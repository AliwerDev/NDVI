"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  ActivityIcon,
  AlertIcon,
  AreaIcon,
  CheckIcon,
  CloseIcon,
  CrosshairIcon,
  ExpandIcon,
  FieldsIcon,
  GlobeIcon,
  HistoryIcon,
  InfoIcon,
  MapIcon,
  PlusIcon,
  SendIcon,
  SettingsIcon,
  SpinnerIcon,
  UndoIcon,
} from "@/components/icons";
import LogoMark from "@/components/Logo";
import MapSearch, { type SearchTarget } from "@/components/MapSearch";
import MapView, { type Basemap } from "@/components/MapView";
import IndexTabs from "@/components/IndexTabs";
import NdviChart from "@/components/NdviChart";
import NdviReport from "@/components/NdviReport";
import NitrogenCard from "@/components/NitrogenCard";
import ObservationStats from "@/components/ObservationStats";
import { AccountSkeleton, ChartSkeleton, FieldListSkeleton, ObservationSkeleton } from "@/components/Skeletons";
import {
  api,
  ApiError,
  type BackfillJob,
  type FieldFeature,
  type FieldLayer,
  type Observation,
  type ObservationImage,
  type Position,
  type User,
} from "@/lib/api";
import { formatArea, formatSotix, ringAreaHa, SMALL_FIELD_HA } from "@/lib/geo";
import {
  daysAgo,
  formatDate,
  formatIndex,
  type IndexName,
  indexValues,
  INDICES,
  isoDate,
  rampGradient,
  rampPercent,
  seasonStart,
} from "@/lib/ndvi";

const BASEMAPS: { value: Basemap; label: string; Icon: typeof GlobeIcon }[] = [
  { value: "satellite", label: "Sunʼiy yoʻldosh", Icon: GlobeIcon },
  { value: "osm", label: "OpenStreetMap", Icon: MapIcon },
];

const LAYERS: { value: FieldLayer; label: string }[] = [
  { value: "ndvi", label: "NDVI" },
  { value: "ndmi", label: "NDMI" },
  { value: "ndre", label: "NDRE" },
  { value: "rgb", label: "Rasm" },
];

// While a backfill job runs: check its status every 3 s.
const BACKFILL_POLL_MS = 3_000;

// The selected field is kept in the URL (?field=3), so a page reload opens the same field.
const FIELD_PARAM = "field";

function fieldIdFromUrl(): number | null {
  const id = Number(new URLSearchParams(window.location.search).get(FIELD_PARAM));
  return Number.isInteger(id) && id > 0 ? id : null;
}

export default function FieldMonitor() {
  const [fields, setFields] = useState<FieldFeature[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [history, setHistory] = useState<Observation[]>([]);
  const [selectedObservation, setSelectedObservation] = useState<Observation | null>(null);
  const [overlay, setOverlay] = useState<ObservationImage | null>(null);
  const [layer, setLayer] = useState<FieldLayer>("ndvi");
  // The index of the chart, the selected row and the report. An index layer on the map follows it.
  const [index, setIndex] = useState<IndexName>("ndvi");
  const [legendHelp, setLegendHelp] = useState(false);
  const [overlayLoading, setOverlayLoading] = useState(false);
  const [basemap, setBasemap] = useState<Basemap>("satellite");
  const [searchTarget, setSearchTarget] = useState<SearchTarget | null>(null);

  const [drawing, setDrawing] = useState(false);
  const [draftPoints, setDraftPoints] = useState<Position[]>([]);
  const [newName, setNewName] = useState("");

  const [reportOpen, setReportOpen] = useState(false);
  const closeReport = useCallback(() => setReportOpen(false), []);

  const [user, setUser] = useState<User | null>(null);
  const [userLoaded, setUserLoaded] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [busy, setBusy] = useState(false);
  const [computing, setComputing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backfillJob, setBackfillJob] = useState<BackfillJob | null>(null);
  // False until the first field list arrives. Until then the URL keeps the field from the last visit.
  const [urlRestored, setUrlRestored] = useState(false);

  const selectedField = fields.find((field) => field.id === selectedId) ?? null;
  const draftArea = ringAreaHa(draftPoints);
  // urlRestored turns true after the first field list request ends, with or without an error.
  const fieldsLoading = !urlRestored;
  // The field check drops a late response for a field that is no longer selected.
  const backfillRunning = backfillJob?.status === "running" && backfillJob.field_id === selectedId;

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
    run(async () => {
      try {
        const list = await api.listFields();
        setFields(list);
        // A deleted field or a field of another user stays unselected.
        const id = fieldIdFromUrl();
        if (id !== null && list.some((field) => field.id === id)) setSelectedId(id);
      } finally {
        setUrlRestored(true);
      }
    });
  }, [run]);

  useEffect(() => {
    if (!urlRestored) return;
    const url = new URL(window.location.href);
    if (selectedId === null) url.searchParams.delete(FIELD_PARAM);
    else url.searchParams.set(FIELD_PARAM, String(selectedId));
    window.history.replaceState(null, "", url);
  }, [urlRestored, selectedId]);

  useEffect(() => {
    // A 401 here sends the user to the login page (see lib/api.ts).
    api
      .me()
      .then(setUser)
      .catch(() => undefined)
      .finally(() => setUserLoaded(true));
  }, []);

  // When the field changes: load its history and show the newest NDVI image.
  useEffect(() => {
    setHistory([]);
    setSelectedObservation(null);
    setOverlay(null);
    setReportOpen(false);
    setHistoryLoading(selectedId !== null);
    if (selectedId === null) return;
    // After a quick switch to another field, the old request must not end the new field's loading state.
    let cancelled = false;
    run(async () => {
      try {
        const observations = await loadHistory(selectedId);
        if (observations.length > 0) setSelectedObservation(observations[observations.length - 1]);
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId, run, loadHistory]);

  // A job can already run for this field: started in another tab, or before a page reload.
  useEffect(() => {
    setBackfillJob(null);
    if (selectedId === null) return;
    let cancelled = false;
    api
      .backfillStatus(selectedId)
      .then((job) => {
        if (!cancelled) setBackfillJob(job);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  // While the job runs: check its status, and reload the chart when it saved new observations.
  // setTimeout (not setInterval), so a slow response does not overlap with the next check.
  useEffect(() => {
    if (!backfillRunning || selectedId === null) return;
    const fieldId = selectedId;
    let cancelled = false;
    let lastSaved = -1;
    let timer: ReturnType<typeof setTimeout>;

    const check = async () => {
      try {
        const job = await api.backfillStatus(fieldId);
        if (cancelled || job === null) return;
        const finished = job.status !== "running";
        if (finished || job.saved_count !== lastSaved) {
          lastSaved = job.saved_count;
          const observations = await api.history(fieldId);
          if (cancelled) return;
          setHistory(observations);
          if (observations.length > 0) {
            setSelectedObservation((current) => current ?? observations[observations.length - 1]);
          }
        }
        setBackfillJob(job);
        if (job.status === "done") {
          setMessage(
            job.saved_count > 0
              ? `Mavsum tarixi yuklandi: ${job.saved_count} ta kuzatuv.`
              : "Yangi tiniq sahna topilmadi. Grafik oʻzgarmadi.",
          );
        } else if (job.status === "failed") {
          setError("Mavsum tarixini yuklab boʻlmadi. Keyinroq qayta urinib koʻring.");
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
  }, [backfillRunning, selectedId]);

  // The old image stays on the map until the new one is ready, so the field does not flash empty.
  useEffect(() => {
    if (!selectedObservation) return;
    // An observation from before NDMI and NDRE were added has no file for them. The legend explains it.
    if (layer !== "rgb" && indexValues(selectedObservation, layer) === null) {
      setOverlay(null);
      setOverlayLoading(false);
      return;
    }
    let cancelled = false;
    setOverlayLoading(true);
    api
      .observationImage(selectedObservation.id, layer)
      .then((image) => {
        if (!cancelled) setOverlay(image);
      })
      .catch((err) => {
        if (cancelled) return;
        // Without this the map keeps the image of the other layer under the new switch position.
        setOverlay(null);
        const reason = err instanceof Error ? err.message : String(err);
        setError(layer === "rgb" ? `Rangli rasmni olib boʻlmadi. ${reason}` : reason);
      })
      .finally(() => {
        if (!cancelled) setOverlayLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedObservation, layer]);

  const selectIndex = (value: IndexName) => {
    setIndex(value);
    setLayer((current) => (current === "rgb" ? "rgb" : value));
  };

  const selectLayer = (value: FieldLayer) => {
    setLayer(value);
    if (value !== "rgb") setIndex(value);
  };

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

  const computeNdvi = () => {
    if (!selectedField) return;
    setComputing(true);
    run(async () => {
      const observation = await api.computeNdvi(selectedField.id, daysAgo(30), isoDate(new Date()));
      await loadHistory(selectedField.id);
      setSelectedObservation(observation);
      setMessage(
        `Indekslar hisoblandi: ${formatDate(observation.observed_on)}, oʻrtacha NDVI ${formatIndex(observation.ndvi_mean)}.`,
      );
    }).finally(() => setComputing(false));
  };

  const backfill = () => {
    if (!selectedField) return;
    const fieldId = selectedField.id;
    run(async () => {
      try {
        setBackfillJob(await api.startBackfill(fieldId, seasonStart(), isoDate(new Date())));
        setMessage("Mavsum tarixi fonda yuklanmoqda. Grafik yangi kuzatuvlar bilan toʻlib boradi.");
      } catch (err) {
        // 409: a job already runs for this field (for example, from another tab). Follow that job.
        if (!(err instanceof ApiError && err.status === 409)) throw err;
        setBackfillJob(await api.backfillStatus(fieldId));
      }
    });
  };

  return (
    <div className="layout">
      <aside className="sidebar" aria-label="Boshqaruv paneli">
        <div className="sheet-handle" aria-hidden="true" />

        <header className="brand">
          <Link href="/" className="brand-link" title="Bosh sahifa: NDVI nima?">
            <LogoMark size={44} className="brand-mark" />
            <div>
              <h1>NDVI monitoring</h1>
              <p>Sentinel-2</p>
            </div>
          </Link>
        </header>

        {!userLoaded && <AccountSkeleton />}
        {user && (
          <Link href="/settings" className="account" aria-label={`Sozlamalar: ${user.display_name}`}>
            <span className="account-avatar" aria-hidden="true">
              {user.display_name.charAt(0).toUpperCase()}
            </span>
            <span className="account-name">
              <span>{user.display_name}</span>
              <span className={user.telegram_linked ? "account-tg" : "account-tg off"}>
                <SendIcon size={12} />
                {user.telegram_linked
                  ? user.telegram_username
                    ? `@${user.telegram_username}`
                    : "Telegram ulangan"
                  : "Telegram ulanmagan"}
              </span>
            </span>
            <span className="account-gear" aria-hidden="true">
              <SettingsIcon size={18} />
            </span>
          </Link>
        )}

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
            <div className="area-row">
              <span className="area-label">Yuzasi</span>
              {draftPoints.length < 3 ? (
                <span className="area-extra">3-nuqtadan keyin koʻrinadi</span>
              ) : (
                <span className="area-value">
                  <strong>≈ {formatArea(draftArea)}</strong>
                  {draftArea < SMALL_FIELD_HA && <span className="area-extra">{formatSotix(draftArea)}</span>}
                </span>
              )}
            </div>
            {draftPoints.length >= 3 && draftArea < SMALL_FIELD_HA && (
              <p className="hint hint-warn">
                <InfoIcon size={18} />
                <span>
                  Maydon 0.5 gektardan kichik. Chegaradagi piksellar (yoʻl, ariq, daraxt) natijaga koʻproq taʼsir qiladi.
                </span>
              </p>
            )}
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
            {fieldsLoading ? (
              <span className="sk" aria-hidden="true" style={{ width: 26, height: 20, borderRadius: 999 }} />
            ) : (
              <span className="badge">{fields.length}</span>
            )}
          </div>
          {fieldsLoading ? (
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
                      onClick={() => selectField(field.id)}
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

        {selectedField && (
          <>
            <section className="card" aria-labelledby="sf-title">
              <div className="field-title">
                <span className="eyebrow">{selectedField.id}-maydon</span>
                <h2 id="sf-title" className="serif-title">
                  {selectedField.properties.name}
                </h2>
                <span className="field-size">
                  <AreaIcon size={16} className="accent-icon" />
                  <strong>{formatArea(selectedField.properties.area_ha)}</strong>
                  {selectedField.properties.area_ha < SMALL_FIELD_HA && (
                    <span>{formatSotix(selectedField.properties.area_ha)}</span>
                  )}
                </span>
              </div>
              <div className="stack">
                <button type="button" className="btn btn-primary" onClick={computeNdvi} disabled={busy}>
                  {computing ? <SpinnerIcon size={16} className="spin" /> : <ActivityIcon size={16} />}
                  {computing ? "Kuting…" : "Indekslarni hisoblash (30 kun)"}
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={backfill}
                  disabled={busy || backfillRunning}
                  aria-busy={backfillRunning}
                >
                  {backfillRunning ? <SpinnerIcon size={16} className="spin" /> : <HistoryIcon size={16} />}
                  {backfillRunning
                    ? backfillJob?.saved_count
                      ? `Yuklanmoqda… ${backfillJob.saved_count} ta saqlandi`
                      : "Yuklanmoqda…"
                    : "Mavsum tarixini yuklash"}
                </button>
              </div>
            </section>

            <section className="card" aria-labelledby="ch-title">
              <div className="card-head">
                <h2 id="ch-title">Indekslar grafigi</h2>
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
              <IndexTabs value={index} onChange={selectIndex} />
              <p className="meta index-caption">{INDICES[index].caption}</p>
              {historyLoading ? (
                <ChartSkeleton />
              ) : (
                <NdviChart
                  observations={history}
                  selectedId={selectedObservation?.id ?? null}
                  onSelect={setSelectedObservation}
                  index={index}
                />
              )}
            </section>

            {historyLoading && <ObservationSkeleton />}

            {selectedObservation && (
              <section className="card" aria-labelledby="st-title">
                <h2 id="st-title">Tanlangan kuzatuv</h2>
                <ObservationStats observation={selectedObservation} index={index} onSelectIndex={selectIndex} />
              </section>
            )}

            {selectedObservation?.nitrogen_advice && selectedObservation.ndre_mean !== null && (
              <NitrogenCard advice={selectedObservation.nitrogen_advice} ndre={selectedObservation.ndre_mean} />
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

        <section className="legend" aria-labelledby="layer-label">
          <div className="legend-head">
            <span id="layer-label">Maydon qatlami</span>
            {selectedObservation && <span className="legend-date">{formatDate(selectedObservation.observed_on)}</span>}
            <button
              type="button"
              className="legend-help-btn"
              aria-label="Ranglar nimani bildiradi?"
              aria-expanded={legendHelp}
              aria-controls="legend-help"
              onClick={() => setLegendHelp((open) => !open)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setLegendHelp(false);
              }}
            >
              ?
            </button>
          </div>

          {legendHelp && (
            <div id="legend-help" className="legend-help" role="note">
              <strong>{layer === "rgb" ? "Rangli rasm" : INDICES[layer].helpTitle}</strong>
              <span>
                {layer === "rgb"
                  ? "Dalaning shu kundagi surati, koʻz bilan koʻrgandek. Yashil — oʻsimlik, jigarrang — ochiq tuproq."
                  : INDICES[layer].helpText}
              </span>
              <span className="legend-help-meta">Sentinel-2 · {layer === "rgb" ? "10 m" : INDICES[layer].pixel} piksel</span>
              <Link href={layer === "ndmi" || layer === "ndre" ? `/#${layer}` : "/#ranglar"} className="legend-help-link">
                Batafsil
              </Link>
            </div>
          )}

          <div role="radiogroup" aria-labelledby="layer-label" className="segmented legend-switch">
            {LAYERS.map(({ value, label }) => {
              const active = layer === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-busy={active && overlayLoading}
                  onClick={() => selectLayer(value)}
                >
                  {active && overlayLoading && <SpinnerIcon size={12} className="spin" />}
                  {label}
                </button>
              );
            })}
          </div>

          {layer !== "rgb" ? (
            <>
              <div className="ramp-wrap" aria-hidden="true">
                <div className="ramp" style={{ background: rampGradient(INDICES[layer].stops) }} />
                {INDICES[layer].threshold && (
                  <span
                    className="ramp-mark"
                    style={{ left: `calc(${rampPercent(layer, INDICES[layer].threshold!.value)}% - 1px)` }}
                  />
                )}
              </div>
              <div className="ramp-ends">
                <span>
                  <strong>{INDICES[layer].rampEnds[0].word}</strong> · {INDICES[layer].rampEnds[0].value}
                </span>
                <span>
                  {INDICES[layer].rampEnds[1].value} · <strong>{INDICES[layer].rampEnds[1].word}</strong>
                </span>
              </div>
              {selectedObservation && indexValues(selectedObservation, layer) === null && (
                <p className="legend-note">
                  Bu kuzatuvda {INDICES[layer].label} yoʻq. Mavsum tarixini qayta yuklang.
                </p>
              )}
            </>
          ) : (
            <p className="legend-meta">
              <span className="rgb-swatches" aria-hidden="true">
                <span style={{ background: "#45592b" }} />
                <span style={{ background: "#7a7a4c" }} />
                <span style={{ background: "#ae9a70" }} />
              </span>
              Koʻz bilan koʻrgandek surat
            </p>
          )}
        </section>
      </main>

      {reportOpen && selectedField && (
        <NdviReport
          field={selectedField}
          observations={history}
          selected={selectedObservation}
          onSelect={setSelectedObservation}
          index={index}
          onSelectIndex={selectIndex}
          onClose={closeReport}
        />
      )}
    </div>
  );
}
