"""Tests for the true color (RGB) image of a field. No network: small synthetic GeoTIFFs act as bands."""

from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient
from rasterio.io import MemoryFile
from sqlalchemy.orm import Session

from app.models import Field
from app.services import rgb as rgb_module
from app.services.history import save_observation
from app.services.render import render_rgb_png
from app.services.rgb import (
    SceneNotFoundError,
    compute_rgb,
    ensure_rgb_cog,
    rgb_path,
    save_rgb_cog,
    to_display,
)
from app.services.stac import Scene
from tests.factories import make_result
from tests.test_ndvi import FIELD, _write_band

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"

# Raw values with the +1000 offset: reflectance 0.05 (red), 0.08 (green), 0.03 (blue).
RED_DN, GREEN_DN, BLUE_DN = 1500, 1800, 1300


def _make_rgb_scene(folder: Path, baseline: str | None = "05.11") -> Scene:
    """A 400 m x 400 m fake tile with B04, B03 and B02 at 10 m."""
    folder.mkdir(parents=True, exist_ok=True)
    bands = {"B04": RED_DN, "B03": GREEN_DN, "B02": BLUE_DN}
    return Scene(
        id="S2_RGB_TEST",
        datetime=datetime(2026, 10, 10, 6, 10, tzinfo=UTC),
        cloud_cover=1.0,
        assets={
            key: _write_band(folder / f"{key}.tif", np.full((40, 40), value, dtype=np.uint16), 10)
            for key, value in bands.items()
        },
        processing_baseline=baseline,
    )


def test_to_display_removes_offset_and_clips() -> None:
    raw = np.array([1000, 1000 + 1500, 1000 + 3000, 1000 + 9000], dtype=np.uint16)

    shown = to_display(raw, -1000)

    # Reflectance 0 is black, 0.3 and above is white, 0.15 is lighter than half because of the gamma.
    assert shown[0] == 0
    assert shown[2] == 255 and shown[3] == 255
    assert 128 < shown[1] < 255


def test_rgb_path_is_next_to_ndvi_cog() -> None:
    assert rgb_path("data/ndvi/7/2026-10-10_S2.tif") == Path("data/ndvi/7/2026-10-10_S2_rgb.tif")


def test_compute_rgb_colors_field_and_hides_outside(tmp_path: Path) -> None:
    raster = compute_rgb(_make_rgb_scene(tmp_path), FIELD)

    red, green, blue, alpha = raster.data
    inside = alpha == 255
    # The field is 200 m x 200 m: 20 x 20 pixels of 10 m.
    assert int(inside.sum()) == 400
    assert red[inside][0] == to_display(np.array([RED_DN]), -1000)[0]
    # Green has the highest reflectance, blue the lowest.
    assert green[inside][0] > red[inside][0] > blue[inside][0]
    assert not red[~inside].any()


def test_ensure_rgb_cog_makes_file_once(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    scene = _make_rgb_scene(tmp_path / "bands")
    calls: list[str] = []

    def fake_get_scene(scene_id: str, keys: tuple[str, ...]) -> Scene:
        calls.append(scene_id)
        return scene

    monkeypatch.setattr(rgb_module, "get_scene", fake_get_scene)
    cog = tmp_path / "ndvi" / "2026-10-10_S2.tif"

    first = ensure_rgb_cog(cog, "S2_RGB_TEST", FIELD)
    second = ensure_rgb_cog(cog, "S2_RGB_TEST", FIELD)

    assert first == second == rgb_path(cog)
    assert first.exists()
    assert calls == ["S2_RGB_TEST"]
    # No temp file is left in the folder.
    assert [p.name for p in first.parent.iterdir()] == [first.name]


def test_ensure_rgb_cog_raises_for_unknown_scene(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(rgb_module, "get_scene", lambda scene_id, keys: None)

    with pytest.raises(SceneNotFoundError):
        ensure_rgb_cog(tmp_path / "x.tif", "MISSING", FIELD)


def test_render_rgb_png(tmp_path: Path) -> None:
    path = save_rgb_cog(compute_rgb(_make_rgb_scene(tmp_path / "bands"), FIELD), tmp_path / "rgb.tif")

    png = render_rgb_png(path)

    assert png.startswith(PNG_SIGNATURE)
    with MemoryFile(png) as memfile, memfile.open() as image:
        assert image.count == 4
        alpha = image.read(4)
        assert alpha.min() == 0 and alpha.max() == 255


def test_rgb_image_endpoints(
    db_client: TestClient, db_session: Session, field: Field, tmp_path: Path
) -> None:
    cog = tmp_path / "ndvi" / "2026-10-18_S2.tif"
    # The RGB COG exists already, so the endpoint does not call the STAC API.
    save_rgb_cog(compute_rgb(_make_rgb_scene(tmp_path / "bands"), FIELD), rgb_path(cog))
    observation = save_observation(db_session, field.id, replace(make_result(18, 0.7), cog_path=str(cog)))

    info = db_client.get(f"/observations/{observation.id}/image", params={"layer": "rgb"})
    png = db_client.get(f"/observations/{observation.id}/image.png", params={"layer": "rgb"})

    assert info.status_code == 200
    assert info.json()["url"] == f"/observations/{observation.id}/image.png?layer=rgb"
    assert png.status_code == 200
    assert png.content.startswith(PNG_SIGNATURE)


def test_rgb_image_endpoint_404_for_unknown_scene(
    db_client: TestClient, db_session: Session, field: Field, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(rgb_module, "get_scene", lambda scene_id, keys: None)
    result = replace(make_result(18, 0.7), cog_path=str(tmp_path / "missing.tif"))
    observation = save_observation(db_session, field.id, result)

    response = db_client.get(f"/observations/{observation.id}/image", params={"layer": "rgb"})

    assert response.status_code == 404


def test_image_endpoint_rejects_unknown_layer(db_client: TestClient, db_session: Session, field: Field) -> None:
    observation = save_observation(db_session, field.id, make_result(18, 0.7))

    assert db_client.get(f"/observations/{observation.id}/image", params={"layer": "ndwi"}).status_code == 422
