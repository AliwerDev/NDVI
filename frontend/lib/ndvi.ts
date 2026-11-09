// NDVI colors. Keep these stops equal to COLOR_STOPS in app/services/render.py.
export const NDVI_STOPS: [number, string][] = [
  [-0.2, "rgb(165, 0, 38)"],
  [0.0, "rgb(215, 48, 39)"],
  [0.2, "rgb(254, 224, 139)"],
  [0.4, "rgb(166, 217, 106)"],
  [0.6, "rgb(26, 152, 80)"],
  [0.9, "rgb(0, 104, 55)"],
];

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
