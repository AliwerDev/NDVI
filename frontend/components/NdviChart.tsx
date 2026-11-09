"use client";

import { ChartIcon } from "@/components/icons";
import type { Observation } from "@/lib/api";
import { formatDate, formatDateLong, ndviColor } from "@/lib/ndvi";

const Y_MIN = -0.2;
const Y_MAX = 1.0;
const Y_TICKS = [0.25, 0.5, 0.75, 1];
const TOOLTIP_HEIGHT = 28;

// "compact" fits the 380 px sidebar. "large" is for the report window and shows month names.
const LAYOUTS = {
  compact: {
    width: 300,
    height: 184,
    pad: { left: 32, right: 8, top: 12, bottom: 34 },
    dateTicks: 2,
    tooltipWidth: 150,
    date: formatDate,
  },
  large: {
    width: 960,
    height: 360,
    pad: { left: 40, right: 16, top: 16, bottom: 36 },
    dateTicks: 6,
    tooltipWidth: 200,
    date: formatDateLong,
  },
};

type Props = {
  observations: Observation[];
  selectedId: number | null;
  onSelect: (observation: Observation) => void;
  variant?: keyof typeof LAYOUTS;
};

function label(observation: Observation, date: (iso: string) => string): string {
  return `${date(observation.observed_on)}: NDVI ${observation.ndvi_mean.toFixed(2)}`;
}

function isoFromTime(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

// An SVG line chart of mean NDVI over time. A click on a point selects that observation.
export default function NdviChart({ observations, selectedId, onSelect, variant = "compact" }: Props) {
  if (observations.length === 0) {
    return (
      <div className="empty">
        <span className="empty-icon">
          <ChartIcon size={22} />
        </span>
        <p>Hali NDVI maʼlumoti yoʻq.</p>
      </div>
    );
  }

  const { width: WIDTH, height: HEIGHT, pad: PAD, dateTicks, tooltipWidth, date } = LAYOUTS[variant];
  const bottom = HEIGHT - PAD.bottom;
  const right = WIDTH - PAD.right;
  const times = observations.map((o) => new Date(o.observed_on).getTime());
  const tMin = Math.min(...times);
  const tMax = Math.max(...times);
  const x = (t: number) => (tMax === tMin ? (PAD.left + right) / 2 : PAD.left + ((t - tMin) / (tMax - tMin)) * (right - PAD.left));
  const y = (v: number) => PAD.top + (1 - (Math.min(Math.max(v, Y_MIN), Y_MAX) - Y_MIN) / (Y_MAX - Y_MIN)) * (bottom - PAD.top);

  const points = observations.map((o, i) => ({ o, px: x(times[i]), py: y(o.ndvi_mean) }));
  const line = points.map((p) => `${p.px.toFixed(1)},${p.py.toFixed(1)}`).join(" ");
  const first = points[0];
  const last = points[points.length - 1];
  const area = `M${first.px.toFixed(1)} ${bottom} L${line.replaceAll(" ", " L")} L${last.px.toFixed(1)} ${bottom} Z`;
  const selected = points.find((p) => p.o.id === selectedId) ?? null;

  // Date labels at even time steps. With one observation there is one label.
  const tickCount = tMax === tMin ? 1 : dateTicks;
  const xTicks = Array.from({ length: tickCount }, (_, i) =>
    tickCount === 1 ? tMin : tMin + ((tMax - tMin) * i) / (tickCount - 1),
  );

  // The tooltip sits above the selected point, or below it when there is no room above.
  let tooltip: { x: number; y: number } | null = null;
  if (selected) {
    const tx = Math.min(Math.max(selected.px - tooltipWidth / 2, PAD.left), right - tooltipWidth);
    const above = selected.py - 14 - TOOLTIP_HEIGHT;
    tooltip = { x: tx, y: above >= 0 ? above : selected.py + 14 };
  }

  const ariaLabel =
    `Oʻrtacha NDVI: ${date(first.o.observed_on)} dan ${date(last.o.observed_on)} gacha ` +
    `${observations.length} ta kuzatuv.` +
    (selected ? ` Tanlangan: ${label(selected.o, date)}` : "");

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className={`chart chart-${variant}`} role="img" aria-label={ariaLabel}>
      {Y_TICKS.map((tick) => (
        <line key={tick} x1={PAD.left} x2={right} y1={y(tick)} y2={y(tick)} className="grid" />
      ))}
      <line x1={PAD.left} x2={right} y1={y(0)} y2={y(0)} className="axis" />
      {[0, ...Y_TICKS].map((tick) => (
        <text key={tick} x={PAD.left - 6} y={y(tick) + 3.5} textAnchor="end" className="tick">
          {tick === 0 || tick === 1 ? tick : tick.toFixed(2).replace(/0$/, "")}
        </text>
      ))}

      <path d={area} className="area" />
      <polyline points={line} className="line" />

      {selected && <line x1={selected.px} x2={selected.px} y1={selected.py + 7} y2={bottom} className="guide" />}

      {points.map(({ o, px, py }) =>
        o.id === selectedId ? null : (
          <g key={o.id} className="point" onClick={() => onSelect(o)}>
            <circle cx={px} cy={py} r={10} className="hit" />
            <circle cx={px} cy={py} r={4} className="dot" />
            <title>{label(o, date)}</title>
          </g>
        ),
      )}

      {selected && (
        <g>
          <circle cx={selected.px} cy={selected.py} r={12} fill={ndviColor(selected.o.ndvi_mean)} fillOpacity={0.18} />
          <circle
            cx={selected.px}
            cy={selected.py}
            r={7.5}
            fill={ndviColor(selected.o.ndvi_mean)}
            className="selected-dot"
          />
        </g>
      )}

      {selected && tooltip && (
        <g className="tooltip">
          <rect x={tooltip.x} y={tooltip.y} width={tooltipWidth} height={TOOLTIP_HEIGHT} rx={6} />
          <text x={tooltip.x + tooltipWidth / 2} y={tooltip.y + 18.5} textAnchor="middle">
            {label(selected.o, date)}
          </text>
        </g>
      )}

      {xTicks.map((time, i) => (
        <text
          key={time}
          x={x(time)}
          y={HEIGHT - 12}
          textAnchor={tickCount === 1 ? "middle" : i === 0 ? "start" : i === tickCount - 1 ? "end" : "middle"}
          className="tick"
        >
          {date(isoFromTime(time))}
        </text>
      ))}
    </svg>
  );
}
