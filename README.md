# Lightroom Analytics

A self-contained web app for analyzing **Adobe Lightroom Classic** catalog files (`.lrcat` SQLite databases). Get an interactive dashboard with charts, drilldowns, filtering, and stats on your photo metadata. No database, no auth — it reads your catalogs from a folder and caches everything in memory.

## Quick start (Docker)

Pull and run the image from GitHub Container Registry. Mount a directory that contains your `.lrcat` file(s):

```bash
docker run -d \
  --name lightroom-analytics \
  -p 8118:8118 \
  -v /path/to/your/catalogs:/catalogs \
  ghcr.io/pppontusw/lightroom-analytics:latest
```

Then open **http://localhost:8118** in your browser.

- Replace `/path/to/your/catalogs` with the folder where your Lightroom catalog (`.lrcat`) lives. The app discovers all `.lrcat` files in that directory. The volume must be read-write so SQLite can write WAL/shm files when opening the database; the app does not modify your catalog data.
- The app listens on port **8118** by default.

### Docker Compose

Create a `docker-compose.yml` (adjust the host path under `volumes` to where your `.lrcat` lives):

```yaml
services:
  lightroom-analytics:
    image: ghcr.io/pppontusw/lightroom-analytics:latest
    ports:
      - "8118:8118"
    volumes:
      - /path/to/your/catalogs:/catalogs
    # Optional: override defaults
    # environment:
    #   CATALOG_DIR: /catalogs
    #   CACHE_REFRESH_HOURS: "4"
    #   LOG_LEVEL: info
    restart: unless-stopped
```

Then run:

```bash
docker compose up -d
```

Open **http://localhost:8118**. To refresh the catalog cache without restarting, use the refresh control in the app or restart the service: `docker compose restart lightroom-analytics`.

## Configuration

All settings are via environment variables. None are required for basic use.

| Variable | Default | Description |
|----------|---------|-------------|
| `CATALOG_DIR` | `/catalogs` | Directory to scan for `.lrcat` files (use the same path as in your `-v` mount). |
| `PORT` | `8118` | Server port inside the container (map it with `-p` as above). |
| `CACHE_REFRESH_HOURS` | `4` | Hours between automatic cache refreshes. |
| `LOG_LEVEL` | `info` | Logging: `debug`, `info`, `warning`, `error`. |

Example with custom catalog path and refresh interval:

```bash
docker run -d \
  --name lightroom-analytics \
  -p 8118:8118 \
  -e CATALOG_DIR=/catalogs \
  -e CACHE_REFRESH_HOURS=2 \
  -v /path/to/your/catalogs:/catalogs \
  ghcr.io/pppontusw/lightroom-analytics:latest
```

## What you get

- **Overview** — Totals, date range, top cameras/lenses.
- **Gear breakdown** — Camera and lens usage, focal length, aperture, shutter speed.
- **Shooting heatmap** — When you shoot over time.
- **Drilldown explorer** — Filter and slice by catalog, date, camera, lens, etc.
- **Comparison** — Compare metrics across catalogs or segments.
- **Rating analysis** — Star ratings and pick flags.

Filters (date range, picks only, min rating, exclude cameras) are applied across views and can be stored in the URL.

## Requirements

- **Lightroom Classic** catalogs (`.lrcat`). The app reads the SQLite DB and EXIF-derived metadata; it does not need access to your photo files.
- Single-user, local/network use — no login. Keep the app on a trusted network.

## Image tags

- `ghcr.io/pppontusw/lightroom-analytics:latest` — latest release (use this for “just run it”).
- Replace `:latest` with a specific version tag if you pin releases.

## License

This project is licensed under the [MIT License](LICENSE).
