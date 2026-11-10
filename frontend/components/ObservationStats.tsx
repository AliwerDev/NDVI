import type { Observation } from "@/lib/api";
import {
  formatDate,
  formatDateLong,
  formatIndex,
  INDEX_NAMES,
  type IndexName,
  indexColor,
  indexValues,
  INDICES,
} from "@/lib/ndvi";

type Tone = "danger" | "warn" | "ok" | "neutral";

type Props = {
  observation: Observation;
  /** The index of the chart. Its row is highlighted. */
  index: IndexName;
  onSelectIndex: (index: IndexName) => void;
  /** Show the month name, for example "12-iyun 2026". */
  longDate?: boolean;
};

// A short status for each index. The NDMI and NDRE limits mirror the backend defaults.
function status(index: IndexName, observation: Observation, mean: number): { text: string; tone: Tone } {
  if (index === "ndvi") {
    if (mean < 0.2) return { text: "Siyrak", tone: "warn" };
    return mean < 0.4 ? { text: "Oʻrtacha", tone: "neutral" } : { text: "Yaxshi", tone: "ok" };
  }
  if (index === "ndmi") {
    if (mean < 0) return { text: "Suv stressi", tone: "danger" };
    return mean < 0.2 ? { text: "Oʻrtacha", tone: "warn" } : { text: "Nam", tone: "ok" };
  }
  const level = observation.nitrogen_advice?.level;
  if (level === "low") return { text: "Azot kam", tone: "danger" };
  if (level === "medium") return { text: "Oʻrtacha", tone: "warn" };
  if (level === "ok") return { text: "Yetarli", tone: "ok" };
  return { text: "Baho yoʻq", tone: "neutral" };
}

// The selected observation: date, clear part, and a two-line row per index. A row click switches the chart and the map.
export default function ObservationStats({ observation, index, onSelectIndex, longDate = false }: Props) {
  const clearPercent = Math.round(observation.clear_fraction * 100);
  const missing = INDEX_NAMES.some((name) => indexValues(observation, name) === null);

  return (
    <div className="obs-stats">
      <div className="obs-stats-head">
        <span className="obs-stats-date">{(longDate ? formatDateLong : formatDate)(observation.observed_on)}</span>
        <span className="obs-stats-clear">
          <span>Bulutsiz</span>
          <span className="progress" aria-hidden="true">
            <span style={{ width: `${clearPercent}%` }} />
          </span>
          <strong>{clearPercent}%</strong>
        </span>
      </div>

      <div className="index-rows" role="group" aria-label="Indekslar">
        {INDEX_NAMES.map((name) => {
          const values = indexValues(observation, name);
          const active = name === index;
          const state = values ? status(name, observation, values.mean) : null;
          return (
            <button
              key={name}
              type="button"
              className={active ? "index-row active" : "index-row"}
              aria-pressed={active}
              onClick={() => onSelectIndex(name)}
            >
              <span className="index-row-top">
                <span
                  className="index-swatch"
                  aria-hidden="true"
                  style={values ? { background: indexColor(name, values.mean) } : undefined}
                />
                <span className="index-row-label">{INDICES[name].label}</span>
                {state && (
                  <span className={`status-chip status-${state.tone}`}>
                    <span className="status-dot" aria-hidden="true" />
                    {state.text}
                  </span>
                )}
              </span>
              <span className="index-row-values">
                {values ? (
                  <>
                    <span className="index-value">{formatIndex(values.mean)}</span>
                    <span className="index-row-range">
                      oraliq {formatIndex(values.min)} – {formatIndex(values.max)}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="index-value index-value-missing">—</span>
                    <span className="index-row-range">Maʼlumot yoʻq</span>
                  </>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {missing && (
        <p className="obs-stats-note">
          Bu kuzatuv NDMI va NDRE qoʻshilishidan oldin olingan. Ularni koʻrish uchun mavsum tarixini qayta yuklang.
        </p>
      )}
    </div>
  );
}
