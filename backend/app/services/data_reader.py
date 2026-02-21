import sqlite3

import pandas as pd


def apex_to_fstop(apex_value: float) -> str:
    """Convert APEX aperture value to f-stop string like 'f/2.8'."""
    fstop = 2 ** (apex_value / 2)
    return f"f/{fstop:.1f}"


def apex_to_shutter(apex_value: float) -> str:
    """Convert APEX shutter speed value to human string like '1/125s'."""
    seconds = 2 ** (-apex_value)
    if seconds >= 1:
        return f"{seconds:.1f}s"
    denominator = int(round(1 / seconds))
    return f"1/{denominator}s"


_CORE_QUERY = """
SELECT
    Adobe_images.captureTime,
    Adobe_images.pick,
    Adobe_images.rating,
    AgHarvestedExifMetadata.focalLength,
    AgHarvestedExifMetadata.aperture,
    AgHarvestedExifMetadata.shutterSpeed,
    AgInternedExifCameraModel.value AS cameraName,
    AgInternedExifLens.value AS lensName
FROM Adobe_images
JOIN AgHarvestedExifMetadata
    ON Adobe_images.id_local = AgHarvestedExifMetadata.image
JOIN AgInternedExifCameraModel
    ON AgHarvestedExifMetadata.cameraModelRef = AgInternedExifCameraModel.id_local
LEFT JOIN AgInternedExifLens
    ON AgHarvestedExifMetadata.lensRef = AgInternedExifLens.id_local
"""

_RELEVANT_COLUMNS = [
    "captureTime",
    "lensName",
    "cameraName",
    "focalLength",
    "aperture",
    "shutterSpeed",
    "pick",
    "rating",
]


def read_catalog(catalog_path: str) -> pd.DataFrame:
    """Read a .lrcat SQLite catalog and return a processed DataFrame.

    Opens the catalog read-only, executes the core join query, parses dates,
    and converts APEX values to human-readable strings.
    """
    uri = f"file:{catalog_path}?mode=ro&immutable=1"
    conn = sqlite3.connect(uri, uri=True)
    try:
        df = pd.read_sql_query(_CORE_QUERY, conn)
    finally:
        conn.close()

    # Ensure we only keep the relevant columns (all should be present from the query)
    df = df[[col for col in _RELEVANT_COLUMNS if col in df.columns]]

    # Parse dates
    if "captureTime" in df.columns:
        df["captureTime"] = pd.to_datetime(df["captureTime"], format="mixed")

    # Convert APEX aperture values
    if "aperture" in df.columns:
        df["aperture"] = df["aperture"].apply(lambda v: apex_to_fstop(v) if pd.notna(v) else v)

    # Convert APEX shutter speed values
    if "shutterSpeed" in df.columns:
        df["shutterSpeed"] = df["shutterSpeed"].apply(
            lambda v: apex_to_shutter(v) if pd.notna(v) else v
        )

    return df
