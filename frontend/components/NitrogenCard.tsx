import { LeafIcon } from "@/components/icons";
import type { NitrogenAdvice } from "@/lib/api";
import { formatIndex } from "@/lib/ndvi";

const LEVELS: Record<NitrogenAdvice["level"], { chip: string; tone: string }> = {
  low: { chip: "Azot kam", tone: "danger" },
  medium: { chip: "Oʻrtacha", tone: "warn" },
  ok: { chip: "Yetarli", tone: "ok" },
  unknown: { chip: "Baho yoʻq", tone: "neutral" },
};

// The scale shows NDRE from 0 to this value. Higher values sit at the right end.
const SCALE_MAX = 0.5;

type Props = {
  advice: NitrogenAdvice;
  ndre: number;
};

// Nitrogen advice for the selected observation, with the NDRE value on a low / medium / enough scale.
export default function NitrogenCard({ advice, ndre }: Props) {
  const level = LEVELS[advice.level];
  const lowShare = (advice.low_threshold / SCALE_MAX) * 100;
  const mediumShare = ((advice.ok_threshold - advice.low_threshold) / SCALE_MAX) * 100;
  const marker = Math.min(Math.max(ndre / SCALE_MAX, 0), 1) * 100;
  const known = advice.level !== "unknown";

  return (
    <section className="card" aria-labelledby="nitrogen-title">
      <div className="card-head">
        <h2 id="nitrogen-title" className="card-title-icon">
          <LeafIcon size={18} className="accent-icon" />
          Azot tavsiyasi
        </h2>
        <span className={`status-chip status-${level.tone}`}>
          <span className="status-dot" aria-hidden="true" />
          {level.chip}
        </span>
      </div>

      <div className={known ? "n-scale" : "n-scale n-scale-off"} aria-hidden="true">
        <div
          className="n-scale-bar"
          style={{ gridTemplateColumns: `${lowShare}fr ${mediumShare}fr ${100 - lowShare - mediumShare}fr` }}
        >
          <span />
          <span />
          <span />
          {known && <span className="n-scale-marker" style={{ left: `calc(${marker}% - 2px)` }} />}
        </div>
        <div
          className="n-scale-labels"
          style={{ gridTemplateColumns: `${lowShare}fr ${mediumShare}fr ${100 - lowShare - mediumShare}fr` }}
        >
          <span>Kam · &lt; {formatIndex(advice.low_threshold)}</span>
          <span>Oʻrtacha</span>
          <span>Yetarli · ≥ {formatIndex(advice.ok_threshold)}</span>
        </div>
      </div>

      <p className="n-text">{advice.text}</p>
      <p className="meta">NDRE {formatIndex(ndre)} · Sunʼiy yoʻldosh bahosi. Qaror oldidan dalani koʻzdan kechiring.</p>
    </section>
  );
}
