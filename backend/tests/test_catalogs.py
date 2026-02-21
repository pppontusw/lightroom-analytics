import pytest

from backend.app.services.catalog_service import discover_catalogs


@pytest.fixture
def catalog_tree(tmp_path):
    """Create a temporary directory tree with .lrcat files and files that should be excluded."""
    # Valid catalog at root level
    root_catalog = tmp_path / "MyPhotos.lrcat"
    root_catalog.write_bytes(b"\x00" * 1024)

    # Lock/journal/WAL files that must be excluded
    (tmp_path / "MyPhotos.lrcat-lock").write_bytes(b"")
    (tmp_path / "MyPhotos.lrcat-journal").write_bytes(b"")
    (tmp_path / "MyPhotos.lrcat-wal").write_bytes(b"")

    # Nested catalog in subdirectory
    subdir = tmp_path / "backups" / "2024"
    subdir.mkdir(parents=True)
    nested_catalog = subdir / "Archive.lrcat"
    nested_catalog.write_bytes(b"\x00" * 2048)

    # Non-lrcat file that should be ignored
    (tmp_path / "notes.txt").write_bytes(b"not a catalog")

    return tmp_path


def test_discover_finds_valid_catalogs(catalog_tree):
    result = discover_catalogs(str(catalog_tree))
    names = [c["name"] for c in result]
    assert "MyPhotos" in names
    assert "Archive" in names
    assert len(result) == 2


def test_discover_excludes_lock_files(catalog_tree):
    result = discover_catalogs(str(catalog_tree))
    paths = [c["path"] for c in result]
    for path in paths:
        assert not path.endswith(".lrcat-lock")
        assert not path.endswith(".lrcat-journal")
        assert not path.endswith(".lrcat-wal")


def test_discover_finds_nested_catalogs(catalog_tree):
    result = discover_catalogs(str(catalog_tree))
    nested = [c for c in result if c["name"] == "Archive"]
    assert len(nested) == 1
    assert "backups" in nested[0]["path"]


def test_discover_returns_correct_structure(catalog_tree):
    result = discover_catalogs(str(catalog_tree))
    for catalog in result:
        assert "path" in catalog
        assert "name" in catalog
        assert "size_mb" in catalog
        assert isinstance(catalog["path"], str)
        assert isinstance(catalog["name"], str)
        assert isinstance(catalog["size_mb"], float)


def test_discover_calculates_size(catalog_tree):
    result = discover_catalogs(str(catalog_tree))
    root_cat = [c for c in result if c["name"] == "MyPhotos"][0]
    # 1024 bytes = 0.0 MB (rounded to 1 decimal)
    assert root_cat["size_mb"] == 0.0


def test_discover_empty_directory(tmp_path):
    result = discover_catalogs(str(tmp_path))
    assert result == []


def test_discover_nonexistent_directory():
    result = discover_catalogs("/nonexistent/path/that/does/not/exist")
    assert result == []


def test_catalogs_endpoint_returns_json(client, tmp_path, monkeypatch):
    # Create a catalog in a temp dir
    catalog = tmp_path / "Test.lrcat"
    catalog.write_bytes(b"\x00" * 512)
    monkeypatch.setenv("CATALOG_DIR", str(tmp_path))

    response = client.get("/api/catalogs")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["name"] == "Test"
    assert data[0]["size_mb"] == 0.0
    assert data[0]["path"] == str(catalog)


def test_catalogs_endpoint_empty_dir(client, tmp_path, monkeypatch):
    monkeypatch.setenv("CATALOG_DIR", str(tmp_path))

    response = client.get("/api/catalogs")
    assert response.status_code == 200
    assert response.json() == []


def test_catalogs_endpoint_nonexistent_dir(client, monkeypatch):
    monkeypatch.setenv("CATALOG_DIR", "/nonexistent/dir")

    response = client.get("/api/catalogs")
    assert response.status_code == 200
    assert response.json() == []
