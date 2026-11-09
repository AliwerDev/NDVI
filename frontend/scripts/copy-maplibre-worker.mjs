// Copies the MapLibre web worker to public/, so Next.js serves it at /maplibre-gl-worker.mjs.
// MapLibre looks for the worker next to its own bundle file. After bundling, that file is not
// there (404), and GeoJSON layers do not render. MapView.tsx points MapLibre to this copy.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "node_modules", "maplibre-gl", "dist", "maplibre-gl-worker.mjs");
const target = join(root, "public", "maplibre-gl-worker.mjs");

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
console.log("Copied MapLibre worker to public/maplibre-gl-worker.mjs");
