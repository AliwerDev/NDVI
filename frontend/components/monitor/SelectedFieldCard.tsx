import { ActivityIcon, AreaIcon, HistoryIcon, SpinnerIcon } from "@/components/icons";
import type { BackfillJob, FieldFeature } from "@/lib/api";
import { formatArea, formatSotix, SMALL_FIELD_HA } from "@/lib/geo";

type Props = {
  field: FieldFeature;
  busy: boolean;
  computing: boolean;
  backfillJob: BackfillJob | null;
  onCompute: () => void;
  onBackfill: () => void;
};

export default function SelectedFieldCard({ field, busy, computing, backfillJob, onCompute, onBackfill }: Props) {
  const { name, area_ha } = field.properties;
  const backfillRunning = backfillJob?.status === "running";

  return (
    <section className="card" aria-labelledby="sf-title">
      <div className="field-title">
        <span className="eyebrow">{field.id}-maydon</span>
        <h2 id="sf-title" className="serif-title">
          {name}
        </h2>
        <span className="field-size">
          <AreaIcon size={16} className="accent-icon" />
          <strong>{formatArea(area_ha)}</strong>
          {area_ha < SMALL_FIELD_HA && <span>{formatSotix(area_ha)}</span>}
        </span>
      </div>
      <div className="stack">
        <button type="button" className="btn btn-primary" onClick={onCompute} disabled={busy}>
          {computing ? <SpinnerIcon size={16} className="spin" /> : <ActivityIcon size={16} />}
          {computing ? "Kuting…" : "Indekslarni hisoblash (30 kun)"}
        </button>
        <button
          type="button"
          className="btn btn-outline"
          onClick={onBackfill}
          disabled={busy || backfillRunning}
          aria-busy={backfillRunning}
        >
          {backfillRunning ? <SpinnerIcon size={16} className="spin" /> : <HistoryIcon size={16} />}
          {backfillRunning
            ? backfillJob.saved_count
              ? `Yuklanmoqda… ${backfillJob.saved_count} ta saqlandi`
              : "Yuklanmoqda…"
            : "Mavsum tarixini yuklash"}
        </button>
      </div>
    </section>
  );
}
