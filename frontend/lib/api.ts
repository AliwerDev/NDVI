// Small typed client for the NDVI backend API.

import { clearToken, getToken, loginUrl } from "@/lib/auth";

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
  // null for observations saved before NDMI and NDRE were added.
  ndmi_mean: number | null;
  ndmi_min: number | null;
  ndmi_max: number | null;
  ndre_mean: number | null;
  ndre_min: number | null;
  ndre_max: number | null;
  nitrogen_advice: NitrogenAdvice | null;
  clear_fraction: number;
  cog_path: string;
  created_at: string;
};

/** Nitrogen advice from NDRE. "unknown": the plants are too sparse for a reliable NDRE. */
export type NitrogenAdvice = {
  level: "low" | "medium" | "ok" | "unknown";
  text: string;
  low_threshold: number;
  ok_threshold: number;
};

// A background job that fills the NDVI history. saved_count grows while the job runs.
export type BackfillJob = {
  id: number;
  field_id: number;
  status: "running" | "done" | "failed";
  start: string;
  end: string;
  saved_count: number;
  created_at: string;
  finished_at: string | null;
};

/** What the map shows inside the selected field: index colors or the true color satellite image. */
export type FieldLayer = "ndvi" | "ndmi" | "ndre" | "rgb";

export type ObservationImage = {
  url: string;
  bounds: [number, number, number, number]; // west, south, east, north
};

export type User = {
  id: number;
  username: string | null;
  display_name: string;
  has_password: boolean;
  // NDVI alerts for all fields of the user go to this Telegram account.
  telegram_linked: boolean;
  telegram_username: string | null;
};

export type AuthResult = { token: string; user: User };

export type TelegramLoginStart = { url: string; poll_token: string; expires_at: string };

export type TelegramPoll = { status: "pending" } | { status: "confirmed"; token: string; user: User };

/** An API error with its HTTP status, so callers can show their own text for 401, 409 or 410. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    // An expired or revoked session: sign in again. /auth/* answers 401 for a wrong password, so skip it.
    if (response.status === 401 && !path.startsWith("/auth/")) {
      clearToken();
      window.location.assign(loginUrl());
    }
    let detail = response.statusText;
    try {
      const body = await response.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      // The body is not JSON. Keep the status text.
    }
    throw new ApiError(detail, response.status);
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

  renameField: (id: number, name: string) =>
    request<FieldFeature>(`/fields/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),

  deleteField: (id: number) => request<void>(`/fields/${id}`, { method: "DELETE" }),

  computeNdvi: (id: number, start: string, end: string) =>
    request<Observation>(`/fields/${id}/ndvi?start=${start}&end=${end}`, { method: "POST" }),

  // 409 if the field already has a running job.
  startBackfill: (id: number, start: string, end: string) =>
    request<BackfillJob>(`/fields/${id}/ndvi/backfill?start=${start}&end=${end}`, { method: "POST" }),

  // The newest backfill job of the field, or null if it never had one.
  backfillStatus: (id: number) => request<BackfillJob | null>(`/fields/${id}/ndvi/backfill`),

  history: (id: number) => request<Observation[]>(`/fields/${id}/ndvi`),

  // The bot username. null when the bot is off or Telegram is unreachable.
  telegramBot: () => request<{ username: string | null }>("/telegram/bot").then((info) => info.username),

  // A one-time t.me link. The bot binds that Telegram account to the user: alerts for all fields go there.
  telegramLink: () => request<{ url: string }>("/auth/telegram/link", { method: "POST" }).then((link) => link.url),

  telegramUnlink: () => request<void>("/auth/telegram", { method: "DELETE" }),

  register: (username: string, password: string) =>
    request<AuthResult>("/auth/register", { method: "POST", body: JSON.stringify({ username, password }) }),

  login: (username: string, password: string) =>
    request<AuthResult>("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),

  logout: () => request<void>("/auth/logout", { method: "POST" }),

  me: () => request<User>("/auth/me"),

  // Only the name the app shows changes. The login stays the same.
  updateDisplayName: (displayName: string) =>
    request<User>("/auth/me", { method: "PATCH", body: JSON.stringify({ display_name: displayName }) }),

  telegramLoginStart: () => request<TelegramLoginStart>("/auth/telegram/start", { method: "POST" }),

  telegramLoginPoll: (pollToken: string) =>
    request<TelegramPoll>("/auth/telegram/poll", { method: "POST", body: JSON.stringify({ poll_token: pollToken }) }),

  // The first "rgb" request for an observation reads the scene from the satellite archive: a few seconds.
  observationImage: (id: number, layer: FieldLayer = "ndvi") =>
    request<ObservationImage>(`/observations/${id}/image?layer=${layer}`).then((image) => ({
      ...image,
      url: `${API_URL}${image.url}`,
    })),
};
