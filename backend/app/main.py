import logging
from contextlib import asynccontextmanager
from pathlib import Path

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from backend.app.config import get_settings
from backend.app.routers.api import router as api_router
from backend.app.services.cache import CatalogCache

settings = get_settings()

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    cache = CatalogCache()

    # Store cache on app state so routers can access it without circular imports
    app.state.cache = cache

    # Load all catalogs into memory on startup
    cache.load_all(settings.catalog_dir)

    # Start background scheduler for periodic refresh
    scheduler = BackgroundScheduler()
    scheduler.add_job(
        cache.refresh,
        "interval",
        hours=settings.cache_refresh_hours,
        args=[settings.catalog_dir],
        id="cache_refresh",
    )
    scheduler.start()
    logger.info(
        "Background cache refresh scheduled every %d hour(s)",
        settings.cache_refresh_hours,
    )

    yield

    # Shutdown scheduler
    scheduler.shutdown(wait=False)
    logger.info("Background scheduler stopped")


app = FastAPI(title="Lightroom Analytics", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")

# Resolve the frontend dist directory (relative to project root)
_DIST_DIR = Path(__file__).resolve().parent.parent.parent / "dist"

# Mount static assets if the frontend has been built
if _DIST_DIR.is_dir() and (_DIST_DIR / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=str(_DIST_DIR / "assets")), name="assets")


@app.get("/{full_path:path}")
def serve_spa(full_path: str):
    index = _DIST_DIR / "index.html"
    if index.is_file():
        return FileResponse(str(index))
    return JSONResponse(
        status_code=404,
        content={"detail": "Frontend not built yet"},
    )
