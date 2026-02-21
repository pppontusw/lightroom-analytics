import sqlite3

import pytest

from backend.app.main import app
from backend.app.services.cache import CatalogCache


def _create_comparison_catalog(path):
    """Create a .lrcat SQLite file with data spanning 2023-2024 for comparison tests.

    Creates 12 images across two years with various gear, picks, and ratings.
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
    ]
    for cam in cameras:
        cursor.execute(
            "INSERT INTO AgInternedExifCameraModel (id_local, value) VALUES (?, ?)",
            cam,
        )

    # Lenses
    lenses = [
        (1, "RF 24-70mm F2.8L"),
        (2, "FE 85mm F1.4 GM"),
    ]
    for lens in lenses:
        cursor.execute(
            "INSERT INTO AgInternedExifLens (id_local, value) VALUES (?, ?)",
            lens,
        )

    # Images spanning 2023 and 2024
    # (id, capture, pick, rating, cam_ref, lens_ref, fl, ap, ss)
    images = [
        # 2023 images (5 total)
        (1, "2023-01-15T10:00:00", 1.0, 4.0, 1, 1, 50.0, 5.0, 7.0),
        (2, "2023-03-20T12:00:00", 0.0, 3.0, 1, 1, 24.0, 3.0, 5.0),
        (3, "2023-06-25T14:00:00", 1.0, 5.0, 2, 2, 85.0, 2.0, 0.0),
        (4, "2023-09-10T08:00:00", 0.0, 2.0, 2, 2, 85.0, 2.0, 3.0),
        (5, "2023-12-01T16:00:00", 1.0, 4.0, 1, 1, 50.0, 1.0, 7.0),
        # 2024 images (7 total)
        (6, "2024-01-10T09:00:00", 0.0, 3.0, 1, 1, 70.0, 5.0, 5.0),
        (7, "2024-02-14T11:00:00", 1.0, 5.0, 1, 1, 50.0, 3.0, 7.0),
        (8, "2024-04-15T13:00:00", 0.0, 1.0, 2, 2, 85.0, 2.0, 0.0),
        (9, "2024-06-30T15:00:00", 1.0, 4.0, 1, 1, 50.0, 1.0, 3.0),
        (10, "2024-07-04T10:00:00", 0.0, 4.0, 2, 2, 85.0, 2.0, 7.0),
        (11, "2024-09-15T12:00:00", 1.0, 5.0, 1, 1, 50.0, 3.0, 5.0),
        (12, "2024-11-01T14:00:00", 0.0, 2.0, 2, 2, 85.0, 2.0, 0.0),
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
def comparison_client(tmp_path, monkeypatch):
    """Create a test client with a pre-loaded comparison catalog."""
    catalog_path = _create_comparison_catalog(tmp_path / "test.lrcat")
    monkeypatch.setenv("CATALOG_DIR", str(tmp_path))

    from fastapi.testclient import TestClient

    with TestClient(app) as client:
        app.state.cache = CatalogCache()
        app.state.cache.load(catalog_path)
        yield client, catalog_path


class TestComparisonBasic:
    def test_returns_200(self, comparison_client):
        client, _ = comparison_client
        response = client.get(
            "/api/comparison"
            "?period_a_start=2023-01-01&period_a_end=2023-12-31"
            "&period_b_start=2024-01-01&period_b_end=2024-12-31"
        )
        assert response.status_code == 200

    def test_response_structure(self, comparison_client):
        client, _ = comparison_client
        data = client.get(
            "/api/comparison"
            "?period_a_start=2023-01-01&period_a_end=2023-12-31"
            "&period_b_start=2024-01-01&period_b_end=2024-12-31"
        ).json()
        assert set(data.keys()) == {"property", "period_a", "period_b"}
        assert set(data["period_a"].keys()) == {"label", "data", "total"}
        assert set(data["period_b"].keys()) == {"label", "data", "total"}

    def test_period_data_entries_have_correct_keys(self, comparison_client):
        client, _ = comparison_client
        data = client.get(
            "/api/comparison"
            "?period_a_start=2023-01-01&period_a_end=2023-12-31"
            "&period_b_start=2024-01-01&period_b_end=2024-12-31"
        ).json()
        for entry in data["period_a"]["data"]:
            assert set(entry.keys()) == {"period", "value", "count"}
        for entry in data["period_b"]["data"]:
            assert set(entry.keys()) == {"period", "value", "count"}

    def test_default_property_is_lens_name(self, comparison_client):
        client, _ = comparison_client
        data = client.get(
            "/api/comparison"
            "?period_a_start=2023-01-01&period_a_end=2023-12-31"
            "&period_b_start=2024-01-01&period_b_end=2024-12-31"
        ).json()
        assert data["property"] == "lensName"


class TestComparisonPeriodIndependence:
    def test_periods_counted_independently(self, comparison_client):
        """Each period's total should reflect only images in that date range."""
        client, _ = comparison_client
        data = client.get(
            "/api/comparison"
            "?period_a_start=2023-01-01&period_a_end=2023-12-31"
            "&period_b_start=2024-01-01&period_b_end=2024-12-31"
        ).json()
        # 2023 has 5 images, 2024 has 7 images
        assert data["period_a"]["total"] == 5
        assert data["period_b"]["total"] == 7

    def test_period_data_sum_equals_total(self, comparison_client):
        client, _ = comparison_client
        data = client.get(
            "/api/comparison"
            "?period_a_start=2023-01-01&period_a_end=2023-12-31"
            "&period_b_start=2024-01-01&period_b_end=2024-12-31"
        ).json()
        data_sum_a = sum(e["count"] for e in data["period_a"]["data"])
        assert data_sum_a == data["period_a"]["total"]
        data_sum_b = sum(e["count"] for e in data["period_b"]["data"])
        assert data_sum_b == data["period_b"]["total"]

    def test_overlapping_periods_allowed(self, comparison_client):
        """Overlapping periods should each count images in their own range."""
        client, _ = comparison_client
        data = client.get(
            "/api/comparison"
            "?period_a_start=2023-01-01&period_a_end=2024-06-30"
            "&period_b_start=2024-01-01&period_b_end=2024-12-31"
        ).json()
        # Period A: 2023 (5) + 2024 Jan-Apr (3, image 9 at 15:00 > Jun 30 midnight) = 8
        assert data["period_a"]["total"] == 8
        # Period B: 2024 all (7)
        assert data["period_b"]["total"] == 7


class TestComparisonFilters:
    def test_picks_only(self, comparison_client):
        client, _ = comparison_client
        data = client.get(
            "/api/comparison"
            "?period_a_start=2023-01-01&period_a_end=2023-12-31"
            "&period_b_start=2024-01-01&period_b_end=2024-12-31"
            "&picks_only=true"
        ).json()
        # 2023 picked: images 1, 3, 5 = 3
        assert data["period_a"]["total"] == 3
        # 2024 picked: images 7, 9, 11 = 3
        assert data["period_b"]["total"] == 3

    def test_min_rating(self, comparison_client):
        client, _ = comparison_client
        data = client.get(
            "/api/comparison"
            "?period_a_start=2023-01-01&period_a_end=2023-12-31"
            "&period_b_start=2024-01-01&period_b_end=2024-12-31"
            "&min_rating=4"
        ).json()
        # 2023 rating>=4: images 1(4), 3(5), 5(4) = 3
        assert data["period_a"]["total"] == 3
        # 2024 rating>=4: images 7(5), 9(4), 10(4), 11(5) = 4
        assert data["period_b"]["total"] == 4

    def test_exclude_cameras(self, comparison_client):
        client, _ = comparison_client
        data = client.get(
            "/api/comparison"
            "?period_a_start=2023-01-01&period_a_end=2023-12-31"
            "&period_b_start=2024-01-01&period_b_end=2024-12-31"
            "&exclude_cameras=sony"
        ).json()
        # 2023 Canon only: images 1, 2, 5 = 3
        assert data["period_a"]["total"] == 3
        # 2024 Canon only: images 6, 7, 9, 11 = 4
        assert data["period_b"]["total"] == 4

    def test_combined_filters(self, comparison_client):
        client, _ = comparison_client
        data = client.get(
            "/api/comparison"
            "?period_a_start=2023-01-01&period_a_end=2023-12-31"
            "&period_b_start=2024-01-01&period_b_end=2024-12-31"
            "&picks_only=true&min_rating=4"
        ).json()
        # 2023 picked + rating>=4: images 1(picked,4), 3(picked,5), 5(picked,4) = 3
        assert data["period_a"]["total"] == 3
        # 2024 picked + rating>=4: images 7(picked,5), 9(picked,4), 11(picked,5) = 3
        assert data["period_b"]["total"] == 3


class TestComparisonLabels:
    def test_full_year_label(self, comparison_client):
        client, _ = comparison_client
        data = client.get(
            "/api/comparison"
            "?period_a_start=2023-01-01&period_a_end=2023-12-31"
            "&period_b_start=2024-01-01&period_b_end=2024-12-31"
        ).json()
        assert data["period_a"]["label"] == "2023"
        assert data["period_b"]["label"] == "2024"

    def test_partial_year_label(self, comparison_client):
        client, _ = comparison_client
        data = client.get(
            "/api/comparison"
            "?period_a_start=2023-01-01&period_a_end=2023-06-30"
            "&period_b_start=2024-01-01&period_b_end=2024-06-30"
        ).json()
        assert data["period_a"]["label"] == "Jan\u2013Jun 2023"
        assert data["period_b"]["label"] == "Jan\u2013Jun 2024"

    def test_multi_year_label(self, comparison_client):
        client, _ = comparison_client
        data = client.get(
            "/api/comparison"
            "?period_a_start=2022-01-01&period_a_end=2023-12-31"
            "&period_b_start=2024-01-01&period_b_end=2024-12-31"
        ).json()
        assert data["period_a"]["label"] == "2022\u20132023"
        assert data["period_b"]["label"] == "2024"

    def test_single_month_label(self, comparison_client):
        client, _ = comparison_client
        data = client.get(
            "/api/comparison"
            "?period_a_start=2023-03-01&period_a_end=2023-03-31"
            "&period_b_start=2024-03-01&period_b_end=2024-03-31"
        ).json()
        assert data["period_a"]["label"] == "Mar\u2013Mar 2023"
        assert data["period_b"]["label"] == "Mar\u2013Mar 2024"


class TestComparisonEmptyPeriods:
    def test_empty_period_returns_zero_total(self, comparison_client):
        client, _ = comparison_client
        data = client.get(
            "/api/comparison"
            "?period_a_start=2020-01-01&period_a_end=2020-12-31"
            "&period_b_start=2024-01-01&period_b_end=2024-12-31"
        ).json()
        assert data["period_a"]["total"] == 0
        assert data["period_a"]["data"] == []
        # Period B should still have data
        assert data["period_b"]["total"] == 7

    def test_both_periods_empty(self, comparison_client):
        client, _ = comparison_client
        data = client.get(
            "/api/comparison"
            "?period_a_start=2020-01-01&period_a_end=2020-12-31"
            "&period_b_start=2021-01-01&period_b_end=2021-12-31"
        ).json()
        assert data["period_a"]["total"] == 0
        assert data["period_a"]["data"] == []
        assert data["period_b"]["total"] == 0
        assert data["period_b"]["data"] == []

    def test_empty_no_catalogs(self, tmp_path, monkeypatch):
        monkeypatch.setenv("CATALOG_DIR", str(tmp_path))

        from fastapi.testclient import TestClient

        with TestClient(app) as client:
            app.state.cache = CatalogCache()
            data = client.get(
                "/api/comparison"
                "?period_a_start=2023-01-01&period_a_end=2023-12-31"
                "&period_b_start=2024-01-01&period_b_end=2024-12-31"
            ).json()
            assert data["period_a"]["total"] == 0
            assert data["period_a"]["data"] == []
            assert data["period_b"]["total"] == 0
            assert data["period_b"]["data"] == []


class TestComparisonValidation:
    def test_missing_period_a_start(self, comparison_client):
        client, _ = comparison_client
        response = client.get(
            "/api/comparison"
            "?period_a_end=2023-12-31"
            "&period_b_start=2024-01-01&period_b_end=2024-12-31"
        )
        assert response.status_code == 422

    def test_missing_period_a_end(self, comparison_client):
        client, _ = comparison_client
        response = client.get(
            "/api/comparison"
            "?period_a_start=2023-01-01"
            "&period_b_start=2024-01-01&period_b_end=2024-12-31"
        )
        assert response.status_code == 422

    def test_missing_period_b_start(self, comparison_client):
        client, _ = comparison_client
        response = client.get(
            "/api/comparison"
            "?period_a_start=2023-01-01&period_a_end=2023-12-31"
            "&period_b_end=2024-12-31"
        )
        assert response.status_code == 422

    def test_missing_period_b_end(self, comparison_client):
        client, _ = comparison_client
        response = client.get(
            "/api/comparison"
            "?period_a_start=2023-01-01&period_a_end=2023-12-31"
            "&period_b_start=2024-01-01"
        )
        assert response.status_code == 422

    def test_missing_all_periods(self, comparison_client):
        client, _ = comparison_client
        response = client.get("/api/comparison")
        assert response.status_code == 422

    def test_invalid_property(self, comparison_client):
        client, _ = comparison_client
        response = client.get(
            "/api/comparison"
            "?property=invalid"
            "&period_a_start=2023-01-01&period_a_end=2023-12-31"
            "&period_b_start=2024-01-01&period_b_end=2024-12-31"
        )
        assert response.status_code == 422

    def test_invalid_grouping(self, comparison_client):
        client, _ = comparison_client
        response = client.get(
            "/api/comparison"
            "?grouping=invalid"
            "&period_a_start=2023-01-01&period_a_end=2023-12-31"
            "&period_b_start=2024-01-01&period_b_end=2024-12-31"
        )
        assert response.status_code == 422


class TestComparisonGrouping:
    def test_year_grouping(self, comparison_client):
        client, _ = comparison_client
        data = client.get(
            "/api/comparison"
            "?grouping=year"
            "&period_a_start=2023-01-01&period_a_end=2023-12-31"
            "&period_b_start=2024-01-01&period_b_end=2024-12-31"
        ).json()
        # Period A should have one entry per value for "2023"
        periods_a = {e["period"] for e in data["period_a"]["data"]}
        assert periods_a == {"2023"}
        # Period B should have one entry per value for "2024"
        periods_b = {e["period"] for e in data["period_b"]["data"]}
        assert periods_b == {"2024"}

    def test_month_grouping(self, comparison_client):
        client, _ = comparison_client
        data = client.get(
            "/api/comparison"
            "?grouping=month"
            "&period_a_start=2023-01-01&period_a_end=2023-12-31"
            "&period_b_start=2024-01-01&period_b_end=2024-12-31"
        ).json()
        periods_a = {e["period"] for e in data["period_a"]["data"]}
        assert "2023-01" in periods_a
        assert "2023-03" in periods_a
        periods_b = {e["period"] for e in data["period_b"]["data"]}
        assert "2024-01" in periods_b
        assert "2024-02" in periods_b

    def test_quarter_grouping(self, comparison_client):
        client, _ = comparison_client
        data = client.get(
            "/api/comparison"
            "?grouping=quarter"
            "&period_a_start=2023-01-01&period_a_end=2023-12-31"
            "&period_b_start=2024-01-01&period_b_end=2024-12-31"
        ).json()
        periods_a = {e["period"] for e in data["period_a"]["data"]}
        assert "2023-Q1" in periods_a
        periods_b = {e["period"] for e in data["period_b"]["data"]}
        assert "2024-Q1" in periods_b

    def test_data_sorted_by_period_then_value(self, comparison_client):
        client, _ = comparison_client
        data = client.get(
            "/api/comparison"
            "?grouping=month"
            "&period_a_start=2023-01-01&period_a_end=2023-12-31"
            "&period_b_start=2024-01-01&period_b_end=2024-12-31"
        ).json()
        for period_key in ("period_a", "period_b"):
            entries = data[period_key]["data"]
            sort_keys = [(e["period"], e["value"]) for e in entries]
            assert sort_keys == sorted(sort_keys)


class TestComparisonProperty:
    def test_camera_name_property(self, comparison_client):
        client, _ = comparison_client
        data = client.get(
            "/api/comparison"
            "?property=cameraName"
            "&period_a_start=2023-01-01&period_a_end=2023-12-31"
            "&period_b_start=2024-01-01&period_b_end=2024-12-31"
        ).json()
        assert data["property"] == "cameraName"
        values_a = {e["value"] for e in data["period_a"]["data"]}
        assert "Canon EOS R5" in values_a
        assert "Sony A7III" in values_a

    def test_specific_catalog_param(self, comparison_client):
        client, catalog_path = comparison_client
        data = client.get(
            f"/api/comparison"
            f"?catalog={catalog_path}"
            f"&period_a_start=2023-01-01&period_a_end=2023-12-31"
            f"&period_b_start=2024-01-01&period_b_end=2024-12-31"
        ).json()
        assert data["period_a"]["total"] == 5
        assert data["period_b"]["total"] == 7
