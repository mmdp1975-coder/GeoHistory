// src/app/page.js
"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FiltersBar from "../components/FiltersBar";
import DetailsPanel from "../components/DetailsPanel";
import { getEvents } from "../lib/api";
import TourControls from "../components/TourControls";
import TimelineSlider from "../components/TimelineSlider";

const MapView = dynamic(() => import("../components/MapView"), { ssr: false });

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

/* ===== Helpers anni + inferenza era ===== */
function toNum(n) { if (n === 0) return 0; const v = Number(n); return Number.isFinite(v) ? v : undefined; }
const BC_TOKENS_RE = /\b(a\s*\.?\s*c\.?|ante\s+cristo|bc|bce)\b/i;
function inferEra(row) {
  const raw = String(row?.era || "").trim().toUpperCase();
  if (raw === "BC" || raw === "AD") return raw;
  const yf = toNum(row?.year_from), yt = toNum(row?.year_to);
  if (yf !== undefined && yt !== undefined && yf > yt) return "BC";
  const txt = [row?.event_it,row?.event_en,row?.event,row?.description_it,row?.description_en,row?.description].filter(Boolean).join(" ");
  if (BC_TOKENS_RE.test(txt)) return "BC";
  return "AD";
}
function getSignedStartEnd(ev) {
  const era = inferEra(ev);
  const yf = toNum(ev?.year_from), yt = toNum(ev?.year_to);
  if (yf !== undefined && yt !== undefined) {
    if (era === "BC") return { s: -Math.max(yf, yt), e: -Math.min(yf, yt), era };
    return { s: Math.min(yf, yt), e: Math.max(yf, yt), era };
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
  ev.__start = s; ev.__end = e; ev.__era = era;
  return ev;
}

/* ===== Search token + alias ===== */
const ALIASES = {
  rome: ["rome", "roma"], florence: ["florence", "firenze"], milan: ["milan", "milano"],
  turin: ["turin", "torino"], venice: ["venice", "venezia"], naples: ["naples", "napoli"],
  genoa: ["genoa", "genova"], padua: ["padua", "padova"], verona: ["verona"],
  bologna: ["bologna"], pisa: ["pisa"],
};
const normLocal = (s) => String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[’'`"“”„]/g,"'").replace(/…/g,"...").replace(/\s+/g," ").trim();
const tokenize = (t) => normLocal(t).split(/[^a-z0-9]+/).filter(Boolean);
const expandAliases = (t) => { const k=normLocal(t); const set=new Set([k]); const ali=ALIASES[k]; if(ali) ali.forEach(a=>set.add(normLocal(a))); return set; };
function wholeWordMatch(ev, q) {
  if (!q) return true;
  const hay = [
    ev.event, ev.event_it, ev.event_en,
    ev.title, ev.title_it, ev.title_en,
    ev.description, ev.description_it, ev.description_en, ev.desc, ev.desc_it, ev.desc_en,
    ev.group_event, ev.group_event_it, ev.group_event_en,
    ev.tags, ev.figures, ev.continent, ev.country, ev.location
  ].filter(Boolean).join(" | ");
  const hayTokens = new Set(tokenize(hay));
  const queryTokens = tokenize(q);
  return queryTokens.every(t => {
    const aliases = expandAliases(t);
    for (const a of aliases) if (hayTokens.has(a)) return true;
    return false;
  });
}

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

  const listRef = useMemo(() => (markers.length ? markers : events), [markers, events]);

  /* ===== FETCH + FILTRI + ORDINAMENTO ===== */
  const fetchEventsApply = useCallback(async () => {
    // ⛔️ NON mandiamo più year_start/year_end al backend
    const baseParams = {
      lang: (lang || "it").toUpperCase(),
      q, group, continent, country, location,
      limit: 20000
    };

    const rows = await getEvents(baseParams);

    console.log("ENH-01 DEBUG — backend rows:", rows?.length ?? 0, {
      sent: { group, continent, country, location, q }
    });

    let list = (rows || []).map(r => normalizeRow(r, lang));

    // search locale
    if (q) list = list.filter(ev => wholeWordMatch(ev, q));

    // filtro temporale SOLO lato client
    const beforeTime = list.length;
    list = list.filter(ev => {
      const s = ev.__start, e = ev.__end;
      if (s === undefined && e === undefined) return true;
      const from = (s !== undefined ? s : e);
      const to   = (e !== undefined ? e : s);
      return !(to < period.start || from > period.end);
    });
    console.log("ENH-01 DEBUG — after time filter:", list.length, "(before:", beforeTime, ")",
      { periodStart: period.start, periodEnd: period.end });

    // ordina cronologico stabile
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
        return A.idx - B.idx;
      })
      .map(x => x.it);

    const m = list.filter(r => Number.isFinite(r.latitude) && Number.isFinite(r.longitude));
    setEvents(list);
    setMarkers(m);
    setSelected(null);
    setFocusEvent(null);

    // aggiorna bounds derivati solo se la lista è “sana”
    if (list.length >= 10) {
      const { min: bMin, max: bMax } = getYearRangeFromRows(list, ABS_MIN, ABS_MAX);
      setBounds({ min: bMin, max: bMax, source: "derived" });
    } else {
      setBounds(b => ({ ...b, source: "stable" }));
    }

    console.log("ENH-01 DEBUG — markers:", m.length, "events:", list.length);
  }, [lang, q, group, continent, country, location, period.start, period.end]);

  // === Auto-apply SOLO dopo interazione utente sulla timeline ===
  const userTouchedTimeline = useRef(false);
  const debounceRef = useRef(0);

  const onTimelineChange = useCallback((s, e) => {
    userTouchedTimeline.current = true;
    setActivated(true);
    setPeriod({ start: clamp(s, bounds.min, bounds.max), end: clamp(e, bounds.min, bounds.max) });
  }, [bounds.min, bounds.max]);

  useEffect(() => {
    if (!userTouchedTimeline.current) return; // no fetch al primo render
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchEventsApply();
      setFitSignal(v => v + 1);
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [period.start, period.end, fetchEventsApply]);

  // === Campi numerici Min/Max: marcano come interazione utente ===
  const onMinInput = (v) => {
    userTouchedTimeline.current = true;
    setActivated(true);
    const val = clamp(parseInt(v || 0, 10), bounds.min, Math.min(bounds.max, period.end));
    setPeriod(p => ({ ...p, start: val }));
  };
  const onMaxInput = (v) => {
    userTouchedTimeline.current = true;
    setActivated(true);
    const val = clamp(parseInt(v || 0, 10), Math.max(bounds.min, period.start), bounds.max);
    setPeriod(p => ({ ...p, end: val }));
  };

  // === Applica dai filtri (pulsante Apply & Close) ===
  const onApplyAndClose = useCallback(async () => {
    setActivated(true);
    await fetchEventsApply();
    setFitSignal(v => v + 1);
    setFiltersOpen(false);
  }, [fetchEventsApply]);

  /* ======== Tour ======== */
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused,  setIsPaused ] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [resumeSignal, setResumeSignal] = useState(0);
  const [speakSignal,  setSpeakSignal ] = useState(0);

  const computeOffset = useCallback(() => {
    const isMobile = typeof window !== "undefined" && window.innerWidth <= 1024;
    if (!isMobile) return { x: 0, y: 0 };
    const h = (selected && bottomSheetRef.current) ? bottomSheetRef.current.getBoundingClientRect().height : 0;
    return { x: 0, y: Math.round(h * 0.55) };
  }, [selected, bottomSheetRef]);

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

  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <div className="gh-app">
      <header className="gh-header">
        <div className="gh-logo">
          <Image src="/logo.png" alt="GeoHistory Journey" fill sizes="(max-width: 768px) 160px, 200px" priority style={{ objectFit: "contain" }} />
        </div>
      </header>

      {/* ===== TIMELINE (Min, Slider, Max, Reset su UNA riga) ===== */}
      <div className="gh-time">
        <label className="gh-mm">
          <span>Min</span>
          <input type="number" value={period.start} onChange={(e) => onMinInput(e.target.value)} />
        </label>

        <TimelineSlider
          min={bounds.min}
          max={bounds.max}
          start={period.start}
          end={period.end}
          onChange={onTimelineChange}
        />

        <label className="gh-mm">
          <span>Max</span>
          <input type="number" value={period.end} onChange={(e) => onMaxInput(e.target.value)} />
        </label>

        <button
          onClick={() => {
            // reset “pulito”: niente fetch finché non tocchi di nuovo la timeline
            userTouchedTimeline.current = false;
            setActivated(false);
            const NOW = new Date().getFullYear();
            setBounds({ min: -5000, max: NOW, source: "default" });
            setPeriod({ start: -5000, end: NOW });
            setEvents([]); setMarkers([]); setSelected(null); setFocusEvent(null);
            setCurrentIndex(-1); setIsPlaying(false); setIsPaused(false);
          }}
          className="gh-btn-reset"
          title="Ripristina dominio e range iniziali"
        >
          Reset Range
        </button>
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
              {/* Card timeline (solo visiva) */}
              <div className="gh-card">
                <div className="gh-card-title">Timeline (read-only)</div>
                <div className="gh-card-meta">
                  <span>{period.start < 0 ? `${Math.abs(period.start)} a.C.` : `${period.start} d.C.`}</span>
                  <span>→</span>
                  <span>{period.end < 0 ? `${Math.abs(period.end)} a.C.` : `${period.end} d.C.`}</span>
                </div>
                <div className="gh-mini-track">
                  <div
                    className="gh-mini-fill"
                    style={{
                      left: `${(100*(period.start - bounds.min))/(bounds.max - bounds.min)}%`,
                      width:`${(100*(period.end   - bounds.min))/(bounds.max - bounds.min) - (100*(period.start - bounds.min))/(bounds.max - bounds.min)}%`
                    }}
                  />
                </div>
                <div className="gh-note">Card informativa: lo stato è condiviso con lo slider in alto.</div>
              </div>

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

      {(activated && (markers.length || events.length)) && (
        <TourControls
          lang={(lang || "it").toLowerCase() === "en" ? "en" : "it"}
          isPlaying={isPlaying}
          selectedEvent={selected}
          hasResults={(markers.length || events.length) > 0}
          resumeSignal={resumeSignal}
          speakSignal={speakSignal}
          onPlay={onPlay}
          onPause={onPause}
          onPrev={onPrev}
          onNext={onNext}
        />
      )}

      <style jsx>{`
        .gh-time {
          position: sticky; top: 0; z-index: 40;
          display: grid; grid-template-columns: 140px 1fr 140px 120px;
          gap: 10px; align-items: center;
          padding: 10px 14px;
          background: rgba(255,255,255,0.9);
          backdrop-filter: saturate(180%) blur(6px);
          border-bottom: 1px solid #e5e7eb;
          width: 100%; min-width: 0; overflow: hidden;
        }
        .gh-mm { display: grid; grid-template-columns: 34px 1fr; align-items: center; gap: 8px; min-width: 0; }
        .gh-mm span { font-size: 12px; font-weight: 700; color: #6b7280; }
        .gh-mm input {
          width: 100%; height: 40px; padding: 6px 10px; border: 1px solid #e5e7eb; border-radius: 10px; font-size: 14px;
          background: #fff; outline: none;
        }
        .gh-mm input:focus { border-color: #93c5fd; box-shadow: 0 0 0 3px rgba(59,130,246,0.25); }
        .gh-btn-reset { height: 40px; border: 1px solid #e5e7eb; border-radius: 10px; background: #fff; font-weight: 700; cursor: pointer; }
        .gh-btn-reset:hover { background: #f9fafb; }

        .gh-card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; background: #fff; margin-bottom: 12px; }
        .gh-card-title { font-weight: 700; color: #374151; margin-bottom: 6px; }
        .gh-card-meta { display: flex; gap: 8px; align-items: baseline; color: #4b5563; font-size: 14px; }
        .gh-mini-track { position: relative; height: 8px; border-radius: 999px; background: #e5e7eb; margin-top: 8px; overflow: hidden; }
        .gh-mini-fill { position: absolute; top: 0; bottom: 0; background: #3b82f6; }
      `}</style>
    </div>
  );
}
