"""Render index (NDVI, NDMI, NDRE) and true color (RGB) COGs as PNG images for web maps."""

import warnings
from pathlib import Path
from typing import Literal

import numpy as np
import rasterio
from affine import Affine
from rasterio.enums import Resampling
from rasterio.errors import NotGeoreferencedWarning
from rasterio.io import DatasetReader, MemoryFile
from rasterio.transform import array_bounds
from rasterio.warp import calculate_default_transform, reproject, transform_bounds

WEB_MERCATOR = "EPSG:3857"

ColorStops = list[tuple[float, tuple[int, int, int]]]
Index = Literal["ndvi", "ndmi", "ndre"]

# Color ramps: (index value, (red, green, blue)). The frontend legend (frontend/lib/ndvi.ts) uses the same stops.
# NDVI: low is red, high is green.
NDVI_STOPS: ColorStops = [
    (-0.2, (165, 0, 38)),
    (0.0, (215, 48, 39)),
    (0.2, (254, 224, 139)),
    (0.4, (166, 217, 106)),
    (0.6, (26, 152, 80)),
    (0.9, (0, 104, 55)),
]
# NDMI: dry is brown, wet is blue.
NDMI_STOPS: ColorStops = [
    (-0.4, (140, 81, 10)),
    (-0.2, (216, 179, 101)),
    (0.0, (246, 232, 195)),
    (0.2, (171, 217, 233)),
    (0.4, (69, 117, 180)),
    (0.6, (49, 54, 149)),
]
# NDRE: low chlorophyll is yellow, high is dark green.
NDRE_STOPS: ColorStops = [
    (-0.1, (255, 255, 204)),
    (0.1, (217, 240, 163)),
    (0.2, (173, 221, 142)),
    (0.3, (120, 198, 121)),
    (0.45, (49, 163, 84)),
    (0.6, (0, 104, 55)),
]
COLOR_RAMPS: dict[Index, ColorStops] = {"ndvi": NDVI_STOPS, "ndmi": NDMI_STOPS, "ndre": NDRE_STOPS}


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


def colorize(data: np.ndarray, stops: ColorStops = NDVI_STOPS) -> np.ndarray:
    """Convert index values to an RGBA array with shape (4, rows, cols). NaN becomes transparent."""
    values = [stop for stop, _ in stops]
    rgba = np.zeros((4, *data.shape), dtype=np.uint8)
    valid = ~np.isnan(data)
    for channel in range(3):
        colors = [color[channel] for _, color in stops]
        rgba[channel][valid] = np.interp(data[valid], values, colors).astype(np.uint8)
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


def render_png(cog_path: Path, index: Index = "ndvi") -> bytes:
    """Reproject an index COG to Web Mercator and return a PNG colored with the ramp of that index."""
    with rasterio.open(cog_path) as src:
        transform, width, height = _mercator_grid(src)
        data = np.full((height, width), np.nan, dtype=np.float32)
        reproject(
            source=rasterio.band(src, 1),
            destination=data,
            dst_transform=transform,
            dst_crs=WEB_MERCATOR,
            src_nodata=np.nan,
            dst_nodata=np.nan,
            resampling=Resampling.nearest,
        )
    return _png(colorize(data, COLOR_RAMPS[index]))


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
