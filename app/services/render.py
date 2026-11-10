"""Render NDVI and true color (RGB) COGs as PNG images for web maps."""

import warnings
from pathlib import Path

import numpy as np
import rasterio
from affine import Affine
from rasterio.enums import Resampling
from rasterio.errors import NotGeoreferencedWarning
from rasterio.io import DatasetReader, MemoryFile
from rasterio.transform import array_bounds
from rasterio.warp import calculate_default_transform, reproject, transform_bounds

WEB_MERCATOR = "EPSG:3857"

# Color ramp: (NDVI value, (red, green, blue)). Low NDVI is red, high NDVI is green.
# The frontend legend uses the same stops.
COLOR_STOPS: list[tuple[float, tuple[int, int, int]]] = [
    (-0.2, (165, 0, 38)),
    (0.0, (215, 48, 39)),
    (0.2, (254, 224, 139)),
    (0.4, (166, 217, 106)),
    (0.6, (26, 152, 80)),
    (0.9, (0, 104, 55)),
]


def _mercator_grid(src: DatasetReader) -> tuple[Affine, int, int]:
    """Grid in Web Mercator that covers the raster. Web maps draw images in this projection."""
    transform, width, height = calculate_default_transform(
        src.crs, WEB_MERCATOR, src.width, src.height, *src.bounds
    )
    return transform, int(width), int(height)


def image_bounds(cog_path: Path) -> tuple[float, float, float, float]:
    """Lon/lat bounds (west, south, east, north) of the PNG that render_png creates."""
    with rasterio.open(cog_path) as src:
        transform, width, height = _mercator_grid(src)
    west, south, east, north = array_bounds(height, width, transform)
    return transform_bounds(WEB_MERCATOR, "EPSG:4326", west, south, east, north)


def colorize(ndvi: np.ndarray) -> np.ndarray:
    """Convert NDVI values to an RGBA array with shape (4, rows, cols). NaN becomes transparent."""
    values = [stop for stop, _ in COLOR_STOPS]
    rgba = np.zeros((4, *ndvi.shape), dtype=np.uint8)
    valid = ~np.isnan(ndvi)
    for channel in range(3):
        colors = [color[channel] for _, color in COLOR_STOPS]
        rgba[channel][valid] = np.interp(ndvi[valid], values, colors).astype(np.uint8)
    rgba[3][valid] = 255
    return rgba


def _png(rgba: np.ndarray) -> bytes:
    """Encode an RGBA array with shape (4, rows, cols) as PNG."""
    _, height, width = rgba.shape
    # The PNG has no coordinates on purpose: the map places it with image_bounds().
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", NotGeoreferencedWarning)
        with MemoryFile() as memfile:
            with memfile.open(driver="PNG", width=width, height=height, count=4, dtype="uint8") as dst:
                dst.write(rgba)
            return memfile.read()


def render_png(cog_path: Path) -> bytes:
    """Reproject the NDVI COG to Web Mercator and return a colored PNG."""
    with rasterio.open(cog_path) as src:
        transform, width, height = _mercator_grid(src)
        ndvi = np.full((height, width), np.nan, dtype=np.float32)
        reproject(
            source=rasterio.band(src, 1),
            destination=ndvi,
            dst_transform=transform,
            dst_crs=WEB_MERCATOR,
            src_nodata=np.nan,
            dst_nodata=np.nan,
            resampling=Resampling.nearest,
        )
    return _png(colorize(ndvi))


def render_rgb_png(rgb_cog_path: Path) -> bytes:
    """Reproject the RGBA COG of a field to Web Mercator and return it as PNG."""
    with rasterio.open(rgb_cog_path) as src:
        transform, width, height = _mercator_grid(src)
        # Pixels outside the source grid stay 0, so their alpha is 0 (transparent).
        rgba = np.zeros((4, height, width), dtype=np.uint8)
        for band in range(4):
            reproject(
                source=rasterio.band(src, band + 1),
                destination=rgba[band],
                dst_transform=transform,
                dst_crs=WEB_MERCATOR,
                resampling=Resampling.nearest,
            )
    return _png(rgba)
