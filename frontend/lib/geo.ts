import type { Position } from "@/lib/api";

// The WGS 84 equatorial radius. The same value and formula are in app/services/area.py.
const EARTH_RADIUS_M = 6_378_137;

// Below this area the edge pixels (road, ditch, trees) change the field mean more. The home page FAQ says the same.
export const SMALL_FIELD_HA = 0.5;

/** Area inside a ring of [lon, lat] points in hectares, on a sphere. The ring can be open or closed. */
export function ringAreaHa(ring: Position[]): number {
  const closed = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];
  const points = closed ? ring.slice(0, -1) : ring;
  const count = points.length;
  if (count < 3) return 0;
  const rad = Math.PI / 180;
  let total = 0;
  for (let i = 0; i < count; i++) {
    const before = points[(i - 1 + count) % count][0];
    const after = points[(i + 1) % count][0];
    total += (after - before) * rad * Math.sin(points[i][1] * rad);
  }
  return (Math.abs(total) * EARTH_RADIUS_M ** 2) / 2 / 10_000;
}

/** "0.32 ga", "12.4 ga", "148 ga". Bigger fields get fewer decimals. */
export function formatArea(areaHa: number): string {
  if (areaHa < 1) return `${areaHa.toFixed(2)} ga`;
  if (areaHa < 100) return `${areaHa.toFixed(1)} ga`;
  return `${Math.round(areaHa)} ga`;
}

/** 1 sotix = 100 m², so 1 hectare = 100 sotix. */
export function formatSotix(areaHa: number): string {
  return `${Math.round(areaHa * 100)} sotix`;
}
