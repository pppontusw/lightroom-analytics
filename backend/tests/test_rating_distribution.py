import sqlite3

import pytest

from backend.app.main import app
from backend.app.services.cache import CatalogCache


def _create_rating_catalog(path):
    """Create a minimal .lrcat SQLite file with test data for rating distribution tests.

    Images:
      1: 2024-06-01, picked, rating 5, Canon EOS R5
      2: 2024-06-01, not picked, rating 3, Sony A7III
      3: 2024-06-15, picked, rating 4, Canon EOS R5
      4: 2024-03-15, not picked, rating 0, Sony A7III
      5: 2024-03-20, picked, rating 0, Canon EOS R5
      6: 2024-01-10, not picked, rating 1, Canon EOS R5
      7: 2024-01-10, not picked, rating 2, Sony A7III
      8: 2024-06-01, picked, rating 5, Canon EOS R5
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
        (1, "2024-06-01T14:30:00", 1.0, 5.0, 1, 1),
        (2, "2024-06-01T09:15:00", 0.0, 3.0, 2, None),
        (3, "2024-06-15T18:00:00", 1.0, 4.0, 1, 1),
        (4, "2024-03-15T10:00:00", 0.0, 0.0, 2, 1),
        (5, "2024-03-20T08:00:00", 1.0, 0.0, 1, 1),
        (6, "2024-01-10T12:00:00", 0.0, 1.0, 1, 1),
        (7, "2024-01-10T15:00:00", 0.0, 2.0, 2, 1),
        (8, "2024-06-01T16:00:00", 1.0, 5.0, 1, 1),
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


def _create_all_unrated_catalog(path):
    """Create a catalog where all photos have rating 0."""
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
        "INSERT INTO AgInternedExifLens (id_local, value) VALUES (1, 'RF 24-70mm F2.8L')"
    )

    for img_id in range(1, 4):
        cursor.execute(
            "INSERT INTO Adobe_images (id_local, captureTime, pick, rating) "
            "VALUES (?, ?, 0.0, 0.0)",
            (img_id, f"2024-06-{img_id:02d}T12:00:00"),
        )
        cursor.execute(
            "INSERT INTO AgHarvestedExifMetadata "
            "(id_local, image, cameraModelRef, lensRef, focalLength, aperture, shutterSpeed) "
            "VALUES (?, ?, 1, 1, 50.0, 5.0, 7.0)",
            (img_id, img_id),
        )

    conn.commit()
    conn.close()
    return str(path)


@pytest.fixture
def rating_client(tmp_path, monkeypatch):
    """Create a test client with a pre-loaded catalog for rating distribution tests."""
    catalog_path = _create_rating_catalog(tmp_path / "test.lrcat")
    monkeypatch.setenv("CATALOG_DIR", str(tmp_path))

    from fastapi.testclient import TestClient

    with TestClient(app) as client:
        app.state.cache = CatalogCache()
        app.state.cache.load(catalog_path)
        yield client, catalog_path


@pytest.fixture
def unrated_client(tmp_path, monkeypatch):
    """Create a test client where all photos have rating 0."""
    catalog_path = _create_all_unrated_catalog(tmp_path / "test.lrcat")
    monkeypatch.setenv("CATALOG_DIR", str(tmp_path))

    from fastapi.testclient import TestClient

    with TestClient(app) as client:
        app.state.cache = CatalogCache()
        app.state.cache.load(catalog_path)
        yield client, catalog_path


class TestRatingDistributionResponseStructure:
    def test_returns_200(self, rating_client):
        client, _ = rating_client
        response = client.get("/api/rating-distribution")
        assert response.status_code == 200

    def test_response_has_all_sections(self, rating_client):
        client, _ = rating_client
        data = client.get("/api/rating-distribution").json()
        assert "overall" in data
        assert "by_camera" in data
        assert "over_time" in data
        assert "pick_stats" in data

    def test_overall_entry_structure(self, rating_client):
        client, _ = rating_client
        data = client.get("/api/rating-distribution").json()
        for entry in data["overall"]:
            assert "rating" in entry
            assert "count" in entry
            assert "percentage" in entry

    def test_by_camera_entry_structure(self, rating_client):
        client, _ = rating_client
        data = client.get("/api/rating-distribution").json()
        for entry in data["by_camera"]:
            assert "camera" in entry
            assert "avg_rating" in entry
            assert "rated_count" in entry

    def test_over_time_entry_structure(self, rating_client):
        client, _ = rating_client
        data = client.get("/api/rating-distribution").json()
        for entry in data["over_time"]:
            assert "period" in entry
            assert "avg_rating" in entry
            assert "rated_count" in entry


class TestRatingDistributionOverall:
    def test_includes_all_ratings_0_to_5(self, rating_client):
        """Overall should include all ratings 0-5 even if some have 0 count."""
        client, _ = rating_client
        data = client.get("/api/rating-distribution").json()
        ratings = [e["rating"] for e in data["overall"]]
        assert ratings == [0, 1, 2, 3, 4, 5]

    def test_counts_are_correct(self, rating_client):
        """Verify counts match test data.

        Rating 0: images 4, 5 = 2
        Rating 1: image 6 = 1
        Rating 2: image 7 = 1
        Rating 3: image 2 = 1
        Rating 4: image 3 = 1
        Rating 5: images 1, 8 = 2
        """
        client, _ = rating_client
        data = client.get("/api/rating-distribution").json()
        by_rating = {e["rating"]: e["count"] for e in data["overall"]}
        assert by_rating[0] == 2
        assert by_rating[1] == 1
        assert by_rating[2] == 1
        assert by_rating[3] == 1
        assert by_rating[4] == 1
        assert by_rating[5] == 2

    def test_percentages_sum_to_100(self, rating_client):
        """All percentages should sum to approximately 100%."""
        client, _ = rating_client
        data = client.get("/api/rating-distribution").json()
        total_pct = sum(e["percentage"] for e in data["overall"])
        assert abs(total_pct - 100.0) < 1.0  # Allow for rounding

    def test_percentage_calculation(self, rating_client):
        """Verify percentage is count/total * 100, rounded to 1 decimal.

        Total = 8, rating 0 count = 2 -> 25.0%
        """
        client, _ = rating_client
        data = client.get("/api/rating-distribution").json()
        by_rating = {e["rating"]: e for e in data["overall"]}
        assert by_rating[0]["percentage"] == 25.0
        assert by_rating[5]["percentage"] == 25.0
        assert by_rating[1]["percentage"] == 12.5

    def test_counts_are_integers(self, rating_client):
        client, _ = rating_client
        data = client.get("/api/rating-distribution").json()
        for entry in data["overall"]:
            assert isinstance(entry["count"], int)

    def test_percentages_are_floats(self, rating_client):
        client, _ = rating_client
        data = client.get("/api/rating-distribution").json()
        for entry in data["overall"]:
            assert isinstance(entry["percentage"], float)


class TestRatingDistributionByCamera:
    def test_cameras_present(self, rating_client):
        """Both cameras should appear since both have rated photos."""
        client, _ = rating_client
        data = client.get("/api/rating-distribution").json()
        cameras = [e["camera"] for e in data["by_camera"]]
        assert "Canon EOS R5" in cameras
        assert "Sony A7III" in cameras

    def test_avg_rating_is_correct(self, rating_client):
        """Verify average ratings (only for photos with rating > 0).

        Canon EOS R5 rated photos: 5, 4, 1, 5 -> mean = 15/4 = 3.8
        Sony A7III rated photos: 3, 2 -> mean = 5/2 = 2.5
        """
        client, _ = rating_client
        data = client.get("/api/rating-distribution").json()
        by_camera = {e["camera"]: e for e in data["by_camera"]}
        assert by_camera["Canon EOS R5"]["avg_rating"] == 3.8
        assert by_camera["Sony A7III"]["avg_rating"] == 2.5

    def test_rated_count_is_correct(self, rating_client):
        """Verify rated_count (photos with rating > 0).

        Canon EOS R5: images 1(5), 3(4), 6(1), 8(5) = 4
        Sony A7III: images 2(3), 7(2) = 2
        """
        client, _ = rating_client
        data = client.get("/api/rating-distribution").json()
        by_camera = {e["camera"]: e for e in data["by_camera"]}
        assert by_camera["Canon EOS R5"]["rated_count"] == 4
        assert by_camera["Sony A7III"]["rated_count"] == 2

    def test_sorted_by_avg_rating_descending(self, rating_client):
        """by_camera should be sorted by avg_rating descending (highest to lowest)."""
        client, _ = rating_client
        data = client.get("/api/rating-distribution").json()
        ratings = [e["avg_rating"] for e in data["by_camera"]]
        assert ratings == sorted(ratings, reverse=True)


class TestRatingDistributionOverTime:
    def test_periods_are_formatted_correctly(self, rating_client):
        """Periods should be in YYYY-MM format."""
        client, _ = rating_client
        data = client.get("/api/rating-distribution").json()
        for entry in data["over_time"]:
            period = entry["period"]
            assert len(period) == 7
            assert period[4] == "-"

    def test_periods_present(self, rating_client):
        """Months with rated photos should be present.

        Rated photos in: 2024-01, 2024-06
        2024-03 has no rated photos (both are rating 0)
        """
        client, _ = rating_client
        data = client.get("/api/rating-distribution").json()
        periods = [e["period"] for e in data["over_time"]]
        assert "2024-01" in periods
        assert "2024-06" in periods
        # March has only unrated photos
        assert "2024-03" not in periods

    def test_avg_rating_per_month(self, rating_client):
        """Verify average ratings per month.

        2024-01: images 6(1), 7(2) -> mean = 1.5
        2024-06: images 1(5), 2(3), 3(4), 8(5) -> mean = 17/4 = 4.2 (rounded)
        """
        client, _ = rating_client
        data = client.get("/api/rating-distribution").json()
        by_period = {e["period"]: e for e in data["over_time"]}
        assert by_period["2024-01"]["avg_rating"] == 1.5
        assert by_period["2024-06"]["avg_rating"] == 4.2

    def test_rated_count_per_month(self, rating_client):
        """Verify rated count per month.

        2024-01: 2 rated photos (images 6, 7)
        2024-06: 4 rated photos (images 1, 2, 3, 8)
        """
        client, _ = rating_client
        data = client.get("/api/rating-distribution").json()
        by_period = {e["period"]: e for e in data["over_time"]}
        assert by_period["2024-01"]["rated_count"] == 2
        assert by_period["2024-06"]["rated_count"] == 4

    def test_periods_sorted_chronologically(self, rating_client):
        """over_time should be sorted chronologically."""
        client, _ = rating_client
        data = client.get("/api/rating-distribution").json()
        periods = [e["period"] for e in data["over_time"]]
        assert periods == sorted(periods)


class TestRatingDistributionNoRatedPhotos:
    def test_overall_still_shows_distribution(self, unrated_client):
        """Even with no rated photos, overall should show counts."""
        client, _ = unrated_client
        data = client.get("/api/rating-distribution").json()
        assert len(data["overall"]) == 6
        by_rating = {e["rating"]: e["count"] for e in data["overall"]}
        assert by_rating[0] == 3  # All 3 photos are rating 0
        for r in range(1, 6):
            assert by_rating[r] == 0

    def test_by_camera_empty_when_no_rated(self, unrated_client):
        """by_camera should be empty when no photos have rating > 0."""
        client, _ = unrated_client
        data = client.get("/api/rating-distribution").json()
        assert data["by_camera"] == []

    def test_over_time_empty_when_no_rated(self, unrated_client):
        """over_time should be empty when no photos have rating > 0."""
        client, _ = unrated_client
        data = client.get("/api/rating-distribution").json()
        assert data["over_time"] == []


class TestRatingDistributionEmptyDataset:
    def test_empty_with_impossible_filter(self, rating_client):
        """Impossible filter should return zeroed response."""
        client, _ = rating_client
        data = client.get("/api/rating-distribution?exclude_cameras=canon,sony").json()
        assert all(e["count"] == 0 for e in data["overall"])
        assert data["by_camera"] == []
        assert data["over_time"] == []
        assert data["pick_stats"]["total"] == 0
        assert data["pick_stats"]["picked"] == 0
        assert data["pick_stats"]["pick_rate"] == 0.0
        assert data["pick_stats"]["by_camera"] == []

    def test_empty_no_catalogs(self, tmp_path, monkeypatch):
        """No catalogs at all should return zeroed response."""
        monkeypatch.setenv("CATALOG_DIR", str(tmp_path))

        from fastapi.testclient import TestClient

        with TestClient(app) as client:
            app.state.cache = CatalogCache()
            data = client.get("/api/rating-distribution").json()
            assert len(data["overall"]) == 6
            assert all(e["count"] == 0 for e in data["overall"])
            assert data["by_camera"] == []
            assert data["over_time"] == []
            assert data["pick_stats"]["total"] == 0
            assert data["pick_stats"]["picked"] == 0


class TestRatingDistributionWithFilters:
    def test_picks_only(self, rating_client):
        """picks_only=true should only include picked images.

        Picked images: 1(5), 3(4), 5(0), 8(5)
        """
        client, _ = rating_client
        data = client.get("/api/rating-distribution?picks_only=true").json()
        total_count = sum(e["count"] for e in data["overall"])
        assert total_count == 4

    def test_exclude_cameras(self, rating_client):
        """exclude_cameras should filter matching cameras.

        Excluding Sony: images 1(5), 3(4), 5(0), 6(1), 8(5) remain
        """
        client, _ = rating_client
        data = client.get("/api/rating-distribution?exclude_cameras=sony").json()
        total_count = sum(e["count"] for e in data["overall"])
        assert total_count == 5
        cameras = [e["camera"] for e in data["by_camera"]]
        assert "Sony A7III" not in cameras

    def test_date_range_filter(self, rating_client):
        """Date range should restrict results.

        2024-06-01 to 2024-06-30: images 1(5), 2(3), 3(4), 8(5)
        """
        client, _ = rating_client
        data = client.get(
            "/api/rating-distribution?start_date=2024-06-01&end_date=2024-06-30"
        ).json()
        total_count = sum(e["count"] for e in data["overall"])
        assert total_count == 4

    def test_combined_filters(self, rating_client):
        """Multiple filters should combine correctly.

        picks_only + exclude_cameras=sony + date range 2024-06:
        Picked Canon in June: images 1(5), 3(4), 8(5)
        """
        client, _ = rating_client
        data = client.get(
            "/api/rating-distribution"
            "?picks_only=true&exclude_cameras=sony"
            "&start_date=2024-06-01&end_date=2024-06-30"
        ).json()
        total_count = sum(e["count"] for e in data["overall"])
        assert total_count == 3


class TestRatingDistributionPickStats:
    def test_pick_stats_structure(self, rating_client):
        client, _ = rating_client
        data = client.get("/api/rating-distribution").json()
        ps = data["pick_stats"]
        assert "total" in ps
        assert "picked" in ps
        assert "pick_rate" in ps
        assert "by_camera" in ps

    def test_pick_stats_overall(self, rating_client):
        """Verify overall pick stats.

        Picked images: 1, 3, 5, 8 = 4 out of 8 = 50.0%
        """
        client, _ = rating_client
        data = client.get("/api/rating-distribution").json()
        ps = data["pick_stats"]
        assert ps["total"] == 8
        assert ps["picked"] == 4
        assert ps["pick_rate"] == 50.0

    def test_pick_stats_by_camera(self, rating_client):
        """Verify pick rate by camera.

        Canon EOS R5: images 1(pick), 3(pick), 5(pick), 6(no), 8(pick) = 4/5 = 80.0%
        Sony A7III: images 2(no), 4(no), 7(no) = 0/3 = 0.0%
        """
        client, _ = rating_client
        data = client.get("/api/rating-distribution").json()
        by_camera = {e["camera"]: e for e in data["pick_stats"]["by_camera"]}
        assert by_camera["Canon EOS R5"]["pick_rate"] == 80.0
        assert by_camera["Canon EOS R5"]["picked"] == 4
        assert by_camera["Canon EOS R5"]["total"] == 5
        assert by_camera["Sony A7III"]["pick_rate"] == 0.0
        assert by_camera["Sony A7III"]["picked"] == 0
        assert by_camera["Sony A7III"]["total"] == 3

    def test_pick_stats_sorted_by_pick_rate(self, rating_client):
        """by_camera in pick_stats should be sorted by pick_rate descending."""
        client, _ = rating_client
        data = client.get("/api/rating-distribution").json()
        rates = [e["pick_rate"] for e in data["pick_stats"]["by_camera"]]
        assert rates == sorted(rates, reverse=True)

    def test_pick_stats_empty(self, unrated_client):
        """All unrated catalog (all pick=0) should have 0 pick rate."""
        client, _ = unrated_client
        data = client.get("/api/rating-distribution").json()
        ps = data["pick_stats"]
        assert ps["total"] == 3
        assert ps["picked"] == 0
        assert ps["pick_rate"] == 0.0

    def test_pick_stats_with_filters(self, rating_client):
        """Pick stats should respect filters.

        Excluding Sony, June only: images 1(pick,5), 3(pick,4), 8(pick,5) = 3 picked, 3 total
        """
        client, _ = rating_client
        data = client.get(
            "/api/rating-distribution"
            "?exclude_cameras=sony&start_date=2024-06-01&end_date=2024-06-30"
        ).json()
        ps = data["pick_stats"]
        assert ps["total"] == 3
        assert ps["picked"] == 3
        assert ps["pick_rate"] == 100.0


class TestRatingDistributionWithCatalogParam:
    def test_specific_catalog(self, rating_client):
        """Specifying a catalog should work."""
        client, catalog_path = rating_client
        data = client.get(f"/api/rating-distribution?catalog={catalog_path}").json()
        total_count = sum(e["count"] for e in data["overall"])
        assert total_count == 8
