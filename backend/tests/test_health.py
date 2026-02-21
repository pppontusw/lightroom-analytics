import os

from backend.app.config import Settings, get_settings


def test_health_returns_ok(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_no_trailing_slash(client):
    response = client.get("/api/health/")
    assert response.status_code != 200 or response.url.path == "/api/health"


def test_health_response_content_type(client):
    response = client.get("/api/health")
    assert response.headers["content-type"] == "application/json"


def test_spa_fallback_without_dist(client):
    response = client.get("/some/random/path")
    # Without a dist/index.html, should return 404
    # With a dist/index.html present, should return 200 with the SPA
    assert response.status_code in (200, 404)
    if response.status_code == 404:
        assert response.json() == {"detail": "Frontend not built yet"}


def test_config_defaults():
    env_vars = ["CATALOG_DIR", "PORT", "CACHE_REFRESH_HOURS", "LOG_LEVEL"]
    old_values = {k: os.environ.pop(k, None) for k in env_vars}

    try:
        settings = get_settings()
        assert settings.catalog_dir == "/catalogs"
        assert settings.port == 8118
        assert settings.cache_refresh_hours == 4
        assert settings.log_level == "info"
    finally:
        for k, v in old_values.items():
            if v is not None:
                os.environ[k] = v


def test_config_from_env():
    env_overrides = {
        "CATALOG_DIR": "/my/catalogs",
        "PORT": "9999",
        "CACHE_REFRESH_HOURS": "12",
        "LOG_LEVEL": "DEBUG",
    }
    old_values = {k: os.environ.get(k) for k in env_overrides}

    try:
        os.environ.update(env_overrides)
        settings = get_settings()
        assert settings.catalog_dir == "/my/catalogs"
        assert settings.port == 9999
        assert settings.cache_refresh_hours == 12
        assert settings.log_level == "debug"
    finally:
        for k, v in old_values.items():
            if v is not None:
                os.environ[k] = v
            else:
                os.environ.pop(k, None)


def test_settings_dataclass_defaults():
    defaults = Settings()
    assert defaults.catalog_dir == "/catalogs"
    assert defaults.port == 8118
    assert defaults.cache_refresh_hours == 4
    assert defaults.log_level == "info"
