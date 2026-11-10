import { useCallback, useEffect, useRef, useState } from "react";

import { api, errorText, type Observation } from "@/lib/api";

/**
 * The observations of the selected field and the selected observation.
 * A late response for a field that is no longer selected is dropped. onError must be stable.
 */
export function useFieldHistory(fieldId: number | null, onError: (text: string) => void) {
  const [history, setHistory] = useState<Observation[]>([]);
  const [selected, setSelected] = useState<Observation | null>(null);
  const [loading, setLoading] = useState(false);
  const fieldIdRef = useRef(fieldId);

  // The newest observation is selected only when nothing is selected yet.
  const reload = useCallback(async (id: number) => {
    const observations = await api.history(id);
    if (fieldIdRef.current !== id) return;
    setHistory(observations);
    if (observations.length > 0) setSelected((current) => current ?? observations[observations.length - 1]);
  }, []);

  const select = useCallback((observation: Observation) => {
    if (observation.field_id === fieldIdRef.current) setSelected(observation);
  }, []);

  useEffect(() => {
    fieldIdRef.current = fieldId;
    setHistory([]);
    setSelected(null);
    setLoading(fieldId !== null);
    if (fieldId === null) return;
    reload(fieldId)
      .catch((err) => {
        if (fieldIdRef.current === fieldId) onError(errorText(err));
      })
      .finally(() => {
        if (fieldIdRef.current === fieldId) setLoading(false);
      });
  }, [fieldId, reload, onError]);

  return { history, selected, select, loading, reload };
}
