"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import MapView, { type Basemap } from "@/components/MapView";
import NdviChart from "@/components/NdviChart";
import { api, type FieldFeature, type Observation, type ObservationImage, type Position } from "@/lib/api";
import { daysAgo, formatDate, isoDate, NDVI_STOPS, seasonStart } from "@/lib/ndvi";

// After a backfill starts, reload the history every 10 s for 3 minutes.
const POLL_INTERVAL_MS = 10_000;
const POLL_COUNT = 18;

export default function FieldMonitor() {
  const [fields, setFields] = useState<FieldFeature[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [history, setHistory] = useState<Observation[]>([]);
  const [selectedObservation, setSelectedObservation] = useState<Observation | null>(null);
  const [overlay, setOverlay] = useState<ObservationImage | null>(null);
  const [basemap, setBasemap] = useState<Basemap>("satellite");

  const [drawing, setDrawing] = useState(false);
  const [draftPoints, setDraftPoints] = useState<Position[]>([]);
  const [newName, setNewName] = useState("");

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const selectedField = fields.find((field) => field.id === selectedId) ?? null;

  const stopPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  };

  // Run an API action, show its error, and keep the buttons disabled while it runs.
  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  const loadFields = useCallback(async () => {
    setFields(await api.listFields());
  }, []);

  const loadHistory = useCallback(async (fieldId: number) => {
    const observations = await api.history(fieldId);
    setHistory(observations);
    return observations;
  }, []);

  useEffect(() => {
    run(loadFields);
    return stopPolling;
  }, [run, loadFields]);

  // When the field changes: load its history and show the newest NDVI image.
  useEffect(() => {
    stopPolling();
    setHistory([]);
    setSelectedObservation(null);
    setOverlay(null);
    if (selectedId === null) return;
    run(async () => {
      const observations = await loadHistory(selectedId);
      if (observations.length > 0) setSelectedObservation(observations[observations.length - 1]);
    });
  }, [selectedId, run, loadHistory]);

  useEffect(() => {
    if (!selectedObservation) return;
    let cancelled = false;
    api
      .observationImage(selectedObservation.id)
      .then((image) => {
        if (!cancelled) setOverlay(image);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    return () => {
      cancelled = true;
    };
  }, [selectedObservation]);

  // Selecting a field ends the drawing mode.
  const selectField = (id: number) => {
    setDrawing(false);
    setDraftPoints([]);
    setSelectedId(id);
  };

  const startDrawing = () => {
    setSelectedId(null);
    setDraftPoints([]);
    setNewName("");
    setDrawing(true);
  };

  const cancelDrawing = () => {
    setDrawing(false);
    setDraftPoints([]);
  };

  const saveField = () =>
    run(async () => {
      const ring = [...draftPoints, draftPoints[0]];
      const created = await api.createField(newName.trim(), { type: "Polygon", coordinates: [ring] });
      setDrawing(false);
      setDraftPoints([]);
      await loadFields();
      setSelectedId(created.id);
      setMessage(`«${created.properties.name}» maydoni saqlandi (raqami: ${created.id}).`);
    });

  const deleteField = () => {
    if (!selectedField) return;
    if (!window.confirm(`«${selectedField.properties.name}» maydoni oʻchirilsinmi?`)) return;
    run(async () => {
      await api.deleteField(selectedField.id);
      setSelectedId(null);
      await loadFields();
    });
  };

  const computeNdvi = () => {
    if (!selectedField) return;
    run(async () => {
      const observation = await api.computeNdvi(selectedField.id, daysAgo(30), isoDate(new Date()));
      await loadHistory(selectedField.id);
      setSelectedObservation(observation);
      setMessage(`NDVI hisoblandi: ${formatDate(observation.observed_on)}, oʻrtacha ${observation.ndvi_mean.toFixed(2)}.`);
    });
  };

  const backfill = () => {
    if (!selectedField) return;
    const fieldId = selectedField.id;
    run(async () => {
      await api.startBackfill(fieldId, seasonStart(), isoDate(new Date()));
      stopPolling();
      let count = 0;
      pollRef.current = setInterval(() => {
        count += 1;
        loadHistory(fieldId).catch(() => undefined);
        if (count >= POLL_COUNT) stopPolling();
      }, POLL_INTERVAL_MS);
      setMessage("Mavsum tarixi fonda yuklanmoqda. Grafik 1–3 daqiqada toʻladi.");
    });
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <h1>NDVI monitoring</h1>

        <div className="row">
          <label>
            Xarita:{" "}
            <select value={basemap} onChange={(e) => setBasemap(e.target.value as Basemap)}>
              <option value="satellite">Sunʼiy yoʻldosh</option>
              <option value="osm">OpenStreetMap</option>
            </select>
          </label>
        </div>

        {drawing ? (
          <section className="card">
            <h2>Yangi maydon</h2>
            <p className="muted">Xaritada maydon burchaklarini bosing. Kamida 3 ta nuqta kerak.</p>
            <p>Nuqtalar: {draftPoints.length}</p>
            <input
              placeholder="Maydon nomi"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={200}
            />
            <div className="row">
              <button onClick={saveField} disabled={busy || draftPoints.length < 3 || !newName.trim()}>
                Saqlash
              </button>
              <button onClick={() => setDraftPoints((points) => points.slice(0, -1))} disabled={draftPoints.length === 0}>
                Oxirgi nuqtani oʻchirish
              </button>
              <button onClick={cancelDrawing} className="secondary">
                Bekor qilish
              </button>
            </div>
          </section>
        ) : (
          <button onClick={startDrawing} disabled={busy}>
            + Yangi maydon chizish
          </button>
        )}

        <section className="card">
          <h2>Maydonlar</h2>
          {fields.length === 0 && <p className="muted">Hali maydon yoʻq.</p>}
          <ul className="field-list">
            {fields.map((field) => (
              <li key={field.id}>
                <button
                  className={field.id === selectedId ? "link active" : "link"}
                  onClick={() => selectField(field.id)}
                >
                  {field.id}. {field.properties.name}
                </button>
              </li>
            ))}
          </ul>
        </section>

        {selectedField && (
          <section className="card">
            <h2>{selectedField.properties.name}</h2>
            <p className="muted">
              Telegram ogohlantirishlari uchun botga yozing: <code>/link {selectedField.id}</code>
            </p>
            <div className="row">
              <button onClick={computeNdvi} disabled={busy}>
                NDVI hisoblash (30 kun)
              </button>
              <button onClick={backfill} disabled={busy}>
                Mavsum tarixini yuklash
              </button>
              <button onClick={deleteField} disabled={busy} className="danger">
                Oʻchirish
              </button>
            </div>

            <h3>NDVI grafigi</h3>
            <NdviChart
              observations={history}
              selectedId={selectedObservation?.id ?? null}
              onSelect={setSelectedObservation}
            />
            {selectedObservation && (
              <table className="stats">
                <tbody>
                  <tr>
                    <th>Sana</th>
                    <td>{formatDate(selectedObservation.observed_on)}</td>
                  </tr>
                  <tr>
                    <th>Oʻrtacha NDVI</th>
                    <td>{selectedObservation.ndvi_mean.toFixed(3)}</td>
                  </tr>
                  <tr>
                    <th>Min / Max</th>
                    <td>
                      {selectedObservation.ndvi_min.toFixed(2)} / {selectedObservation.ndvi_max.toFixed(2)}
                    </td>
                  </tr>
                  <tr>
                    <th>Bulutsiz qism</th>
                    <td>{Math.round(selectedObservation.clear_fraction * 100)}%</td>
                  </tr>
                </tbody>
              </table>
            )}
          </section>
        )}

        {busy && <p className="muted">Kuting…</p>}
        {message && <p className="ok">{message}</p>}
        {error && <p className="error">Xato: {error}</p>}

        <section className="legend">
          <span>NDVI</span>
          <div
            className="ramp"
            style={{
              background: `linear-gradient(to right, ${NDVI_STOPS.map(
                ([value, color]) => `${color} ${(((value + 0.2) / 1.1) * 100).toFixed(0)}%`,
              ).join(", ")})`,
            }}
          />
          <div className="ramp-labels">
            <span>−0.2</span>
            <span>0.35</span>
            <span>0.9</span>
          </div>
        </section>
      </aside>

      <main className="map-wrap">
        <MapView
          fields={fields}
          selectedId={selectedId}
          onSelectField={selectField}
          drawing={drawing}
          draftPoints={draftPoints}
          onAddPoint={(point) => setDraftPoints((points) => [...points, point])}
          overlay={overlay}
          basemap={basemap}
        />
      </main>
    </div>
  );
}
