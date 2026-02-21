import sqlite3

import pytest

from backend.app.main import app
from backend.app.services.cache import CatalogCache


def _create_sample_catalog(path):
    """Create a minimal .lrcat SQLite file with test data for overview tests."""
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

    # Camera models
    cursor.execute(
        "INSERT INTO AgInternedExifCameraModel (id_local, value) VALUES (1, 'Canon EOS R5')"
    )
    cursor.execute(
        "INSERT INTO AgInternedExifCameraModel (id_local, value) VALUES (2, 'Sony A7III')"
    )

    # Lenses
    cursor.execute(
        "INSERT INTO AgInternedExifLens (id_local, value) VALUES (1, 'RF 24-70mm F2.8L')"
    )

    # Image 1: Picked, rating 4, Canon, 2024-03, focal 50mm
    cursor.execute(
        "INSERT INTO Adobe_images (id_local, captureTime, pick, rating) "
        "VALUES (1, '2024-03-15T14:30:00', 1.0, 4.0)"
    )
    cursor.execute(
        "INSERT INTO AgHarvestedExifMetadata "
        "(id_local, image, cameraModelRef, lensRef, focalLength, aperture, shutterSpeed) "
        "VALUES (1, 1, 1, 1, 50.0, 5.0, 7.0)"
    )

    # Image 2: Not picked, rating 2, Sony, 2024-06, focal 85mm, NULL lens
    cursor.execute(
        "INSERT INTO Adobe_images (id_local, captureTime, pick, rating) "
        "VALUES (2, '2024-06-01T09:15:00', 0.0, 2.0)"
    )
    cursor.execute(
        "INSERT INTO AgHarvestedExifMetadata "
        "(id_local, image, cameraModelRef, lensRef, focalLength, aperture, shutterSpeed) "
        "VALUES (2, 2, 2, NULL, 85.0, 2.0, 0.0)"
    )

    # Image 3: Picked, rating 5, Canon, 2023-12, focal 35mm
    cursor.execute(
        "INSERT INTO Adobe_images (id_local, captureTime, pick, rating) "
        "VALUES (3, '2023-12-25T10:00:00', 1.0, 5.0)"
    )
    cursor.execute(
        "INSERT INTO AgHarvestedExifMetadata "
        "(id_local, image, cameraModelRef, lensRef, focalLength, aperture, shutterSpeed) "
        "VALUES (3, 3, 1, 1, 35.0, 3.0, 3.0)"
    )

    # Image 4: Not picked, rating 0, Sony, 2024-01, focal 50mm
    cursor.execute(
        "INSERT INTO Adobe_images (id_local, captureTime, pick, rating) "
        "VALUES (4, '2024-01-10T08:00:00', 0.0, 0.0)"
    )
    cursor.execute(
        "INSERT INTO AgHarvestedExifMetadata "
        "(id_local, image, cameraModelRef, lensRef, focalLength, aperture, shutterSpeed) "
        "VALUES (4, 4, 2, 1, 50.0, 6.0, 5.0)"
    )

    conn.commit()
    conn.close()
    return str(path)


@pytest.fixture
def overview_client(tmp_path, monkeypatch):
    """Create a test client with a pre-loaded catalog."""
    catalog_path = _create_sample_catalog(tmp_path / "test.lrcat")
    monkeypatch.setenv("CATALOG_DIR", str(tmp_path))

    from fastapi.testclient import TestClient

    with TestClient(app) as client:
        # Pre-load the catalog into the app's cache
        app.state.cache = CatalogCache()
        app.state.cache.load(catalog_path)
        yield client, catalog_path


class TestOverviewResponseStructure:
    def test_returns_200(self, overview_client):
        client, _ = overview_client
        response = client.get("/api/overview")
        assert response.status_code == 200

    def test_all_fields_present(self, overview_client):
        client, _ = overview_client
        data = client.get("/api/overview").json()
        expected_keys = {
            "total_photos",
            "date_range",
            "most_used_camera",
            "most_used_lens",
            "most_used_focal_length",
            "photos_per_month",
            "rating_distribution",
            "cameras",
            "lenses",
        }
        assert set(data.keys()) == expected_keys

    def test_field_types(self, overview_client):
        client, _ = overview_client
        data = client.get("/api/overview").json()
        assert isinstance(data["total_photos"], int)
        assert isinstance(data["date_range"], dict)
        assert isinstance(data["most_used_camera"], dict)
        assert isinstance(data["most_used_lens"], dict)
        assert isinstance(data["most_used_focal_length"], dict)
        assert isinstance(data["photos_per_month"], list)
        assert isinstance(data["rating_distribution"], list)
        assert isinstance(data["cameras"], list)
        assert isinstance(data["lenses"], list)


class TestOverviewTotalPhotos:
    def test_total_photos_correct(self, overview_client):
        client, _ = overview_client
        data = client.get("/api/overview").json()
        assert data["total_photos"] == 4


class TestOverviewDateRange:
    def test_date_range_earliest(self, overview_client):
        client, _ = overview_client
        data = client.get("/api/overview").json()
        assert data["date_range"]["earliest"] == "2023-12-25"

    def test_date_range_latest(self, overview_client):
        client, _ = overview_client
        data = client.get("/api/overview").json()
        assert data["date_range"]["latest"] == "2024-06-01"


class TestOverviewMostUsed:
    def test_most_used_camera(self, overview_client):
        client, _ = overview_client
        data = client.get("/api/overview").json()
        # Canon EOS R5 appears in images 1,3 = 2 times; Sony A7III in 2,4 = 2 times
        # Both tied at 2, value_counts returns first by insertion order
        assert data["most_used_camera"]["count"] == 2
        assert data["most_used_camera"]["name"] in ["Canon EOS R5", "Sony A7III"]

    def test_most_used_lens(self, overview_client):
        client, _ = overview_client
        data = client.get("/api/overview").json()
        # RF 24-70mm appears in images 1,3,4 = 3 times (image 2 has NULL lens)
        assert data["most_used_lens"]["name"] == "RF 24-70mm F2.8L"
        assert data["most_used_lens"]["count"] == 3

    def test_most_used_focal_length(self, overview_client):
        client, _ = overview_client
        data = client.get("/api/overview").json()
        # Focal lengths: 50mm (images 1,4), 85mm (image 2), 35mm (image 3)
        # 50mm is most used with count 2
        assert data["most_used_focal_length"]["name"] == "50mm"
        assert data["most_used_focal_length"]["count"] == 2


class TestOverviewPhotosPerMonth:
    def test_periods_formatted_as_yyyy_mm(self, overview_client):
        client, _ = overview_client
        data = client.get("/api/overview").json()
        for entry in data["photos_per_month"]:
            period = entry["period"]
            # Must match YYYY-MM format
            assert len(period) == 7
            assert period[4] == "-"
            assert period[:4].isdigit()
            assert period[5:].isdigit()

    def test_correct_month_counts(self, overview_client):
        client, _ = overview_client
        data = client.get("/api/overview").json()
        months = {e["period"]: e["count"] for e in data["photos_per_month"]}
        assert months["2023-12"] == 1  # Image 3
        assert months["2024-01"] == 1  # Image 4
        assert months["2024-03"] == 1  # Image 1
        assert months["2024-06"] == 1  # Image 2

    def test_photos_per_month_sorted_chronologically(self, overview_client):
        client, _ = overview_client
        data = client.get("/api/overview").json()
        periods = [e["period"] for e in data["photos_per_month"]]
        assert periods == sorted(periods)


class TestOverviewRatingDistribution:
    def test_includes_all_ratings_0_through_5(self, overview_client):
        client, _ = overview_client
        data = client.get("/api/overview").json()
        ratings = [e["rating"] for e in data["rating_distribution"]]
        assert ratings == [0, 1, 2, 3, 4, 5]

    def test_rating_counts_correct(self, overview_client):
        client, _ = overview_client
        data = client.get("/api/overview").json()
        rating_map = {e["rating"]: e["count"] for e in data["rating_distribution"]}
        assert rating_map[0] == 1  # Image 4
        assert rating_map[1] == 0  # None
        assert rating_map[2] == 1  # Image 2
        assert rating_map[3] == 0  # None
        assert rating_map[4] == 1  # Image 1
        assert rating_map[5] == 1  # Image 3

    def test_rating_distribution_length(self, overview_client):
        client, _ = overview_client
        data = client.get("/api/overview").json()
        assert len(data["rating_distribution"]) == 6


class TestOverviewCamerasAndLenses:
    def test_cameras_sorted(self, overview_client):
        client, _ = overview_client
        data = client.get("/api/overview").json()
        assert data["cameras"] == ["Canon EOS R5", "Sony A7III"]

    def test_lenses_sorted(self, overview_client):
        client, _ = overview_client
        data = client.get("/api/overview").json()
        # Only RF 24-70mm (image 2 has NULL lens)
        assert data["lenses"] == ["RF 24-70mm F2.8L"]

    def test_cameras_are_unique(self, overview_client):
        client, _ = overview_client
        data = client.get("/api/overview").json()
        assert len(data["cameras"]) == len(set(data["cameras"]))


class TestOverviewWithFilters:
    def test_picks_only(self, overview_client):
        client, _ = overview_client
        data = client.get("/api/overview?picks_only=true").json()
        # Images 1 and 3 are picked
        assert data["total_photos"] == 2

    def test_min_rating(self, overview_client):
        client, _ = overview_client
        data = client.get("/api/overview?min_rating=4").json()
        # Images 1 (rating 4) and 3 (rating 5)
        assert data["total_photos"] == 2

    def test_date_range_filter(self, overview_client):
        client, _ = overview_client
        data = client.get("/api/overview?start_date=2024-01-01&end_date=2024-04-01").json()
        # Images 1 (2024-03-15) and 4 (2024-01-10)
        assert data["total_photos"] == 2

    def test_exclude_cameras(self, overview_client):
        client, _ = overview_client
        data = client.get("/api/overview?exclude_cameras=sony").json()
        # Only Canon images 1 and 3
        assert data["total_photos"] == 2
        assert data["cameras"] == ["Canon EOS R5"]

    def test_combined_filters(self, overview_client):
        client, _ = overview_client
        data = client.get("/api/overview?picks_only=true&min_rating=5&exclude_cameras=sony").json()
        # Only Image 3
        assert data["total_photos"] == 1
        assert data["most_used_camera"]["name"] == "Canon EOS R5"


class TestOverviewEmptyResult:
    def test_empty_with_impossible_filter(self, overview_client):
        client, _ = overview_client
        data = client.get("/api/overview?exclude_cameras=canon,sony").json()
        assert data["total_photos"] == 0
        assert data["date_range"]["earliest"] is None
        assert data["date_range"]["latest"] is None
        assert data["most_used_camera"] is None
        assert data["most_used_lens"] is None
        assert data["most_used_focal_length"] is None
        assert data["photos_per_month"] == []
        assert data["cameras"] == []
        assert data["lenses"] == []

    def test_empty_rating_distribution_still_has_all_ratings(self, overview_client):
        client, _ = overview_client
        data = client.get("/api/overview?exclude_cameras=canon,sony").json()
        ratings = [e["rating"] for e in data["rating_distribution"]]
        assert ratings == [0, 1, 2, 3, 4, 5]
        assert all(e["count"] == 0 for e in data["rating_distribution"])

    def test_empty_no_catalogs(self, tmp_path, monkeypatch):
        monkeypatch.setenv("CATALOG_DIR", str(tmp_path))

        from fastapi.testclient import TestClient

        with TestClient(app) as client:
            app.state.cache = CatalogCache()
            data = client.get("/api/overview").json()
            assert data["total_photos"] == 0
            assert data["cameras"] == []


class TestOverviewWithCatalogParam:
    def test_specific_catalog(self, overview_client):
        client, catalog_path = overview_client
        data = client.get(f"/api/overview?catalog={catalog_path}").json()
        assert data["total_photos"] == 4

    def test_rejects_undiscovered_catalog(self, overview_client):
        client, _ = overview_client
        response = client.get("/api/overview?catalog=/tmp/not-discovered.lrcat")
        assert response.status_code == 404
