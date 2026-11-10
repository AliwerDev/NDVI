import { FieldsIcon } from "@/components/icons";
import { FieldListSkeleton } from "@/components/Skeletons";
import type { FieldFeature } from "@/lib/api";
import { formatArea } from "@/lib/geo";

type Props = {
  fields: FieldFeature[];
  loading: boolean;
  selectedId: number | null;
  onSelect: (id: number) => void;
};

export default function FieldList({ fields, loading, selectedId, onSelect }: Props) {
  return (
    <section className="card" aria-labelledby="fl-title">
      <div className="card-head">
        <h2 id="fl-title">Maydonlar</h2>
        {loading ? (
          <span className="sk" aria-hidden="true" style={{ width: 26, height: 20, borderRadius: 999 }} />
        ) : (
          <span className="badge">{fields.length}</span>
        )}
      </div>
      {loading ? (
        <FieldListSkeleton />
      ) : fields.length === 0 ? (
        <div className="empty">
          <span className="empty-icon">
            <FieldsIcon size={22} />
          </span>
          <p>Hali maydon yoʻq.</p>
        </div>
      ) : (
        <ul className="field-list">
          {fields.map((field) => {
            const active = field.id === selectedId;
            return (
              <li key={field.id}>
                <button
                  type="button"
                  aria-pressed={active}
                  className={active ? "field-row active" : "field-row"}
                  onClick={() => onSelect(field.id)}
                >
                  <span className="field-id">{field.id}.</span>
                  <span className="field-name">{field.properties.name}</span>
                  <span className="field-area">{formatArea(field.properties.area_ha)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
