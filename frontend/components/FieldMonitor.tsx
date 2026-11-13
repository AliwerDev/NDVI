"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

import { ExpandIcon, PlusIcon } from "@/components/icons";
import IndexTabs from "@/components/IndexTabs";
import LogoMark from "@/components/Logo";
import MapSearch, { type SearchTarget } from "@/components/MapSearch";
import MapView, { type Basemap } from "@/components/MapView";
import AccountCard from "@/components/monitor/AccountCard";
import BasemapSwitch from "@/components/monitor/BasemapSwitch";
import DrawingCard from "@/components/monitor/DrawingCard";
import FieldList from "@/components/monitor/FieldList";
import LayerLegend from "@/components/monitor/LayerLegend";
import SelectedFieldCard from "@/components/monitor/SelectedFieldCard";
import Toasts from "@/components/monitor/Toasts";
import NdviChart from "@/components/NdviChart";
import NdviReport from "@/components/NdviReport";
import NitrogenCard from "@/components/NitrogenCard";
import ObservationStats from "@/components/ObservationStats";
import { ChartSkeleton, ObservationSkeleton } from "@/components/Skeletons";
import { useBackfill } from "@/hooks/useBackfill";
import { useFieldHistory } from "@/hooks/useFieldHistory";
import { useFields } from "@/hooks/useFields";
import { useOverlay } from "@/hooks/useOverlay";
import { api, errorText, type FieldLayer, type Position } from "@/lib/api";
import { daysAgo, formatDate, formatIndex, type IndexName, INDICES, isoDate } from "@/lib/ndvi";

// MapView redraws the draft when this array changes, so "not drawing" uses one constant array.
const NO_POINTS: Position[] = [];

export default function FieldMonitor() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A counter, not a flag: the first finished action must not enable the buttons while another one runs.
  const [pending, setPending] = useState(0);
  const busy = pending > 0;
  const [computing, setComputing] = useState(false);

  const { fields, loading: fieldsLoading, selectedId, setSelectedId, reload: reloadFields } = useFields(setError);
  const {
    history,
    selected: observation,
    select: selectObservation,
    loading: historyLoading,
    reload: reloadHistory,
  } = useFieldHistory(selectedId, setError);
  const backfill = useBackfill(selectedId, reloadHistory, setMessage, setError);

  // The index of the chart, the selected row and the report. An index layer on the map follows it.
  const [index, setIndex] = useState<IndexName>("ndvi");
  const [showRgb, setShowRgb] = useState(false);
  const layer: FieldLayer = showRgb ? "rgb" : index;
  const overlay = useOverlay(observation, layer, setError);

  const [basemap, setBasemap] = useState<Basemap>("satellite");
  const [searchTarget, setSearchTarget] = useState<SearchTarget | null>(null);
  // null: the user does not draw a field.
  const [draftPoints, setDraftPoints] = useState<Position[] | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const closeReport = useCallback(() => setReportOpen(false), []);

  const selectedField = fields.find((field) => field.id === selectedId) ?? null;

  // Run an API action, show its error, and keep the buttons disabled while it runs.
  const run = async (action: () => Promise<void>) => {
    setPending((count) => count + 1);
    setError(null);
    setMessage(null);
    try {
      await action();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending((count) => count - 1);
    }
  };

  const selectLayer = (value: FieldLayer) => {
    setShowRgb(value === "rgb");
    if (value !== "rgb") setIndex(value);
  };

  // Selecting a field ends the drawing mode.
  const selectField = (id: number) => {
    setDraftPoints(null);
    setReportOpen(false);
    setSelectedId(id);
  };

  const startDrawing = () => {
    setSelectedId(null);
    setReportOpen(false);
    setDraftPoints([]);
  };

  const saveField = (points: Position[], name: string) =>
    run(async () => {
      const created = await api.createField(name, { type: "Polygon", coordinates: [[...points, points[0]]] });
      setDraftPoints(null);
      await reloadFields();
      setSelectedId(created.id);
      setMessage(`«${created.properties.name}» maydoni saqlandi (raqami: ${created.id}).`);
    });

  const computeIndices = (fieldId: number) => {
    setComputing(true);
    run(async () => {
      const created = await api.computeNdvi(fieldId, daysAgo(30), isoDate(new Date()));
      await reloadHistory(fieldId);
      selectObservation(created);
      setMessage(
        `Indekslar hisoblandi: ${formatDate(created.observed_on)}, oʻrtacha NDVI ${formatIndex(created.ndvi_mean)}.`,
      );
    }).finally(() => setComputing(false));
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

        <AccountCard />

        {draftPoints ? (
          <DrawingCard
            points={draftPoints}
            busy={busy}
            onUndo={() => setDraftPoints((points) => points && points.slice(0, -1))}
            onCancel={() => setDraftPoints(null)}
            onSave={(name) => saveField(draftPoints, name)}
          />
        ) : (
          <button type="button" className="btn btn-primary" onClick={startDrawing} disabled={busy}>
            <PlusIcon size={16} />
            Yangi maydon chizish
          </button>
        )}

        <FieldList fields={fields} loading={fieldsLoading} selectedId={selectedId} onSelect={selectField} />

        {selectedField && (
          <>
            <SelectedFieldCard
              field={selectedField}
              busy={busy}
              computing={computing}
              backfillJob={backfill.job}
              onCompute={() => computeIndices(selectedField.id)}
              onBackfill={() => run(() => backfill.start(selectedField.id))}
            />

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
              <IndexTabs value={index} onChange={setIndex} />
              <p className="meta index-caption">{INDICES[index].caption}</p>
              {historyLoading ? (
                <ChartSkeleton />
              ) : (
                <NdviChart
                  observations={history}
                  selectedId={observation?.id ?? null}
                  onSelect={selectObservation}
                  index={index}
                />
              )}
            </section>

            {historyLoading && <ObservationSkeleton />}

            {observation && (
              <section className="card" aria-labelledby="st-title">
                <h2 id="st-title">Tanlangan kuzatuv</h2>
                <ObservationStats observation={observation} index={index} onSelectIndex={setIndex} />
              </section>
            )}

            {observation?.nitrogen_advice && observation.ndre_mean !== null && (
              <NitrogenCard advice={observation.nitrogen_advice} ndre={observation.ndre_mean} />
            )}
          </>
        )}
      </aside>

      <main className="map-wrap">
        <MapSearch onSelect={setSearchTarget} />
        <BasemapSwitch value={basemap} onChange={setBasemap} />
        <MapView
          fields={fields}
          selectedId={selectedId}
          onSelectField={selectField}
          drawing={draftPoints !== null}
          draftPoints={draftPoints ?? NO_POINTS}
          onAddPoint={(point) => setDraftPoints((points) => points && [...points, point])}
          overlay={overlay.image}
          basemap={basemap}
          searchTarget={searchTarget}
          onLocateError={setError}
        />
        <Toasts
          busy={busy}
          message={message}
          error={error}
          onCloseMessage={() => setMessage(null)}
          onCloseError={() => setError(null)}
        />
        <LayerLegend layer={layer} loading={overlay.loading} observation={observation} onSelect={selectLayer} />
      </main>

      {reportOpen && selectedField && (
        <NdviReport
          field={selectedField}
          observations={history}
          selected={observation}
          onSelect={selectObservation}
          index={index}
          onSelectIndex={setIndex}
          onClose={closeReport}
        />
      )}
    </div>
  );
}
