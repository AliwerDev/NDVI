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

import type { SearchTarget } from "@/components/MapSearch";
import type { FieldFeature, ObservationImage, Position } from "@/lib/api";

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
      maxzoom: 19,
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
    // Show the closing edge back to the first point as soon as there are 3 points.
    const line = points.length >= 3 ? [...points, points[0]] : points;
    features.push({ type: "Feature", geometry: { type: "LineString", coordinates: line }, properties: {} });
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
          "fill-opacity": 0.12,
        },
      });
      map.addLayer({
        id: "fields-line",
        type: "line",
        source: "fields",
        paint: {
          "line-color": ["case", ["get", "selected"], "#2563eb", "#f59e0b"],
          "line-width": ["case", ["get", "selected"], 3, 2],
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
        paint: { "line-color": "#111827", "line-width": 7, "line-opacity": 0.7 },
      });
      map.addLayer({
        id: "draft-line",
        type: "line",
        source: "draft",
        filter: ["==", ["geometry-type"], "LineString"],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#facc15", "line-width": 3.5 },
      });
      map.addLayer({
        id: "draft-points",
        type: "circle",
        source: "draft",
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          // The first point is bigger, so the user sees where the polygon closes.
          "circle-radius": ["case", ["get", "first"], 9, 7],
          "circle-color": ["case", ["get", "first"], "#22c55e", "#facc15"],
          "circle-stroke-color": "#111827",
          "circle-stroke-width": 2.5,
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
    map.addLayer({ id: "ndvi", type: "raster", source: "ndvi", paint: { "raster-resampling": "nearest" } }, "fields-line");
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

  return <div ref={containerRef} className="map" />;
}
