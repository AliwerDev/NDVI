// Helpers for the weather card and the rain bars of the chart.

import type { WeatherDay } from "@/lib/api";

const WEEKDAYS_UZ = ["Ya", "Du", "Se", "Ch", "Pa", "Ju", "Sh"];
const WEEKDAYS_LONG_UZ = ["yakshanba", "dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba"];
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

const DAY_MS = 86_400_000;

// Local midnight, so getDay() gives the weekday of the calendar date and not of the UTC date.
function localDate(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

export function shiftDate(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day) + days * DAY_MS).toISOString().slice(0, 10);
}

export function weekdayShort(iso: string): string {
  return WEEKDAYS_UZ[localDate(iso).getDay()];
}

/** "12-noyabr" */
export function dayMonth(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${Number(day)}-${MONTHS_UZ[Number(month) - 1]}`;
}

/** "12-noyabr, payshanba" */
export function dayMonthWeekday(iso: string): string {
  return `${dayMonth(iso)}, ${WEEKDAYS_LONG_UZ[localDate(iso).getDay()]}`;
}

/** "11–13-noyabr", "30-noyabr – 2-dekabr" or "12-noyabr". */
export function formatPeriod(first: string, last: string): string {
  if (first === last) return dayMonth(first);
  if (first.slice(0, 7) === last.slice(0, 7)) return `${Number(first.slice(8))}–${dayMonth(last)}`;
  return `${dayMonth(first)} – ${dayMonth(last)}`;
}

/** A real minus sign and at most one decimal: "−1.5", "12". */
export function formatNumber(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded < 0 ? "−" : ""}${Math.abs(rounded)}`;
}

export function formatTemp(value: number | null): string {
  return value === null ? "—" : `${formatNumber(Math.round(value))}°`;
}

export type WeatherPeriod = { kind: "frost" | "heat"; first: string; last: string; value: number };

/** The first run of frost (t_min ≤ threshold) or heat (t_max ≥ threshold) days, or null. */
export function firstPeriod(days: WeatherDay[], kind: WeatherPeriod["kind"], threshold: number): WeatherPeriod | null {
  const hit = (d: WeatherDay) =>
    kind === "frost" ? d.t_min !== null && d.t_min <= threshold : d.t_max !== null && d.t_max >= threshold;
  const start = days.findIndex(hit);
  if (start < 0) return null;
  let end = start;
  while (end + 1 < days.length && hit(days[end + 1])) end += 1;
  const values = days.slice(start, end + 1).map((d) => (kind === "frost" ? d.t_min : d.t_max) as number);
  return {
    kind,
    first: days[start].day,
    last: days[end].day,
    value: kind === "frost" ? Math.min(...values) : Math.max(...values),
  };
}

export type WeatherTotals = { days: number; precipitation: number; et0: number; tMax: number | null };

/** Totals of the n days before `iso` (the day itself is not included), or null without data. */
export function totalsBefore(days: WeatherDay[], iso: string, n = 7): WeatherTotals | null {
  const from = shiftDate(iso, -n);
  const rows = days.filter((d) => d.day >= from && d.day < iso);
  if (rows.length === 0) return null;
  const maxima = rows.flatMap((d) => (d.t_max === null ? [] : [d.t_max]));
  return {
    days: rows.length,
    precipitation: rows.reduce((sum, d) => sum + (d.precipitation ?? 0), 0),
    et0: rows.reduce((sum, d) => sum + (d.et0 ?? 0), 0),
    tMax: maxima.length > 0 ? Math.max(...maxima) : null,
  };
}
