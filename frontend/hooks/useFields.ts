import { useCallback, useEffect, useState } from "react";

import { api, errorText, type FieldFeature } from "@/lib/api";

// The selected field is kept in the URL (?field=3), so a page reload opens the same field.
const FIELD_PARAM = "field";

function fieldIdFromUrl(): number | null {
  const id = Number(new URLSearchParams(window.location.search).get(FIELD_PARAM));
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** The field list of the user and the selected field. onError must be stable (a state setter). */
export function useFields(onError: (text: string) => void) {
  const [fields, setFields] = useState<FieldFeature[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // True until the first field list request ends. Until then the URL keeps the field from the last visit.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .listFields()
      .then((list) => {
        if (cancelled) return;
        setFields(list);
        // A deleted field or a field of another user stays unselected.
        const id = fieldIdFromUrl();
        if (id !== null && list.some((field) => field.id === id)) setSelectedId(id);
      })
      .catch((err) => {
        if (!cancelled) onError(errorText(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [onError]);

  useEffect(() => {
    if (loading) return;
    const url = new URL(window.location.href);
    if (selectedId === null) url.searchParams.delete(FIELD_PARAM);
    else url.searchParams.set(FIELD_PARAM, String(selectedId));
    window.history.replaceState(null, "", url);
  }, [loading, selectedId]);

  const reload = useCallback(async () => {
    setFields(await api.listFields());
  }, []);

  return { fields, loading, selectedId, setSelectedId, reload };
}
