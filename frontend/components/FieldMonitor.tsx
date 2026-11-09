"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  ActivityIcon,
  AlertIcon,
  CheckIcon,
  CloseIcon,
  CopyIcon,
  CrosshairIcon,
  ExpandIcon,
  FieldsIcon,
  GlobeIcon,
  HistoryIcon,
  LeafIcon,
  MapIcon,
  PlusIcon,
  SendIcon,
  SpinnerIcon,
  TrashIcon,
  UndoIcon,
} from "@/components/icons";
import MapSearch, { type SearchTarget } from "@/components/MapSearch";
import MapView, { type Basemap } from "@/components/MapView";
import NdviChart from "@/components/NdviChart";
import NdviReport from "@/components/NdviReport";
import ObservationStats from "@/components/ObservationStats";
import { api, type FieldFeature, type Observation, type ObservationImage, type Position } from "@/lib/api";
import { daysAgo, formatDate, isoDate, NDVI_STOPS, seasonStart } from "@/lib/ndvi";

const BASEMAPS: { value: Basemap; label: string; Icon: typeof GlobeIcon }[] = [
  { value: "satellite", label: "Sunʼiy yoʻldosh", Icon: GlobeIcon },
  { value: "osm", label: "OpenStreetMap", Icon: MapIcon },
];

// The legend puts each color stop on a −0.2…0.9 bar.
const RAMP = `linear-gradient(to right, ${NDVI_STOPS.map(
  ([value, color]) => `${color} ${(((value + 0.2) / 1.1) * 100).toFixed(2)}%`,
).join(", ")})`;

// The bot username without "@". When it is set, one button links the field through a deep link
// (t.me/<bot>?start=link_<id>). Without it, the user types "/link <id>" to the bot.
const TELEGRAM_BOT = process.env.NEXT_PUBLIC_TELEGRAM_BOT?.replace(/^@/, "").trim() || null;

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
  const [searchTarget, setSearchTarget] = useState<SearchTarget | null>(null);

  const [drawing, setDrawing] = useState(false);
  const [draftPoints, setDraftPoints] = useState<Position[]>([]);
  const [newName, setNewName] = useState("");

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const closeReport = useCallback(() => setReportOpen(false), []);

  const [busy, setBusy] = useState(false);
  const [computing, setComputing] = useState(false);
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
    setConfirmingDelete(false);
    setReportOpen(false);
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
    setConfirmingDelete(false);
    run(async () => {
      await api.deleteField(selectedField.id);
      setSelectedId(null);
      await loadFields();
    });
  };

  const copyLinkCommand = async (command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // The clipboard is not available (for example, over plain HTTP). The command stays visible.
    }
  };

  const computeNdvi = () => {
    if (!selectedField) return;
    setComputing(true);
    run(async () => {
      const observation = await api.computeNdvi(selectedField.id, daysAgo(30), isoDate(new Date()));
      await loadHistory(selectedField.id);
      setSelectedObservation(observation);
      setMessage(`NDVI hisoblandi: ${formatDate(observation.observed_on)}, oʻrtacha ${observation.ndvi_mean.toFixed(2)}.`);
    }).finally(() => setComputing(false));
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

  const linkCommand = selectedField ? `/link ${selectedField.id}` : "";

  return (
    <div className="layout">
      <aside className="sidebar" aria-label="Boshqaruv paneli">
        <div className="sheet-handle" aria-hidden="true" />

        <header className="brand">
          <div className="brand-mark" aria-hidden="true">
            <LeafIcon size={22} />
          </div>
          <div>
            <h1>NDVI monitoring</h1>
            <p>Sentinel-2</p>
          </div>
        </header>

        <section className="basemap" aria-labelledby="bm-label">
          <span id="bm-label" className="label">
            Xarita
          </span>
          <div role="radiogroup" aria-labelledby="bm-label" className="segmented">
            {BASEMAPS.map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={basemap === value}
                onClick={() => setBasemap(value)}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>
        </section>

        {drawing ? (
          <section className="card card-drawing" aria-labelledby="nf-title">
            <div className="card-head">
              <h2 id="nf-title">Yangi maydon</h2>
              <span role="status" aria-live="polite" className="chip">
                <span className="draft-dot" aria-hidden="true" />
                Nuqtalar: {draftPoints.length}
              </span>
            </div>
            <p className="hint">
              <CrosshairIcon size={18} className="accent-icon" />
              <span>Xaritada maydon burchaklarini bosing. Kamida 3 ta nuqta kerak.</span>
            </p>
            <div className="input-group">
              <label htmlFor="field-name" className="label">
                Maydon nomi
              </label>
              <input
                id="field-name"
                type="text"
                className="input"
                placeholder="Maydon nomi"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={200}
              />
              <span className="counter">{newName.length} / 200</span>
            </div>
            <div className="stack">
              <button
                type="button"
                className="btn btn-primary"
                onClick={saveField}
                disabled={busy || draftPoints.length < 3 || !newName.trim()}
              >
                <CheckIcon size={16} />
                Saqlash
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setDraftPoints((points) => points.slice(0, -1))}
                disabled={draftPoints.length === 0}
              >
                <UndoIcon size={16} />
                Oxirgi nuqtani oʻchirish
              </button>
              <button type="button" className="btn btn-muted" onClick={cancelDrawing}>
                Bekor qilish
              </button>
            </div>
          </section>
        ) : (
          <button type="button" className="btn btn-primary" onClick={startDrawing} disabled={busy}>
            <PlusIcon size={16} />
            Yangi maydon chizish
          </button>
        )}

        <section className="card" aria-labelledby="fl-title">
          <div className="card-head">
            <h2 id="fl-title">Maydonlar</h2>
            <span className="badge">{fields.length}</span>
          </div>
          {fields.length === 0 ? (
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
                      onClick={() => selectField(field.id)}
                    >
                      <span className="swatch" aria-hidden="true" />
                      <span className="field-id">{field.id}.</span>
                      <span className="field-name">{field.properties.name}</span>
                      {active && <CheckIcon size={16} className="accent-icon" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {selectedField && (
          <>
            <section className="card" aria-labelledby="sf-title">
              <div className="field-title">
                <span className="eyebrow">{selectedField.id}-maydon</span>
                <h2 id="sf-title" className="serif-title">
                  {selectedField.properties.name}
                </h2>
              </div>
              {TELEGRAM_BOT ? (
                <div className="telegram">
                  <p>
                    <SendIcon size={16} className="accent-icon" />
                    <span>NDVI keskin tushsa, Telegram orqali ogohlantirish oling.</span>
                  </p>
                  <a
                    className="btn btn-telegram"
                    href={`https://t.me/${TELEGRAM_BOT}?start=link_${selectedField.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <SendIcon size={16} />
                    Telegramda ulash
                  </a>
                </div>
              ) : (
                <div className="telegram">
                  <p>
                    <SendIcon size={16} className="accent-icon" />
                    <span>Telegram ogohlantirishlari uchun botga yozing:</span>
                  </p>
                  <button
                    type="button"
                    className="code-chip"
                    aria-label={`${linkCommand} — nusxa olish`}
                    onClick={() => copyLinkCommand(linkCommand)}
                  >
                    <code>{linkCommand}</code>
                    {copied ? <CheckIcon size={16} className="accent-icon" /> : <CopyIcon size={16} />}
                  </button>
                  <span className="sr-only" role="status">
                    {copied ? "Nusxa olindi" : ""}
                  </span>
                </div>
              )}
              <div className="stack">
                <button type="button" className="btn btn-primary" onClick={computeNdvi} disabled={busy}>
                  {computing ? <SpinnerIcon size={16} className="spin" /> : <ActivityIcon size={16} />}
                  {computing ? "Kuting…" : "NDVI hisoblash (30 kun)"}
                </button>
                <button type="button" className="btn btn-outline" onClick={backfill} disabled={busy}>
                  <HistoryIcon size={16} />
                  Mavsum tarixini yuklash
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => setConfirmingDelete(true)}
                  disabled={busy}
                >
                  <TrashIcon size={16} />
                  Oʻchirish
                </button>
              </div>
            </section>

            <section className="card" aria-labelledby="ch-title">
              <div className="card-head">
                <h2 id="ch-title">NDVI grafigi</h2>
                {history.length > 0 && (
                  <div className="card-head-actions">
                    <span className="meta">{history.length} ta kuzatuv</span>
                    <button
                      type="button"
                      className="icon-btn icon-btn-sm"
                      aria-label="Hisobotni katta oynada ochish"
                      title="Kattalashtirish"
                      onClick={() => setReportOpen(true)}
                    >
                      <ExpandIcon size={16} />
                    </button>
                  </div>
                )}
              </div>
              <NdviChart
                observations={history}
                selectedId={selectedObservation?.id ?? null}
                onSelect={setSelectedObservation}
              />
            </section>

            {selectedObservation && (
              <section className="card" aria-labelledby="st-title">
                <h2 id="st-title">Tanlangan kuzatuv</h2>
                <ObservationStats observation={selectedObservation} />
              </section>
            )}
          </>
        )}
      </aside>

      <main className="map-wrap">
        <MapSearch onSelect={setSearchTarget} />
        <MapView
          fields={fields}
          selectedId={selectedId}
          onSelectField={selectField}
          drawing={drawing}
          draftPoints={draftPoints}
          onAddPoint={(point) => setDraftPoints((points) => [...points, point])}
          overlay={overlay}
          basemap={basemap}
          searchTarget={searchTarget}
        />

        <div className="toasts">
          {busy && (
            <div role="status" className="toast">
              <span className="toast-icon">
                <SpinnerIcon size={16} className="spin" />
              </span>
              <p>Kuting…</p>
            </div>
          )}
          {message && (
            <div role="status" className="toast toast-ok">
              <span className="toast-icon">
                <CheckIcon size={16} />
              </span>
              <p>{message}</p>
              <button type="button" className="toast-close" aria-label="Yopish" onClick={() => setMessage(null)}>
                <CloseIcon size={16} />
              </button>
            </div>
          )}
          {error && (
            <div role="alert" className="toast toast-error">
              <span className="toast-icon">
                <AlertIcon size={16} />
              </span>
              <p>Xato: {error}</p>
              <button type="button" className="toast-close" aria-label="Yopish" onClick={() => setError(null)}>
                <CloseIcon size={16} />
              </button>
            </div>
          )}
        </div>

        <div className="legend" role="group" aria-label="NDVI shkalasi">
          <div className="legend-head">
            <span>NDVI</span>
            <span>Sentinel-2</span>
          </div>
          <div className="ramp" aria-hidden="true" style={{ background: RAMP }} />
          <div className="ramp-labels">
            <span>−0.2</span>
            <span>0.35</span>
            <span>0.9</span>
          </div>
        </div>
      </main>

      {reportOpen && selectedField && (
        <NdviReport
          field={selectedField}
          observations={history}
          selected={selectedObservation}
          onSelect={setSelectedObservation}
          onClose={closeReport}
        />
      )}

      {confirmingDelete && selectedField && (
        <div className="modal-backdrop" onClick={() => setConfirmingDelete(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="dlg-title"
            className="dialog"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") setConfirmingDelete(false);
            }}
          >
            <div className="dialog-head">
              <span className="dialog-icon" aria-hidden="true">
                <TrashIcon size={20} />
              </span>
              <h3 id="dlg-title">«{selectedField.properties.name}» maydoni oʻchirilsinmi?</h3>
            </div>
            <div className="dialog-actions">
              <button type="button" className="btn btn-outline" autoFocus onClick={() => setConfirmingDelete(false)}>
                Bekor qilish
              </button>
              <button type="button" className="btn btn-danger-solid" onClick={deleteField}>
                Oʻchirish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
