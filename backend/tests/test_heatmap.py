import sqlite3
from datetime import date, timedelta

import pytest

from backend.app.main import app
from backend.app.services.cache import CatalogCache


def _create_heatmap_catalog(path):
    """Create a minimal .lrcat SQLite file with test data for heatmap tests.

    Images:
      1: 2024-06-01, picked, rating 4, Canon
      2: 2024-06-01, not picked, rating 2, Sony
      3: 2024-06-01, picked, rating 5, Canon
      4: 2024-03-15, not picked, rating 0, Sony
      5: 2024-01-10, picked, rating 3, Canon
      6: 2023-09-20, not picked, rating 1, Canon
    """
    conn = sqlite3.connect(str(path))
    cursor = conn.cursor()

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

    cursor.execute(
        "INSERT INTO AgInternedExifCameraModel (id_local, value) VALUES (1, 'Canon EOS R5')"
    )
    cursor.execute(
        "INSERT INTO AgInternedExifCameraModel (id_local, value) VALUES (2, 'Sony A7III')"
    )
    cursor.execute(
        "INSERT INTO AgInternedExifLens (id_local, value) VALUES (1, 'RF 24-70mm F2.8L')"
    )

    images = [
        (1, "2024-06-01T14:30:00", 1.0, 4.0, 1, 1),
        (2, "2024-06-01T09:15:00", 0.0, 2.0, 2, None),
        (3, "2024-06-01T18:00:00", 1.0, 5.0, 1, 1),
        (4, "2024-03-15T10:00:00", 0.0, 0.0, 2, 1),
        (5, "2024-01-10T08:00:00", 1.0, 3.0, 1, 1),
        (6, "2023-09-20T12:00:00", 0.0, 1.0, 1, 1),
    ]

    for img_id, capture, pick, rating, camera_ref, lens_ref in images:
        cursor.execute(
            "INSERT INTO Adobe_images (id_local, captureTime, pick, rating) VALUES (?, ?, ?, ?)",
            (img_id, capture, pick, rating),
        )
        cursor.execute(
            "INSERT INTO AgHarvestedExifMetadata "
            "(id_local, image, cameraModelRef, lensRef, focalLength, aperture, shutterSpeed) "
            "VALUES (?, ?, ?, ?, 50.0, 5.0, 7.0)",
            (img_id, img_id, camera_ref, lens_ref),
        )

    conn.commit()
    conn.close()
    return str(path)


@pytest.fixture
def heatmap_client(tmp_path, monkeypatch):
    """Create a test client with a pre-loaded catalog for heatmap tests."""
    catalog_path = _create_heatmap_catalog(tmp_path / "test.lrcat")
    monkeypatch.setenv("CATALOG_DIR", str(tmp_path))

    from fastapi.testclient import TestClient

    with TestClient(app) as client:
        app.state.cache = CatalogCache()
        app.state.cache.load(catalog_path)
        yield client, catalog_path


class TestHeatmapResponseStructure:
    def test_returns_200(self, heatmap_client):
        client, _ = heatmap_client
        response = client.get("/api/heatmap")
        assert response.status_code == 200

    def test_response_has_data_key(self, heatmap_client):
        client, _ = heatmap_client
        data = client.get("/api/heatmap").json()
        assert "data" in data

    def test_each_entry_has_date_and_count(self, heatmap_client):
        client, _ = heatmap_client
        data = client.get("/api/heatmap").json()
        for entry in data["data"]:
            assert "date" in entry
            assert "count" in entry


class TestHeatmapDailyCounts:
    def test_correct_count_for_multi_photo_day(self, heatmap_client):
        """2024-06-01 has 3 photos."""
        client, _ = heatmap_client
        data = client.get("/api/heatmap").json()
        by_date = {e["date"]: e["count"] for e in data["data"]}
        assert by_date["2024-06-01"] == 3

    def test_correct_count_for_single_photo_day(self, heatmap_client):
        """2024-03-15 has 1 photo."""
        client, _ = heatmap_client
        data = client.get("/api/heatmap").json()
        by_date = {e["date"]: e["count"] for e in data["data"]}
        assert by_date["2024-03-15"] == 1


class TestHeatmapZeroCountDays:
    def test_zero_count_days_included(self, heatmap_client):
        """Days between photos should have count 0."""
        client, _ = heatmap_client
        data = client.get("/api/heatmap").json()
        by_date = {e["date"]: e["count"] for e in data["data"]}
        # 2024-03-16 is the day after a photo but before the next one
        assert by_date.get("2024-03-16") == 0

    def test_no_gaps_in_date_range(self, heatmap_client):
        """Every day between start and end should be present."""
        client, _ = heatmap_client
        data = client.get("/api/heatmap").json()
        dates = [e["date"] for e in data["data"]]
        if len(dates) >= 2:
            start = date.fromisoformat(dates[0])
            end = date.fromisoformat(dates[-1])
            expected_days = (end - start).days + 1
            assert len(dates) == expected_days


class TestHeatmapDefaultDateRange:
    def test_default_end_is_latest_photo(self, heatmap_client):
        """Default end date should be the latest photo date (2024-06-01)."""
        client, _ = heatmap_client
        data = client.get("/api/heatmap").json()
        dates = [e["date"] for e in data["data"]]
        assert dates[-1] == "2024-06-01"

    def test_default_start_is_one_year_before_latest(self, heatmap_client):
        """Default start date should be 365 days before the latest photo."""
        client, _ = heatmap_client
        data = client.get("/api/heatmap").json()
        dates = [e["date"] for e in data["data"]]
        latest = date.fromisoformat("2024-06-01")
        expected_start = latest - timedelta(days=365)
        assert dates[0] == expected_start.isoformat()

    def test_default_range_not_based_on_today(self, heatmap_client):
        """The default range should be based on the latest photo, not today."""
        client, _ = heatmap_client
        data = client.get("/api/heatmap").json()
        dates = [e["date"] for e in data["data"]]
        # The latest date in our test data is 2024-06-01, not today
        assert dates[-1] == "2024-06-01"


class TestHeatmapCustomDateRange:
    def test_custom_start_date(self, heatmap_client):
        """Custom start_date should be respected."""
        client, _ = heatmap_client
        data = client.get("/api/heatmap?start_date=2024-01-01").json()
        dates = [e["date"] for e in data["data"]]
        assert dates[0] == "2024-01-01"
        # End should still default to latest photo
        assert dates[-1] == "2024-06-01"

    def test_custom_end_date(self, heatmap_client):
        """Custom end_date should be respected."""
        client, _ = heatmap_client
        data = client.get("/api/heatmap?end_date=2024-03-31").json()
        dates = [e["date"] for e in data["data"]]
        assert dates[-1] == "2024-03-31"

    def test_custom_start_and_end(self, heatmap_client):
        """Both custom start and end dates should be respected."""
        client, _ = heatmap_client
        data = client.get("/api/heatmap?start_date=2024-03-01&end_date=2024-03-31").json()
        dates = [e["date"] for e in data["data"]]
        assert dates[0] == "2024-03-01"
        assert dates[-1] == "2024-03-31"
        assert len(dates) == 31  # March has 31 days

    def test_custom_range_counts(self, heatmap_client):
        """Counts should reflect data within the custom range only."""
        client, _ = heatmap_client
        data = client.get("/api/heatmap?start_date=2024-03-01&end_date=2024-03-31").json()
        by_date = {e["date"]: e["count"] for e in data["data"]}
        assert by_date["2024-03-15"] == 1  # Image 4
        assert by_date["2024-03-01"] == 0
        assert by_date["2024-03-31"] == 0


class TestHeatmapWithFilters:
    def test_picks_only(self, heatmap_client):
        """picks_only=true should only count picked images."""
        client, _ = heatmap_client
        data = client.get("/api/heatmap?picks_only=true").json()
        by_date = {e["date"]: e["count"] for e in data["data"]}
        # 2024-06-01: images 1,3 are picked (2 out of 3)
        assert by_date["2024-06-01"] == 2

    def test_min_rating(self, heatmap_client):
        """min_rating should filter out lower-rated images."""
        client, _ = heatmap_client
        data = client.get("/api/heatmap?min_rating=4").json()
        by_date = {e["date"]: e["count"] for e in data["data"]}
        # 2024-06-01: images 1 (rating 4) and 3 (rating 5)
        assert by_date["2024-06-01"] == 2

    def test_exclude_cameras(self, heatmap_client):
        """exclude_cameras should filter out matching images."""
        client, _ = heatmap_client
        data = client.get("/api/heatmap?exclude_cameras=sony").json()
        by_date = {e["date"]: e["count"] for e in data["data"]}
        # 2024-06-01: only Canon images 1,3 (image 2 is Sony)
        assert by_date["2024-06-01"] == 2

    def test_combined_filters(self, heatmap_client):
        """Multiple filters should combine correctly."""
        client, _ = heatmap_client
        data = client.get("/api/heatmap?picks_only=true&min_rating=5&exclude_cameras=sony").json()
        by_date = {e["date"]: e["count"] for e in data["data"]}
        # Only image 3: picked, rating 5, Canon, 2024-06-01
        assert by_date["2024-06-01"] == 1


class TestHeatmapEmptyDataset:
    def test_empty_with_impossible_filter(self, heatmap_client):
        """Impossible filter should return empty data array."""
        client, _ = heatmap_client
        data = client.get("/api/heatmap?exclude_cameras=canon,sony").json()
        assert data["data"] == []

    def test_empty_no_catalogs(self, tmp_path, monkeypatch):
        """No catalogs at all should return empty data array."""
        monkeypatch.setenv("CATALOG_DIR", str(tmp_path))

        from fastapi.testclient import TestClient

        with TestClient(app) as client:
            app.state.cache = CatalogCache()
            data = client.get("/api/heatmap").json()
            assert data["data"] == []


class TestHeatmapDateFormat:
    def test_dates_are_iso_format(self, heatmap_client):
        """All dates should be formatted as YYYY-MM-DD."""
        client, _ = heatmap_client
        data = client.get("/api/heatmap").json()
        for entry in data["data"]:
            d = entry["date"]
            assert len(d) == 10
            assert d[4] == "-"
            assert d[7] == "-"
            # Verify it's a valid date
            date.fromisoformat(d)

    def test_counts_are_integers(self, heatmap_client):
        """All counts should be integers."""
        client, _ = heatmap_client
        data = client.get("/api/heatmap").json()
        for entry in data["data"]:
            assert isinstance(entry["count"], int)


class TestHeatmapWithCatalogParam:
    def test_specific_catalog(self, heatmap_client):
        """Specifying a catalog should work."""
        client, catalog_path = heatmap_client
        data = client.get(f"/api/heatmap?catalog={catalog_path}").json()
        assert len(data["data"]) > 0
        total = sum(e["count"] for e in data["data"])
        # All 6 images should be counted (or only those within default 1-year range)
        # Latest is 2024-06-01, default start is 2023-06-02
        # Image 6 is 2023-09-20 which is within range
        assert total >= 1
