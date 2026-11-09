"use client";

import { useEffect, useRef } from "react";

import { CloseIcon } from "@/components/icons";
import NdviChart from "@/components/NdviChart";
import ObservationStats from "@/components/ObservationStats";
import type { FieldFeature, Observation } from "@/lib/api";
import { formatDate, ndviColor } from "@/lib/ndvi";

type Props = {
  field: FieldFeature;
  observations: Observation[];
  selected: Observation | null;
  onSelect: (observation: Observation) => void;
  onClose: () => void;
};

// The NDVI report of one field in a large window: chart, selected observation and all observations.
export default function NdviReport({ field, observations, selected, onSelect, onClose }: Props) {
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
      ? `${formatDate(observations[0].observed_on)} – ${formatDate(observations[observations.length - 1].observed_on)}`
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
            <span className="eyebrow">{field.id}-maydon · NDVI hisobot</span>
            <h2 id="report-title" className="serif-title">
              {field.properties.name}
            </h2>
            {period && (
              <span className="meta">
                {observations.length} ta kuzatuv · {period}
              </span>
            )}
          </div>
          <button ref={closeRef} type="button" className="icon-btn" aria-label="Yopish" onClick={onClose}>
            <CloseIcon size={20} />
          </button>
        </header>

        <div className="report-body">
          <section className="card" aria-labelledby="report-chart-title">
            <h3 id="report-chart-title" className="card-title">
              NDVI grafigi
            </h3>
            <NdviChart
              observations={observations}
              selectedId={selected?.id ?? null}
              onSelect={onSelect}
              variant="large"
            />
          </section>

          {selected && (
            <section className="card" aria-labelledby="report-stats-title">
              <h3 id="report-stats-title" className="card-title">
                Tanlangan kuzatuv
              </h3>
              <ObservationStats observation={selected} columns={4} />
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
                      <th scope="col">Oʻrtacha NDVI</th>
                      <th scope="col">Min</th>
                      <th scope="col">Max</th>
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
                              {formatDate(o.observed_on)}
                            </button>
                          </td>
                          <td>
                            <span className="ndvi-cell">
                              <span className="ndvi-swatch" style={{ background: ndviColor(o.ndvi_mean) }} />
                              {o.ndvi_mean.toFixed(3)}
                            </span>
                          </td>
                          <td>{o.ndvi_min.toFixed(2)}</td>
                          <td>{o.ndvi_max.toFixed(2)}</td>
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
