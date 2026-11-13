import { formatArea } from "@/lib/geo";
import { formatDayMonth } from "@/lib/ndvi";

const numbers = new Intl.NumberFormat("ru-RU");

/** 6140 → "6 140". */
export function formatNumber(value: number): string {
  return numbers.format(value);
}

/** Share of a total in whole percent. 0 when the total is 0. */
export function percent(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

/** formatArea, with digit groups for big totals: "4 812 ga". */
export function formatTotalArea(areaHa: number): string {
  return areaHa < 100 ? formatArea(areaHa) : `${formatNumber(Math.round(areaHa))} ga`;
}

function clock(date: Date): string {
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

// Midnight of the browser's local day. isoDate() in lib/ndvi.ts uses UTC, which is the wrong day before 05:00 in Tashkent.
function localMidnight(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function localIso(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The local day of a timestamp: "2-sentyabr". */
export function formatDay(iso: string): string {
  return formatDayMonth(localIso(new Date(iso)));
}

/** A timestamp as people say it: "Bugun, 14:05", "Kecha", "9 kun oldin", "2-sentyabr". */
export function formatSeen(iso: string | null, now = new Date()): string {
  if (!iso) return "—";
  const date = new Date(iso);
  const days = Math.round((localMidnight(now) - localMidnight(date)) / 86_400_000);
  if (days <= 0) return `Bugun, ${clock(date)}`;
  if (days === 1) return "Kecha";
  if (days < 30) return `${days} kun oldin`;
  return formatDayMonth(localIso(date));
}

/** How long ago: "5 daqiqa", "2 soat", "3 kun". */
export function formatAge(iso: string, now = new Date()): string {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} daqiqa`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} soat`;
  return `${Math.round(hours / 24)} kun`;
}
