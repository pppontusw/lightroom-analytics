import sqlite3

import pytest

from backend.app.main import app
from backend.app.services.cache import CatalogCache


def _create_drilldown_catalog(path):
    """Create a .lrcat SQLite file with enough data for drilldown tests.

    Creates 12 images across different cameras, lenses, and focal lengths
    to test hierarchical drilldown at multiple levels.
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

    # Camera models
    cameras = [
        (1, "Canon EOS R5"),
        (2, "Sony A7III"),
        (3, "Nikon Z6"),
    ]
    for cam in cameras:
        cursor.execute(
            "INSERT INTO AgInternedExifCameraModel (id_local, value) VALUES (?, ?)",
            cam,
        )

    # Lenses
    lenses = [
        (1, "RF 24-70mm F2.8L"),
        (2, "RF 50mm F1.2L"),
        (3, "FE 85mm F1.4 GM"),
    ]
    for lens in lenses:
        cursor.execute(
            "INSERT INTO AgInternedExifLens (id_local, value) VALUES (?, ?)",
            lens,
        )

    # Images: spread across 2023-2024, various gear
    # (id, capture, pick, rating, cam_ref, lens_ref, fl, ap, ss)
    images = [
        # Canon EOS R5 with RF 24-70mm (3 images: 24mm, 50mm, 70mm)
        (1, "2023-10-15T10:00:00", 1.0, 4.0, 1, 1, 24.0, 3.0, 5.0),
        (2, "2023-11-20T12:00:00", 0.0, 3.0, 1, 1, 50.0, 5.0, 7.0),
        (3, "2024-04-15T11:00:00", 1.0, 5.0, 1, 1, 70.0, 5.0, 5.0),
        # Canon EOS R5 with RF 50mm (2 images: 50mm)
        (4, "2024-02-14T16:00:00", 1.0, 4.0, 1, 2, 50.0, 1.0, 7.0),
        (5, "2024-06-30T15:00:00", 1.0, 3.0, 1, 2, 50.0, 1.0, 3.0),
        # Sony A7III with FE 85mm (3 images: 85mm)
        (6, "2023-12-25T14:00:00", 1.0, 5.0, 2, 3, 85.0, 2.0, 0.0),
        (7, "2024-01-10T08:00:00", 0.0, 2.0, 2, 3, 85.0, 2.0, 3.0),
        (8, "2024-05-20T13:00:00", 0.0, 1.0, 2, 3, 85.0, 2.0, 0.0),
        # Sony A7III with no lens / NULL (1 image)
        (9, "2024-09-01T14:00:00", 0.0, 2.0, 2, None, 85.0, 2.0, 0.0),
        # Nikon Z6 with no lens / NULL (2 images: 35mm, 24mm)
        (10, "2024-03-01T09:00:00", 0.0, 0.0, 3, None, 35.0, 4.0, 6.0),
        (11, "2024-07-04T10:00:00", 0.0, 4.0, 3, None, 24.0, 6.0, 7.0),
        # Canon EOS R5 with RF 24-70mm (1 more image at 50mm)
        (12, "2024-08-15T12:00:00", 1.0, 5.0, 1, 1, 50.0, 3.0, 5.0),
    ]

    for img in images:
        (img_id, capture, pick, rating, cam_ref, lens_ref, fl, ap, ss) = img
        cursor.execute(
            "INSERT INTO Adobe_images (id_local, captureTime, pick, rating) VALUES (?, ?, ?, ?)",
            (img_id, capture, pick, rating),
        )
        cursor.execute(
            "INSERT INTO AgHarvestedExifMetadata "
            "(id_local, image, cameraModelRef, lensRef, focalLength, aperture, shutterSpeed) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (img_id, img_id, cam_ref, lens_ref, fl, ap, ss),
        )

    conn.commit()
    conn.close()
    return str(path)


@pytest.fixture
def drilldown_client(tmp_path, monkeypatch):
    """Create a test client with a pre-loaded drilldown catalog."""
    catalog_path = _create_drilldown_catalog(tmp_path / "test.lrcat")
    monkeypatch.setenv("CATALOG_DIR", str(tmp_path))

    from fastapi.testclient import TestClient

    with TestClient(app) as client:
        app.state.cache = CatalogCache()
        app.state.cache.load(catalog_path)
        yield client, catalog_path


# Test data summary:
# Canon EOS R5 (6 images):
#   RF 24-70mm F2.8L (4): 24mm(1), 50mm(2), 70mm(1)
#   RF 50mm F1.2L (2): 50mm(2)
# Sony A7III (4 images):
#   FE 85mm F1.4 GM (3): 85mm(3)
#   Unknown (1): 85mm(1)
# Nikon Z6 (2 images):
#   Unknown (2): 35mm(1), 24mm(1)


class TestDrilldownTopLevel:
    """Test top-level drilldown (no filter_values) returns grouped data."""

    def test_returns_200(self, drilldown_client):
        client, _ = drilldown_client
        response = client.get("/api/drilldown")
        assert response.status_code == 200

    def test_default_hierarchy_top_level_is_camera(self, drilldown_client):
        client, _ = drilldown_client
        data = client.get("/api/drilldown").json()
        assert data["level"] == 0
        assert data["property"] == "cameraName"

    def test_top_level_has_no_parent_filters(self, drilldown_client):
        client, _ = drilldown_client
        data = client.get("/api/drilldown").json()
        assert "parent_filters" not in data

    def test_top_level_data_structure(self, drilldown_client):
        client, _ = drilldown_client
        data = client.get("/api/drilldown").json()
        assert "data" in data
        for entry in data["data"]:
            assert set(entry.keys()) == {"value", "count"}

    def test_top_level_camera_counts(self, drilldown_client):
        client, _ = drilldown_client
        data = client.get("/api/drilldown").json()
        counts = {e["value"]: e["count"] for e in data["data"]}
        assert counts["Canon EOS R5"] == 6
        assert counts["Sony A7III"] == 4
        assert counts["Nikon Z6"] == 2

    def test_top_level_sorted_descending(self, drilldown_client):
        client, _ = drilldown_client
        data = client.get("/api/drilldown").json()
        counts = [e["count"] for e in data["data"]]
        assert counts == sorted(counts, reverse=True)

    def test_top_level_total_matches_all_images(self, drilldown_client):
        client, _ = drilldown_client
        data = client.get("/api/drilldown").json()
        total = sum(e["count"] for e in data["data"])
        assert total == 12


class TestDrilldownOneLevel:
    """Test drilling into one level with filter_values."""

    def test_drill_into_canon(self, drilldown_client):
        client, _ = drilldown_client
        data = client.get("/api/drilldown?filter_values=Canon EOS R5").json()
        assert data["level"] == 1
        assert data["property"] == "lensName"

    def test_drill_into_canon_lens_counts(self, drilldown_client):
        client, _ = drilldown_client
        data = client.get("/api/drilldown?filter_values=Canon EOS R5").json()
        counts = {e["value"]: e["count"] for e in data["data"]}
        assert counts["RF 24-70mm F2.8L"] == 4
        assert counts["RF 50mm F1.2L"] == 2

    def test_drill_into_canon_parent_filters(self, drilldown_client):
        client, _ = drilldown_client
        data = client.get("/api/drilldown?filter_values=Canon EOS R5").json()
        assert data["parent_filters"] == {"cameraName": "Canon EOS R5"}

    def test_drill_into_sony(self, drilldown_client):
        client, _ = drilldown_client
        data = client.get("/api/drilldown?filter_values=Sony A7III").json()
        counts = {e["value"]: e["count"] for e in data["data"]}
        assert counts["FE 85mm F1.4 GM"] == 3
        assert counts["Unknown"] == 1

    def test_drill_into_nikon(self, drilldown_client):
        client, _ = drilldown_client
        data = client.get("/api/drilldown?filter_values=Nikon Z6").json()
        counts = {e["value"]: e["count"] for e in data["data"]}
        # Nikon has only Unknown lenses
        assert counts["Unknown"] == 2

    def test_one_level_sorted_descending(self, drilldown_client):
        client, _ = drilldown_client
        data = client.get("/api/drilldown?filter_values=Canon EOS R5").json()
        counts = [e["count"] for e in data["data"]]
        assert counts == sorted(counts, reverse=True)


class TestDrilldownTwoLevels:
    """Test drilling into two levels."""

    def test_drill_into_canon_rf2470(self, drilldown_client):
        client, _ = drilldown_client
        data = client.get("/api/drilldown?filter_values=Canon EOS R5,RF 24-70mm F2.8L").json()
        assert data["level"] == 2
        assert data["property"] == "focalLength"

    def test_drill_into_canon_rf2470_focal_counts(self, drilldown_client):
        client, _ = drilldown_client
        data = client.get("/api/drilldown?filter_values=Canon EOS R5,RF 24-70mm F2.8L").json()
        counts = {e["value"]: e["count"] for e in data["data"]}
        assert counts[50.0] == 2
        assert counts[24.0] == 1
        assert counts[70.0] == 1

    def test_drill_into_canon_rf2470_parent_filters(self, drilldown_client):
        client, _ = drilldown_client
        data = client.get("/api/drilldown?filter_values=Canon EOS R5,RF 24-70mm F2.8L").json()
        assert data["parent_filters"] == {
            "cameraName": "Canon EOS R5",
            "lensName": "RF 24-70mm F2.8L",
        }

    def test_drill_into_sony_fe85(self, drilldown_client):
        client, _ = drilldown_client
        data = client.get("/api/drilldown?filter_values=Sony A7III,FE 85mm F1.4 GM").json()
        counts = {e["value"]: e["count"] for e in data["data"]}
        # All Sony + FE 85mm images are at 85mm
        assert counts[85.0] == 3

    def test_two_level_sorted_descending(self, drilldown_client):
        client, _ = drilldown_client
        data = client.get("/api/drilldown?filter_values=Canon EOS R5,RF 24-70mm F2.8L").json()
        counts = [e["count"] for e in data["data"]]
        assert counts == sorted(counts, reverse=True)


class TestDrilldownParentFilters:
    """Test that parent_filters are correctly built."""

    def test_no_parent_filters_at_level_0(self, drilldown_client):
        client, _ = drilldown_client
        data = client.get("/api/drilldown").json()
        assert "parent_filters" not in data

    def test_parent_filters_at_level_1(self, drilldown_client):
        client, _ = drilldown_client
        data = client.get("/api/drilldown?filter_values=Canon EOS R5").json()
        assert data["parent_filters"] == {"cameraName": "Canon EOS R5"}

    def test_parent_filters_at_level_2(self, drilldown_client):
        client, _ = drilldown_client
        data = client.get("/api/drilldown?filter_values=Canon EOS R5,RF 50mm F1.2L").json()
        assert data["parent_filters"] == {
            "cameraName": "Canon EOS R5",
            "lensName": "RF 50mm F1.2L",
        }


class TestDrilldownCustomHierarchy:
    """Test custom hierarchy ordering."""

    def test_lens_first_hierarchy(self, drilldown_client):
        client, _ = drilldown_client
        data = client.get("/api/drilldown?hierarchy=lensName,cameraName,focalLength").json()
        assert data["level"] == 0
        assert data["property"] == "lensName"
        values = {e["value"] for e in data["data"]}
        assert "RF 24-70mm F2.8L" in values
        assert "RF 50mm F1.2L" in values
        assert "FE 85mm F1.4 GM" in values
        assert "Unknown" in values

    def test_lens_first_drill_into_rf2470(self, drilldown_client):
        client, _ = drilldown_client
        data = client.get(
            "/api/drilldown?hierarchy=lensName,cameraName,focalLength"
            "&filter_values=RF 24-70mm F2.8L"
        ).json()
        assert data["level"] == 1
        assert data["property"] == "cameraName"
        # RF 24-70mm is only on Canon EOS R5
        counts = {e["value"]: e["count"] for e in data["data"]}
        assert counts["Canon EOS R5"] == 4

    def test_focal_length_first(self, drilldown_client):
        client, _ = drilldown_client
        data = client.get("/api/drilldown?hierarchy=focalLength,cameraName").json()
        assert data["level"] == 0
        assert data["property"] == "focalLength"

    def test_two_level_hierarchy(self, drilldown_client):
        client, _ = drilldown_client
        data = client.get(
            "/api/drilldown?hierarchy=cameraName,lensName&filter_values=Canon EOS R5"
        ).json()
        assert data["level"] == 1
        assert data["property"] == "lensName"


class TestDrilldownEmptyResults:
    """Test empty results at a drill level."""

    def test_empty_drill_with_nonexistent_value(self, drilldown_client):
        client, _ = drilldown_client
        data = client.get("/api/drilldown?filter_values=Nonexistent Camera").json()
        assert data["data"] == []
        assert data["level"] == 1
        assert data["property"] == "lensName"

    def test_empty_with_impossible_filter(self, drilldown_client):
        client, _ = drilldown_client
        data = client.get("/api/drilldown?exclude_cameras=canon,sony,nikon").json()
        assert data["data"] == []
        assert data["level"] == 0
        assert data["property"] == "cameraName"

    def test_empty_no_catalogs(self, tmp_path, monkeypatch):
        monkeypatch.setenv("CATALOG_DIR", str(tmp_path))

        from fastapi.testclient import TestClient

        with TestClient(app) as client:
            app.state.cache = CatalogCache()
            data = client.get("/api/drilldown").json()
            assert data["data"] == []
            assert data["level"] == 0
            assert data["property"] == "cameraName"

    def test_empty_drill_still_has_parent_filters(self, drilldown_client):
        client, _ = drilldown_client
        data = client.get("/api/drilldown?filter_values=Nonexistent Camera").json()
        assert data["parent_filters"] == {"cameraName": "Nonexistent Camera"}


class TestDrilldownValidation:
    """Test invalid hierarchy depth error and invalid properties."""

    def test_filter_values_exceeds_hierarchy(self, drilldown_client):
        client, _ = drilldown_client
        # Default hierarchy is 3 levels, so 3 filter_values is too many
        response = client.get("/api/drilldown?filter_values=Canon EOS R5,RF 24-70mm F2.8L,50.0")
        assert response.status_code == 422

    def test_filter_values_exceeds_short_hierarchy(self, drilldown_client):
        client, _ = drilldown_client
        # 1-level hierarchy with 1 filter_value = error
        response = client.get("/api/drilldown?hierarchy=cameraName&filter_values=Canon EOS R5")
        assert response.status_code == 422

    def test_invalid_property_in_hierarchy(self, drilldown_client):
        client, _ = drilldown_client
        response = client.get("/api/drilldown?hierarchy=invalidProp,cameraName")
        assert response.status_code == 422

    def test_empty_hierarchy(self, drilldown_client):
        client, _ = drilldown_client
        response = client.get("/api/drilldown?hierarchy=")
        assert response.status_code == 422

    def test_valid_single_property_hierarchy(self, drilldown_client):
        client, _ = drilldown_client
        response = client.get("/api/drilldown?hierarchy=cameraName")
        assert response.status_code == 200


class TestDrilldownNullHandling:
    """Test that NULL values in properties display as 'Unknown'."""

    def test_null_lens_shown_as_unknown_at_top(self, drilldown_client):
        client, _ = drilldown_client
        data = client.get("/api/drilldown?hierarchy=lensName,cameraName").json()
        values = {e["value"] for e in data["data"]}
        assert "Unknown" in values

    def test_null_lens_count_correct(self, drilldown_client):
        client, _ = drilldown_client
        data = client.get("/api/drilldown?hierarchy=lensName,cameraName").json()
        unknown_entry = next(e for e in data["data"] if e["value"] == "Unknown")
        # 3 images have NULL lens: Sony(1) + Nikon(2)
        assert unknown_entry["count"] == 3

    def test_drill_into_unknown_lens(self, drilldown_client):
        client, _ = drilldown_client
        data = client.get(
            "/api/drilldown?hierarchy=lensName,cameraName&filter_values=Unknown"
        ).json()
        counts = {e["value"]: e["count"] for e in data["data"]}
        assert counts["Nikon Z6"] == 2
        assert counts["Sony A7III"] == 1


class TestDrilldownWithFilters:
    """Test drilldown with common filters applied."""

    def test_picks_only(self, drilldown_client):
        client, _ = drilldown_client
        data = client.get("/api/drilldown?picks_only=true").json()
        total = sum(e["count"] for e in data["data"])
        # Picked images: 1, 3, 4, 5, 6, 12 = 6
        assert total == 6

    def test_min_rating(self, drilldown_client):
        client, _ = drilldown_client
        data = client.get("/api/drilldown?min_rating=5").json()
        total = sum(e["count"] for e in data["data"])
        # Rating=5: images 3, 6, 12 = 3
        assert total == 3

    def test_date_range(self, drilldown_client):
        client, _ = drilldown_client
        data = client.get("/api/drilldown?start_date=2024-01-01&end_date=2024-12-31").json()
        total = sum(e["count"] for e in data["data"])
        # 2024 images: 3, 4, 5, 7, 8, 9, 10, 11, 12 = 9
        assert total == 9

    def test_exclude_cameras_with_drilldown(self, drilldown_client):
        client, _ = drilldown_client
        data = client.get("/api/drilldown?exclude_cameras=sony").json()
        values = {e["value"] for e in data["data"]}
        assert "Sony A7III" not in values

    def test_specific_catalog(self, drilldown_client):
        client, catalog_path = drilldown_client
        data = client.get(f"/api/drilldown?catalog={catalog_path}").json()
        total = sum(e["count"] for e in data["data"])
        assert total == 12
