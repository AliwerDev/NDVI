"use client";

import type { Observation } from "@/lib/api";
import { formatDate } from "@/lib/ndvi";

const WIDTH = 320;
const HEIGHT = 170;
const PAD = { left: 34, right: 10, top: 10, bottom: 26 };
const Y_MIN = -0.2;
const Y_MAX = 1.0;
const Y_TICKS = [0, 0.25, 0.5, 0.75, 1];

type Props = {
  observations: Observation[];
  selectedId: number | null;
  onSelect: (observation: Observation) => void;
};

// A small SVG line chart of mean NDVI over time. A click on a point selects that observation.
export default function NdviChart({ observations, selectedId, onSelect }: Props) {
  if (observations.length === 0) {
    return <p className="muted">Hali NDVI maʼlumoti yoʻq.</p>;
  }

  const times = observations.map((o) => new Date(o.observed_on).getTime());
  const tMin = Math.min(...times);
  const tMax = Math.max(...times);
  const x = (t: number) =>
    tMax === tMin
      ? (PAD.left + WIDTH - PAD.right) / 2
      : PAD.left + ((t - tMin) / (tMax - tMin)) * (WIDTH - PAD.left - PAD.right);
  const y = (v: number) =>
    PAD.top + (1 - (Math.min(Math.max(v, Y_MIN), Y_MAX) - Y_MIN) / (Y_MAX - Y_MIN)) * (HEIGHT - PAD.top - PAD.bottom);

  const points = observations.map((o, i) => ({ o, px: x(times[i]), py: y(o.ndvi_mean) }));
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.px.toFixed(1)},${p.py.toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="chart" role="img" aria-label="NDVI grafigi">
      {Y_TICKS.map((tick) => (
        <g key={tick}>
          <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(tick)} y2={y(tick)} className="grid" />
          <text x={PAD.left - 6} y={y(tick) + 3} textAnchor="end" className="tick">
            {tick.toFixed(2)}
          </text>
        </g>
      ))}
      <path d={path} className="line" />
      {points.map(({ o, px, py }) => (
        <circle
          key={o.id}
          cx={px}
          cy={py}
          r={o.id === selectedId ? 5 : 3.5}
          className={o.id === selectedId ? "point selected" : "point"}
          onClick={() => onSelect(o)}
        >
          <title>{`${formatDate(o.observed_on)}: NDVI ${o.ndvi_mean.toFixed(2)}`}</title>
        </circle>
      ))}
      <text x={PAD.left} y={HEIGHT - 6} className="tick">
        {formatDate(observations[0].observed_on)}
      </text>
      <text x={WIDTH - PAD.right} y={HEIGHT - 6} textAnchor="end" className="tick">
        {formatDate(observations[observations.length - 1].observed_on)}
      </text>
    </svg>
  );
}
