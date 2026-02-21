import sqlite3

import pandas as pd
import pytest

from backend.app.services.data_reader import (
    apex_to_fstop,
    apex_to_shutter,
    read_catalog,
)


@pytest.fixture
def sample_catalog(tmp_path):
    """Create a minimal .lrcat SQLite file with the required tables and sample data."""
    catalog_path = tmp_path / "test.lrcat"
    conn = sqlite3.connect(str(catalog_path))
    cursor = conn.cursor()

    # Create tables matching Lightroom's schema (only the columns we need)
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

    # Insert camera models
    cursor.execute(
        "INSERT INTO AgInternedExifCameraModel (id_local, value) VALUES (1, 'Canon EOS R5')"
    )
    cursor.execute(
        "INSERT INTO AgInternedExifCameraModel (id_local, value) VALUES (2, 'Sony A7III')"
    )

    # Insert lenses
    cursor.execute(
        "INSERT INTO AgInternedExifLens (id_local, value) VALUES (1, 'RF 24-70mm F2.8L')"
    )
    cursor.execute("INSERT INTO AgInternedExifLens (id_local, value) VALUES (2, 'FE 85mm F1.4 GM')")

    # Image 1: Normal photo with all metadata
    cursor.execute(
        "INSERT INTO Adobe_images (id_local, captureTime, pick, rating) "
        "VALUES (1, '2024-03-15T14:30:00', 1.0, 4.0)"
    )
    cursor.execute(
        "INSERT INTO AgHarvestedExifMetadata "
        "(id_local, image, cameraModelRef, lensRef, focalLength, aperture, shutterSpeed) "
        "VALUES (1, 1, 1, 1, 50.0, 5.0, 7.0)"
    )

    # Image 2: Photo with NULL lens (no lensRef) — LEFT JOIN test
    cursor.execute(
        "INSERT INTO Adobe_images (id_local, captureTime, pick, rating) "
        "VALUES (2, '2024-06-01 09:15:00', 0.0, 3.0)"
    )
    cursor.execute(
        "INSERT INTO AgHarvestedExifMetadata "
        "(id_local, image, cameraModelRef, lensRef, focalLength, aperture, shutterSpeed) "
        "VALUES (2, 2, 2, NULL, 85.0, 2.0, 0.0)"
    )

    # Image 3: Different date format and extreme APEX values
    cursor.execute(
        "INSERT INTO Adobe_images (id_local, captureTime, pick, rating) "
        "VALUES (3, '2023-12-25', 0.0, 5.0)"
    )
    cursor.execute(
        "INSERT INTO AgHarvestedExifMetadata "
        "(id_local, image, cameraModelRef, lensRef, focalLength, aperture, shutterSpeed) "
        "VALUES (3, 3, 1, 2, 35.0, 0.0, -1.0)"
    )

    # Image 4: NULL aperture and shutter speed
    cursor.execute(
        "INSERT INTO Adobe_images (id_local, captureTime, pick, rating) "
        "VALUES (4, '2024-01-10T08:00:00', 0.0, 0.0)"
    )
    cursor.execute(
        "INSERT INTO AgHarvestedExifMetadata "
        "(id_local, image, cameraModelRef, lensRef, focalLength, aperture, shutterSpeed) "
        "VALUES (4, 4, 2, 1, 24.0, NULL, NULL)"
    )

    conn.commit()
    conn.close()
    return str(catalog_path)


# --- APEX conversion unit tests ---


class TestApexToFstop:
    def test_aperture_5_gives_f56(self):
        result = apex_to_fstop(5.0)
        assert result == "f/5.7"  # 2^(5/2) = 5.656... rounds to 5.7

    def test_aperture_2_gives_f2(self):
        assert apex_to_fstop(2.0) == "f/2.0"  # 2^(2/2) = 2.0

    def test_aperture_0_gives_f1(self):
        assert apex_to_fstop(0.0) == "f/1.0"  # 2^(0/2) = 1.0

    def test_aperture_6_gives_f8(self):
        assert apex_to_fstop(6.0) == "f/8.0"  # 2^(6/2) = 8.0

    def test_aperture_8_gives_f16(self):
        assert apex_to_fstop(8.0) == "f/16.0"  # 2^(8/2) = 16.0

    def test_aperture_3_gives_f28(self):
        result = apex_to_fstop(3.0)
        assert result == "f/2.8"  # 2^(3/2) = 2.828... rounds to 2.8


class TestApexToShutter:
    def test_shutter_7_gives_1_over_128(self):
        assert apex_to_shutter(7.0) == "1/128s"  # 2^(-7) = 1/128

    def test_shutter_0_gives_1s(self):
        assert apex_to_shutter(0.0) == "1.0s"  # 2^0 = 1.0

    def test_shutter_negative1_gives_2s(self):
        assert apex_to_shutter(-1.0) == "2.0s"  # 2^1 = 2.0

    def test_shutter_negative2_gives_4s(self):
        assert apex_to_shutter(-2.0) == "4.0s"  # 2^2 = 4.0

    def test_shutter_10_gives_1_over_1024(self):
        assert apex_to_shutter(10.0) == "1/1024s"  # 2^(-10) = 1/1024

    def test_shutter_3_gives_1_over_8(self):
        assert apex_to_shutter(3.0) == "1/8s"  # 2^(-3) = 1/8


# --- Integration tests for read_catalog ---


class TestReadCatalog:
    def test_returns_dataframe_with_expected_columns(self, sample_catalog):
        df = read_catalog(sample_catalog)
        expected_cols = {
            "captureTime",
            "lensName",
            "cameraName",
            "focalLength",
            "aperture",
            "shutterSpeed",
            "pick",
            "rating",
        }
        assert set(df.columns) == expected_cols

    def test_returns_all_rows(self, sample_catalog):
        df = read_catalog(sample_catalog)
        assert len(df) == 4

    def test_null_lens_does_not_crash(self, sample_catalog):
        df = read_catalog(sample_catalog)
        # Image 2 has no lens — lensName should be NaN
        null_lens_row = df[df["cameraName"] == "Sony A7III"].iloc[0]
        assert pd.isna(null_lens_row["lensName"])

    def test_dates_are_parsed_to_datetime(self, sample_catalog):
        df = read_catalog(sample_catalog)
        assert pd.api.types.is_datetime64_any_dtype(df["captureTime"])

    def test_mixed_date_formats_parsed(self, sample_catalog):
        df = read_catalog(sample_catalog)
        # All 4 rows should have valid datetime values (no NaT)
        assert df["captureTime"].notna().all()

    def test_aperture_values_are_strings(self, sample_catalog):
        df = read_catalog(sample_catalog)
        # Non-null aperture values should be strings starting with "f/"
        valid_apertures = df["aperture"].dropna()
        for val in valid_apertures:
            assert isinstance(val, str)
            assert val.startswith("f/")

    def test_shutter_values_are_strings(self, sample_catalog):
        df = read_catalog(sample_catalog)
        # Non-null shutter values should be strings ending with "s"
        valid_shutters = df["shutterSpeed"].dropna()
        for val in valid_shutters:
            assert isinstance(val, str)
            assert val.endswith("s")

    def test_apex_conversion_accuracy(self, sample_catalog):
        df = read_catalog(sample_catalog)
        # Image 1: aperture APEX 5.0 → f/5.7, shutter APEX 7.0 → 1/128s
        img1 = df[df["cameraName"] == "Canon EOS R5"]
        img1_with_lens = img1[img1["lensName"] == "RF 24-70mm F2.8L"].iloc[0]
        assert img1_with_lens["aperture"] == "f/5.7"
        assert img1_with_lens["shutterSpeed"] == "1/128s"

    def test_slow_shutter_conversion(self, sample_catalog):
        df = read_catalog(sample_catalog)
        # Image 3: shutter APEX -1.0 → 2.0s (slow shutter)
        img3 = df[df["rating"] == 5.0].iloc[0]
        assert img3["shutterSpeed"] == "2.0s"

    def test_null_aperture_and_shutter_remain_null(self, sample_catalog):
        df = read_catalog(sample_catalog)
        # Image 4: NULL aperture and shutter speed
        img4 = df[df["rating"] == 0.0].iloc[0]
        assert pd.isna(img4["aperture"])
        assert pd.isna(img4["shutterSpeed"])

    def test_camera_names_present(self, sample_catalog):
        df = read_catalog(sample_catalog)
        cameras = set(df["cameraName"].dropna())
        assert "Canon EOS R5" in cameras
        assert "Sony A7III" in cameras

    def test_catalog_opened_read_only(self, sample_catalog):
        """Verify the catalog file is not modified after reading."""
        import os

        mtime_before = os.path.getmtime(sample_catalog)
        read_catalog(sample_catalog)
        mtime_after = os.path.getmtime(sample_catalog)
        assert mtime_before == mtime_after
