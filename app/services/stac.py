"""Find Sentinel-2 L2A scenes for a field through the Planetary Computer STAC API."""

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, date, datetime, time

import pystac
from pystac_client import Client
from shapely.geometry import mapping, shape
from shapely.geometry.base import BaseGeometry

from app.config import get_settings

# Asset keys on Planetary Computer: B04 = red, B08 = near infrared, SCL = scene classification.
# The 20 m bands: B05 = red edge, B8A = narrow near infrared, B11 = shortwave infrared (for NDRE and NDMI).
REQUIRED_ASSETS = ("B04", "B08", "SCL", "B05", "B8A", "B11")
# True color: B04 = red, B03 = green, B02 = blue.
RGB_ASSETS = ("B04", "B03", "B02")


@dataclass(frozen=True)
class Scene:
    """One Sentinel-2 scene picked for a field.

    The asset URLs are not signed. Sign them just before reading, because signed URLs expire.
    """

    id: str
    datetime: datetime
    cloud_cover: float
    assets: dict[str, str]
    # For example "05.13". Since baseline 04.00 the pixel values include an offset of +1000.
    processing_baseline: str | None = None


def search_scenes(
    polygon: BaseGeometry, start: date, end: date, max_cloud_cover: float
) -> list[pystac.Item]:
    """Return STAC items that intersect the polygon in [start, end] with cloud cover <= max_cloud_cover."""
    settings = get_settings()
    client = Client.open(settings.stac_api_url)
    search = client.search(
        collections=[settings.stac_collection],
        intersects=mapping(polygon),
        # Full days in UTC: from start 00:00:00 to end 23:59:59.
        datetime=[
            datetime.combine(start, time.min, tzinfo=UTC),
            datetime.combine(end, time.max, tzinfo=UTC),
        ],
        query={"eo:cloud_cover": {"lte": max_cloud_cover}},
        max_items=500,
    )
    return list(search.items())


def rank_scenes(
    items: Iterable[pystac.Item], polygon: BaseGeometry, max_cloud_cover: float
) -> list[Scene]:
    """Return usable scenes, newest first.

    A scene is usable if it fully covers the polygon, has all bands, and is not too cloudy.
    """
    candidates = [
        item
        for item in items
        if item.datetime is not None
        and item.properties.get("eo:cloud_cover", 100.0) <= max_cloud_cover
        and all(key in item.assets for key in REQUIRED_ASSETS)
        # A field on a tile edge is only partly inside that tile. The neighbor tile covers it fully.
        and item.geometry is not None
        and shape(item.geometry).covers(polygon)
    ]
    # Newest first. For two tiles of the same pass, the less cloudy one comes first.
    candidates.sort(key=lambda item: (item.datetime, -item.properties["eo:cloud_cover"]), reverse=True)
    return [
        Scene(
            id=item.id,
            datetime=item.datetime,
            cloud_cover=item.properties["eo:cloud_cover"],
            assets={key: item.assets[key].href for key in REQUIRED_ASSETS},
            processing_baseline=item.properties.get("s2:processing_baseline"),
        )
        for item in candidates
    ]


def pick_best_scene(
    items: Iterable[pystac.Item], polygon: BaseGeometry, max_cloud_cover: float
) -> Scene | None:
    """Return the newest usable scene, or None."""
    scenes = rank_scenes(items, polygon, max_cloud_cover)
    return scenes[0] if scenes else None


def get_scene(scene_id: str, asset_keys: tuple[str, ...] = RGB_ASSETS) -> Scene | None:
    """Return the scene with this id and the given assets, or None if the STAC API does not know it."""
    settings = get_settings()
    client = Client.open(settings.stac_api_url)
    items = list(client.search(collections=[settings.stac_collection], ids=[scene_id], max_items=1).items())
    if not items or items[0].datetime is None or not all(key in items[0].assets for key in asset_keys):
        return None
    item = items[0]
    return Scene(
        id=item.id,
        datetime=item.datetime,
        cloud_cover=item.properties.get("eo:cloud_cover", 0.0),
        assets={key: item.assets[key].href for key in asset_keys},
        processing_baseline=item.properties.get("s2:processing_baseline"),
    )


def find_scenes(
    polygon: BaseGeometry, start: date, end: date, max_cloud_cover: float | None = None
) -> list[Scene]:
    """Search the STAC API and return usable scenes for the polygon, newest first."""
    if max_cloud_cover is None:
        max_cloud_cover = get_settings().max_cloud_cover
    items = search_scenes(polygon, start, end, max_cloud_cover)
    return rank_scenes(items, polygon, max_cloud_cover)


def find_best_scene(
    polygon: BaseGeometry, start: date, end: date, max_cloud_cover: float | None = None
) -> Scene | None:
    """Search the STAC API and return the newest usable scene, or None."""
    scenes = find_scenes(polygon, start, end, max_cloud_cover)
    return scenes[0] if scenes else None
