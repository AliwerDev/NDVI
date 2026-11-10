"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import {
  type GeoJSONSource,
  type LngLatBoundsLike,
  Map as MapLibreMap,
  type MapMouseEvent,
  Marker,
  setWorkerUrl,
  type StyleSpecification,
} from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

import { MinusIcon, PlusIcon } from "@/components/icons";
import type { SearchTarget } from "@/components/MapSearch";
import { API_URL, type FieldFeature, type ObservationImage, type Position } from "@/lib/api";
import { getToken } from "@/lib/auth";

// The bundler moves maplibre-gl, so its default worker URL gives 404 and GeoJSON layers
// (fields, drawing) do not render. scripts/copy-maplibre-worker.mjs puts the worker in public/.
setWorkerUrl("/maplibre-gl-worker.mjs");

export type Basemap = "osm" | "satellite";

const STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "© OpenStreetMap contributors",
    },
    satellite: {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      // In rural areas Esri has no imagery above z17 and returns a "Map data not yet available"
      // tile. Above this level MapLibre stretches the z17 tiles instead.
      maxzoom: 17,
      attribution: "Imagery © Esri",
    },
  },
  layers: [
    { id: "osm", type: "raster", source: "osm" },
    { id: "satellite", type: "raster", source: "satellite", layout: { visibility: "none" } },
  ],
};

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

type Props = {
  fields: FieldFeature[];
  selectedId: number | null;
  onSelectField: (id: number) => void;
  drawing: boolean;
  draftPoints: Position[];
  onAddPoint: (point: Position) => void;
  overlay: ObservationImage | null;
  basemap: Basemap;
  searchTarget: SearchTarget | null;
};

function boundsOf(features: FieldFeature[]): LngLatBoundsLike | null {
  const points = features.flatMap((feature) => feature.geometry.coordinates[0]);
  if (points.length === 0) return null;
  const lngs = points.map((point) => point[0]);
  const lats = points.map((point) => point[1]);
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
}

function fieldsData(fields: FieldFeature[], selectedId: number | null): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: fields.map((field) => ({
      type: "Feature",
      geometry: field.geometry,
      // The id is copied to properties, because click queries read properties.
      properties: { id: field.id, name: field.properties.name, selected: field.id === selectedId },
    })),
  };
}

function draftData(points: Position[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  if (points.length >= 3) {
    const ring = [...points, points[0]];
    features.push({ type: "Feature", geometry: { type: "Polygon", coordinates: [ring] }, properties: {} });
  }
  if (points.length >= 2) {
    features.push({ type: "Feature", geometry: { type: "LineString", coordinates: points }, properties: { closing: false } });
  }
  if (points.length >= 3) {
    // The closing edge back to the first point is dashed: it is not drawn by the user yet.
    const closing = [points[points.length - 1], points[0]];
    features.push({ type: "Feature", geometry: { type: "LineString", coordinates: closing }, properties: { closing: true } });
  }
  points.forEach((point, index) => {
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: point },
      properties: { first: index === 0 },
    });
  });
  return { type: "FeatureCollection", features };
}

export default function MapView(props: Props) {
  const { fields, selectedId, drawing, draftPoints, overlay, basemap, searchTarget } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const [loaded, setLoaded] = useState(false);
  const fittedToAllRef = useRef(false);

  // The map is created once. Its click handler reads the newest props through this ref.
  const propsRef = useRef(props);
  useEffect(() => {
    propsRef.current = props;
  });

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: STYLE,
      center: [64.5, 41.4], // Uzbekistan
      zoom: 5,
      // The NDVI PNG comes from our API, which needs the session token. Tile servers get no token.
      transformRequest: (url) => {
        const token = getToken();
        return token && url.startsWith(API_URL) ? { url, headers: { Authorization: `Bearer ${token}` } } : { url };
      },
    });
    mapRef.current = map;

    map.on("load", () => {
      map.addSource("fields", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "fields-fill",
        type: "fill",
        source: "fields",
        paint: {
          "fill-color": ["case", ["get", "selected"], "#2563eb", "#f59e0b"],
          "fill-opacity": ["case", ["get", "selected"], 0.16, 0.18],
        },
      });
      // A wide casing under each outline keeps it visible on satellite imagery.
      map.addLayer({
        id: "fields-casing",
        type: "line",
        source: "fields",
        layout: { "line-join": "round" },
        paint: {
          "line-color": ["case", ["get", "selected"], "#ffffff", "#141413"],
          "line-opacity": ["case", ["get", "selected"], 1, 0.6],
          "line-width": ["case", ["get", "selected"], 8, 5],
        },
      });
      map.addLayer({
        id: "fields-line",
        type: "line",
        source: "fields",
        layout: { "line-join": "round" },
        paint: {
          "line-color": ["case", ["get", "selected"], "#2563eb", "#f59e0b"],
          "line-width": ["case", ["get", "selected"], 4, 2],
        },
      });
      // Draft polygon while drawing. Bright yellow with a dark outline stays visible on satellite imagery.
      map.addSource("draft", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "draft-fill",
        type: "fill",
        source: "draft",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": "#facc15", "fill-opacity": 0.25 },
      });
      map.addLayer({
        id: "draft-line-casing",
        type: "line",
        source: "draft",
        filter: ["==", ["geometry-type"], "LineString"],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#1c1917",
          "line-width": ["case", ["get", "closing"], 4.5, 6.5],
          "line-opacity": ["case", ["get", "closing"], 0.7, 1],
        },
      });
      map.addLayer({
        id: "draft-line",
        type: "line",
        source: "draft",
        filter: ["all", ["==", ["geometry-type"], "LineString"], ["!", ["get", "closing"]]],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#facc15", "line-width": 3 },
      });
      map.addLayer({
        id: "draft-closing",
        type: "line",
        source: "draft",
        filter: ["all", ["==", ["geometry-type"], "LineString"], ["get", "closing"]],
        paint: { "line-color": "#facc15", "line-width": 2, "line-dasharray": [3.5, 3.5] },
      });
      map.addLayer({
        id: "draft-points",
        type: "circle",
        source: "draft",
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          // The first point is bigger, so the user sees where the polygon closes.
          "circle-radius": ["case", ["get", "first"], 10, 6.5],
          "circle-color": ["case", ["get", "first"], "#22c55e", "#facc15"],
          "circle-stroke-color": "#1c1917",
          "circle-stroke-width": ["case", ["get", "first"], 3, 2.5],
        },
      });
      setLoaded(true);
    });

    map.on("click", (event: MapMouseEvent) => {
      const current = propsRef.current;
      if (current.drawing) {
        current.onAddPoint([event.lngLat.lng, event.lngLat.lat]);
        return;
      }
      const hit = map.queryRenderedFeatures(event.point, { layers: ["fields-fill"] })[0];
      if (hit?.properties?.id !== undefined) {
        current.onSelectField(Number(hit.properties.id));
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
      setLoaded(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    (map.getSource("fields") as GeoJSONSource).setData(fieldsData(fields, selectedId));
    if (!fittedToAllRef.current && fields.length > 0) {
      const bounds = boundsOf(fields);
      if (bounds) map.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 0 });
      fittedToAllRef.current = true;
    }
  }, [loaded, fields, selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    const selected = fields.find((field) => field.id === selectedId);
    if (!map || !loaded || !selected) return;
    const bounds = boundsOf([selected]);
    if (bounds) map.fitBounds(bounds, { padding: 80, maxZoom: 16 });
    // "fields" is left out of the dependencies on purpose: zoom only when the selection changes,
    // not every time the field list reloads.
  }, [loaded, selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    (map.getSource("draft") as GeoJSONSource).setData(draftData(draftPoints));
    map.getCanvas().style.cursor = drawing ? "crosshair" : "";
  }, [loaded, draftPoints, drawing]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    if (map.getLayer("ndvi")) map.removeLayer("ndvi");
    if (map.getSource("ndvi")) map.removeSource("ndvi");
    // The blue fill of the selected field would tint the NDVI colors, so it is hidden under an overlay.
    map.setPaintProperty("fields-fill", "fill-opacity", ["case", ["get", "selected"], overlay ? 0 : 0.16, 0.18]);
    if (!overlay) return;
    const [west, south, east, north] = overlay.bounds;
    map.addSource("ndvi", {
      type: "image",
      url: overlay.url,
      coordinates: [
        [west, north],
        [east, north],
        [east, south],
        [west, south],
      ],
    });
    // Put the NDVI image under the field outlines.
    map.addLayer(
      { id: "ndvi", type: "raster", source: "ndvi", paint: { "raster-resampling": "nearest", "raster-opacity": 0.92 } },
      "fields-casing",
    );
  }, [loaded, overlay]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    map.setLayoutProperty("osm", "visibility", basemap === "osm" ? "visible" : "none");
    map.setLayoutProperty("satellite", "visibility", basemap === "satellite" ? "visible" : "none");
  }, [loaded, basemap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || !searchTarget) return;
    if (searchTarget.bbox) {
      map.fitBounds(searchTarget.bbox, { padding: 40, maxZoom: 16 });
    } else {
      map.flyTo({ center: searchTarget.center, zoom: 16 });
    }
    // One marker shows the last search result.
    markerRef.current?.remove();
    markerRef.current = new Marker({ color: "#dc2626" }).setLngLat(searchTarget.center).addTo(map);
  }, [loaded, searchTarget]);

  return (
    <>
      <div ref={containerRef} className="map" />
      <div className="map-zoom">
        <button type="button" aria-label="Yaqinlashtirish" onClick={() => mapRef.current?.zoomIn()}>
          <PlusIcon size={18} strokeWidth={2} />
        </button>
        <button type="button" aria-label="Uzoqlashtirish" onClick={() => mapRef.current?.zoomOut()}>
          <MinusIcon size={18} />
        </button>
      </div>
    </>
  );
}
