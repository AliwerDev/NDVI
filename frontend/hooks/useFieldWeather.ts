import { useEffect, useRef, useState } from "react";

import { api, type FieldWeather } from "@/lib/api";

/**
 * The weather of the selected field, from `start` to the end of the forecast.
 * The weather is extra information: an error is kept here for the card and does not open an error toast.
 */
export function useFieldWeather(fieldId: number | null, start: string | null) {
  const [weather, setWeather] = useState<FieldWeather | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => {
    const request = ++requestRef.current;
    setFailed(false);
    if (fieldId === null) {
      setWeather(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .weather(fieldId, start ?? undefined)
      .then((result) => {
        if (requestRef.current === request) setWeather(result);
      })
      .catch(() => {
        if (requestRef.current === request) {
          setWeather(null);
          setFailed(true);
        }
      })
      .finally(() => {
        if (requestRef.current === request) setLoading(false);
      });
  }, [fieldId, start]);

  // Weather of another field must not stay on screen while the new one loads.
  useEffect(() => setWeather(null), [fieldId]);

  return { weather, loading, failed };
}
