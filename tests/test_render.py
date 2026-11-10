"""Tests for the NDVI PNG rendering and the image endpoints."""

from dataclasses import replace
from pathlib import Path

import numpy as np
import pytest
import rasterio
from fastapi.testclient import TestClient
from rasterio.io import MemoryFile
from rasterio.transform import from_origin
from sqlalchemy.orm import Session

from app.models import Field
from app.services.history import save_observation
from app.services.ndvi import index_cog_path
from app.services.render import NDMI_STOPS, colorize, image_bounds, render_png
from tests.factories import make_result

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def _write_ndvi_cog(path: Path) -> Path:
    """A 20 x 20 NDVI raster near Tashkent (UTM 42N) with a NaN corner."""
    data = np.full((20, 20), 0.7, dtype=np.float32)
    data[:5, :5] = np.nan
    with rasterio.open(
        path,
        "w",
        driver="COG",
        height=20,
        width=20,
        count=1,
        dtype="float32",
        crs="EPSG:32642",
        transform=from_origin(516_800, 4_573_000, 10, 10),
        nodata=np.nan,
    ) as dst:
        dst.write(data, 1)
    return path


def test_colorize_maps_low_to_red_high_to_green_and_nan_to_transparent() -> None:
    rgba = colorize(np.array([[-0.2, 0.9, np.nan]], dtype=np.float32))

    assert tuple(rgba[:, 0, 0]) == (165, 0, 38, 255)
    assert tuple(rgba[:, 0, 1]) == (0, 104, 55, 255)
    assert rgba[3, 0, 2] == 0


def test_render_png_and_bounds(tmp_path: Path) -> None:
    cog = _write_ndvi_cog(tmp_path / "ndvi.tif")

    png = render_png(cog)
    west, south, east, north = image_bounds(cog)

    assert png.startswith(PNG_SIGNATURE)
    with MemoryFile(png) as memfile, memfile.open() as image:
        assert image.count == 4
        alpha = image.read(4)
        assert alpha.min() == 0 and alpha.max() == 255
    # Near Tashkent: about 69.2 E, 41.3 N, and about 200 m wide.
    assert 69.1 < west < east < 69.3
    assert 41.2 < south < north < 41.4
    assert (east - west) == pytest.approx(0.0024, abs=0.0005)


def test_image_endpoints(db_client: TestClient, db_session: Session, field: Field, tmp_path: Path) -> None:
    cog = _write_ndvi_cog(tmp_path / "ndvi.tif")
    result = replace(make_result(18, 0.7), cog_path=str(cog))
    observation = save_observation(db_session, field.id, result)

    info = db_client.get(f"/observations/{observation.id}/image")
    png = db_client.get(f"/observations/{observation.id}/image.png")

    assert info.status_code == 200
    assert info.json()["url"] == f"/observations/{observation.id}/image.png"
    assert len(info.json()["bounds"]) == 4
    assert png.status_code == 200
    assert png.headers["content-type"] == "image/png"
    assert png.content.startswith(PNG_SIGNATURE)


def test_image_endpoint_404(db_client: TestClient, db_session: Session, field: Field) -> None:
    observation = save_observation(db_session, field.id, make_result(18, 0.7))  # its COG file does not exist

    assert db_client.get("/observations/999999/image").status_code == 404
    assert db_client.get(f"/observations/{observation.id}/image.png").status_code == 404


def test_cors_allows_frontend_origin(client: TestClient) -> None:
    response = client.get("/health", headers={"Origin": "http://localhost:3000"})

    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_colorize_with_ndmi_ramp_maps_dry_to_brown_and_wet_to_blue() -> None:
    rgba = colorize(np.array([[-0.4, 0.6]], dtype=np.float32), NDMI_STOPS)

    assert tuple(rgba[:, 0, 0]) == (140, 81, 10, 255)
    assert tuple(rgba[:, 0, 1]) == (49, 54, 149, 255)


@pytest.mark.parametrize("layer", ["ndmi", "ndre"])
def test_index_layer_endpoints(
    layer: str, db_client: TestClient, db_session: Session, field: Field, tmp_path: Path
) -> None:
    cog = _write_ndvi_cog(tmp_path / "ndvi.tif")
    _write_ndvi_cog(index_cog_path(cog, layer))
    observation = save_observation(db_session, field.id, replace(make_result(18, 0.7), cog_path=str(cog)))

    info = db_client.get(f"/observations/{observation.id}/image", params={"layer": layer})
    png = db_client.get(f"/observations/{observation.id}/image.png", params={"layer": layer})

    assert info.status_code == 200
    assert info.json()["url"] == f"/observations/{observation.id}/image.png?layer={layer}"
    assert png.status_code == 200 and png.content.startswith(PNG_SIGNATURE)


def test_index_layer_404_for_old_observation(
    db_client: TestClient, db_session: Session, field: Field, tmp_path: Path
) -> None:
    # An observation saved before NDMI was added has only the NDVI file.
    cog = _write_ndvi_cog(tmp_path / "ndvi.tif")
    observation = save_observation(db_session, field.id, replace(make_result(18, 0.7), cog_path=str(cog)))

    response = db_client.get(f"/observations/{observation.id}/image", params={"layer": "ndmi"})

    assert response.status_code == 404
    assert response.json()["detail"] == "NDMI file not found"
