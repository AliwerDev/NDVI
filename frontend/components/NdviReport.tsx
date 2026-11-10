"use client";

import { useEffect, useRef } from "react";

import { CloseIcon } from "@/components/icons";
import NdviChart from "@/components/NdviChart";
import ObservationStats from "@/components/ObservationStats";
import ObservationWeather from "@/components/ObservationWeather";
import IndexTabs from "@/components/IndexTabs";
import type { FieldFeature, Observation, WeatherDay } from "@/lib/api";
import { formatArea } from "@/lib/geo";
import { formatDateLong, formatIndex, INDEX_NAMES, type IndexName, indexColor, indexValues, INDICES } from "@/lib/ndvi";

type Props = {
  field: FieldFeature;
  observations: Observation[];
  selected: Observation | null;
  onSelect: (observation: Observation) => void;
  index: IndexName;
  onSelectIndex: (index: IndexName) => void;
  onClose: () => void;
  /** Daily weather: rain bars under the chart and the week before the selected observation. */
  weatherDays?: WeatherDay[];
};

// The report of one field in a large window: chart of one index, selected observation and all observations.
export default function NdviReport({
  field,
  observations,
  selected,
  onSelect,
  index,
  onSelectIndex,
  onClose,
  weatherDays,
}: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const newestFirst = [...observations].reverse();
  const period =
    observations.length > 0
      ? `${formatDateLong(observations[0].observed_on)} – ${formatDateLong(observations[observations.length - 1].observed_on)}`
      : null;

  return (
    <div className="modal-backdrop report-backdrop" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-title"
        className="report"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="report-head">
          <div className="field-title">
            <span className="eyebrow">{field.id}-maydon · hisobot</span>
            <h2 id="report-title" className="serif-title">
              {field.properties.name}
            </h2>
            <span className="meta">
              {formatArea(field.properties.area_ha)}
              {period && ` · ${observations.length} ta kuzatuv · ${period}`}
            </span>
          </div>
          <button ref={closeRef} type="button" className="icon-btn" aria-label="Yopish" onClick={onClose}>
            <CloseIcon size={20} />
          </button>
        </header>

        <div className="report-body">
          <section className="card" aria-labelledby="report-chart-title">
            <div className="card-head card-head-wrap">
              <div>
                <h3 id="report-chart-title" className="card-title">
                  Oʻrtacha {INDICES[index].label}
                  {weatherDays && weatherDays.length > 0 && " va kunlik yogʻin"}
                </h3>
                <p className="meta">
                  {INDICES[index].caption}
                  {weatherDays && weatherDays.length > 0 && " · yogʻin Open-Meteo modelidan, taxminiy"}
                </p>
              </div>
              <IndexTabs value={index} onChange={onSelectIndex} className="report-tabs" />
            </div>
            <NdviChart
              observations={observations}
              selectedId={selected?.id ?? null}
              onSelect={onSelect}
              index={index}
              variant="large"
              rain={weatherDays}
            />
            {weatherDays && weatherDays.length > 0 && (
              <p className="meta">Yogʻin ustunini bosing — kun va yogʻin miqdori chiqadi. 20 mm dan koʻpi kesiladi.</p>
            )}
          </section>

          {selected && (
            <section className="card" aria-labelledby="report-stats-title">
              <h3 id="report-stats-title" className="card-title">
                Tanlangan kuzatuv
              </h3>
              <ObservationStats observation={selected} index={index} onSelectIndex={onSelectIndex} longDate />
              {weatherDays && <ObservationWeather days={weatherDays} observedOn={selected.observed_on} />}
            </section>
          )}

          {observations.length > 0 && (
            <section className="card" aria-labelledby="report-table-title">
              <h3 id="report-table-title" className="card-title">
                Barcha kuzatuvlar
              </h3>
              <div className="table-wrap">
                <table className="obs-table">
                  <thead>
                    <tr>
                      <th scope="col">Sana</th>
                      {INDEX_NAMES.map((name) => (
                        <th key={name} scope="col">
                          {INDICES[name].label}
                        </th>
                      ))}
                      <th scope="col">Bulutsiz qism</th>
                    </tr>
                  </thead>
                  <tbody>
                    {newestFirst.map((o) => {
                      const active = o.id === selected?.id;
                      return (
                        <tr key={o.id} className={active ? "active" : undefined} onClick={() => onSelect(o)}>
                          <td>
                            <button type="button" className="row-select" aria-pressed={active}>
                              {formatDateLong(o.observed_on)}
                            </button>
                          </td>
                          {INDEX_NAMES.map((name) => {
                            const values = indexValues(o, name);
                            return (
                              <td key={name}>
                                {values ? (
                                  <span className="ndvi-cell">
                                    <span
                                      className="ndvi-swatch"
                                      style={{ background: indexColor(name, values.mean) }}
                                    />
                                    {formatIndex(values.mean)}
                                  </span>
                                ) : (
                                  <span className="muted-cell">—</span>
                                )}
                              </td>
                            );
                          })}
                          <td>{Math.round(o.clear_fraction * 100)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
