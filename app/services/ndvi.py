"""Compute NDVI for a field from Sentinel-2 L2A bands and save it as a Cloud Optimized GeoTIFF."""

import logging
import math
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import numpy as np
import planetary_computer
import rasterio
from affine import Affine
from rasterio.crs import CRS
from rasterio.enums import Resampling
from rasterio.errors import RasterioIOError
from rasterio.features import geometry_mask
from rasterio.warp import transform_geom
from rasterio.windows import Window
from rasterio.windows import bounds as window_bounds
from shapely.geometry import mapping, shape
from shapely.geometry.base import BaseGeometry

from app.config import get_settings
from app.services.stac import Scene, find_scenes

logger = logging.getLogger(__name__)
# SCL classes that count as clear ground: 4 = vegetation, 5 = bare soil, 6 = water.
# All other classes (no data, defective, dark area, cloud shadow, unclassified, clouds, cirrus, snow) are masked.
CLEAR_SCL_CLASSES = (4, 5, 6)

# Since processing baseline 04.00 (January 2022), L2A pixel values include +1000 (BOA_ADD_OFFSET = -1000).
# The scale (1/10000) cancels in the NDVI ratio, but the offset does not, so it must be removed.
BOA_ADD_OFFSET = -1000

# Only this many scenes are read before giving up. Each try reads three bands over HTTP.
MAX_SCENE_ATTEMPTS = 5
# Limit for one history backfill. Each scene takes a few seconds.
MAX_BACKFILL_SCENES = 40

# GDAL settings for fast partial reads of COGs over HTTP.
GDAL_ENV = {
    "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
    "GDAL_HTTP_MERGE_CONSECUTIVE_RANGES": "YES",
    "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".tif",
}


@dataclass(frozen=True)
class NdviStats:
    """NDVI summary for the clear pixels inside the field. Values are None if no pixel is clear."""

    mean: float | None
    min: float | None
    max: float | None
    clear_fraction: float
    field_pixels: int
    clear_pixels: int


@dataclass(frozen=True)
class NdviRaster:
    """NDVI grid around the field. NaN outside the field and under clouds."""

    data: np.ndarray
    transform: Affine
    crs: CRS
    stats: NdviStats


@dataclass(frozen=True)
class FieldNdvi:
    """Result for one field: the scene used, the statistics and the saved COG path."""

    scene: Scene
    stats: NdviStats
    cog_path: str


class NoClearSceneError(Exception):
    """No scene in the date range gives enough clear pixels over the field."""


def _sign(href: str) -> str:
    """Add a Planetary Computer access token to HTTPS URLs. Local paths stay unchanged."""
    return planetary_computer.sign(href) if href.startswith("https://") else href


def _boa_offset(processing_baseline: str | None) -> int:
    """Return the offset to add to raw pixel values for this processing baseline."""
    if processing_baseline is None:
        # Planetary Computer items always have this property. Without it, assume old data without offset.
        return 0
    return BOA_ADD_OFFSET if float(processing_baseline) >= 4.0 else 0


def _pixel_window(bounds: tuple[float, float, float, float], transform: Affine) -> Window:
    """Smallest window of whole pixels that contains the bounds (north-up rasters only)."""
    left, bottom, right, top = bounds
    col_start, row_start = ~transform @ (left, top)
    col_stop, row_stop = ~transform @ (right, bottom)
    col0, row0 = math.floor(col_start), math.floor(row_start)
    col1, row1 = math.ceil(col_stop), math.ceil(row_stop)
    return Window(col0, row0, col1 - col0, row1 - row0)


def compute_ndvi(scene: Scene, polygon: BaseGeometry) -> NdviRaster:
    """Read B04, B08 and SCL around the polygon and compute NDVI for clear pixels inside it."""
    with (
        rasterio.Env(**GDAL_ENV),
        rasterio.open(_sign(scene.assets["B04"])) as red_src,
        rasterio.open(_sign(scene.assets["B08"])) as nir_src,
        rasterio.open(_sign(scene.assets["SCL"])) as scl_src,
    ):
        crs = red_src.crs
        # The polygon is in lon/lat (EPSG:4326). The bands use UTM.
        field_geom = transform_geom("EPSG:4326", crs, mapping(polygon))

        # SCL has 20 m pixels, B04/B08 have 10 m pixels. Take the window on the coarser SCL grid first,
        # then use the same area on the 10 m grid, so that every SCL pixel maps to exactly 2x2 band pixels.
        if (red_src.transform.c, red_src.transform.f) != (scl_src.transform.c, scl_src.transform.f):
            raise ValueError("SCL and band rasters do not share the same origin")
        scale = round(scl_src.res[0] / red_src.res[0])
        scl_window = _pixel_window(shape(field_geom).bounds, scl_src.transform)
        band_window = Window(
            scl_window.col_off * scale,
            scl_window.row_off * scale,
            scl_window.width * scale,
            scl_window.height * scale,
        )
        out_shape = (int(band_window.height), int(band_window.width))

        red_raw = red_src.read(1, window=band_window)
        nir_raw = nir_src.read(1, window=band_window)
        # Nearest resampling keeps the class numbers unchanged.
        scl = scl_src.read(1, window=scl_window, out_shape=out_shape, resampling=Resampling.nearest)
        transform = red_src.window_transform(band_window)

    offset = _boa_offset(scene.processing_baseline)
    red = red_raw.astype(np.float32) + offset
    nir = nir_raw.astype(np.float32) + offset

    inside = geometry_mask([field_geom], out_shape=out_shape, transform=transform, invert=True)
    clear = (
        inside
        & np.isin(scl, CLEAR_SCL_CLASSES)
        # Raw value 0 is "no data". Zero or negative reflectance gives a meaningless ratio.
        & (red_raw > 0)
        & (nir_raw > 0)
        & (red > 0)
        & (nir > 0)
    )

    ndvi = np.full(out_shape, np.nan, dtype=np.float32)
    ndvi[clear] = (nir[clear] - red[clear]) / (nir[clear] + red[clear])

    field_pixels = int(inside.sum())
    clear_pixels = int(clear.sum())
    values = ndvi[clear]
    stats = NdviStats(
        mean=round(float(values.mean()), 4) if clear_pixels else None,
        min=round(float(values.min()), 4) if clear_pixels else None,
        max=round(float(values.max()), 4) if clear_pixels else None,
        clear_fraction=round(clear_pixels / field_pixels, 4) if field_pixels else 0.0,
        field_pixels=field_pixels,
        clear_pixels=clear_pixels,
    )
    return NdviRaster(data=ndvi, transform=transform, crs=crs, stats=stats)


def save_cog(raster: NdviRaster, path: Path) -> Path:
    """Write the NDVI grid as a float32 Cloud Optimized GeoTIFF. NaN is the nodata value."""
    path.parent.mkdir(parents=True, exist_ok=True)
    height, width = raster.data.shape
    with rasterio.open(
        path,
        "w",
        driver="COG",
        height=height,
        width=width,
        count=1,
        dtype="float32",
        crs=raster.crs,
        transform=raster.transform,
        nodata=np.nan,
        compress="DEFLATE",
    ) as dst:
        dst.write(raster.data, 1)
    return path


def _try_scene(field_id: int, polygon: BaseGeometry, scene: Scene, data_dir: Path) -> FieldNdvi | None:
    """Compute NDVI for one scene. Save a COG and return the result only if the field is clear enough."""
    raster = compute_ndvi(scene, polygon)
    stats = raster.stats
    if stats.clear_pixels == 0 or stats.clear_fraction < get_settings().min_clear_fraction:
        return None
    path = data_dir / "ndvi" / str(field_id) / f"{scene.datetime:%Y-%m-%d}_{scene.id}.tif"
    save_cog(raster, path)
    return FieldNdvi(scene=scene, stats=stats, cog_path=path.as_posix())


def compute_field_ndvi(
    field_id: int,
    polygon: BaseGeometry,
    start: date,
    end: date,
    data_dir: Path | None = None,
) -> FieldNdvi:
    """Find the newest scene with enough clear pixels over the field, compute NDVI and save a COG.

    Raises NoClearSceneError if no scene in [start, end] is clear enough.
    """
    settings = get_settings()
    if data_dir is None:
        data_dir = Path(settings.data_dir)

    scenes = find_scenes(polygon, start, end)
    if not scenes:
        raise NoClearSceneError(
            f"No scene with cloud cover <= {settings.max_cloud_cover}% covers this field "
            f"between {start} and {end}"
        )

    tried = scenes[:MAX_SCENE_ATTEMPTS]
    for scene in tried:
        result = _try_scene(field_id, polygon, scene, data_dir)
        if result is not None:
            return result

    raise NoClearSceneError(
        f"The field is too cloudy in the {len(tried)} newest scenes between {start} and {end} "
        f"(clear pixels below {settings.min_clear_fraction:.0%})"
    )


def compute_field_ndvi_series(
    field_id: int,
    polygon: BaseGeometry,
    start: date,
    end: date,
    data_dir: Path | None = None,
) -> list[FieldNdvi]:
    """Compute NDVI for every clear scene in [start, end], newest first, at most one per date."""
    return list(iter_field_ndvi_series(field_id, polygon, start, end, data_dir))


def iter_field_ndvi_series(
    field_id: int,
    polygon: BaseGeometry,
    start: date,
    end: date,
    data_dir: Path | None = None,
) -> Iterator[FieldNdvi]:
    """Yield the NDVI of each clear scene in [start, end] as soon as it is computed.

    Newest first, at most one per date. Only the newest MAX_BACKFILL_SCENES scenes are read.
    A scene that fails to read is skipped.
    """
    if data_dir is None:
        data_dir = Path(get_settings().data_dir)

    done_dates: set[date] = set()
    for scene in find_scenes(polygon, start, end)[:MAX_BACKFILL_SCENES]:
        day = scene.datetime.date()
        # Two neighbor tiles of the same pass have the same date. One result per date is enough.
        if day in done_dates:
            continue
        try:
            result = _try_scene(field_id, polygon, scene, data_dir)
        except RasterioIOError:
            logger.warning("Could not read scene %s, skipped", scene.id, exc_info=True)
            continue
        if result is not None:
            done_dates.add(day)
            yield result
