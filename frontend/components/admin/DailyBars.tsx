"use client";

import { useId, useState } from "react";

import { formatNumber } from "@/components/admin/format";
import type { DailyCount } from "@/lib/api";
import { formatDayMonth, formatDayMonthShort } from "@/lib/ndvi";

const STEP = 20;
const BAR = 14;
const BASE = 150;
const PLOT_TOP = 10;
// Room on the right for the scale labels.
const GUTTER = 40;

function barPath(index: number, height: number): string {
  const x = index * STEP + (STEP - BAR) / 2;
  const y = BASE - height;
  const r = Math.min(4, height);
  // Only the top corners are round: the bar stands on the baseline.
  return `M${x},${BASE} V${y + r} Q${x},${y} ${x + r},${y} H${x + BAR - r} Q${x + BAR},${y} ${x + BAR},${y + r} V${BASE} Z`;
}

type Props = {
  title: string;
  data: DailyCount[];
};

/** One bar per day. Hover shows the value. A hidden table gives the same numbers to screen readers. */
export default function DailyBars({ title, data }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const titleId = useId();
  const width = data.length * STEP;
  const max = Math.max(1, ...data.map((item) => item.count));
  const total = data.reduce((sum, item) => sum + item.count, 0);
  const ticks = data.length > 0 ? [0, 7, 14, 21, data.length - 1].filter((i) => i < data.length) : [];

  return (
    <section className="card admin-chart" aria-labelledby={titleId}>
      <div className="admin-card-head">
        <h2 id={titleId}>{title}</h2>
        <span className="meta">30 kunda {formatNumber(total)} ta</span>
      </div>
      <div className="admin-chart-plot">
        <svg
          viewBox={`0 0 ${width + GUTTER} 176`}
          width="100%"
          aria-hidden="true"
          onMouseLeave={() => setHover(null)}
        >
          <line x1="0" y1={PLOT_TOP} x2={width} y2={PLOT_TOP} className="admin-grid" />
          <line x1="0" y1={(PLOT_TOP + BASE) / 2} x2={width} y2={(PLOT_TOP + BASE) / 2} className="admin-grid" />
          <line x1="0" y1={BASE} x2={width} y2={BASE} className="admin-baseline" />
          <text x={width + 8} y={PLOT_TOP + 4} className="admin-axis">
            {formatNumber(max)}
          </text>
          <text x={width + 8} y={(PLOT_TOP + BASE) / 2 + 4} className="admin-axis">
            {formatNumber(Math.round(max / 2))}
          </text>
          {data.map((item, index) => {
            const height = item.count === 0 ? 0 : Math.max(2, (item.count / max) * (BASE - PLOT_TOP));
            return (
              <g key={item.day}>
                {height > 0 && (
                  <path d={barPath(index, height)} className={hover === index ? "admin-bar active" : "admin-bar"} />
                )}
                {/* The hit area is the whole column, wider and taller than the bar. */}
                <rect
                  x={index * STEP}
                  y="0"
                  width={STEP}
                  height={BASE}
                  fill="transparent"
                  onMouseEnter={() => setHover(index)}
                />
              </g>
            );
          })}
          {ticks.map((index) => (
            <text key={index} x={index * STEP + STEP / 2} y="170" textAnchor="middle" className="admin-axis">
              {formatDayMonthShort(data[index].day)}
            </text>
          ))}
        </svg>
        {hover !== null && data[hover] && (
          <div
            className="admin-tip"
            // Clamped, so the tip of an edge bar stays inside the card.
            style={{ left: `${Math.min(88, Math.max(12, ((hover * STEP + STEP / 2) / (width + GUTTER)) * 100))}%` }}
            aria-hidden="true"
          >
            <strong>{formatNumber(data[hover].count)} ta</strong> · {formatDayMonth(data[hover].day)}
          </div>
        )}
      </div>
      <table className="sr-only">
        <caption>{title}, kunlar boʻyicha</caption>
        <tbody>
          {data.map((item) => (
            <tr key={item.day}>
              <th scope="row">{formatDayMonth(item.day)}</th>
              <td>{item.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
