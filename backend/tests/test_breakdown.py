import sqlite3

import pytest

from backend.app.main import app
from backend.app.services.cache import CatalogCache


def _create_breakdown_catalog(path):
    """Create a .lrcat SQLite file with enough data for breakdown tests.

    Creates 12 images across different months, cameras, lenses, focal lengths,
    apertures, and shutter speeds to test all breakdown scenarios.
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
        # 2023 Q4
        (1, "2023-10-15T10:00:00", 1.0, 4.0, 1, 1, 50.0, 5.0, 7.0),
        (2, "2023-11-20T12:00:00", 0.0, 3.0, 1, 1, 24.0, 3.0, 5.0),
        (3, "2023-12-25T14:00:00", 1.0, 5.0, 2, 3, 85.0, 2.0, 0.0),
        # 2024 Q1
        (4, "2024-01-10T08:00:00", 0.0, 2.0, 2, 3, 85.0, 2.0, 3.0),
        (5, "2024-02-14T16:00:00", 1.0, 4.0, 1, 2, 50.0, 1.0, 7.0),
        (6, "2024-03-01T09:00:00", 0.0, 0.0, 3, None, 35.0, 4.0, 6.0),
        # 2024 Q2
        (7, "2024-04-15T11:00:00", 1.0, 5.0, 1, 1, 70.0, 5.0, 5.0),
        (8, "2024-05-20T13:00:00", 0.0, 1.0, 2, 3, 85.0, 2.0, 0.0),
        (9, "2024-06-30T15:00:00", 1.0, 3.0, 1, 2, 50.0, 1.0, 3.0),
        # 2024 Q3
        (10, "2024-07-04T10:00:00", 0.0, 4.0, 3, None, 24.0, 6.0, 7.0),
        (11, "2024-08-15T12:00:00", 1.0, 5.0, 1, 1, 50.0, 3.0, 5.0),
        (12, "2024-09-01T14:00:00", 0.0, 2.0, 2, 3, 85.0, 2.0, 0.0),
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
def breakdown_client(tmp_path, monkeypatch):
    """Create a test client with a pre-loaded breakdown catalog."""
    catalog_path = _create_breakdown_catalog(tmp_path / "test.lrcat")
    monkeypatch.setenv("CATALOG_DIR", str(tmp_path))

    from fastapi.testclient import TestClient

    with TestClient(app) as client:
        app.state.cache = CatalogCache()
        app.state.cache.load(catalog_path)
        yield client, catalog_path


class TestBreakdownResponseStructure:
    def test_returns_200(self, breakdown_client):
        client, _ = breakdown_client
        response = client.get("/api/breakdown")
        assert response.status_code == 200

    def test_all_fields_present(self, breakdown_client):
        client, _ = breakdown_client
        data = client.get("/api/breakdown").json()
        assert set(data.keys()) == {"property", "grouping", "data", "totals"}

    def test_default_property_is_lens_name(self, breakdown_client):
        client, _ = breakdown_client
        data = client.get("/api/breakdown").json()
        assert data["property"] == "lensName"

    def test_default_grouping_is_month(self, breakdown_client):
        client, _ = breakdown_client
        data = client.get("/api/breakdown").json()
        assert data["grouping"] == "month"

    def test_data_entries_have_correct_keys(self, breakdown_client):
        client, _ = breakdown_client
        data = client.get("/api/breakdown").json()
        for entry in data["data"]:
            assert set(entry.keys()) == {"period", "value", "count"}

    def test_totals_entries_have_correct_keys(self, breakdown_client):
        client, _ = breakdown_client
        data = client.get("/api/breakdown").json()
        for entry in data["totals"]:
            assert set(entry.keys()) == {"value", "count"}


class TestBreakdownByProperty:
    def test_lens_name(self, breakdown_client):
        client, _ = breakdown_client
        data = client.get("/api/breakdown?property=lensName").json()
        values = {t["value"] for t in data["totals"]}
        # We have RF 24-70mm, RF 50mm, FE 85mm, and Unknown (NULL lens)
        assert "RF 24-70mm F2.8L" in values
        assert "RF 50mm F1.2L" in values
        assert "FE 85mm F1.4 GM" in values
        assert "Unknown" in values

    def test_camera_name(self, breakdown_client):
        client, _ = breakdown_client
        data = client.get("/api/breakdown?property=cameraName").json()
        values = {t["value"] for t in data["totals"]}
        assert "Canon EOS R5" in values
        assert "Sony A7III" in values
        assert "Nikon Z6" in values

    def test_focal_length(self, breakdown_client):
        client, _ = breakdown_client
        data = client.get("/api/breakdown?property=focalLength").json()
        # focalLength is numeric, will be float values
        values = {t["value"] for t in data["totals"]}
        assert 50.0 in values
        assert 85.0 in values

    def test_aperture(self, breakdown_client):
        client, _ = breakdown_client
        data = client.get("/api/breakdown?property=aperture").json()
        # Aperture values are already converted from APEX
        values = {t["value"] for t in data["totals"]}
        assert "f/1.4" in values  # APEX 1.0 -> f/1.4
        assert "f/5.7" in values  # APEX 5.0 -> f/5.7

    def test_shutter_speed(self, breakdown_client):
        client, _ = breakdown_client
        data = client.get("/api/breakdown?property=shutterSpeed").json()
        values = {t["value"] for t in data["totals"]}
        assert "1/128s" in values  # APEX 7.0 -> 1/128
        assert "1.0s" in values  # APEX 0.0 -> 1s


class TestBreakdownGroupings:
    def test_day_grouping(self, breakdown_client):
        client, _ = breakdown_client
        data = client.get("/api/breakdown?grouping=day").json()
        periods = {e["period"] for e in data["data"]}
        assert "2024-01-10" in periods
        assert "2023-10-15" in periods
        # Verify YYYY-MM-DD format
        for period in periods:
            assert len(period) == 10
            parts = period.split("-")
            assert len(parts) == 3
            assert all(p.isdigit() for p in parts)

    def test_week_grouping(self, breakdown_client):
        client, _ = breakdown_client
        data = client.get("/api/breakdown?grouping=week").json()
        periods = {e["period"] for e in data["data"]}
        # Verify YYYY-WNN format
        for period in periods:
            assert "-W" in period
            year_part, week_part = period.split("-W")
            assert year_part.isdigit()
            assert week_part.isdigit()
            assert 1 <= int(week_part) <= 53

    def test_month_grouping(self, breakdown_client):
        client, _ = breakdown_client
        data = client.get("/api/breakdown?grouping=month").json()
        periods = {e["period"] for e in data["data"]}
        assert "2024-01" in periods
        assert "2023-10" in periods
        # Verify YYYY-MM format
        for period in periods:
            assert len(period) == 7
            assert period[4] == "-"

    def test_quarter_grouping(self, breakdown_client):
        client, _ = breakdown_client
        data = client.get("/api/breakdown?grouping=quarter").json()
        periods = {e["period"] for e in data["data"]}
        assert "2023-Q4" in periods
        assert "2024-Q1" in periods
        assert "2024-Q2" in periods
        assert "2024-Q3" in periods
        # Verify YYYY-QN format
        for period in periods:
            assert "-Q" in period
            year_part, q_part = period.split("-Q")
            assert year_part.isdigit()
            assert q_part in ("1", "2", "3", "4")

    def test_year_grouping(self, breakdown_client):
        client, _ = breakdown_client
        data = client.get("/api/breakdown?grouping=year").json()
        periods = {e["period"] for e in data["data"]}
        assert "2023" in periods
        assert "2024" in periods
        # Verify YYYY format
        for period in periods:
            assert len(period) == 4
            assert period.isdigit()


class TestBreakdownTopN:
    def test_top_n_groups_excess_into_other(self, breakdown_client):
        client, _ = breakdown_client
        # With top_n=2, we have 4 lenses (RF 24-70, RF 50, FE 85, Unknown)
        # So 2 should remain and rest grouped as "Other"
        data = client.get("/api/breakdown?property=lensName&top_n=2").json()
        values = {t["value"] for t in data["totals"]}
        assert "Other" in values
        # Should have exactly 3 entries: top 2 + Other
        assert len(data["totals"]) == 3

    def test_top_n_larger_than_unique_no_other(self, breakdown_client):
        client, _ = breakdown_client
        # 3 cameras, top_n=50 (default) -> no "Other" needed
        data = client.get("/api/breakdown?property=cameraName&top_n=50").json()
        values = {t["value"] for t in data["totals"]}
        assert "Other" not in values

    def test_top_n_equal_to_unique_no_other(self, breakdown_client):
        client, _ = breakdown_client
        # 3 cameras, top_n=3 -> exactly enough, no "Other"
        data = client.get("/api/breakdown?property=cameraName&top_n=3").json()
        values = {t["value"] for t in data["totals"]}
        assert "Other" not in values

    def test_top_n_1(self, breakdown_client):
        client, _ = breakdown_client
        data = client.get("/api/breakdown?property=cameraName&top_n=1").json()
        values = {t["value"] for t in data["totals"]}
        assert "Other" in values
        # Should have exactly 2 entries: top 1 + Other
        assert len(data["totals"]) == 2

    def test_top_n_other_total_is_sum_of_remaining(self, breakdown_client):
        client, _ = breakdown_client
        # Get full breakdown first
        full = client.get("/api/breakdown?property=cameraName&top_n=100").json()
        full_totals = {t["value"]: t["count"] for t in full["totals"]}

        # Now with top_n=1
        limited = client.get("/api/breakdown?property=cameraName&top_n=1").json()
        limited_totals = {t["value"]: t["count"] for t in limited["totals"]}

        # The top camera count should match
        top_camera = limited["totals"][0]["value"]
        assert top_camera != "Other"
        assert limited_totals[top_camera] == full_totals[top_camera]

        # "Other" should equal sum of all remaining cameras
        other_expected = sum(c for name, c in full_totals.items() if name != top_camera)
        assert limited_totals["Other"] == other_expected

    def test_top_n_default_is_50(self, breakdown_client):
        client, _ = breakdown_client
        # No top_n param -> uses default 50
        data = client.get("/api/breakdown?property=cameraName").json()
        values = {t["value"] for t in data["totals"]}
        assert "Other" not in values  # 3 cameras, 50 > 3

    def test_top_n_max_100_rejects_101(self, breakdown_client):
        client, _ = breakdown_client
        resp = client.get("/api/breakdown?property=cameraName&top_n=101")
        assert resp.status_code == 422


class TestBreakdownTotals:
    def test_totals_sorted_descending(self, breakdown_client):
        client, _ = breakdown_client
        data = client.get("/api/breakdown?property=cameraName").json()
        counts = [t["count"] for t in data["totals"]]
        assert counts == sorted(counts, reverse=True)

    def test_totals_sum_equals_total_photos(self, breakdown_client):
        client, _ = breakdown_client
        data = client.get("/api/breakdown?property=cameraName").json()
        total = sum(t["count"] for t in data["totals"])
        assert total == 12  # 12 images in test data

    def test_data_sum_equals_totals_sum(self, breakdown_client):
        client, _ = breakdown_client
        data = client.get("/api/breakdown?property=lensName").json()
        data_sum = sum(e["count"] for e in data["data"])
        totals_sum = sum(t["count"] for t in data["totals"])
        assert data_sum == totals_sum


class TestBreakdownExcludeLenses:
    def test_exclude_single_lens(self, breakdown_client):
        client, _ = breakdown_client
        data = client.get("/api/breakdown?property=lensName&exclude_lenses=RF 24-70").json()
        values = {t["value"] for t in data["totals"]}
        assert "RF 24-70mm F2.8L" not in values

    def test_exclude_multiple_lenses(self, breakdown_client):
        client, _ = breakdown_client
        data = client.get("/api/breakdown?property=lensName&exclude_lenses=RF 24-70,FE 85").json()
        values = {t["value"] for t in data["totals"]}
        assert "RF 24-70mm F2.8L" not in values
        assert "FE 85mm F1.4 GM" not in values

    def test_exclude_lenses_case_insensitive(self, breakdown_client):
        client, _ = breakdown_client
        data = client.get("/api/breakdown?property=lensName&exclude_lenses=rf 24-70").json()
        values = {t["value"] for t in data["totals"]}
        assert "RF 24-70mm F2.8L" not in values

    def test_exclude_lenses_keeps_null_lens_images(self, breakdown_client):
        client, _ = breakdown_client
        # Excluding specific lenses should NOT exclude images with NULL lens
        data = client.get("/api/breakdown?property=lensName&exclude_lenses=RF 24-70").json()
        values = {t["value"] for t in data["totals"]}
        assert "Unknown" in values


class TestBreakdownWithFilters:
    def test_picks_only(self, breakdown_client):
        client, _ = breakdown_client
        data = client.get("/api/breakdown?picks_only=true").json()
        total = sum(t["count"] for t in data["totals"])
        # Picked images: 1, 3, 5, 7, 9, 11 = 6
        assert total == 6

    def test_min_rating(self, breakdown_client):
        client, _ = breakdown_client
        data = client.get("/api/breakdown?min_rating=4").json()
        total = sum(t["count"] for t in data["totals"])
        # Rating >= 4: images 1(4), 3(5), 5(4), 7(5), 10(4), 11(5) = 6
        assert total == 6

    def test_date_range(self, breakdown_client):
        client, _ = breakdown_client
        data = client.get("/api/breakdown?start_date=2024-01-01&end_date=2024-07-01").json()
        total = sum(t["count"] for t in data["totals"])
        # 2024 Q1+Q2: images 4, 5, 6, 7, 8, 9 = 6
        assert total == 6

    def test_exclude_cameras(self, breakdown_client):
        client, _ = breakdown_client
        data = client.get("/api/breakdown?exclude_cameras=sony").json()
        total = sum(t["count"] for t in data["totals"])
        # Sony images: 3, 4, 8, 12 = 4, so remaining = 12 - 4 = 8
        assert total == 8

    def test_combined_filters(self, breakdown_client):
        client, _ = breakdown_client
        data = client.get("/api/breakdown?picks_only=true&min_rating=5&exclude_cameras=sony").json()
        total = sum(t["count"] for t in data["totals"])
        # Picked + rating>=5 + not Sony: images 7(Canon,picked,5), 11(Canon,picked,5) = 2
        assert total == 2


class TestBreakdownEmptyResult:
    def test_empty_with_impossible_filter(self, breakdown_client):
        client, _ = breakdown_client
        data = client.get("/api/breakdown?exclude_cameras=canon,sony,nikon").json()
        assert data["data"] == []
        assert data["totals"] == []
        assert data["property"] == "lensName"
        assert data["grouping"] == "month"

    def test_empty_no_catalogs(self, tmp_path, monkeypatch):
        monkeypatch.setenv("CATALOG_DIR", str(tmp_path))

        from fastapi.testclient import TestClient

        with TestClient(app) as client:
            app.state.cache = CatalogCache()
            data = client.get("/api/breakdown").json()
            assert data["data"] == []
            assert data["totals"] == []


class TestBreakdownNullHandling:
    def test_null_lens_grouped_as_unknown(self, breakdown_client):
        client, _ = breakdown_client
        data = client.get("/api/breakdown?property=lensName").json()
        values = {t["value"] for t in data["totals"]}
        # Images 6 and 10 have NULL lens, should appear as "Unknown"
        assert "Unknown" in values
        unknown_total = next(t["count"] for t in data["totals"] if t["value"] == "Unknown")
        assert unknown_total == 2


class TestBreakdownValidation:
    def test_invalid_property(self, breakdown_client):
        client, _ = breakdown_client
        response = client.get("/api/breakdown?property=invalid")
        assert response.status_code == 422

    def test_invalid_grouping(self, breakdown_client):
        client, _ = breakdown_client
        response = client.get("/api/breakdown?grouping=invalid")
        assert response.status_code == 422


class TestBreakdownPeriodFormats:
    """Verify specific period format strings for each grouping."""

    def test_day_format_yyyy_mm_dd(self, breakdown_client):
        client, _ = breakdown_client
        # Use end_date past the capture time (2024-01-10T08:00:00)
        data = client.get(
            "/api/breakdown?grouping=day&start_date=2024-01-10&end_date=2024-01-11"
        ).json()
        assert len(data["data"]) > 0
        assert data["data"][0]["period"] == "2024-01-10"

    def test_month_format_yyyy_mm(self, breakdown_client):
        client, _ = breakdown_client
        data = client.get(
            "/api/breakdown?grouping=month&start_date=2024-01-01&end_date=2024-01-31"
        ).json()
        assert len(data["data"]) > 0
        assert data["data"][0]["period"] == "2024-01"

    def test_quarter_format_yyyy_qn(self, breakdown_client):
        client, _ = breakdown_client
        data = client.get(
            "/api/breakdown?grouping=quarter&start_date=2024-01-01&end_date=2024-03-31"
        ).json()
        periods = {e["period"] for e in data["data"]}
        assert "2024-Q1" in periods

    def test_year_format_yyyy(self, breakdown_client):
        client, _ = breakdown_client
        data = client.get("/api/breakdown?grouping=year").json()
        periods = {e["period"] for e in data["data"]}
        assert "2023" in periods
        assert "2024" in periods

    def test_week_format_yyyy_wnn(self, breakdown_client):
        client, _ = breakdown_client
        data = client.get(
            "/api/breakdown?grouping=week&start_date=2024-01-08&end_date=2024-01-14"
        ).json()
        assert len(data["data"]) > 0
        period = data["data"][0]["period"]
        assert "-W" in period
        year_part, week_part = period.split("-W")
        assert len(week_part) == 2  # Zero-padded


class TestBreakdownDataConsistency:
    def test_data_sorted_by_period(self, breakdown_client):
        client, _ = breakdown_client
        data = client.get("/api/breakdown?grouping=month").json()
        periods = [e["period"] for e in data["data"]]
        assert periods == sorted(periods)

    def test_specific_catalog_param(self, breakdown_client):
        client, catalog_path = breakdown_client
        data = client.get(f"/api/breakdown?catalog={catalog_path}").json()
        total = sum(t["count"] for t in data["totals"])
        assert total == 12
