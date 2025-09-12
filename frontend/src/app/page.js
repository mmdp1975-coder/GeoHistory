"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import FiltersBar from "../components/FiltersBar";
import DetailsPanel from "../components/DetailsPanel";
import { getEvents } from "../lib/api";
import TourControls from "../components/TourControls";

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

/* ===== Helpers anni + inferenza era ===== */
function toNum(n) {
  if (n === 0) return 0;
  const v = Number(n);
  return Number.isFinite(v) ? v : undefined;
}

const BC_TOKENS_RE = /\b(a\s*\.?\s*c\.?|ante\s+cristo|bc|bce)\b/i;

/** Normalizza 'era' (BC/AD) con fallback se mancante/sbagliata */
function inferEra(row) {
  const raw = String(row?.era || "").trim().toUpperCase();
  if (raw === "BC" || raw === "AD") return raw;

  const yf = toNum(row?.year_from);
  const yt = toNum(row?.year_to);

  // 1) Intervallo "al contrario" (tipico dei BC salvati come positivi): from > to
  if (yf !== undefined && yt !== undefined && yf > yt) return "BC";

  // 2) Indicatori nel testo (titolo/descrizione)
  const txt = [
    row?.event_it, row?.event_en, row?.event,
    row?.description_it, row?.description_en, row?.description
  ].filter(Boolean).join(" ");
  if (BC_TOKENS_RE.test(txt)) return "BC";

  // 3) Default
  return "AD";
}

/** Calcola start/end firmati per sort/filtri, usando l'era inferita */
function getSignedStartEnd(ev) {
  const era = inferEra(ev);
  const yf = toNum(ev?.year_from);
  const yt = toNum(ev?.year_to);

  if (yf !== undefined && yt !== undefined) {
    if (era === "BC") {
      // BC: numeri più grandi = più antichi → start = -max, end = -min
      return { s: -Math.max(yf, yt), e: -Math.min(yf, yt), era };
    } else {
      return { s: Math.min(yf, yt), e: Math.max(yf, yt), era };
    }
  }
  if (yf !== undefined) return { s: (era === "BC" ? -yf : yf), e: (era === "BC" ? -yf : yf), era };
  if (yt !== undefined) return { s: (era === "BC" ? -yt : yt), e: (era === "BC" ? -yt : yt), era };
  return { s: undefined, e: undefined, era };
}

function getYearRangeFromRows(rows, ABS_MIN, ABS_MAX) {
  let min = +Infinity, max = -Infinity;
  for (const r of rows || []) {
    const { s, e } = getSignedStartEnd(r);
    if (s !== undefined) min = Math.min(min, s);
    if (e !== undefined) max = Math.max(max, e);
  }
  if (!Number.isFinite(min)) min = ABS_MIN;
  if (!Number.isFinite(max)) max = ABS_MAX;
  if (min > max) [min, max] = [max, min];
  return { min, max };
}

function normalizeRow(row, langCode) {
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

  const { s, e, era } = getSignedStartEnd(ev);
  ev.__start = s;
  ev.__end = e;
  ev.__era = era; // era “pulita”/inferita per la UI
  return ev;
}

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'`"“”„]/g, "'")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ").trim();
}

/* ===== Pagina ===== */
export default function Page() {
  const [lang, setLang] = useState((process.env.NEXT_PUBLIC_LANG || "it").toLowerCase());
  const [q, setQ] = useState("");
  const [continent, setContinent] = useState("");
  const [country, setCountry] = useState("");
  const [location, setLocation] = useState("");
  const [group, setGroup] = useState("");

  const [activated, setActivated] = useState(false);

  const ABS_MIN = -5000;
  const ABS_MAX = new Date().getFullYear();
  const [bounds, setBounds] = useState({ min: ABS_MIN, max: ABS_MAX, source: "default" });
  const [period, setPeriod] = useState({ start: ABS_MIN, end: ABS_MAX });

  const [events, setEvents] = useState([]);
  const [markers, setMarkers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [focusEvent, setFocusEvent] = useState(null);

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

  /* ===== FETCH + FILTRI + SORT ===== */
  const fetchEventsApply = useCallback(async () => {
    const baseParams = { lang: lang.toUpperCase(), q, continent, country, location, limit: 10000 };

    // 1) bounds reali
    const pre = await getEvents(baseParams);
    const preNorm = (pre || []).map(r => normalizeRow(r, lang));
    const { min: bMin, max: bMax } = getYearRangeFromRows(preNorm, ABS_MIN, ABS_MAX);
    setBounds({ min: bMin, max: bMax, source: "derived" });
    setPeriod({ start: bMin, end: bMax });

    // 2) dati + normalizza
    const rows = await getEvents(baseParams);
    let list = (rows || []).map(r => normalizeRow(r, lang));

    // filtro group se presente
    if (group) {
      const g = norm(group);
      list = list.filter(ev => {
        const fields = [ev.group_event, ev.group_event_it, ev.group_event_en, ev.group, ev.group_it, ev.group_en].map(norm);
        return fields.some(f => f === g || f.includes(g));
      });
    }

    // filtro periodo su start/end firmati
    list = list.filter(ev => {
      const s = ev.__start, e = ev.__end;
      if (s === undefined && e === undefined) return true;
      const from = (s !== undefined ? s : e);
      const to   = (e !== undefined ? e : s);
      return !(to < period.start || from > period.end);
    });

    // === ORDINAMENTO CRONOLOGICO ASC (più antico → più recente) ===
    list = list
      .map((it, idx) => ({ it, idx }))
      .sort((A, B) => {
        const a = A.it, b = B.it;
        const as = a.__start ?? a.__end ?? 0;
        const bs = b.__start ?? b.__end ?? 0;
        if (as !== bs) return as - bs;
        const ae = a.__end ?? a.__start ?? 0;
        const be = b.__end ?? b.__start ?? 0;
        if (ae !== be) return ae - be;
        return A.idx - B.idx; // stabilità
      })
      .map(x => x.it);

    const m = list.filter(r => Number.isFinite(r.latitude) && Number.isFinite(r.longitude));
    setEvents(list);
    setMarkers(m);
    setSelected(null);
    setFocusEvent(null);
    setCurrentIndex(-1);
  }, [lang, q, continent, country, location, group, period.start, period.end]);

  const onApplyAndClose = useCallback(async () => {
    setActivated(true);
    await fetchEventsApply();
    setFitSignal(v => v + 1);
    setFiltersOpen(false);
  }, [fetchEventsApply]);

  const onResetRange = useCallback(() => {
    setActivated(false);
    setBounds({ min: ABS_MIN, max: ABS_MAX, source: "default" });
    setPeriod({ start: ABS_MIN, end: ABS_MAX });
    setEvents([]); setMarkers([]); setSelected(null); setFocusEvent(null);
    setCurrentIndex(-1);
    setIsPlaying(false);
    setIsPaused(false);
  }, []);

  /* ===== Tour controls ===== */
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused]   = useState(false);
  const [resumeSignal, setResumeSignal] = useState(0);
  const [speakSignal, setSpeakSignal]   = useState(0);

  const listRef = useMemo(() => (markers.length ? markers : events), [markers, events]);

  const setByIndex = useCallback((idx) => {
    const list = listRef;
    if (!list.length) return;
    const clamped = Math.max(0, Math.min(idx, list.length - 1));
    const ev = list[clamped];
    setCurrentIndex(clamped);
    setSelected(ev);
    setPanOffsetPx(computeOffset());
    setFocusEvent(ev);
  }, [listRef, computeOffset]);

  const onPlay = useCallback(() => {
    const list = listRef;
    if (!list.length) return;

    if (isPaused && selected) {
      setIsPaused(false);
      setIsPlaying(true);
      setResumeSignal(s => s + 1);
      return;
    }
    setIsPaused(false);
    setIsPlaying(true);
    if (currentIndex < 0 || !selected) {
      setByIndex(0);
      setTimeout(() => setSpeakSignal(s => s + 1), 0);
    } else {
      setSpeakSignal(s => s + 1);
    }
  }, [listRef, isPaused, selected, currentIndex, setByIndex]);

  const onPause = useCallback(() => { setIsPaused(true); setIsPlaying(false); }, []);
  const onNext  = useCallback(() => { const list=listRef; if (!list.length) return; const i=(currentIndex<0?0:currentIndex+1); setIsPaused(false); setIsPlaying(true); setByIndex(i); setTimeout(()=>setSpeakSignal(s=>s+1),0); }, [listRef,currentIndex,setByIndex]);
  const onPrev  = useCallback(() => { const list=listRef; if (!list.length) return; const i=(currentIndex<0?0:currentIndex-1); setIsPaused(false); setIsPlaying(true); setByIndex(i); setTimeout(()=>setSpeakSignal(s=>s+1),0); }, [listRef,currentIndex,setByIndex]);

  useEffect(() => { if (!activated || listRef.length === 0) { setIsPlaying(false); setIsPaused(false); } }, [activated, listRef.length]);

  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <div className="gh-app">
      <header className="gh-header">
        <div className="gh-logo">
          <Image src="/logo.png" alt="GeoHistory Journey" fill sizes="(max-width: 768px) 160px, 200px" priority style={{ objectFit: "contain" }} />
        </div>
      </header>

      <div className="gh-time">
        <label className="gh-mm">
          <span>Min</span>
          <input type="number" value={period.start} onChange={(e) => {
            const v = clamp(parseInt(e.target.value || 0, 10), bounds.min, Math.min(bounds.max, period.end));
            setPeriod(p => ({ ...p, start: v }));
          }} />
        </label>

        <RangeSlider
          min={bounds.min} max={bounds.max}
          start={period.start} end={period.end}
          onChange={(s, e) => setPeriod({ start: clamp(s, bounds.min, bounds.max), end: clamp(e, bounds.min, bounds.max) })}
        />

        <label className="gh-mm">
          <span>Max</span>
          <input type="number" value={period.end} onChange={(e) => {
            const v = clamp(parseInt(e.target.value || 0, 10), Math.max(bounds.min, period.start), bounds.max);
            setPeriod(p => ({ ...p, end: v }));
          }} />
        </label>

        <button onClick={onResetRange} className="gh-btn-reset">Reset Range</button>
      </div>

      <div className="gh-main">
        <section className="gh-map-panel">
          <MapView
            markers={activated ? (markers.length ? markers : events) : []}
            selectedId={selected?.id ?? null}
            onSelect={(ev) => {
              setSelected(ev);
              setPanOffsetPx(computeOffset());
              setFocusEvent(ev);
              if (isPlaying) setSpeakSignal(s => s + 1);
            }}
            focusEvent={focusEvent}
            panOffsetPx={panOffsetPx}
            fitSignal={fitSignal}
            fitPadding={typeof window !== "undefined" && window.innerWidth >= 1025
              ? { top: 24, right: 420, bottom: 24, left: 24 }
              : { top: 24, right: 24, bottom: 24, left: 24 }}
          />
        </section>

        <aside className="gh-details">
          <DetailsPanel event={selected} lang={lang} />
        </aside>
      </div>

      <button className="gh-fab" onClick={() => setFiltersOpen(true)} aria-label="Open Filters" title="Open Filters">Filters</button>

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
                onFiltersChanged={() => {}}
              />
            </div>
          </div>
        </div>
      )}

      <div ref={bottomSheetRef} className={`gh-bottomsheet ${selected ? "open" : ""}`}>
        <div className="grabber" />
        <div className="inner"><DetailsPanel event={selected} lang={lang} /></div>
      </div>

      {(activated && resultsLen > 0) && (
        <TourControls
          lang={(lang || "it").toLowerCase() === "en" ? "en" : "it"}
          isPlaying={isPlaying}
          selectedEvent={selected}
          hasResults={resultsLen > 0}
          resumeSignal={resumeSignal}
          speakSignal={speakSignal}
          onPlay={onPlay}
          onPause={onPause}
          onPrev={onPrev}
          onNext={onNext}
        />
      )}
    </div>
  );
}
