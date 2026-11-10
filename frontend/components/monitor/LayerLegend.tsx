"use client";

import Link from "next/link";
import { useState } from "react";

import { SpinnerIcon } from "@/components/icons";
import type { FieldLayer, Observation } from "@/lib/api";
import { formatDate, indexValues, INDICES, rampGradient, rampPercent } from "@/lib/ndvi";

const LAYERS: { value: FieldLayer; label: string }[] = [
  { value: "ndvi", label: "NDVI" },
  { value: "ndmi", label: "NDMI" },
  { value: "ndre", label: "NDRE" },
  { value: "rgb", label: "Rasm" },
];

type Props = {
  layer: FieldLayer;
  loading: boolean;
  observation: Observation | null;
  onSelect: (layer: FieldLayer) => void;
};

// The layer switch on the map, with the color ramp and a "?" help note.
export default function LayerLegend({ layer, loading, observation, onSelect }: Props) {
  const [helpOpen, setHelpOpen] = useState(false);
  const info = layer === "rgb" ? null : INDICES[layer];

  return (
    <section className="legend" aria-labelledby="layer-label">
      <div className="legend-head">
        <span id="layer-label">Maydon qatlami</span>
        {observation && <span className="legend-date">{formatDate(observation.observed_on)}</span>}
        <button
          type="button"
          className="legend-help-btn"
          aria-label="Ranglar nimani bildiradi?"
          aria-expanded={helpOpen}
          aria-controls="legend-help"
          onClick={() => setHelpOpen((open) => !open)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setHelpOpen(false);
          }}
        >
          ?
        </button>
      </div>

      {helpOpen && (
        <div id="legend-help" className="legend-help" role="note">
          <strong>{info ? info.helpTitle : "Rangli rasm"}</strong>
          <span>
            {info
              ? info.helpText
              : "Dalaning shu kundagi surati, koʻz bilan koʻrgandek. Yashil — oʻsimlik, jigarrang — ochiq tuproq."}
          </span>
          <span className="legend-help-meta">Sentinel-2 · {info ? info.pixel : "10 m"} piksel</span>
          <Link href={layer === "ndmi" || layer === "ndre" ? `/#${layer}` : "/#ranglar"} className="legend-help-link">
            Batafsil
          </Link>
        </div>
      )}

      <div role="radiogroup" aria-labelledby="layer-label" className="segmented legend-switch">
        {LAYERS.map(({ value, label }) => {
          const active = layer === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              aria-busy={active && loading}
              onClick={() => onSelect(value)}
            >
              {active && loading && <SpinnerIcon size={12} className="spin" />}
              {label}
            </button>
          );
        })}
      </div>

      {layer !== "rgb" && info ? (
        <>
          <div className="ramp-wrap" aria-hidden="true">
            <div className="ramp" style={{ background: rampGradient(info.stops) }} />
            {info.threshold && (
              <span
                className="ramp-mark"
                style={{ left: `calc(${rampPercent(layer, info.threshold.value)}% - 1px)` }}
              />
            )}
          </div>
          <div className="ramp-ends">
            <span>
              <strong>{info.rampEnds[0].word}</strong> · {info.rampEnds[0].value}
            </span>
            <span>
              {info.rampEnds[1].value} · <strong>{info.rampEnds[1].word}</strong>
            </span>
          </div>
          {observation && indexValues(observation, layer) === null && (
            <p className="legend-note">Bu kuzatuvda {info.label} yoʻq. Mavsum tarixini qayta yuklang.</p>
          )}
        </>
      ) : (
        <p className="legend-meta">
          <span className="rgb-swatches" aria-hidden="true">
            <span style={{ background: "#45592b" }} />
            <span style={{ background: "#7a7a4c" }} />
            <span style={{ background: "#ae9a70" }} />
          </span>
          Koʻz bilan koʻrgandek surat
        </p>
      )}
    </section>
  );
}
