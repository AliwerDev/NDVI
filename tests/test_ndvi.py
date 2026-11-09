"""Tests for NDVI computation. No network: small synthetic GeoTIFFs in a temp folder act as bands."""

from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

import numpy as np
import pytest
import rasterio
from fastapi.testclient import TestClient
from rasterio.transform import from_origin
from rasterio.warp import transform_geom
from shapely.geometry import box, mapping, shape

from app.services import ndvi as ndvi_module
from app.services.ndvi import (
    FieldNdvi,
    NdviStats,
    NoClearSceneError,
    compute_field_ndvi,
    compute_field_ndvi_series,
    compute_ndvi,
)
from app.services.stac import Scene

UTM = "EPSG:32642"  # UTM zone 42N, as for Sentinel-2 tiles near Tashkent
X0, Y0 = 500_000.0, 4_600_000.0  # top-left corner of the fake tile

# Field: 200 m x 200 m = 20 x 20 band pixels (10 m) = 10 x 10 SCL pixels (20 m).
FIELD_UTM = box(X0 + 100, Y0 - 300, X0 + 300, Y0 - 100)
FIELD = shape(transform_geom(UTM, "EPSG:4326", mapping(FIELD_UTM)))

# Raw values include the +1000 offset: red reflectance 0.05, NIR reflectance 0.30.
RED_DN, NIR_DN = 1500, 4000
EXPECTED_NDVI = (0.30 - 0.05) / (0.30 + 0.05)  # 0.7143
EXPECTED_NDVI_WITHOUT_OFFSET = (4000 - 1500) / (4000 + 1500)  # 0.4545


def _write_band(path: Path, data: np.ndarray, resolution: float) -> str:
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        height=data.shape[0],
        width=data.shape[1],
        count=1,
        dtype=data.dtype,
        crs=UTM,
        transform=from_origin(X0, Y0, resolution, resolution),
    ) as dst:
        dst.write(data, 1)
    return str(path)


def _make_scene(
    folder: Path,
    scene_id: str = "S2_TEST",
    day: int = 10,
    cloudy_quarter: bool = False,
    all_cloudy: bool = False,
    baseline: str | None = "05.11",
) -> Scene:
    """Create a 400 m x 400 m fake tile: B04 and B08 at 10 m, SCL at 20 m."""
    folder.mkdir(parents=True, exist_ok=True)
    red = np.full((40, 40), RED_DN, dtype=np.uint16)
    nir = np.full((40, 40), NIR_DN, dtype=np.uint16)
    scl = np.full((20, 20), 4, dtype=np.uint8)  # 4 = vegetation
    if cloudy_quarter:
        scl[5:10, 5:10] = 9  # high cloud over the top-left quarter of the field
    if all_cloudy:
        scl[:, :] = 9
    return Scene(
        id=scene_id,
        datetime=datetime(2026, 10, day, 6, 10, tzinfo=UTC),
        cloud_cover=1.0,
        assets={
            "B04": _write_band(folder / "B04.tif", red, 10),
            "B08": _write_band(folder / "B08.tif", nir, 10),
            "SCL": _write_band(folder / "SCL.tif", scl, 20),
        },
        processing_baseline=baseline,
    )


# --- compute_ndvi ---


def test_ndvi_value_with_offset_removed(tmp_path: Path) -> None:
    raster = compute_ndvi(_make_scene(tmp_path), FIELD)

    assert raster.stats.mean == pytest.approx(EXPECTED_NDVI, abs=1e-4)
    assert raster.stats.min == pytest.approx(EXPECTED_NDVI, abs=1e-4)
    assert raster.stats.max == pytest.approx(EXPECTED_NDVI, abs=1e-4)
    assert raster.stats.field_pixels == 400
    assert raster.stats.clear_fraction == 1.0


def test_old_baseline_has_no_offset(tmp_path: Path) -> None:
    raster = compute_ndvi(_make_scene(tmp_path, baseline="03.01"), FIELD)

    assert raster.stats.mean == pytest.approx(EXPECTED_NDVI_WITHOUT_OFFSET, abs=1e-4)


def test_clouds_are_masked(tmp_path: Path) -> None:
    raster = compute_ndvi(_make_scene(tmp_path, cloudy_quarter=True), FIELD)

    assert raster.stats.field_pixels == 400
    assert raster.stats.clear_pixels == 300
    assert raster.stats.clear_fraction == 0.75
    # Cloudy pixels are NaN, clear pixels keep the NDVI value.
    assert np.isnan(raster.data).sum() > 0
    assert raster.stats.mean == pytest.approx(EXPECTED_NDVI, abs=1e-4)


def test_pixels_outside_field_are_nan(tmp_path: Path) -> None:
    raster = compute_ndvi(_make_scene(tmp_path), FIELD)

    assert int(np.count_nonzero(~np.isnan(raster.data))) == 400


def test_fully_cloudy_field_has_no_stats(tmp_path: Path) -> None:
    raster = compute_ndvi(_make_scene(tmp_path, all_cloudy=True), FIELD)

    assert raster.stats.clear_pixels == 0
    assert raster.stats.clear_fraction == 0.0
    assert raster.stats.mean is None


# --- compute_field_ndvi ---


def test_skips_cloudy_scene_and_saves_cog(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    cloudy = _make_scene(tmp_path / "new", scene_id="NEW_CLOUDY", day=20, all_cloudy=True)
    clear = _make_scene(tmp_path / "old", scene_id="OLD_CLEAR", day=10)
    monkeypatch.setattr(ndvi_module, "find_scenes", lambda polygon, start, end: [cloudy, clear])

    result = compute_field_ndvi(7, FIELD, date(2026, 10, 1), date(2026, 10, 31), data_dir=tmp_path / "data")

    assert result.scene.id == "OLD_CLEAR"
    assert result.stats.mean == pytest.approx(EXPECTED_NDVI, abs=1e-4)
    cog = Path(result.cog_path)
    assert cog == tmp_path / "data" / "ndvi" / "7" / "2026-10-10_OLD_CLEAR.tif"
    with rasterio.open(cog) as src:
        assert src.dtypes[0] == "float32"
        assert src.crs.to_string() == UTM
        assert src.profile["tiled"]
        assert int(np.count_nonzero(~np.isnan(src.read(1)))) == 400


def test_raises_when_all_scenes_are_cloudy(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    cloudy = _make_scene(tmp_path, all_cloudy=True)
    monkeypatch.setattr(ndvi_module, "find_scenes", lambda polygon, start, end: [cloudy])

    with pytest.raises(NoClearSceneError, match="too cloudy"):
        compute_field_ndvi(1, FIELD, date(2026, 10, 1), date(2026, 10, 31), data_dir=tmp_path)


def test_raises_when_no_scene_found(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ndvi_module, "find_scenes", lambda polygon, start, end: [])

    with pytest.raises(NoClearSceneError, match="No scene"):
        compute_field_ndvi(1, FIELD, date(2026, 10, 1), date(2026, 10, 31), data_dir=tmp_path)


def test_series_keeps_one_clear_result_per_date(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    scenes = [
        _make_scene(tmp_path / "a", scene_id="DAY20_TILE_A", day=20),
        _make_scene(tmp_path / "b", scene_id="DAY20_TILE_B", day=20),
        _make_scene(tmp_path / "c", scene_id="DAY15_CLOUDY", day=15, all_cloudy=True),
        _make_scene(tmp_path / "d", scene_id="DAY10", day=10),
    ]
    monkeypatch.setattr(ndvi_module, "find_scenes", lambda polygon, start, end: scenes)

    results = compute_field_ndvi_series(1, FIELD, date(2026, 10, 1), date(2026, 10, 31), data_dir=tmp_path)

    assert [r.scene.id for r in results] == ["DAY20_TILE_A", "DAY10"]


# --- POST /fields/{id}/ndvi ---


def _create_field(client: TestClient) -> int:
    response = client.post("/fields", json={"name": "Paxta-1", "geometry": mapping(box(69.20, 41.30, 69.21, 41.31))})
    assert response.status_code == 201, response.text
    return response.json()["id"]


def test_ndvi_endpoint_returns_result(db_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    result = FieldNdvi(
        scene=Scene(id="S2_TEST", datetime=datetime(2026, 10, 10, tzinfo=UTC), cloud_cover=1.0, assets={}),
        stats=NdviStats(mean=0.71, min=0.6, max=0.8, clear_fraction=1.0, field_pixels=400, clear_pixels=400),
        cog_path="data/ndvi/1/2026-10-10_S2_TEST.tif",
    )
    monkeypatch.setattr("app.api.ndvi.compute_field_ndvi", lambda *args, **kwargs: result)
    field_id = _create_field(db_client)

    response = db_client.post(f"/fields/{field_id}/ndvi?start=2026-10-01&end=2026-10-31")

    assert response.status_code == 200
    body = response.json()
    assert body["field_id"] == field_id
    assert body["observed_on"] == "2026-10-10"
    assert body["scene_id"] == "S2_TEST"
    assert body["ndvi_mean"] == 0.71
    assert body["cog_path"] == "data/ndvi/1/2026-10-10_S2_TEST.tif"
    # The observation is stored, so the history has it.
    history = db_client.get(f"/fields/{field_id}/ndvi").json()
    assert [o["id"] for o in history] == [body["id"]]


def test_ndvi_endpoint_404_when_too_cloudy(db_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def fail(*args: Any, **kwargs: Any) -> None:
        raise NoClearSceneError("too cloudy")

    monkeypatch.setattr("app.api.ndvi.compute_field_ndvi", fail)
    field_id = _create_field(db_client)

    response = db_client.post(f"/fields/{field_id}/ndvi?start=2026-10-01&end=2026-10-31")

    assert response.status_code == 404
    assert response.json()["detail"] == "too cloudy"


def test_ndvi_endpoint_rejects_reversed_dates(client: TestClient) -> None:
    response = client.post("/fields/1/ndvi?start=2026-10-31&end=2026-10-01")

    assert response.status_code == 422
