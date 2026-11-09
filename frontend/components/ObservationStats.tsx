import type { Observation } from "@/lib/api";
import { formatDate, formatDateLong, ndviColor, ndviTextColor } from "@/lib/ndvi";

type Props = {
  observation: Observation;
  columns?: 2 | 4;
  /** Show the month name, for example "12-iyun 2026". */
  longDate?: boolean;
};

// Four stat tiles for one NDVI observation.
export default function ObservationStats({ observation, columns = 2, longDate = false }: Props) {
  const clearPercent = Math.round(observation.clear_fraction * 100);
  return (
    <dl className={columns === 4 ? "stats stats-4" : "stats"}>
      <div className="stat">
        <dt>Sana</dt>
        <dd>{(longDate ? formatDateLong : formatDate)(observation.observed_on)}</dd>
      </div>
      <div className="stat">
        <dt>Oʻrtacha NDVI</dt>
        <dd>
          <span
            className="ndvi-badge"
            style={{ background: ndviColor(observation.ndvi_mean), color: ndviTextColor(observation.ndvi_mean) }}
          >
            {observation.ndvi_mean.toFixed(3)}
          </span>
        </dd>
      </div>
      <div className="stat">
        <dt>Min / Max</dt>
        <dd>
          {observation.ndvi_min.toFixed(2)} / {observation.ndvi_max.toFixed(2)}
        </dd>
      </div>
      <div className="stat">
        <dt>Bulutsiz qism</dt>
        <dd className="stat-progress">
          <span>{clearPercent}%</span>
          <span className="progress" aria-hidden="true">
            <span style={{ width: `${clearPercent}%` }} />
          </span>
        </dd>
      </div>
    </dl>
  );
}
