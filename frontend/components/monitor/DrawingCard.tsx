"use client";

import { useState } from "react";

import { CheckIcon, CrosshairIcon, InfoIcon, UndoIcon } from "@/components/icons";
import type { Position } from "@/lib/api";
import { formatArea, formatSotix, ringAreaHa, SMALL_FIELD_HA } from "@/lib/geo";

type Props = {
  points: Position[];
  busy: boolean;
  onUndo: () => void;
  onCancel: () => void;
  onSave: (name: string) => void;
};

// The new field form. The name lives here, so typing does not render the map and the sidebar again.
export default function DrawingCard({ points, busy, onUndo, onCancel, onSave }: Props) {
  const [name, setName] = useState("");
  const area = ringAreaHa(points);
  const closed = points.length >= 3;

  return (
    <section className="card card-drawing" aria-labelledby="nf-title">
      <div className="card-head">
        <h2 id="nf-title">Yangi maydon</h2>
        <span role="status" aria-live="polite" className="chip">
          <span className="draft-dot" aria-hidden="true" />
          Nuqtalar: {points.length}
        </span>
      </div>
      <p className="hint">
        <CrosshairIcon size={18} className="accent-icon" />
        <span>Xaritada maydon burchaklarini bosing. Kamida 3 ta nuqta kerak.</span>
      </p>
      <div className="area-row">
        <span className="area-label">Yuzasi</span>
        {closed ? (
          <span className="area-value">
            <strong>≈ {formatArea(area)}</strong>
            {area < SMALL_FIELD_HA && <span className="area-extra">{formatSotix(area)}</span>}
          </span>
        ) : (
          <span className="area-extra">3-nuqtadan keyin koʻrinadi</span>
        )}
      </div>
      {closed && area < SMALL_FIELD_HA && (
        <p className="hint hint-warn">
          <InfoIcon size={18} />
          <span>
            Maydon 0.5 gektardan kichik. Chegaradagi piksellar (yoʻl, ariq, daraxt) natijaga koʻproq taʼsir qiladi.
          </span>
        </p>
      )}
      <div className="input-group">
        <label htmlFor="field-name" className="label">
          Maydon nomi
        </label>
        <input
          id="field-name"
          type="text"
          className="input"
          placeholder="Maydon nomi"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={200}
        />
        <span className="counter">{name.length} / 200</span>
      </div>
      <div className="stack">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => onSave(name.trim())}
          disabled={busy || !closed || !name.trim()}
        >
          <CheckIcon size={16} />
          Saqlash
        </button>
        <button type="button" className="btn btn-outline" onClick={onUndo} disabled={points.length === 0}>
          <UndoIcon size={16} />
          Oxirgi nuqtani oʻchirish
        </button>
        <button type="button" className="btn btn-muted" onClick={onCancel}>
          Bekor qilish
        </button>
      </div>
    </section>
  );
}
