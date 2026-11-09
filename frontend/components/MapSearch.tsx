"use client";

import { type FormEvent, useState } from "react";

import type { Position } from "@/lib/api";

// Where the map moves after a search. A bbox zooms to the whole place, a point zooms in close.
export type SearchTarget = {
  center: Position; // [longitude, latitude]
  bbox?: [number, number, number, number]; // west, south, east, north
  label: string;
};

type NominatimPlace = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  boundingbox: [string, string, string, string]; // south, north, west, east
};

// Nominatim usage policy: at most 1 request per second and no search-as-you-type.
// So the search runs only on Enter or a button click.
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

/** Read "41.30, 69.21" or "41.30 69.21" as latitude, longitude. Returns null for other text. */
export function parseCoordinates(text: string): Position | null {
  const match = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  let lat = Number(match[1]);
  let lon = Number(match[2]);
  // The usual order is "latitude, longitude" (as in Google Maps). Swap if the first value cannot be a latitude.
  if (Math.abs(lat) > 90 && Math.abs(lon) <= 90) [lat, lon] = [lon, lat];
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return [lon, lat];
}

async function searchPlaces(query: string): Promise<SearchTarget[]> {
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    countrycodes: "uz",
    limit: "5",
    "accept-language": "uz",
  });
  const response = await fetch(`${NOMINATIM_URL}?${params}`);
  if (!response.ok) throw new Error(`Qidiruv xizmati javob bermadi (${response.status})`);
  const places = (await response.json()) as NominatimPlace[];
  return places.map((place) => {
    const [south, north, west, east] = place.boundingbox.map(Number);
    return {
      center: [Number(place.lon), Number(place.lat)],
      bbox: [west, south, east, north],
      label: place.display_name,
    };
  });
}

type Props = {
  onSelect: (target: SearchTarget) => void;
};

export default function MapSearch({ onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchTarget[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const text = query.trim();
    if (!text) return;
    setError(null);
    setResults(null);

    const point = parseCoordinates(text);
    if (point) {
      onSelect({ center: point, label: text });
      return;
    }

    setLoading(true);
    try {
      const found = await searchPlaces(text);
      setResults(found);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const choose = (target: SearchTarget) => {
    setResults(null);
    onSelect(target);
  };

  return (
    <div className="map-search">
      <form onSubmit={submit}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Joy nomi yoki 41.30, 69.21"
          aria-label="Xaritadan qidirish"
        />
        <button type="submit" disabled={loading || !query.trim()}>
          {loading ? "…" : "Qidirish"}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      {results && results.length === 0 && <p className="muted">Hech narsa topilmadi.</p>}
      {results && results.length > 0 && (
        <ul className="search-results">
          {results.map((result) => (
            <li key={result.label}>
              <button type="button" className="link" onClick={() => choose(result)}>
                {result.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
