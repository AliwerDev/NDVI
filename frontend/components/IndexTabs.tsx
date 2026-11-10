import { INDEX_NAMES, type IndexName, INDICES, rampGradient } from "@/lib/ndvi";

type Props = {
  value: IndexName;
  onChange: (index: IndexName) => void;
  className?: string;
};

// NDVI | NDMI | NDRE switch for the charts. Each button shows a small sample of the index colors.
export default function IndexTabs({ value, onChange, className }: Props) {
  return (
    <div role="radiogroup" aria-label="Grafik indeksi" className={`segmented index-tabs ${className ?? ""}`}>
      {INDEX_NAMES.map((name) => (
        <button key={name} type="button" role="radio" aria-checked={value === name} onClick={() => onChange(name)}>
          <span className="ramp-swatch" aria-hidden="true" style={{ background: rampGradient(INDICES[name].stops) }} />
          {INDICES[name].label}
        </button>
      ))}
    </div>
  );
}
