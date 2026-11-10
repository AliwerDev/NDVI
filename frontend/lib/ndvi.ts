import type { Observation } from "@/lib/api";

export type IndexName = "ndvi" | "ndmi" | "ndre";
export type ColorStops = [number, string][];

// Keep the stops equal to NDVI_STOPS, NDMI_STOPS and NDRE_STOPS in app/services/render.py.
export const NDVI_STOPS: ColorStops = [
  [-0.2, "rgb(165, 0, 38)"],
  [0.0, "rgb(215, 48, 39)"],
  [0.2, "rgb(254, 224, 139)"],
  [0.4, "rgb(166, 217, 106)"],
  [0.6, "rgb(26, 152, 80)"],
  [0.9, "rgb(0, 104, 55)"],
];

export const NDMI_STOPS: ColorStops = [
  [-0.4, "rgb(140, 81, 10)"],
  [-0.2, "rgb(216, 179, 101)"],
  [0.0, "rgb(246, 232, 195)"],
  [0.2, "rgb(171, 217, 233)"],
  [0.4, "rgb(69, 117, 180)"],
  [0.6, "rgb(49, 54, 149)"],
];

export const NDRE_STOPS: ColorStops = [
  [-0.1, "rgb(255, 255, 204)"],
  [0.1, "rgb(217, 240, 163)"],
  [0.2, "rgb(173, 221, 142)"],
  [0.3, "rgb(120, 198, 121)"],
  [0.45, "rgb(49, 163, 84)"],
  [0.6, "rgb(0, 104, 55)"],
];

export type IndexInfo = {
  label: string;
  caption: string;
  stops: ColorStops;
  // Chart range and grid lines.
  min: number;
  max: number;
  ticks: number[];
  line: string;
  // A dashed line on the chart. The values mirror the defaults of NDMI_STRESS_THRESHOLD and NDRE_LOW_THRESHOLD.
  threshold: { value: number; label: string } | null;
  legendLabels: [string, string, string];
  legendNote: string | null;
  pixel: string;
};

export const INDEX_NAMES: IndexName[] = ["ndvi", "ndmi", "ndre"];

export const INDICES: Record<IndexName, IndexInfo> = {
  ndvi: {
    label: "NDVI",
    caption: "Oʻsimlik zichligi va sogʻligʻi",
    stops: NDVI_STOPS,
    min: -0.2,
    max: 1.0,
    ticks: [0.25, 0.5, 0.75, 1],
    line: "#2e6b3d",
    threshold: null,
    legendLabels: ["−0.2", "0.35", "0.9"],
    legendNote: null,
    pixel: "10 m",
  },
  ndmi: {
    label: "NDMI",
    caption: "Barg namligi — suv stressini koʻrsatadi",
    stops: NDMI_STOPS,
    min: -0.4,
    max: 0.6,
    ticks: [-0.4, -0.2, 0.2, 0.4, 0.6],
    line: "#2f5f9e",
    threshold: { value: 0, label: "Suv stressi chegarasi" },
    legendLabels: ["−0.4", "0.1", "0.6"],
    legendNote: "Jigarrang — quruq, koʻk — nam. 0 dan past qiymat suv stressini bildiradi.",
    pixel: "20 m",
  },
  ndre: {
    label: "NDRE",
    caption: "Xlorofill — azot holatini koʻrsatadi",
    stops: NDRE_STOPS,
    min: -0.1,
    max: 0.6,
    ticks: [0.2, 0.4, 0.6],
    line: "#5c6b12",
    threshold: { value: 0.2, label: "Azot chegarasi" },
    legendLabels: ["−0.1", "0.25", "0.6"],
    legendNote: "Sariq — azot kam, toʻq yashil — azot yetarli. NDVI past boʻlsa, baho berilmaydi.",
    pixel: "20 m",
  },
};

/** Mean, min and max of an index, or null when the observation has no value for it. */
export function indexValues(observation: Observation, index: IndexName): { mean: number; min: number; max: number } | null {
  const mean = observation[`${index}_mean`];
  const min = observation[`${index}_min`];
  const max = observation[`${index}_max`];
  return mean === null || min === null || max === null ? null : { mean, min, max };
}

function parseRgb(color: string): [number, number, number] {
  const [r, g, b] = color.match(/\d+/g)!.map(Number);
  return [r, g, b];
}

/** The ramp color for a value, linearly interpolated between the stops. */
export function rampRgb(stops: ColorStops, value: number): [number, number, number] {
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (value <= first[0]) return parseRgb(first[1]);
  if (value >= last[0]) return parseRgb(last[1]);
  const upper = stops.findIndex(([stop]) => stop >= value);
  const [v0, c0] = stops[upper - 1];
  const [v1, c1] = stops[upper];
  const t = (value - v0) / (v1 - v0);
  const a = parseRgb(c0);
  const b = parseRgb(c1);
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as [number, number, number];
}

export function indexColor(index: IndexName, value: number): string {
  return `rgb(${rampRgb(INDICES[index].stops, value).join(", ")})`;
}

/** White text on the dark ends of a ramp, dark text on the light middle. */
export function indexTextColor(index: IndexName, value: number): string {
  const [r, g, b] = rampRgb(INDICES[index].stops, value);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#141413" : "#ffffff";
}

/** A CSS gradient that puts each stop at its place between the first and the last stop. */
export function rampGradient(stops: ColorStops): string {
  const first = stops[0][0];
  const span = stops[stops.length - 1][0] - first;
  return `linear-gradient(to right, ${stops
    .map(([value, color]) => `${color} ${(((value - first) / span) * 100).toFixed(2)}%`)
    .join(", ")})`;
}

/** "0.25", "−0.05": a real minus sign, so negative values are easy to read. */
export function formatIndex(value: number, digits = 2): string {
  return `${value < 0 ? "−" : ""}${Math.abs(value).toFixed(digits)}`;
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
