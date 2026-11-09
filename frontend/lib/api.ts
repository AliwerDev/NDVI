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
  clear_fraction: number;
  cog_path: string;
  created_at: string;
};

export type ObservationImage = {
  url: string;
  bounds: [number, number, number, number]; // west, south, east, north
};

export type User = {
  id: number;
  username: string | null;
  display_name: string;
  telegram_linked: boolean;
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

  deleteField: (id: number) => request<void>(`/fields/${id}`, { method: "DELETE" }),

  computeNdvi: (id: number, start: string, end: string) =>
    request<Observation>(`/fields/${id}/ndvi?start=${start}&end=${end}`, { method: "POST" }),

  startBackfill: (id: number, start: string, end: string) =>
    request<unknown>(`/fields/${id}/ndvi/backfill?start=${start}&end=${end}`, { method: "POST" }),

  history: (id: number) => request<Observation[]>(`/fields/${id}/ndvi`),

  // The bot username. null when the bot is off or Telegram is unreachable.
  telegramBot: () => request<{ username: string | null }>("/telegram/bot").then((info) => info.username),

  // A one-time t.me link. The bot subscribes the chat to this field's alerts.
  telegramLink: (fieldId: number) =>
    request<{ url: string }>(`/fields/${fieldId}/telegram-link`, { method: "POST" }).then((link) => link.url),

  register: (username: string, password: string) =>
    request<AuthResult>("/auth/register", { method: "POST", body: JSON.stringify({ username, password }) }),

  login: (username: string, password: string) =>
    request<AuthResult>("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),

  logout: () => request<void>("/auth/logout", { method: "POST" }),

  me: () => request<User>("/auth/me"),

  telegramLoginStart: () => request<TelegramLoginStart>("/auth/telegram/start", { method: "POST" }),

  telegramLoginPoll: (pollToken: string) =>
    request<TelegramPoll>("/auth/telegram/poll", { method: "POST", body: JSON.stringify({ poll_token: pollToken }) }),

  observationImage: (id: number) =>
    request<ObservationImage>(`/observations/${id}/image`).then((image) => ({
      ...image,
      url: `${API_URL}${image.url}`,
    })),
};
