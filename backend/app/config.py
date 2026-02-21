import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    catalog_dir: str = "/catalogs"
    port: int = 8118
    cache_refresh_hours: int = 4
    refresh_cooldown_seconds: int = 300
    refresh_rate_limit_per_minute: int = 10
    log_level: str = "info"


def get_settings() -> Settings:
    return Settings(
        catalog_dir=os.environ.get("CATALOG_DIR", Settings.catalog_dir),
        port=int(os.environ.get("PORT", Settings.port)),
        cache_refresh_hours=int(
            os.environ.get("CACHE_REFRESH_HOURS", Settings.cache_refresh_hours)
        ),
        refresh_cooldown_seconds=int(
            os.environ.get("REFRESH_COOLDOWN_SECONDS", Settings.refresh_cooldown_seconds)
        ),
        refresh_rate_limit_per_minute=int(
            os.environ.get(
                "REFRESH_RATE_LIMIT_PER_MINUTE",
                Settings.refresh_rate_limit_per_minute,
            )
        ),
        log_level=os.environ.get("LOG_LEVEL", Settings.log_level).lower(),
    )
