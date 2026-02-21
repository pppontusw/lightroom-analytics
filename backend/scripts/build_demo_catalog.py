#!/usr/bin/env python3
"""
Build a demo .lrcat SQLite file with fake data for Lightroom Analytics.

The date range always ends on the day the script is run (today) and extends
backward by default 730 days (about 2 years). Use --output to set the path
and --num-photos to control how many images are generated.

Example:
  python -m backend.scripts.build_demo_catalog
  python -m backend.scripts.build_demo_catalog --output ./demo.lrcat --num-photos 3000
"""

import argparse
import random
import sqlite3
from datetime import date, timedelta
from pathlib import Path


def create_schema(cursor: sqlite3.Cursor) -> None:
    """Create the four tables required by the app's data_reader query."""
    cursor.execute("""
        CREATE TABLE Adobe_images (
            id_local INTEGER PRIMARY KEY,
            captureTime TEXT,
            pick REAL,
            rating REAL
        )
    """)
    cursor.execute("""
        CREATE TABLE AgHarvestedExifMetadata (
            id_local INTEGER PRIMARY KEY,
            image INTEGER,
            cameraModelRef INTEGER,
            lensRef INTEGER,
            focalLength REAL,
            aperture REAL,
            shutterSpeed REAL
        )
    """)
    cursor.execute("""
        CREATE TABLE AgInternedExifCameraModel (
            id_local INTEGER PRIMARY KEY,
            value TEXT
        )
    """)
    cursor.execute("""
        CREATE TABLE AgInternedExifLens (
            id_local INTEGER PRIMARY KEY,
            value TEXT
        )
    """)


def insert_cameras_and_lenses(cursor: sqlite3.Cursor) -> None:
    """Insert interned camera and lens names (referenced by id_local)."""
    cameras = [
        (1, "Canon EOS R5"),
        (2, "Canon EOS R3"),
        (3, "Sony A7 III"),
        (4, "Sony A7R V"),
        (5, "Nikon Z6"),
        (6, "Nikon Z8"),
        (7, "Fujifilm X-T5"),
        (8, "Panasonic Lumix S5 II"),
        (9, "Olympus OM-D E-M1 Mark III"),
    ]
    for row in cameras:
        cursor.execute(
            "INSERT INTO AgInternedExifCameraModel (id_local, value) VALUES (?, ?)",
            row,
        )

    lenses = [
        (1, "RF 24-70mm F2.8L"),
        (2, "RF 50mm F1.2L"),
        (3, "RF 70-200mm F2.8L"),
        (4, "RF 16mm F2.8"),
        (5, "FE 85mm F1.4 GM"),
        (6, "FE 24-105mm F4 G"),
        (7, "FE 35mm F1.4 GM"),
        (8, "Nikkor Z 24-70mm f/2.8 S"),
        (9, "Nikkor Z 70-200mm f/2.8 VR S"),
        (10, "Nikkor Z 14-24mm f/2.8 S"),
        (11, "XF 16-55mm F2.8 R LM WR"),
        (12, "XF 56mm F1.2 R"),
        (13, "Lumix S 24-105mm F4"),
        (14, "M.Zuiko 12-40mm F2.8 PRO"),
        (15, "M.Zuiko 40-150mm F2.8 PRO"),
    ]
    for row in lenses:
        cursor.execute(
            "INSERT INTO AgInternedExifLens (id_local, value) VALUES (?, ?)",
            row,
        )


# Camera id -> list of lens ids that fit that mount.
# Canon RF (1,2), Sony FE (3,4), Nikon Z (5,6), Fuji X (7), Panasonic L (8), Olympus MFT (9).
CAMERA_LENSES: dict[int, list[int]] = {
    1: [1, 2, 3, 4],       # Canon EOS R5  -> RF
    2: [1, 2, 3, 4],       # Canon EOS R3  -> RF
    3: [5, 6, 7],          # Sony A7 III   -> FE
    4: [5, 6, 7],          # Sony A7R V    -> FE
    5: [8, 9, 10],         # Nikon Z6      -> Nikkor Z
    6: [8, 9, 10],         # Nikon Z8      -> Nikkor Z
    7: [11, 12],            # Fujifilm X-T5 -> XF
    8: [13],                # Panasonic S5 II -> Lumix S
    9: [14, 15],            # Olympus E-M1 III -> M.Zuiko
}

# Rating distribution: 0–5 with 3 most common, 2/4 less common, 1/5 rare.
# Weights (0, 1, 2, 3, 4, 5).
RATING_WEIGHTS: tuple[float, ...] = (22, 3, 15, 38, 16, 6)

# Lens id -> (min_focal_mm, max_focal_mm). Primes have min == max.
LENS_FOCAL_RANGES_MM: dict[int, tuple[float, float]] = {
    1: (24.0, 70.0),    # RF 24-70
    2: (50.0, 50.0),    # RF 50
    3: (70.0, 200.0),  # RF 70-200
    4: (16.0, 16.0),   # RF 16
    5: (85.0, 85.0),   # FE 85
    6: (24.0, 105.0),  # FE 24-105
    7: (35.0, 35.0),   # FE 35
    8: (24.0, 70.0),   # Nikkor Z 24-70
    9: (70.0, 200.0),  # Nikkor Z 70-200
    10: (14.0, 24.0),  # Nikkor Z 14-24
    11: (16.0, 55.0),  # XF 16-55
    12: (56.0, 56.0),  # XF 56
    13: (24.0, 105.0), # Lumix S 24-105
    14: (12.0, 40.0),  # M.Zuiko 12-40
    15: (40.0, 150.0), # M.Zuiko 40-150
}


def _photos_per_day() -> int:
    """
    Number of photos to generate for a single day.
    ~32% of days get 0; rest get a count in light/medium/heavy buckets for big variance.
    """
    r = random.random()
    if r < 0.32:
        return 0
    if r < 0.57:
        return random.randint(1, 35)
    if r < 0.82:
        return random.randint(35, 120)
    return random.randint(120, 380)


def build_demo_catalog(
    out_path: str,
    num_photos: int = 50000,
    end_date: date | None = None,
    days_back: int = 730,
) -> int:
    """
    Write a demo .lrcat SQLite file. Returns the actual number of photos written.

    Photos per day: ~32% of days have 0 photos; the rest get a count from
    light (1–35), medium (35–120), or heavy (120–380) for strong variation.
    Gear (cameras, lenses, focal length, aperture, shutter) is chosen at
    random per photo for a wide spread in breakdown/drilldown views.

    Total photo count is approximate (driven by the per-day distribution).

    Args:
        out_path: Path for the output .lrcat file.
        num_photos: Target total images (approximate; actual total varies by run).
        end_date: Last date for capture times (inclusive). Defaults to today.
        days_back: Number of days before end_date for the start of the range.
    """
    if end_date is None:
        end_date = date.today()
    start_date = end_date - timedelta(days=days_back)

    conn = sqlite3.connect(out_path)
    cursor = conn.cursor()

    create_schema(cursor)
    insert_cameras_and_lenses(cursor)

    apex_aperture = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0]  # f/1.4 .. f/16
    apex_shutter = [-2.0, 0.0, 2.0, 3.0, 5.0, 6.0, 7.0, 8.0, 10.0]  # 4s .. 1/1024s
    camera_refs = list(range(1, 10))  # 9 cameras

    total_days = (end_date - start_date).days + 1
    image_id = 1

    # Scale daily counts so expected total ≈ num_photos (expected ~50k with default weights)
    expected_per_day = (
        0.32 * 0 + 0.25 * 18 + 0.25 * 77.5 + 0.18 * 250
    )  # ~69
    scale = num_photos / max(expected_per_day * total_days, 1)

    for day_offset in range(total_days):
        capture_date = start_date + timedelta(days=day_offset)
        raw_count = _photos_per_day()
        count = max(0, int(round(raw_count * scale)))
        for _ in range(count):
            hour = random.randint(5, 22)
            minute = random.randint(0, 59)
            second = random.randint(0, 59)
            capture_time = f"{capture_date.isoformat()}T{hour:02d}:{minute:02d}:{second:02d}"

            pick = 1.0 if random.random() < 0.3 else 0.0
            rating = float(random.choices(range(6), weights=RATING_WEIGHTS, k=1)[0])
            cam_ref = random.choice(camera_refs)
            lens_ref = random.choice(CAMERA_LENSES[cam_ref])
            lo, hi = LENS_FOCAL_RANGES_MM[lens_ref]
            focal = round(random.uniform(lo, hi), 1)
            aperture = random.choice(apex_aperture)
            shutter = random.choice(apex_shutter)

            cursor.execute(
                "INSERT INTO Adobe_images (id_local, captureTime, pick, rating) VALUES (?, ?, ?, ?)",
                (image_id, capture_time, pick, rating),
            )
            cursor.execute(
                "INSERT INTO AgHarvestedExifMetadata "
                "(id_local, image, cameraModelRef, lensRef, focalLength, aperture, shutterSpeed) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (image_id, image_id, cam_ref, lens_ref, focal, aperture, shutter),
            )
            image_id += 1

    conn.commit()
    conn.close()
    return image_id - 1


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build a demo .lrcat catalog with fake data (date range ends today).",
    )
    parser.add_argument(
        "--output",
        "-o",
        default=None,
        help="Output path for the .lrcat file (default: backend/demo.lrcat next to this script)",
    )
    parser.add_argument(
        "--num-photos",
        "-n",
        type=int,
        default=50000,
        metavar="N",
        help="Number of fake images to generate (default: 50000)",
    )
    parser.add_argument(
        "--days-back",
        type=int,
        default=730,
        metavar="D",
        help="Number of days before today for the start of the date range (default: 730)",
    )
    args = parser.parse_args()

    if args.output is None:
        backend_dir = Path(__file__).resolve().parent.parent
        args.output = str(backend_dir / "demo.lrcat")

    total = build_demo_catalog(
        out_path=args.output,
        num_photos=args.num_photos,
        end_date=date.today(),
        days_back=args.days_back,
    )
    print(f"Wrote demo catalog to {args.output} ({total} photos, up to today).")


if __name__ == "__main__":
    main()
