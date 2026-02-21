import logging
import threading
from datetime import datetime, timezone

import pandas as pd

from backend.app.services.catalog_service import discover_catalogs
from backend.app.services.data_reader import read_catalog

logger = logging.getLogger(__name__)


class CatalogCache:
    """In-memory cache of processed catalog DataFrames, keyed by file path."""

    def __init__(self):
        self._cache: dict[str, pd.DataFrame] = {}
        self._last_refreshed: dict[str, datetime] = {}
        self._lock = threading.Lock()

    def get(self, catalog_path: str) -> pd.DataFrame | None:
        """Get cached DataFrame for a catalog, or None if not cached."""
        with self._lock:
            return self._cache.get(catalog_path)

    def load(self, catalog_path: str) -> pd.DataFrame:
        """Read catalog from disk, process it, cache it, return it."""
        logger.info("Loading catalog: %s", catalog_path)
        df = read_catalog(catalog_path)
        with self._lock:
            self._cache[catalog_path] = df
            self._last_refreshed[catalog_path] = datetime.now(timezone.utc)
        logger.info("Cached catalog: %s (%d rows)", catalog_path, len(df))
        return df

    def load_all(self, catalog_dir: str) -> None:
        """Discover and load all catalogs in the directory."""
        catalogs = discover_catalogs(catalog_dir)
        logger.info("Discovered %d catalog(s) in %s", len(catalogs), catalog_dir)
        for catalog in catalogs:
            self.load(catalog["path"])

    def refresh(self, catalog_dir: str) -> None:
        """Re-discover and reload all catalogs (re-scan for new/removed files)."""
        logger.info("Refreshing catalogs from %s", catalog_dir)
        catalogs = discover_catalogs(catalog_dir)
        new_paths = {c["path"] for c in catalogs}

        # Remove catalogs that no longer exist on disk
        with self._lock:
            removed = [p for p in self._cache if p not in new_paths]
            for p in removed:
                del self._cache[p]
                del self._last_refreshed[p]
                logger.info("Removed stale catalog from cache: %s", p)

        # Load (or reload) all discovered catalogs
        for catalog in catalogs:
            self.load(catalog["path"])

    def get_or_load(self, catalog_path: str) -> pd.DataFrame:
        """Return cached data, or load from disk if not cached."""
        df = self.get(catalog_path)
        if df is not None:
            return df
        return self.load(catalog_path)

    def list_cached(self) -> list[str]:
        """Return list of cached catalog paths."""
        with self._lock:
            return list(self._cache.keys())


def get_filtered_data(
    cache: CatalogCache,
    catalog: str | None,
    catalog_dir: str,
    start_date: str | None = None,
    end_date: str | None = None,
    picks_only: bool = False,
    min_rating: int = 0,
    exclude_cameras: str = "",
    exclude_lenses: str = "",
) -> pd.DataFrame:
    """Get cached data for a catalog, applying common filters.

    If catalog is None, uses the first discovered catalog.
    Returns a filtered copy - never mutates the cache.
    """
    if catalog is None:
        cached = cache.list_cached()
        if not cached:
            # Try discovering catalogs first
            catalogs = discover_catalogs(catalog_dir)
            if not catalogs:
                return pd.DataFrame()
            catalog = catalogs[0]["path"]
        else:
            catalog = cached[0]

    df = cache.get_or_load(catalog)
    df = df.copy()

    # Date range filter
    if start_date is not None and "captureTime" in df.columns:
        start = pd.to_datetime(start_date)
        df = df[df["captureTime"] >= start]

    if end_date is not None and "captureTime" in df.columns:
        end = pd.to_datetime(end_date)
        df = df[df["captureTime"] <= end]

    # Picks only filter
    if picks_only and "pick" in df.columns:
        df = df[df["pick"] == 1.0]

    # Min rating filter
    if min_rating > 0 and "rating" in df.columns:
        df = df[df["rating"] >= min_rating]

    # Camera exclusion filter (comma-separated substrings, case-insensitive)
    if exclude_cameras and "cameraName" in df.columns:
        exclusions = [s.strip().lower() for s in exclude_cameras.split(",") if s.strip()]
        if exclusions:
            mask = df["cameraName"].apply(
                lambda name: not any(exc in str(name).lower() for exc in exclusions)
            )
            df = df[mask]

    # Lens exclusion filter (comma-separated substrings, case-insensitive)
    if exclude_lenses and "lensName" in df.columns:
        exclusions = [s.strip().lower() for s in exclude_lenses.split(",") if s.strip()]
        if exclusions:
            mask = df["lensName"].apply(
                lambda name: (
                    not any(exc in str(name).lower() for exc in exclusions)
                    if pd.notna(name)
                    else True
                )  # Keep rows with NULL lens (not excluded)
            )
            df = df[mask]

    return df
