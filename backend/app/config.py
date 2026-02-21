import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    catalog_dir: str = "/catalogs"
    port: int = 8118
    cache_refresh_hours: int = 4
    log_level: str = "info"


def get_settings() -> Settings:
    return Settings(
        catalog_dir=os.environ.get("CATALOG_DIR", Settings.catalog_dir),
        port=int(os.environ.get("PORT", Settings.port)),
        cache_refresh_hours=int(
            os.environ.get("CACHE_REFRESH_HOURS", Settings.cache_refresh_hours)
        ),
        log_level=os.environ.get("LOG_LEVEL", Settings.log_level).lower(),
    )
