import sqlite3

import pandas as pd
import pytest

from backend.app.services.cache import CatalogCache, InvalidCatalogError, get_filtered_data


def _create_sample_catalog(path):
    """Create a minimal .lrcat SQLite file with test data."""
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

    # Image 1: Picked, high rating, Canon
    cursor.execute(
        "INSERT INTO Adobe_images (id_local, captureTime, pick, rating) "
        "VALUES (1, '2024-03-15T14:30:00', 1.0, 4.0)"
    )
    cursor.execute(
        "INSERT INTO AgHarvestedExifMetadata "
        "(id_local, image, cameraModelRef, lensRef, focalLength, aperture, shutterSpeed) "
        "VALUES (1, 1, 1, 1, 50.0, 5.0, 7.0)"
    )

    # Image 2: Not picked, low rating, Sony
    cursor.execute(
        "INSERT INTO Adobe_images (id_local, captureTime, pick, rating) "
        "VALUES (2, '2024-06-01T09:15:00', 0.0, 2.0)"
    )
    cursor.execute(
        "INSERT INTO AgHarvestedExifMetadata "
        "(id_local, image, cameraModelRef, lensRef, focalLength, aperture, shutterSpeed) "
        "VALUES (2, 2, 2, NULL, 85.0, 2.0, 0.0)"
    )

    # Image 3: Picked, high rating, Canon, earlier date
    cursor.execute(
        "INSERT INTO Adobe_images (id_local, captureTime, pick, rating) "
        "VALUES (3, '2023-12-25T10:00:00', 1.0, 5.0)"
    )
    cursor.execute(
        "INSERT INTO AgHarvestedExifMetadata "
        "(id_local, image, cameraModelRef, lensRef, focalLength, aperture, shutterSpeed) "
        "VALUES (3, 3, 1, 1, 35.0, 3.0, 3.0)"
    )

    # Image 4: Not picked, no rating, Sony
    cursor.execute(
        "INSERT INTO Adobe_images (id_local, captureTime, pick, rating) "
        "VALUES (4, '2024-01-10T08:00:00', 0.0, 0.0)"
    )
    cursor.execute(
        "INSERT INTO AgHarvestedExifMetadata "
        "(id_local, image, cameraModelRef, lensRef, focalLength, aperture, shutterSpeed) "
        "VALUES (4, 4, 2, 1, 24.0, 6.0, 5.0)"
    )

    conn.commit()
    conn.close()
    return str(path)


@pytest.fixture
def sample_catalog(tmp_path):
    """Create a single sample catalog."""
    return _create_sample_catalog(tmp_path / "test.lrcat")


@pytest.fixture
def catalog_dir(tmp_path):
    """Create a directory with two sample catalogs."""
    _create_sample_catalog(tmp_path / "catalog_a.lrcat")
    _create_sample_catalog(tmp_path / "catalog_b.lrcat")
    return str(tmp_path)


# --- CatalogCache tests ---


class TestCatalogCacheLoad:
    def test_load_populates_cache(self, sample_catalog):
        cache = CatalogCache()
        df = cache.load(sample_catalog)
        assert isinstance(df, pd.DataFrame)
        assert len(df) == 4
        assert sample_catalog in cache.list_cached()

    def test_load_returns_dataframe(self, sample_catalog):
        cache = CatalogCache()
        df = cache.load(sample_catalog)
        assert "cameraName" in df.columns
        assert "captureTime" in df.columns


class TestCatalogCacheGet:
    def test_get_returns_none_when_not_cached(self):
        cache = CatalogCache()
        assert cache.get("/nonexistent/path") is None

    def test_get_returns_cached_data(self, sample_catalog):
        cache = CatalogCache()
        cache.load(sample_catalog)
        df = cache.get(sample_catalog)
        assert df is not None
        assert len(df) == 4

    def test_get_returns_data_without_re_reading_disk(self, sample_catalog):
        cache = CatalogCache()
        cache.load(sample_catalog)

        # Modify internal cache to prove get doesn't re-read from disk
        with cache._lock:
            cache._cache[sample_catalog] = pd.DataFrame({"marker": [1]})

        df = cache.get(sample_catalog)
        assert "marker" in df.columns
        assert len(df) == 1


class TestCatalogCacheGetOrLoad:
    def test_returns_cached_if_available(self, sample_catalog):
        cache = CatalogCache()
        cache.load(sample_catalog)

        # Replace with marker data
        with cache._lock:
            cache._cache[sample_catalog] = pd.DataFrame({"marker": [1]})

        df = cache.get_or_load(sample_catalog)
        assert "marker" in df.columns

    def test_loads_from_disk_if_not_cached(self, sample_catalog):
        cache = CatalogCache()
        df = cache.get_or_load(sample_catalog)
        assert len(df) == 4
        assert sample_catalog in cache.list_cached()


class TestCatalogCacheLoadAll:
    def test_load_all_discovers_and_caches(self, catalog_dir):
        cache = CatalogCache()
        cache.load_all(catalog_dir)
        cached = cache.list_cached()
        assert len(cached) == 2

    def test_load_all_empty_dir(self, tmp_path):
        cache = CatalogCache()
        cache.load_all(str(tmp_path))
        assert cache.list_cached() == []

    def test_load_all_nonexistent_dir(self):
        cache = CatalogCache()
        cache.load_all("/nonexistent/dir")
        assert cache.list_cached() == []


class TestCatalogCacheRefresh:
    def test_refresh_reloads_from_disk(self, catalog_dir):
        cache = CatalogCache()
        cache.load_all(catalog_dir)
        assert len(cache.list_cached()) == 2

        # Refresh should reload everything
        cache.refresh(catalog_dir)
        assert len(cache.list_cached()) == 2

    def test_refresh_removes_stale_entries(self, tmp_path):
        cache = CatalogCache()
        catalog_path = _create_sample_catalog(tmp_path / "test.lrcat")
        cache.load(catalog_path)
        assert len(cache.list_cached()) == 1

        # Remove the catalog file from disk
        import os

        os.remove(catalog_path)

        # Refresh should remove the stale entry
        cache.refresh(str(tmp_path))
        assert cache.list_cached() == []

    def test_refresh_picks_up_new_catalogs(self, tmp_path):
        cache = CatalogCache()
        _create_sample_catalog(tmp_path / "first.lrcat")
        cache.load_all(str(tmp_path))
        assert len(cache.list_cached()) == 1

        # Add a new catalog
        _create_sample_catalog(tmp_path / "second.lrcat")

        cache.refresh(str(tmp_path))
        assert len(cache.list_cached()) == 2


class TestCatalogCacheListCached:
    def test_list_empty(self):
        cache = CatalogCache()
        assert cache.list_cached() == []

    def test_list_returns_paths(self, sample_catalog):
        cache = CatalogCache()
        cache.load(sample_catalog)
        cached = cache.list_cached()
        assert cached == [sample_catalog]


# --- Refresh endpoint test ---


class TestRefreshEndpoint:
    def test_refresh_returns_ok(self, client, tmp_path, monkeypatch):
        monkeypatch.setenv("CATALOG_DIR", str(tmp_path))
        response = client.post("/api/refresh")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

    def test_refresh_with_catalogs(self, client, tmp_path, monkeypatch):
        _create_sample_catalog(tmp_path / "test.lrcat")
        monkeypatch.setenv("CATALOG_DIR", str(tmp_path))

        response = client.post("/api/refresh")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

    def test_refresh_get_method_not_allowed(self, client, tmp_path, monkeypatch):
        monkeypatch.setenv("CATALOG_DIR", str(tmp_path))
        response = client.get("/api/refresh")
        # GET falls through to SPA fallback (404), not allowed on POST-only route
        assert response.status_code != 200

    def test_refresh_respects_cooldown(self, client, tmp_path, monkeypatch):
        monkeypatch.setenv("CATALOG_DIR", str(tmp_path))
        monkeypatch.setenv("REFRESH_COOLDOWN_SECONDS", "60")
        monkeypatch.setenv("REFRESH_RATE_LIMIT_PER_MINUTE", "100")

        first = client.post("/api/refresh")
        second = client.post("/api/refresh")

        assert first.status_code == 200
        assert second.status_code == 429
        assert "Refresh cooldown active" in second.json()["detail"]

    def test_refresh_rate_limit(self, client, tmp_path, monkeypatch):
        monkeypatch.setenv("CATALOG_DIR", str(tmp_path))
        monkeypatch.setenv("REFRESH_COOLDOWN_SECONDS", "0")
        monkeypatch.setenv("REFRESH_RATE_LIMIT_PER_MINUTE", "1")

        first = client.post("/api/refresh")
        second = client.post("/api/refresh")

        assert first.status_code == 200
        assert second.status_code == 429
        assert "Refresh rate limit exceeded" in second.json()["detail"]


# --- get_filtered_data tests ---


class TestGetFilteredData:
    @pytest.fixture
    def loaded_cache(self, sample_catalog):
        cache = CatalogCache()
        cache.load(sample_catalog)
        return cache, sample_catalog

    def test_returns_all_when_no_filters(self, loaded_cache, tmp_path):
        cache, catalog_path = loaded_cache
        df = get_filtered_data(cache, catalog_path, str(tmp_path))
        assert len(df) == 4

    def test_default_catalog_when_none(self, loaded_cache, tmp_path):
        cache, _ = loaded_cache
        df = get_filtered_data(cache, None, str(tmp_path))
        assert len(df) == 4

    def test_default_catalog_from_discovery(self, tmp_path):
        _create_sample_catalog(tmp_path / "auto.lrcat")
        cache = CatalogCache()
        # Don't pre-load — get_filtered_data should load via get_or_load
        df = get_filtered_data(cache, None, str(tmp_path))
        assert len(df) == 4

    def test_invalid_catalog_rejected(self, tmp_path):
        _create_sample_catalog(tmp_path / "auto.lrcat")
        cache = CatalogCache()

        with pytest.raises(InvalidCatalogError):
            get_filtered_data(cache, "/tmp/not-discovered.lrcat", str(tmp_path))

    def test_returns_empty_for_no_catalogs(self, tmp_path):
        cache = CatalogCache()
        df = get_filtered_data(cache, None, str(tmp_path))
        assert len(df) == 0

    def test_date_range_start(self, loaded_cache, tmp_path):
        cache, catalog_path = loaded_cache
        df = get_filtered_data(cache, catalog_path, str(tmp_path), start_date="2024-01-01")
        # Should exclude Image 3 (2023-12-25)
        assert len(df) == 3

    def test_date_range_end(self, loaded_cache, tmp_path):
        cache, catalog_path = loaded_cache
        df = get_filtered_data(cache, catalog_path, str(tmp_path), end_date="2024-01-31")
        # Should include Image 3 (2023-12-25) and Image 4 (2024-01-10)
        assert len(df) == 2

    def test_date_range_both(self, loaded_cache, tmp_path):
        cache, catalog_path = loaded_cache
        df = get_filtered_data(
            cache,
            catalog_path,
            str(tmp_path),
            start_date="2024-01-01",
            end_date="2024-04-01",
        )
        # Image 1 (2024-03-15) and Image 4 (2024-01-10)
        assert len(df) == 2

    def test_picks_only(self, loaded_cache, tmp_path):
        cache, catalog_path = loaded_cache
        df = get_filtered_data(cache, catalog_path, str(tmp_path), picks_only=True)
        # Images 1 and 3 are picked
        assert len(df) == 2
        assert all(df["pick"] == 1.0)

    def test_min_rating(self, loaded_cache, tmp_path):
        cache, catalog_path = loaded_cache
        df = get_filtered_data(cache, catalog_path, str(tmp_path), min_rating=4)
        # Image 1 (rating 4) and Image 3 (rating 5)
        assert len(df) == 2
        assert all(df["rating"] >= 4)

    def test_min_rating_zero_is_no_filter(self, loaded_cache, tmp_path):
        cache, catalog_path = loaded_cache
        df = get_filtered_data(cache, catalog_path, str(tmp_path), min_rating=0)
        assert len(df) == 4

    def test_exclude_cameras(self, loaded_cache, tmp_path):
        cache, catalog_path = loaded_cache
        df = get_filtered_data(cache, catalog_path, str(tmp_path), exclude_cameras="sony")
        # Exclude Sony A7III — Images 2 and 4
        assert len(df) == 2
        assert all("Canon" in name for name in df["cameraName"])

    def test_exclude_cameras_case_insensitive(self, loaded_cache, tmp_path):
        cache, catalog_path = loaded_cache
        df = get_filtered_data(cache, catalog_path, str(tmp_path), exclude_cameras="CANON")
        # Exclude Canon EOS R5 — Images 1 and 3
        assert len(df) == 2
        assert all("Sony" in name for name in df["cameraName"])

    def test_exclude_cameras_multiple(self, loaded_cache, tmp_path):
        cache, catalog_path = loaded_cache
        df = get_filtered_data(cache, catalog_path, str(tmp_path), exclude_cameras="canon,sony")
        assert len(df) == 0

    def test_exclude_cameras_substring_match(self, loaded_cache, tmp_path):
        cache, catalog_path = loaded_cache
        df = get_filtered_data(cache, catalog_path, str(tmp_path), exclude_cameras="eos")
        # "eos" matches "Canon EOS R5"
        assert len(df) == 2
        assert all("Sony" in name for name in df["cameraName"])

    def test_exclude_cameras_empty_string_is_no_filter(self, loaded_cache, tmp_path):
        cache, catalog_path = loaded_cache
        df = get_filtered_data(cache, catalog_path, str(tmp_path), exclude_cameras="")
        assert len(df) == 4

    def test_multiple_filters_combine_with_and(self, loaded_cache, tmp_path):
        cache, catalog_path = loaded_cache
        df = get_filtered_data(
            cache,
            catalog_path,
            str(tmp_path),
            picks_only=True,
            min_rating=5,
            exclude_cameras="sony",
        )
        # Only Image 3: picked, rating 5, Canon
        assert len(df) == 1
        assert df.iloc[0]["rating"] == 5.0
        assert df.iloc[0]["pick"] == 1.0
        assert "Canon" in df.iloc[0]["cameraName"]

    def test_exclude_lenses(self, loaded_cache, tmp_path):
        cache, catalog_path = loaded_cache
        df = get_filtered_data(cache, catalog_path, str(tmp_path), exclude_lenses="RF 24-70")
        # All images use RF 24-70mm (image 2 has NULL lens, kept)
        lens_names = df["lensName"].dropna().unique()
        for name in lens_names:
            assert "RF 24-70" not in name

    def test_exclude_lenses_keeps_null(self, loaded_cache, tmp_path):
        cache, catalog_path = loaded_cache
        df = get_filtered_data(cache, catalog_path, str(tmp_path), exclude_lenses="RF 24-70")
        # Image 2 has NULL lens and should be kept
        assert df["lensName"].isna().any()

    def test_does_not_mutate_cache(self, loaded_cache, tmp_path):
        cache, catalog_path = loaded_cache
        original_df = cache.get(catalog_path)
        original_len = len(original_df)

        # Apply restrictive filters
        get_filtered_data(
            cache,
            catalog_path,
            str(tmp_path),
            picks_only=True,
            min_rating=5,
        )

        # Cache should still have all rows
        cached_df = cache.get(catalog_path)
        assert len(cached_df) == original_len
