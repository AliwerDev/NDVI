// Small typed client for the NDVI backend API.

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Position = [number, number]; // [longitude, latitude]

export type Polygon = {
  type: "Polygon";
  coordinates: Position[][];
};

export type FieldFeature = {
  type: "Feature";
  id: number;
  geometry: Polygon;
  properties: { name: string; created_at: string };
};

export type Observation = {
  id: number;
  field_id: number;
  observed_on: string;
  scene_id: string;
  scene_cloud_cover: number;
  ndvi_mean: number;
  ndvi_min: number;
  ndvi_max: number;
  clear_fraction: number;
  cog_path: string;
  created_at: string;
};

export type ObservationImage = {
  url: string;
  bounds: [number, number, number, number]; // west, south, east, north
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      // The body is not JSON. Keep the status text.
    }
    throw new Error(detail);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export const api = {
  listFields: () =>
    request<{ features: FieldFeature[] }>("/fields").then((collection) => collection.features),

  createField: (name: string, geometry: Polygon) =>
    request<FieldFeature>("/fields", { method: "POST", body: JSON.stringify({ name, geometry }) }),

  deleteField: (id: number) => request<void>(`/fields/${id}`, { method: "DELETE" }),

  computeNdvi: (id: number, start: string, end: string) =>
    request<Observation>(`/fields/${id}/ndvi?start=${start}&end=${end}`, { method: "POST" }),

  startBackfill: (id: number, start: string, end: string) =>
    request<unknown>(`/fields/${id}/ndvi/backfill?start=${start}&end=${end}`, { method: "POST" }),

  history: (id: number) => request<Observation[]>(`/fields/${id}/ndvi`),

  // The bot username for the t.me deep link. null when the bot is off or Telegram is unreachable.
  telegramBot: () => request<{ username: string | null }>("/telegram/bot").then((info) => info.username),

  observationImage: (id: number) =>
    request<ObservationImage>(`/observations/${id}/image`).then((image) => ({
      ...image,
      url: `${API_URL}${image.url}`,
    })),
};
