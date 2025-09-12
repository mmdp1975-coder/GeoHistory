"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { useCallback, useMemo, useRef, useState } from "react";
import FiltersBar from "../components/FiltersBar";
import DetailsPanel from "../components/DetailsPanel";
import { getEvents } from "../lib/api"; // ← rimosso getBounds

const MapView = dynamic(() => import("../components/MapView"), { ssr: false });

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

/* ===== RangeSlider ===== */
function RangeSlider({ min, max, start, end, onChange }) {
  const trackRef = useRef(null);
  const draggingRef = useRef(null);
  const range = Math.max(1, (max - min));
  const clampPct = (pct) => Math.max(0, Math.min(100, pct));
  const pctToValue = (pct) => Math.round(clamp(min + (pct / 100) * range, min, max));
  const onDown = (clientX, which) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const pct = clampPct(((clientX - rect.left) / rect.width) * 100);
    const val = pctToValue(pct);
    if (which === "start") onChange?.(Math.min(val, end ?? max), end ?? max);
    else onChange?.(start ?? min, Math.max(val, start ?? min));
  };
  const pick = (clientX) => {
    const rect = trackRef.current.getBoundingClientRect();
    const sPct = ((start - min) / range) * rect.width;
    const ePct = ((end - min) / range) * rect.width;
    const pxS = rect.left + sPct;
    const pxE = rect.left + ePct;
    return Math.abs(clientX - pxS) <= Math.abs(clientX - pxE) ? "start" : "end";
  };
  return (
      <>
        <div
          ref={trackRef}
          className="gh-track"
          role="group"
          aria-label="Time range"
          onMouseDown={(e) => {
            draggingRef.current = pick(e.clientX);
            onDown(e.clientX, draggingRef.current);
            const mm = (ev) => onDown(ev.clientX, draggingRef.current);
            const mu = () => { draggingRef.current = null; window.removeEventListener("mousemove", mm); window.removeEventListener("mouseup", mu); };
            window.addEventListener("mousemove", mm); window.addEventListener("mouseup", mu); e.preventDefault();
          }}
          onTouchStart={(e) => {
            const t = e.touches[0]; if (!t) return;
            draggingRef.current = pick(t.clientX);
            onDown(t.clientX, draggingRef.current);
            const tm = (ev) => { const tt = ev.touches[0]; if (tt) onDown(tt.clientX, draggingRef.current); };
            const te = () => { draggingRef.current = null; window.removeEventListener("touchmove", tm); window.removeEventListener("touchend", te); };
            window.addEventListener("touchmove", tm, { passive: false }); window.addEventListener("touchend", te);
          }}
        >
          <div className="gh-range-fill" style={{ left: `${(start - min) / (max - min) * 100}%`, width: `${Math.max(0, ((end - start) / (max - min)) * 100)}%` }} />
          <button className="gh-handle" style={{ left: `${(start - min) / (max - min) * 100}%` }} aria-label="Start year" />
          <button className="gh-handle" style={{ left: `${(end - min) / (max - min) * 100}%` }} aria-label="End year" />
        </div>
        <style jsx>{`
          .gh-track { flex: 1 1 auto; position: relative; height: 8px; background: #e5e7eb; border-radius: 999px; cursor: pointer; user-select: none; touch-action: none; }
          .gh-range-fill { position: absolute; top: 0; bottom: 0; background: #3b82f6; border-radius: 999px; }
          .gh-handle { position: absolute; top: 50%; transform: translate(-50%, -50%); width: 18px; height: 18px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 0 1px rgba(0,0,0,.2); background: #111827; cursor: grab; }
        `}</style>
      </>
  );
}

/* ===== util: ricava min/max anni dai rows in modo robusto ===== */
function getYearRangeFromRows(rows, ABS_MIN, ABS_MAX) {
  let min = +Infinity, max = -Infinity;
  for (const r of rows || []) {
    const candsStart = [r.year_start, r.start_year, r.from_year, r.year]
      .map(x => (x === 0 ? 0 : Number(x)))
      .filter(Number.isFinite);
    const candsEnd   = [r.year_end, r.end_year, r.to_year, r.year]
      .map(x => (x === 0 ? 0 : Number(x)))
      .filter(Number.isFinite);
    if (candsStart.length) min = Math.min(min, Math.min(...candsStart));
    if (candsEnd.length)   max = Math.max(max, Math.max(...candsEnd));
  }
  if (!Number.isFinite(min)) min = ABS_MIN;
  if (!Number.isFinite(max)) max = ABS_MAX;
  if (min > max) [min, max] = [max, min];
  return { min, max };
}

export default function Page() {
  /* ===== stato filtri ===== */
  const [lang, setLang] = useState((process.env.NEXT_PUBLIC_LANG || "it").toLowerCase());
  const [q, setQ] = useState("");
  const [continent, setContinent] = useState("");
  const [country, setCountry] = useState("");
  const [location, setLocation] = useState("");
  const [group, setGroup] = useState("");

  /* ===== gating: mostra risultati solo dopo Apply ===== */
  const [activated, setActivated] = useState(false);

  /* ===== tempo minimo assoluto ===== */
  const ABS_MIN = -3000;
  const ABS_MAX = new Date().getFullYear();

  /* ===== bounds + periodo (i bounds reali si allineano su Apply) ===== */
  const [bounds, setBounds] = useState({ min: ABS_MIN, max: ABS_MAX, source: "default" });
  const [period, setPeriod] = useState({ start: ABS_MIN, end: ABS_MAX });

  /* ===== dati ===== */
  const [events, setEvents] = useState([]);
  const [markers, setMarkers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [focusEvent, setFocusEvent] = useState(null);

  /* ===== mappa ===== */
  const [fitSignal, setFitSignal] = useState(0);
  const bottomSheetRef = useRef(null);
  const [panOffsetPx, setPanOffsetPx] = useState({ x: 0, y: 0 });

  const computeOffset = useCallback(() => {
    const isMobile = typeof window !== "undefined" && window.innerWidth <= 1024;
    if (!isMobile) return { x: 0, y: 0 };
    const h = (selected && bottomSheetRef.current)
      ? bottomSheetRef.current.getBoundingClientRect().height
      : 0;
    return { x: 0, y: Math.round(h * 0.55) };
  }, [selected]);

  const resultsLen = useMemo(() => (markers.length || events.length), [markers.length, events.length]);

  /* ===== normalizzazione ===== */
  const normalizeI18n = useCallback((row, langCode) => {
    const L = (langCode || "it").toLowerCase();
    const isIt = L === "it";
    const ev = {
      ...row,
      event: isIt ? (row.event_it ?? row.event_en ?? row.event) : (row.event_en ?? row.event_it ?? row.event),
      group_event: isIt ? (row.group_event_it ?? row.group_event_en ?? row.group_event) : (row.group_event_en ?? row.group_event_it ?? row.group_event),
      description: isIt ? (row.description_it ?? row.description_en ?? row.description) : (row.description_en ?? row.description_it ?? row.description),
      wikipedia: isIt ? (row.wikipedia_it ?? row.wikipedia_en ?? row.wikipedia) : (row.wikipedia_en ?? row.wikipedia_it ?? row.wikipedia),
    };
    const lat = ev.latitude ?? ev.lat ?? ev.Latitude ?? ev.y ?? null;
    const lon = ev.longitude ?? ev.lng ?? ev.lon ?? ev.Longitude ?? ev.x ?? null;
    ev.latitude = Number.isFinite(lat) ? lat : (lat != null ? Number(lat) : null);
    ev.longitude = Number.isFinite(lon) ? lon : (lon != null ? Number(lon) : null);
    return ev;
  }, []);

  /* ===== fetch helpers (Apply) ===== */
  const fetchEventsApply = useCallback(async () => {
    // 1) fetch preliminare senza range per calcolare bounds reali
    const baseParams = {
      lang: lang.toUpperCase(),
      q, continent, country, location, group,
      limit: 2000
    };
    const preRows = await getEvents(baseParams);
    const preNorm = (preRows || []).map(r => normalizeI18n(r, lang));
    const { min: bMin, max: bMax } = getYearRangeFromRows(preNorm, ABS_MIN, ABS_MAX);

    // 2) allinea bounds + periodo
    setBounds({ min: bMin, max: bMax, source: "derived" });
    setPeriod({ start: bMin, end: bMax });

    // 3) fetch finale con il range determinato
    const rangedParams = {
      ...baseParams,
      year_start: bMin,
      year_end: bMax
    };
    const rows = await getEvents(rangedParams);
    const normalized = (rows || []).map(r => normalizeI18n(r, lang));
    const m = normalized.filter(r => Number.isFinite(r.latitude) && Number.isFinite(r.longitude));
    setEvents(normalized);
    setMarkers(m);
    setSelected(null);
    setFocusEvent(null);
  }, [lang, q, continent, country, location, group, normalizeI18n]);

  /* ===== APPLY (unico punto che scatena il caricamento) ===== */
  const onApplyAndClose = useCallback(async () => {
    setActivated(true);
    await fetchEventsApply();               // carica dati + calcola bounds localmente
    setFitSignal(v => v + 1);               // fai fit ai risultati
    setFiltersOpen(false);
  }, [fetchEventsApply]);

  /* ===== reset totale ===== */
  const onResetRange = useCallback(() => {
    setActivated(false);
    setBounds({ min: ABS_MIN, max: ABS_MAX, source: "default" });
    setPeriod({ start: ABS_MIN, end: ABS_MAX });
    setEvents([]); setMarkers([]); setSelected(null); setFocusEvent(null);
  }, []);

  /* ===== reader bar ===== */
  const listRef = useRef([]);
  const setByIndex = useCallback((idx) => {
    const list = markers.length ? markers : events;
    if (!list.length) return;
    const clamped = Math.max(0, Math.min(idx, list.length - 1));
    const ev = list[clamped];
    setSelected(ev);
    setPanOffsetPx(computeOffset());
    setFocusEvent(ev);
  }, [markers, events, computeOffset]);
  const onPlay = useCallback(() => { const list = markers.length ? markers : events; if (!list.length) return; setByIndex(0); }, [markers, events, setByIndex]);
  const onNext = useCallback(() => { const list = markers.length ? markers : events; if (!list.length) return; const i = Math.max(0, list.findIndex(x => x.id === selected?.id)); setByIndex(i + 1); }, [markers, events, selected, setByIndex]);
  const onPrev = useCallback(() => { const list = markers.length ? markers : events; if (!list.length) return; const i = Math.max(0, list.findIndex(x => x.id === selected?.id)); setByIndex(i - 1); }, [markers, events, selected, setByIndex]);
  const onPause = useCallback(() => {}, []);

  /* ===== UI: filtri overlay ===== */
  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <div className="gh-app">
      {/* Header */}
      <header className="gh-header">
        <div className="gh-logo">
          <Image src="/logo.png" alt="GeoHistory Journey" fill sizes="(max-width: 768px) 160px, 200px" priority style={{ objectFit: "contain" }} />
        </div>
      </header>

      {/* Time range (mostra sempre, ma viene applicato solo con Apply) */}
      <div className="gh-time">
        <label className="gh-mm">
          <span>Min</span>
          <input
            type="number"
            value={period.start}
            onChange={(e) => {
              const v = clamp(parseInt(e.target.value || 0, 10), bounds.min, Math.min(bounds.max, period.end));
              setPeriod(p => ({ ...p, start: v }));
            }}
          />
        </label>

        <RangeSlider
          min={bounds.min} max={bounds.max}
          start={period.start} end={period.end}
          onChange={(s, e) => setPeriod({ start: clamp(s, bounds.min, bounds.max), end: clamp(e, bounds.min, bounds.max) })}
        />

        <label className="gh-mm">
          <span>Max</span>
          <input
            type="number"
            value={period.end}
            onChange={(e) => {
              const v = clamp(parseInt(e.target.value || 0, 10), Math.max(bounds.min, period.start), bounds.max);
              setPeriod(p => ({ ...p, end: v }));
            }}
          />
        </label>

        <button onClick={onResetRange} className="gh-btn-reset">Reset Range</button>
      </div>

      {/* Main */}
      <div className="gh-main">
        <section className="gh-map-panel">
          <MapView
            markers={activated ? markers : []}     // <<< SOLO dopo Apply
            selectedId={selected?.id ?? null}
            onSelect={(ev) => {
              setSelected(ev);
              setPanOffsetPx(computeOffset());
              setFocusEvent(ev);
            }}
            focusEvent={focusEvent}
            panOffsetPx={panOffsetPx}
            fitSignal={fitSignal}
            fitPadding={typeof window !== "undefined" && window.innerWidth >= 1025
              ? { top: 24, right: 420, bottom: 24, left: 24 }
              : { top: 24, right: 24, bottom: 24, left: 24 }}
          />
        </section>

        {/* Dettagli (desktop) */}
        <aside className="gh-details">
          <DetailsPanel event={selected} />
        </aside>
      </div>

      {/* FAB Filters */}
      <button className="gh-fab" onClick={() => setFiltersOpen(true)} aria-label="Open Filters" title="Open Filters">Filters</button>

      {/* Overlay Filters */}
      {filtersOpen && (
        <div className="gh-overlay" onClick={() => setFiltersOpen(false)}>
          <div className="gh-sheet" onClick={(e)=>e.stopPropagation()}>
            <div className="gh-sheet-header">
              <div className="gh-sheet-title">Filters</div>
              <button className="gh-close" onClick={onApplyAndClose}>Apply & Close</button>
            </div>
            <div className="gh-sheet-body">
              <FiltersBar
                lang={lang} setLang={setLang}
                q={q} setQ={setQ}
                continent={continent} setContinent={setContinent}
                country={country} setCountry={setCountry}
                location={location} setLocation={setLocation}
                group={group} setGroup={setGroup}
                period={period}
                onFiltersChanged={() => { /* modalità Apply-only: non facciamo fetch qui */ }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Bottom-sheet (mobile) */}
      <div ref={bottomSheetRef} className={`gh-bottomsheet ${selected ? "open" : ""}`}>
        <div className="grabber" />
        <div className="inner"><DetailsPanel event={selected} /></div>
      </div>

      {/* Reader Bar (solo se ci sono risultati e dopo Apply) */}
      {(activated && resultsLen > 0) && (
        <div className="gh-readerbar" role="toolbar" aria-label="Tour controls">
          <button title="Previous" aria-label="Previous" onClick={onPrev}>⏮</button>
          <button title="Play"     aria-label="Play"    onClick={onPlay}>▶</button>
          <button title="Pause"    aria-label="Pause"   onClick={onPause}>⏸</button>
          <button title="Next"     aria-label="Next"    onClick={onNext}>⏭</button>
        </div>
      )}
    </div>
  );
}
