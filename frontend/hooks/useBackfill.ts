import { useCallback, useEffect, useState } from "react";

import { api, ApiError, type BackfillJob } from "@/lib/api";
import { isoDate, seasonStart } from "@/lib/ndvi";

// While a backfill job runs: check its status every 3 s.
const BACKFILL_POLL_MS = 3_000;

/**
 * The season history job of the selected field. While it runs, the chart gets the new observations.
 * reloadHistory, onMessage and onError must be stable.
 */
export function useBackfill(
  fieldId: number | null,
  reloadHistory: (fieldId: number) => Promise<void>,
  onMessage: (text: string) => void,
  onError: (text: string) => void,
) {
  const [job, setJob] = useState<BackfillJob | null>(null);
  // The field check drops a late response for a field that is no longer selected.
  const current = job?.field_id === fieldId ? job : null;
  const running = current?.status === "running";

  // A job can already run for this field: started in another tab, or before a page reload.
  useEffect(() => {
    setJob(null);
    if (fieldId === null) return;
    let cancelled = false;
    api
      .backfillStatus(fieldId)
      .then((found) => {
        if (!cancelled) setJob(found);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [fieldId]);

  // setTimeout (not setInterval), so a slow response does not overlap with the next check.
  useEffect(() => {
    if (!running || fieldId === null) return;
    let cancelled = false;
    let lastSaved = -1;
    let timer: ReturnType<typeof setTimeout>;

    const check = async () => {
      try {
        const status = await api.backfillStatus(fieldId);
        if (cancelled || status === null) return;
        const finished = status.status !== "running";
        if (finished || status.saved_count !== lastSaved) {
          lastSaved = status.saved_count;
          await reloadHistory(fieldId);
          if (cancelled) return;
        }
        setJob(status);
        if (status.status === "done") {
          onMessage(
            status.saved_count > 0
              ? `Mavsum tarixi yuklandi: ${status.saved_count} ta kuzatuv.`
              : "Yangi tiniq sahna topilmadi. Grafik oʻzgarmadi.",
          );
        } else if (status.status === "failed") {
          onError("Mavsum tarixini yuklab boʻlmadi. Keyinroq qayta urinib koʻring.");
        }
        if (finished) return;
      } catch {
        // A network error: try again at the next check.
      }
      if (!cancelled) timer = setTimeout(check, BACKFILL_POLL_MS);
    };

    timer = setTimeout(check, BACKFILL_POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [running, fieldId, reloadHistory, onMessage, onError]);

  const start = useCallback(
    async (id: number) => {
      try {
        setJob(await api.startBackfill(id, seasonStart(), isoDate(new Date())));
        onMessage("Mavsum tarixi fonda yuklanmoqda. Grafik yangi kuzatuvlar bilan toʻlib boradi.");
      } catch (err) {
        // 409: a job already runs for this field (for example, from another tab). Follow that job.
        if (!(err instanceof ApiError && err.status === 409)) throw err;
        setJob(await api.backfillStatus(id));
      }
    },
    [onMessage],
  );

  return { job: current, running, start };
}
