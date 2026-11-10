"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  ActivityIcon,
  AlertIcon,
  CheckIcon,
  CloseIcon,
  CrosshairIcon,
  ExpandIcon,
  FieldsIcon,
  GlobeIcon,
  HistoryIcon,
  ImageIcon,
  LogoutIcon,
  MapIcon,
  PlusIcon,
  SendIcon,
  SpinnerIcon,
  TrashIcon,
  UndoIcon,
} from "@/components/icons";
import LogoMark from "@/components/Logo";
import MapSearch, { type SearchTarget } from "@/components/MapSearch";
import MapView, { type Basemap } from "@/components/MapView";
import NdviChart from "@/components/NdviChart";
import NdviReport from "@/components/NdviReport";
import ObservationStats from "@/components/ObservationStats";
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
import { clearToken } from "@/lib/auth";
import { daysAgo, formatDate, isoDate, NDVI_STOPS, seasonStart } from "@/lib/ndvi";

const BASEMAPS: { value: Basemap; label: string; Icon: typeof GlobeIcon }[] = [
  { value: "satellite", label: "Sunʼiy yoʻldosh", Icon: GlobeIcon },
  { value: "osm", label: "OpenStreetMap", Icon: MapIcon },
];

const LAYERS: { value: FieldLayer; label: string }[] = [
  { value: "ndvi", label: "NDVI" },
  { value: "rgb", label: "Rangli rasm" },
];

// The legend puts each color stop on a −0.2…0.9 bar.
const RAMP = `linear-gradient(to right, ${NDVI_STOPS.map(
  ([value, color]) => `${color} ${(((value + 0.2) / 1.1) * 100).toFixed(2)}%`,
).join(", ")})`;

// While a backfill job runs: check its status every 3 s.
const BACKFILL_POLL_MS = 3_000;

// While the user links Telegram: check the account every 3 s, for as long as the code lives (10 min).
const TELEGRAM_CHECK_MS = 3_000;
const TELEGRAM_CODE_MS = 10 * 60_000;

export default function FieldMonitor() {
  const [fields, setFields] = useState<FieldFeature[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [history, setHistory] = useState<Observation[]>([]);
  const [selectedObservation, setSelectedObservation] = useState<Observation | null>(null);
  const [overlay, setOverlay] = useState<ObservationImage | null>(null);
  // Farmers ask for the plain picture first, so the true color image is the default layer.
  const [layer, setLayer] = useState<FieldLayer>("rgb");
  const [overlayLoading, setOverlayLoading] = useState(false);
  const [basemap, setBasemap] = useState<Basemap>("satellite");
  const [searchTarget, setSearchTarget] = useState<SearchTarget | null>(null);

  const [drawing, setDrawing] = useState(false);
  const [draftPoints, setDraftPoints] = useState<Position[]>([]);
  const [newName, setNewName] = useState("");

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const closeReport = useCallback(() => setReportOpen(false), []);

  const [user, setUser] = useState<User | null>(null);
  // The "Telegramni ulash" button shows only when the bot runs.
  const [telegramAvailable, setTelegramAvailable] = useState(false);
  const [waitingForTelegram, setWaitingForTelegram] = useState(false);
  // The link, when the browser blocked the new tab.
  const [blockedLinkUrl, setBlockedLinkUrl] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [computing, setComputing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backfillJob, setBackfillJob] = useState<BackfillJob | null>(null);

  const selectedField = fields.find((field) => field.id === selectedId) ?? null;
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
    run(loadFields);
  }, [run, loadFields]);

  useEffect(() => {
    // A 401 here sends the user to the login page (see lib/api.ts).
    api.me().then(setUser).catch(() => undefined);
    // An error here only hides the Telegram button, so it is not shown to the user.
    api
      .telegramBot()
      .then((username) => setTelegramAvailable(username !== null))
      .catch(() => undefined);
  }, []);

  // After "Telegramni ulash": the user taps "Start" in Telegram, then comes back. Check the account
  // when the tab gets focus and every few seconds, until the link shows or the code expires.
  useEffect(() => {
    if (!waitingForTelegram) return;
    const refresh = () =>
      api
        .me()
        .then((me) => {
          setUser(me);
          if (me.telegram_linked) {
            setWaitingForTelegram(false);
            setBlockedLinkUrl(null);
            setMessage("Telegram ulandi. Barcha maydonlaringiz boʻyicha ogohlantirishlar unga keladi.");
          }
        })
        .catch(() => undefined);
    window.addEventListener("focus", refresh);
    const timer = setInterval(refresh, TELEGRAM_CHECK_MS);
    const stop = setTimeout(() => setWaitingForTelegram(false), TELEGRAM_CODE_MS);
    return () => {
      window.removeEventListener("focus", refresh);
      clearInterval(timer);
      clearTimeout(stop);
    };
  }, [waitingForTelegram]);

  // When the field changes: load its history and show the newest NDVI image.
  useEffect(() => {
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

  // The API makes a one-time t.me link. The bot binds that Telegram account to this user,
  // and NDVI alerts for all fields go there.
  const openTelegramLink = async () => {
    setBlockedLinkUrl(null);
    // Open the tab now, inside the click. A tab opened after an await is often blocked as a popup.
    const tab = window.open("", "_blank");
    try {
      const url = await api.telegramLink();
      if (tab) {
        tab.opener = null;
        tab.location.href = url;
      } else {
        setBlockedLinkUrl(url);
      }
      setWaitingForTelegram(true);
    } catch (err) {
      tab?.close();
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const unlinkTelegram = async () => {
    setError(null);
    try {
      await api.telegramUnlink();
      setUser(await api.me());
      setMessage("Telegram uzildi. Ogohlantirishlar endi yuborilmaydi.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } finally {
      clearToken();
      window.location.assign("/login");
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

        {user && (
          <section className="account" aria-label="Hisob">
            <div className="account-row">
              <span className="account-avatar" aria-hidden="true">
                {user.display_name.charAt(0).toUpperCase()}
              </span>
              <div className="account-name">
                <span>{user.display_name}</span>
                <span>{user.has_password ? "Login va parol" : "Telegram orqali"}</span>
              </div>
              <button type="button" className="account-logout" onClick={logout}>
                <LogoutIcon size={16} />
                Chiqish
              </button>
            </div>

            {user.telegram_linked ? (
              <div className="account-telegram">
                <SendIcon size={16} className="account-telegram-icon" />
                <span>
                  Ogohlantirishlar:{" "}
                  <strong>{user.telegram_username ? `@${user.telegram_username}` : "Telegram"}</strong>
                </span>
                {user.has_password && (
                  <button type="button" className="account-text-btn" onClick={unlinkTelegram}>
                    Uzish
                  </button>
                )}
              </div>
            ) : (
              telegramAvailable && (
                <div className="account-telegram account-telegram-off">
                  <p>Barcha maydonlaringiz boʻyicha NDVI ogohlantirishlari Telegramga kelishi uchun ulang.</p>
                  <button type="button" className="btn btn-telegram" onClick={openTelegramLink}>
                    {waitingForTelegram ? <SpinnerIcon size={16} className="spin" /> : <SendIcon size={16} />}
                    {waitingForTelegram ? "Telegramda «Start» ni bosing…" : "Telegramni ulash"}
                  </button>
                  {blockedLinkUrl && (
                    <a className="telegram-fallback" href={blockedLinkUrl} target="_blank" rel="noopener noreferrer">
                      Telegram ochilmadimi? Shu yerni bosing.
                    </a>
                  )}
                </div>
              )
            )}
          </section>
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
              <div className="stack">
                <button type="button" className="btn btn-primary" onClick={computeNdvi} disabled={busy}>
                  {computing ? <SpinnerIcon size={16} className="spin" /> : <ActivityIcon size={16} />}
                  {computing ? "Kuting…" : "NDVI hisoblash (30 kun)"}
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

        <section className="legend" aria-labelledby="layer-label">
          <div className="legend-head">
            <span id="layer-label">Maydon qatlami</span>
            {selectedObservation && <span>{formatDate(selectedObservation.observed_on)}</span>}
          </div>
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
                  onClick={() => setLayer(value)}
                >
                  {active && overlayLoading ? (
                    <SpinnerIcon size={14} className="spin" />
                  ) : value === "ndvi" ? (
                    <span className="legend-switch-ramp" aria-hidden="true" />
                  ) : (
                    <ImageIcon size={14} />
                  )}
                  {label}
                </button>
              );
            })}
          </div>

          {layer === "ndvi" ? (
            <>
              <div className="ramp" aria-hidden="true" style={{ background: RAMP }} />
              <div className="ramp-labels">
                <span>−0.2</span>
                <span>0.35</span>
                <span>0.9</span>
              </div>
              <Link href="/#ranglar" className="legend-link">
                Ranglar nimani bildiradi?
              </Link>
            </>
          ) : (
            <>
              <p className="legend-note">
                Dalaning shu kundagi surati, koʻz bilan koʻrgandek. Yashil — oʻsimlik, jigarrang — ochiq tuproq.
              </p>
              <p className="legend-meta">
                <span className="rgb-swatches" aria-hidden="true">
                  <span style={{ background: "#45592b" }} />
                  <span style={{ background: "#7a7a4c" }} />
                  <span style={{ background: "#ae9a70" }} />
                </span>
                Sentinel-2 · 10 m piksel
              </p>
            </>
          )}
        </section>
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
