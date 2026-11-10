"""True color (RGB) image of a field from Sentinel-2 L2A bands, saved as a Cloud Optimized GeoTIFF.

The image is made on first request and kept next to the NDVI COG of the same observation.
Clouds are not masked: the farmer sees the field as the satellite saw it on that date.
"""

import os
import uuid
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import rasterio
from affine import Affine
from rasterio.crs import CRS
from rasterio.features import geometry_mask
from rasterio.warp import transform_geom
from shapely.geometry import mapping, shape
from shapely.geometry.base import BaseGeometry

from app.services.ndvi import GDAL_ENV, _boa_offset, _pixel_window, _sign
from app.services.stac import RGB_ASSETS, Scene, get_scene

# Reflectance 0..0.3 fills the 0..255 range. Fields and soil are dark, so a wider range looks gray.
# One fixed stretch for all dates keeps the images of one field comparable.
MAX_REFLECTANCE = 0.3
# An exponent below 1 makes the dark mid tones lighter.
GAMMA = 0.8


class SceneNotFoundError(Exception):
    """The STAC API has no scene with the id of the observation."""


@dataclass(frozen=True)
class RgbRaster:
    """RGBA grid around the field, shape (4, rows, cols). Alpha is 0 outside the field."""

    data: np.ndarray
    transform: Affine
    crs: CRS


def rgb_path(cog_path: str | Path) -> Path:
    """The RGB COG path that belongs to an NDVI COG: "<name>_rgb.tif" in the same folder."""
    path = Path(cog_path)
    return path.with_name(f"{path.stem}_rgb.tif")


def to_display(raw: np.ndarray, offset: int) -> np.ndarray:
    """Raw L2A pixel values to 0..255 display values."""
    reflectance = (raw.astype(np.float32) + offset) / 10_000
    scaled = np.clip(reflectance / MAX_REFLECTANCE, 0, 1) ** GAMMA
    return np.round(scaled * 255).astype(np.uint8)


def compute_rgb(scene: Scene, polygon: BaseGeometry) -> RgbRaster:
    """Read B04, B03 and B02 around the polygon and make an RGBA image of the field."""
    keys = RGB_ASSETS
    with rasterio.Env(**GDAL_ENV):
        sources = [rasterio.open(_sign(scene.assets[key])) for key in keys]
        try:
            first = sources[0]
            if any(src.transform != first.transform for src in sources[1:]):
                raise ValueError("RGB band rasters do not share the same grid")
            crs = first.crs
            field_geom = transform_geom("EPSG:4326", crs, mapping(polygon))
            window = _pixel_window(shape(field_geom).bounds, first.transform)
            raw = [src.read(1, window=window) for src in sources]
            transform = first.window_transform(window)
        finally:
            for src in sources:
                src.close()

    out_shape = raw[0].shape
    offset = _boa_offset(scene.processing_baseline)
    inside = geometry_mask([field_geom], out_shape=out_shape, transform=transform, invert=True)
    # Raw value 0 is "no data".
    valid = inside & np.all([band > 0 for band in raw], axis=0)

    rgba = np.zeros((4, *out_shape), dtype=np.uint8)
    for channel, band in enumerate(raw):
        rgba[channel] = np.where(valid, to_display(band, offset), 0)
    rgba[3] = np.where(valid, 255, 0)
    return RgbRaster(data=rgba, transform=transform, crs=crs)


def save_rgb_cog(raster: RgbRaster, path: Path) -> Path:
    """Write the RGBA grid as a uint8 COG. Two requests can make the same file, so the write is atomic."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f"{path.stem}.{uuid.uuid4().hex}.tmp.tif")
    _, height, width = raster.data.shape
    try:
        with rasterio.open(
            tmp,
            "w",
            driver="COG",
            height=height,
            width=width,
            count=4,
            dtype="uint8",
            crs=raster.crs,
            transform=raster.transform,
            compress="DEFLATE",
        ) as dst:
            dst.write(raster.data)
        os.replace(tmp, path)
    finally:
        tmp.unlink(missing_ok=True)
    return path


def ensure_rgb_cog(cog_path: str | Path, scene_id: str, polygon: BaseGeometry) -> Path:
    """Return the RGB COG of an observation. Make it from the scene first if it does not exist yet.

    Raises SceneNotFoundError if the STAC API does not know the scene.
    """
    path = rgb_path(cog_path)
    if path.exists():
        return path
    scene = get_scene(scene_id, RGB_ASSETS)
    if scene is None:
        raise SceneNotFoundError(f"Scene {scene_id} not found")
    return save_rgb_cog(compute_rgb(scene, polygon), path)
