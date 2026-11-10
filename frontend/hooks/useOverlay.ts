import { useEffect, useState } from "react";

import { api, errorText, type FieldLayer, type Observation, type ObservationImage } from "@/lib/api";
import { indexValues } from "@/lib/ndvi";

/**
 * The image of one layer of the observation, for the map.
 * The old image stays until the new one is ready, so the field does not flash empty. onError must be stable.
 */
export function useOverlay(observation: Observation | null, layer: FieldLayer, onError: (text: string) => void) {
  const [image, setImage] = useState<ObservationImage | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // An observation from before NDMI and NDRE were added has no file for them. The legend explains it.
    if (!observation || (layer !== "rgb" && indexValues(observation, layer) === null)) {
      setImage(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .observationImage(observation.id, layer)
      .then((next) => {
        if (!cancelled) setImage(next);
      })
      .catch((err) => {
        if (cancelled) return;
        // Without this the map keeps the image of the other layer under the new switch position.
        setImage(null);
        onError(layer === "rgb" ? `Rangli rasmni olib boʻlmadi. ${errorText(err)}` : errorText(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [observation, layer, onError]);

  return { image, loading };
}
