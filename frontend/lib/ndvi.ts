// NDVI colors. Keep these stops equal to COLOR_STOPS in app/services/render.py.
export const NDVI_STOPS: [number, string][] = [
  [-0.2, "rgb(165, 0, 38)"],
  [0.0, "rgb(215, 48, 39)"],
  [0.2, "rgb(254, 224, 139)"],
  [0.4, "rgb(166, 217, 106)"],
  [0.6, "rgb(26, 152, 80)"],
  [0.9, "rgb(0, 104, 55)"],
];

function parseRgb(color: string): [number, number, number] {
  const [r, g, b] = color.match(/\d+/g)!.map(Number);
  return [r, g, b];
}

/** The ramp color for an NDVI value, linearly interpolated between the stops. */
export function ndviRgb(value: number): [number, number, number] {
  const first = NDVI_STOPS[0];
  const last = NDVI_STOPS[NDVI_STOPS.length - 1];
  if (value <= first[0]) return parseRgb(first[1]);
  if (value >= last[0]) return parseRgb(last[1]);
  const upper = NDVI_STOPS.findIndex(([stop]) => stop >= value);
  const [v0, c0] = NDVI_STOPS[upper - 1];
  const [v1, c1] = NDVI_STOPS[upper];
  const t = (value - v0) / (v1 - v0);
  const a = parseRgb(c0);
  const b = parseRgb(c1);
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as [number, number, number];
}

export function ndviColor(value: number): string {
  return `rgb(${ndviRgb(value).join(", ")})`;
}

/** White text on the dark ends of the ramp, dark text on the light yellow middle. */
export function ndviTextColor(value: number): string {
  const [r, g, b] = ndviRgb(value);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#141413" : "#ffffff";
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return isoDate(date);
}

// The growing season starts on 1 March. Before March, use the previous year's season.
export function seasonStart(): string {
  const today = new Date();
  const year = today.getMonth() < 2 ? today.getFullYear() - 1 : today.getFullYear();
  return `${year}-03-01`;
}

export function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}.${month}.${year}`;
}

// Intl has no reliable Uzbek (Latin) month names in every browser, so the names are listed here.
const MONTHS_UZ = [
  "yanvar",
  "fevral",
  "mart",
  "aprel",
  "may",
  "iyun",
  "iyul",
  "avgust",
  "sentyabr",
  "oktyabr",
  "noyabr",
  "dekabr",
];

/** "2026-06-12" → "12-iyun 2026". For the report window, where there is room for the month name. */
export function formatDateLong(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${Number(day)}-${MONTHS_UZ[Number(month) - 1]} ${year}`;
}
