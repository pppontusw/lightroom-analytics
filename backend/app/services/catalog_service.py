from pathlib import Path

EXCLUDED_SUFFIXES = {".lrcat-lock", ".lrcat-journal", ".lrcat-wal"}


def discover_catalogs(catalog_dir: str) -> list[dict]:
    """Recursively scan catalog_dir for .lrcat files, excluding lock/journal/WAL files."""
    catalog_path = Path(catalog_dir)

    if not catalog_path.is_dir():
        return []

    catalogs = []
    for path in sorted(catalog_path.rglob("*.lrcat*")):
        if not path.is_file():
            continue
        if path.suffix in EXCLUDED_SUFFIXES:
            continue
        if not path.name.endswith(".lrcat"):
            continue

        size_mb = round(path.stat().st_size / (1024 * 1024), 1)
        catalogs.append(
            {
                "path": str(path),
                "name": path.stem,
                "size_mb": size_mb,
            }
        )

    return catalogs
