"""Field area on the Earth's surface, from a polygon in WGS 84 (lon/lat)."""

from math import radians, sin

from shapely.geometry import Polygon

# The WGS 84 equatorial radius. The same value and formula are in frontend/lib/geo.ts.
EARTH_RADIUS_M = 6_378_137.0

SQUARE_METERS_PER_HECTARE = 10_000


def _ring_area_m2(ring: list[tuple[float, float]]) -> float:
    """Area inside a ring of (lon, lat) points on a sphere. The ring can be open or closed.

    Spherical polygon formula (Chamberlain and Duquette, 2007). For a field of a few
    kilometers the error against the WGS 84 ellipsoid is below 0.5 %.
    """
    points = ring[:-1] if len(ring) > 1 and ring[0] == ring[-1] else ring
    count = len(points)
    if count < 3:
        return 0.0
    total = 0.0
    for i in range(count):
        lon_before = points[i - 1][0]
        lon_after = points[(i + 1) % count][0]
        total += radians(lon_after - lon_before) * sin(radians(points[i][1]))
    return abs(total) * EARTH_RADIUS_M**2 / 2


def polygon_area_ha(polygon: Polygon) -> float:
    """Area of the polygon in hectares. Holes are subtracted."""
    area = _ring_area_m2(list(polygon.exterior.coords))
    area -= sum(_ring_area_m2(list(hole.coords)) for hole in polygon.interiors)
    return area / SQUARE_METERS_PER_HECTARE


def format_area(area_ha: float) -> str:
    """Format an area for users: "0.32 ga", "12.4 ga", "148 ga". Bigger fields get fewer decimals."""
    if area_ha < 1:
        return f"{area_ha:.2f} ga"
    if area_ha < 100:
        return f"{area_ha:.1f} ga"
    return f"{area_ha:.0f} ga"
