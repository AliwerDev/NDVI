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
REQUIRED_ASSETS = ("B04", "B08", "SCL")


@dataclass(frozen=True)
class Scene:
    """One Sentinel-2 scene picked for a field.

    The asset URLs are not signed. Sign them just before reading (Milestone 4), because signed URLs expire.
    """

    id: str
    datetime: datetime
    cloud_cover: float
    assets: dict[str, str]


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


def pick_best_scene(
    items: Iterable[pystac.Item], polygon: BaseGeometry, max_cloud_cover: float
) -> Scene | None:
    """Pick the newest item that fully covers the polygon, has all bands, and is not too cloudy."""
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
    if not candidates:
        return None

    # Newest first. For two tiles of the same pass, prefer the less cloudy one.
    best = max(candidates, key=lambda item: (item.datetime, -item.properties["eo:cloud_cover"]))
    return Scene(
        id=best.id,
        datetime=best.datetime,
        cloud_cover=best.properties["eo:cloud_cover"],
        assets={key: best.assets[key].href for key in REQUIRED_ASSETS},
    )


def find_best_scene(
    polygon: BaseGeometry, start: date, end: date, max_cloud_cover: float | None = None
) -> Scene | None:
    """Search the STAC API and return the best scene for the polygon, or None."""
    if max_cloud_cover is None:
        max_cloud_cover = get_settings().max_cloud_cover
    items = search_scenes(polygon, start, end, max_cloud_cover)
    return pick_best_scene(items, polygon, max_cloud_cover)
