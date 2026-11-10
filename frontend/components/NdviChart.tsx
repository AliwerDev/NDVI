"use client";

import { useState } from "react";

import { ChartIcon } from "@/components/icons";
import type { Observation, WeatherDay } from "@/lib/api";
import { formatDate, formatDateLong, formatIndex, type IndexName, indexColor, indexValues, INDICES } from "@/lib/ndvi";
import { dayMonth, formatNumber } from "@/lib/weather";

const TOOLTIP_HEIGHT = 28;
const DAY_MS = 86_400_000;
// Rain bars stop at this height. A heavier day still shows its value in the tooltip.
const RAIN_MAX_MM = 20;

// "compact" fits the 380 px sidebar. "large" is for the report window and shows month names.
const LAYOUTS = {
  compact: {
    width: 300,
    height: 184,
    pad: { left: 32, right: 8, top: 12, bottom: 34 },
    dateTicks: 2,
    tooltipWidth: 150,
    date: formatDate,
    // The rain band under the chart: its height and the gap above it.
    rainBand: 34,
    rainGap: 14,
  },
  large: {
    width: 960,
    height: 360,
    pad: { left: 40, right: 16, top: 16, bottom: 36 },
    dateTicks: 6,
    tooltipWidth: 200,
    date: formatDateLong,
    rainBand: 68,
    rainGap: 20,
  },
};

type Props = {
  observations: Observation[];
  selectedId: number | null;
  onSelect: (observation: Observation) => void;
  index?: IndexName;
  variant?: keyof typeof LAYOUTS;
  /** Daily weather. With it, daily rain shows as bars under the chart. */
  rain?: WeatherDay[];
};

function isoFromTime(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

function tickLabel(tick: number): string {
  return Number.isInteger(tick) ? String(tick) : formatIndex(tick).replace(/0$/, "");
}

// An SVG line chart of one index (mean over the field) over time. A click on a point selects that observation.
export default function NdviChart({
  observations,
  selectedId,
  onSelect,
  index = "ndvi",
  variant = "compact",
  rain = [],
}: Props) {
  // The large chart shows the value of a clicked rain bar.
  const [rainDay, setRainDay] = useState<string | null>(null);
  const info = INDICES[index];
  // Observations from before NDMI and NDRE were added have no value for them.
  const points0 = observations.flatMap((o) => {
    const values = indexValues(o, index);
    return values ? [{ o, value: values.mean }] : [];
  });

  if (points0.length === 0) {
    return (
      <div className="empty">
        <span className="empty-icon">
          <ChartIcon size={22} />
        </span>
        <p>
          {observations.length === 0
            ? `Hali ${info.label} maʼlumoti yoʻq.`
            : `Kuzatuvlarda ${info.label} yoʻq. Mavsum tarixini qayta yuklang.`}
        </p>
      </div>
    );
  }

  const { width: WIDTH, height: BASE_HEIGHT, pad: PAD, dateTicks, tooltipWidth, date, rainBand, rainGap } = LAYOUTS[variant];
  const bottom = BASE_HEIGHT - PAD.bottom;
  const right = WIDTH - PAD.right;
  const times = points0.map(({ o }) => new Date(o.observed_on).getTime());
  const tMin = Math.min(...times);
  const tMax = Math.max(...times);

  // Rain needs a time axis, so one observation shows no band.
  const rainDays =
    tMax > tMin
      ? rain.filter((d) => {
          const t = new Date(d.day).getTime();
          return t >= tMin && t <= tMax;
        })
      : [];
  const showRain = rainDays.length > 0;
  const HEIGHT = BASE_HEIGHT + (showRain ? rainGap + rainBand : 0);
  const rainTop = bottom + rainGap;
  const rainBottom = rainTop + rainBand;
  const x = (t: number) => (tMax === tMin ? (PAD.left + right) / 2 : PAD.left + ((t - tMin) / (tMax - tMin)) * (right - PAD.left));
  const y = (v: number) =>
    PAD.top + (1 - (Math.min(Math.max(v, info.min), info.max) - info.min) / (info.max - info.min)) * (bottom - PAD.top);
  const label = (o: Observation, value: number) => `${date(o.observed_on)}: ${info.label} ${formatIndex(value)}`;

  const points = points0.map(({ o, value }, i) => ({ o, value, px: x(times[i]), py: y(value) }));
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

  const dayWidth = showRain ? ((right - PAD.left) * DAY_MS) / (tMax - tMin) : 0;
  const barWidth = Math.min(Math.max(dayWidth * 0.7, 1.2), 8);
  const bars = rainDays.flatMap((d) => {
    const mm = d.precipitation ?? 0;
    if (mm <= 0) return [];
    const h = (Math.min(mm, RAIN_MAX_MM) / RAIN_MAX_MM) * rainBand;
    return [{ day: d.day, mm, x: x(new Date(d.day).getTime()), h }];
  });
  const totalRain = rainDays.reduce((sum, d) => sum + (d.precipitation ?? 0), 0);
  // The 7 days before the selected observation: the weather that the "Tanlangan kuzatuv" card describes.
  const windowStart = selected ? Math.max(x(new Date(selected.o.observed_on).getTime() - 7 * DAY_MS), PAD.left) : 0;
  const rainTip = variant === "large" ? (bars.find((b) => b.day === rainDay) ?? null) : null;
  const rainTipWidth = 180;
  const rainTipX = rainTip ? Math.min(Math.max(rainTip.x - rainTipWidth / 2, PAD.left), right - rainTipWidth) : 0;

  const ariaLabel =
    `Oʻrtacha ${info.label}: ${date(first.o.observed_on)} dan ${date(last.o.observed_on)} gacha ` +
    `${points.length} ta kuzatuv.` +
    (selected ? ` Tanlangan: ${label(selected.o, selected.value)}` : "") +
    (showRain ? ` Shu davrda jami yogʻin ${formatNumber(totalRain)} mm.` : "");

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className={`chart chart-${variant}`} role="img" aria-label={ariaLabel}>
      {info.ticks.map((tick) => (
        <line key={tick} x1={PAD.left} x2={right} y1={y(tick)} y2={y(tick)} className="grid" />
      ))}
      <line x1={PAD.left} x2={right} y1={y(0)} y2={y(0)} className="axis" />
      {[0, ...info.ticks].map((tick) => (
        <text key={tick} x={PAD.left - 6} y={y(tick) + 3.5} textAnchor="end" className="tick">
          {tickLabel(tick)}
        </text>
      ))}

      {info.threshold && (
        <g className="threshold">
          <line x1={PAD.left} x2={right} y1={y(info.threshold.value)} y2={y(info.threshold.value)} />
          <text x={right} y={y(info.threshold.value) - 5} textAnchor="end">
            {info.threshold.label} · {formatIndex(info.threshold.value)}
          </text>
        </g>
      )}

      <path d={area} className="area" style={{ fill: info.line }} />
      <polyline points={line} className="line" style={{ stroke: info.line }} />

      {showRain && (
        <g className="rain">
          {selected && (
            <rect
              x={windowStart}
              y={rainTop}
              width={Math.max(selected.px - windowStart, 0)}
              height={rainBand}
              className="rain-window"
            />
          )}
          <line x1={PAD.left} x2={right} y1={rainTop} y2={rainTop} className="grid" />
          <line x1={PAD.left} x2={right} y1={rainBottom} y2={rainBottom} className="axis" />
          <text x={PAD.left - 6} y={rainTop + 3.5} textAnchor="end" className="tick">
            {RAIN_MAX_MM}
          </text>
          <text x={PAD.left - 6} y={rainBottom + 3.5} textAnchor="end" className="tick">
            0
          </text>
          <text x={right} y={rainTop - 4} textAnchor="end" className="rain-label">
            Yogʻin, mm/kun
          </text>
          {bars.map((b) => (
            <g
              key={b.day}
              className={variant === "large" ? "rain-hit" : undefined}
              onClick={variant === "large" ? () => setRainDay(b.day) : undefined}
            >
              {variant === "large" && (
                <rect x={b.x - dayWidth / 2} y={rainTop} width={Math.max(dayWidth, 4)} height={rainBand} fill="transparent" />
              )}
              <rect
                x={b.x - barWidth / 2}
                y={rainBottom - b.h}
                width={barWidth}
                height={b.h}
                rx={barWidth > 3 ? 1 : 0}
                className={b.day === rainTip?.day ? "rain-bar active" : "rain-bar"}
              />
              <title>{`${dayMonth(b.day)}: ${formatNumber(b.mm)} mm`}</title>
            </g>
          ))}
        </g>
      )}

      {selected && (
        <line
          x1={selected.px}
          x2={selected.px}
          y1={selected.py + 7}
          y2={showRain ? rainBottom : bottom}
          className="guide"
        />
      )}

      {points.map(({ o, value, px, py }) =>
        o.id === selectedId ? null : (
          <g key={o.id} className="point" onClick={() => onSelect(o)}>
            <circle cx={px} cy={py} r={10} className="hit" />
            <circle cx={px} cy={py} r={4} className="dot" style={{ stroke: info.line }} />
            <title>{label(o, value)}</title>
          </g>
        ),
      )}

      {selected && (
        <g>
          <circle cx={selected.px} cy={selected.py} r={12} fill={indexColor(index, selected.value)} fillOpacity={0.18} />
          <circle
            cx={selected.px}
            cy={selected.py}
            r={7.5}
            fill={indexColor(index, selected.value)}
            className="selected-dot"
          />
        </g>
      )}

      {selected && tooltip && (
        <g className="tooltip">
          <rect x={tooltip.x} y={tooltip.y} width={tooltipWidth} height={TOOLTIP_HEIGHT} rx={6} />
          <text x={tooltip.x + tooltipWidth / 2} y={tooltip.y + 18.5} textAnchor="middle">
            {label(selected.o, selected.value)}
          </text>
        </g>
      )}

      {rainTip && (
        <g className="tooltip">
          <rect x={rainTipX} y={rainTop - 8 - TOOLTIP_HEIGHT} width={rainTipWidth} height={TOOLTIP_HEIGHT} rx={6} />
          <text x={rainTipX + rainTipWidth / 2} y={rainTop - 8 - TOOLTIP_HEIGHT + 18.5} textAnchor="middle">
            {`${dayMonth(rainTip.day)}: yogʻin ${formatNumber(rainTip.mm)} mm`}
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
