// src/app/explore/page.js
"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import FiltersBar from "@/components/FiltersBar";
import { getEvents } from "@/lib/api";
import TourControls from "@/components/TourControls";
import TimelineSlider from "@/components/TimelineSlider";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

/* ------------ utils ------------ */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const toNum = (n) => (n === 0 ? 0 : Number.isFinite(Number(n)) ? Number(n) : undefined);
const BC_RE = /\b(a\s*\.?\s*c\.?|ante\s+cristo|bc|bce)\b/i;

function inferEra(row){
  const raw = String(row?.era || "").trim().toUpperCase();
  if (raw === "BC" || raw === "AD") return raw;
  const yf = toNum(row?.year_from), yt = toNum(row?.year_to);
  if (yf !== undefined && yt !== undefined && yf > yt) return "BC";
  const txt = [row?.event_it,row?.event_en,row?.event,row?.description_it,row?.description_en,row?.description].filter(Boolean).join(" ");
  return BC_RE.test(txt) ? "BC" : "AD";
}

function normalizeRow(row, langCode){
  const L = (langCode || "it").toLowerCase();
  const it = L === "it";
  const ev = {
    ...row,
    event: it ? (row.event_it ?? row.event_en ?? row.event) : (row.event_en ?? row.event_it ?? row.event),
    group_event: it ? (row.group_event_it ?? row.group_event_en ?? row.group_event) : (row.group_event_en ?? row.group_event_it ?? row.group_event),
    description: it ? (row.description_it ?? row.description_en ?? row.description) : (row.description_en ?? row.description_it ?? row.description),
    wikipedia: it ? (row.wikipedia_it ?? row.wikipedia_en ?? row.wikipedia) : (row.wikipedia_en ?? row.wikipedia_it ?? row.wikipedia),
  };
  const lat = ev.latitude ?? ev.lat ?? ev.y ?? null;
  const lon = ev.longitude ?? ev.lng ?? ev.x ?? null;
  ev.latitude  = Number.isFinite(lat) ? lat : (lat != null ? Number(lat) : null);
  ev.longitude = Number.isFinite(lon) ? lon : (lon != null ? Number(lon) : null);

  const era = inferEra(ev);
  const yf = toNum(ev?.year_from), yt = toNum(ev?.year_to);
  let s, e;
  if (yf !== undefined && yt !== undefined){
    if (era === "BC"){ s = -Math.max(yf, yt); e = -Math.min(yf, yt); }
    else { s = Math.min(yf, yt); e = Math.max(yf, yt); }
  } else if (yf !== undefined){ const y = era === "BC" ? -yf : yf; s = y; e = y; }
  else if (yt !== undefined){ const y = era === "BC" ? -yt : yt; s = y; e = y; }
  ev.__start = s; ev.__end = e; ev.__era = era;
  return ev;
}

function rangeFromRows(rows, ABS_MIN, ABS_MAX){
  let min = +Infinity, max = -Infinity;
  for (const r of rows || []){
    const s = r.__start, e = r.__end;
    if (s !== undefined) min = Math.min(min, s);
    if (e !== undefined) max = Math.max(max, e);
  }
  if (!Number.isFinite(min)) min = ABS_MIN;
  if (!Number.isFinite(max)) max = ABS_MAX;
  if (min > max) [min, max] = [max, min];
  return { min, max };
}

const filterByPeriod = (list, start, end) => {
  return (list || []).filter(ev => {
    const s = ev.__start, e = ev.__end;
    if (s === undefined && e === undefined) return true;
    const from = s ?? e, to = e ?? s;
    return !(to < start || from > end);
  });
};

/* ---- helpers per “dal–al” ---- */
const eraIsBC = (era) => String(era || "").trim().toUpperCase() === "BC";
function fmtYearByEra(y, era, lang = "it") {
  if (y === undefined || y === null) return "";
  const it = (lang || "it").toLowerCase() === "it";
  if (it) return eraIsBC(era) ? `${y} a.C.` : `${y} d.C.`;
  return eraIsBC(era) ? `${y} BC` : `${y} AD`;
}
function fmtRangeByEra(from, to, era, lang = "it") {
  if (from !== undefined && to !== undefined) {
    if (from === to) return fmtYearByEra(from, era, lang);
    return `${fmtYearByEra(from, era, lang)} – ${fmtYearByEra(to, era, lang)}`;
  }
  if (from !== undefined) return fmtYearByEra(from, era, lang);
  if (to !== undefined)   return fmtYearByEra(to,   era, lang);
  return "";
}

/* ------------ component ------------ */
export default function Page(){
  const [lang, setLang] = useState((process.env.NEXT_PUBLIC_LANG || "it").toLowerCase());
  const [q, setQ] = useState("");
  const [continent, setContinent] = useState("");
  const [country, setCountry] = useState("");
  const [location, setLocation] = useState("");
  const [group, setGroup] = useState("");

  // non caricare all'avvio
  const [activated, setActivated] = useState(false);

  const ABS_MIN = -5000;
  const ABS_MAX = new Date().getFullYear();

  // bounds = dominio visibile; period = intervallo selezionato
  const [bounds, setBounds] = useState({ min: ABS_MIN, max: ABS_MAX });
  const [period, setPeriod] = useState({ start: ABS_MIN, end: ABS_MAX });

  // dataset completo dell’ultimo Apply (no filtro periodo)
  const [allEvents, setAllEvents] = useState([]);

  // vista corrente
  const [events, setEvents] = useState([]);
  const [markers, setMarkers] = useState([]);

  const [selected, setSelected] = useState(null);
  const [focusEvent, setFocusEvent] = useState(null);

  const [fitSignal, setFitSignal] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const bottomSheetRef = useRef(null);
  const [panOffsetPx, setPanOffsetPx] = useState({ x: 0, y: 0 });

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const q = () => setIsMobile(window.matchMedia("(max-width: 768px)").matches);
    q(); window.addEventListener("resize", q);
    return () => window.removeEventListener("resize", q);
  }, []);

  // lista per il tour
  const listRef = useMemo(() => (markers.length ? markers : events), [markers, events]);

  /* ------------ FETCH: SOLO su Apply & Close ------------ */
  const fetchEventsApply = useCallback(async () => {
    const rows = await getEvents({
      lang: (lang || "it").toUpperCase(),
      q, group, continent, country, location,
      limit: 20000
    });

    const full = (rows || []).map(r => normalizeRow(r, lang));

    if (group && full.length) {
      const { min, max } = rangeFromRows(full, ABS_MIN, ABS_MAX);
      setBounds({ min, max });
      setPeriod({ start: min, end: max });
    } else if (full.length >= 10) {
      const { min, max } = rangeFromRows(full, ABS_MIN, ABS_MAX);
      setBounds({ min, max });
    } else {
      setBounds({ min: ABS_MIN, max: ABS_MAX });
    }

    setAllEvents(full);

    const filtered = filterByPeriod(full, period.start, period.end)
      .sort((a,b) => {
        const as = (a.__start ?? 0), bs = (b.__start ?? 0);
        if (as !== bs) return as - bs;
        const ae = (a.__end ?? as), be = (b.__end ?? bs);
        return ae - be;
      });

    const m = filtered.filter(r => Number.isFinite(r.latitude) && Number.isFinite(r.longitude));
    setEvents(filtered);
    setMarkers(m);

    setSelected(null);
    setFocusEvent(null);
    setFitSignal(v => v + 1);
  }, [lang, q, group, continent, country, location, period.start, period.end]);

  /* ------------ TIMELINE: filtra SOLO in locale ------------ */
  const onTimelineChange = useCallback((s, e) => {
    setPeriod({ start: clamp(s, bounds.min, bounds.max), end: clamp(e, bounds.min, bounds.max) });
  }, [bounds.min, bounds.max]);

  useEffect(() => {
    if (!activated) return;
    const filtered = filterByPeriod(allEvents, period.start, period.end)
      .sort((a,b) => {
        const as = (a.__start ?? 0), bs = (b.__start ?? 0);
        if (as !== bs) return as - bs;
        const ae = (a.__end ?? as), be = (b.__end ?? bs);
        return ae - be;
      });
    const m = filtered.filter(r => Number.isFinite(r.latitude) && Number.isFinite(r.longitude));
    setEvents(filtered);
    setMarkers(m);
    setSelected(null);
    setFocusEvent(null);
    setFitSignal(v => v + 1);
  }, [activated, period.start, period.end, allEvents]);

  const onMinInput = (v) => {
    const val = clamp(parseInt(v || 0, 10), bounds.min, Math.min(bounds.max, period.end));
    setPeriod(p => ({ ...p, start: val }));
  };
  const onMaxInput = (v) => {
    const val = clamp(parseInt(v || 0, 10), Math.max(bounds.min, period.start), bounds.max);
    setPeriod(p => ({ ...p, end: val }));
  };

  const onWidenBounds = useCallback((side = null) => {
    const factor = 1.25;
    const curSpan = (bounds.max - bounds.min);
    const addSpan = Math.max(1, Math.round(curSpan * (factor - 1)));
    let newMin = bounds.min;
    let newMax = bounds.max;

    if (side === "left") newMin = bounds.min - addSpan;
    else if (side === "right") newMax = bounds.max + addSpan;
    else { newMin = bounds.min - Math.floor(addSpan / 2); newMax = bounds.max + Math.ceil(addSpan / 2); }

    newMin = Math.min(newMin, period.start);
    newMax = Math.max(newMax, period.end);
    const GMIN = -5000, GMAX = new Date().getFullYear();
    if (newMin < GMIN) newMin = GMIN;
    if (newMax > GMAX) newMax = GMAX;
    if (newMax <= newMin) newMax = newMin + 1;

    setBounds({ min: newMin, max: newMax });
  }, [bounds.min, bounds.max, period.start, period.end]);

  const [mapResetSignal, setMapResetSignal] = useState(0);
  const doReset = () => {
    const NOW = new Date().getFullYear();
    setActivated(false);
    setAllEvents([]);
    setEvents([]); setMarkers([]); setSelected(null); setFocusEvent(null);
    setBounds({ min: -5000, max: NOW });
    setPeriod({ start: -5000, end: NOW });
    setFitSignal(v => v + 1);
    setMapResetSignal(v => v + 1);
    setFiltersOpen(false);
    try { if ("speechSynthesis" in window) window.speechSynthesis.cancel(); } catch {}
  };

  const onSelectEvent = useCallback((ev) => {
    setSelected(ev);
    const h = (bottomSheetRef.current?.getBoundingClientRect()?.height || 0);
    setPanOffsetPx({ x: 0, y: Math.round(h * 0.45) });
    setFocusEvent(ev);
    setFitSignal(v => v + 1);
  }, []);

  const detailsWidthDesktop = 420;
  const bottomH = (bottomSheetRef.current?.getBoundingClientRect()?.height || 0);
  const fitPadding = isMobile
    ? { top: 24, right: 24, bottom: Math.min(260, Math.round(bottomH * 1.1) + 32), left: 24 }
    : { top: 24, right: detailsWidthDesktop + 24, bottom: 24, left: 24 };

  const hasResults = activated && (markers.length || events.length) > 0;

  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(false);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  const [resumeSignal, setResumeSignal] = useState(0);
  const [speakSignal, setSpeakSignal] = useState(0);

  const currentList = listRef;

  const indexOfSelected = () => {
    if (!selected) return -1;
    return currentList.findIndex(e => e.id === selected.id);
  };

  const selectByIndex = (idx) => {
    if (!currentList.length) return;
    const i = Math.max(0, Math.min(currentList.length - 1, idx));
    const ev = currentList[i];
    setSelected(ev);
    setFocusEvent(ev);
    setFitSignal(v => v + 1);
    const h = (bottomSheetRef.current?.getBoundingClientRect()?.height || 0);
    setPanOffsetPx({ x: 0, y: Math.round(h * 0.45) });
  };

  const onPlay = () => {
    if (!hasResults) return;
    setIsPlaying(true);
    if (!selected) {
      selectByIndex(0);
      setSpeakSignal(v => v + 1);
    } else {
      setResumeSignal(v => v + 1);
      setSpeakSignal(v => v + 1);
    }
  };

  const onPause = () => setIsPlaying(false);

  const onNext = () => {
    if (!hasResults) return;
    const idx = indexOfSelected();
    const nextIdx = idx < 0 ? 0 : Math.min(idx + 1, currentList.length - 1);
    selectByIndex(nextIdx);
    if (isPlayingRef.current) setSpeakSignal(v => v + 1);
  };

  const onPrev = () => {
    if (!hasResults) return;
    const idx = indexOfSelected();
    const prevIdx = idx < 0 ? 0 : Math.max(idx - 1, 0);
    selectByIndex(prevIdx);
    if (isPlayingRef.current) setSpeakSignal(v => v + 1);
  };

  const whenSelected = (() => {
    if (!selected) return "";
    const era = selected.__era || "AD";
    const yf = toNum(selected?.year_from);
    const yt = toNum(selected?.year_to);
    if (yf === undefined && yt === undefined) return "";
    const from = era === "BC" ? (yf ?? yt) : (yf ?? yt);
    const to   = era === "BC" ? (yt ?? yf) : (yt ?? yf);
    return fmtRangeByEra(from, to, era, lang);
  })();

  return (
    <div className="gh-app">
      <header className="gh-header">
        <div className="gh-logo">
          <Image src="/logo.png" alt="GeoHistory Journey" fill sizes="(max-width: 768px)" priority style={{ objectFit: "contain" }} />
        </div>
      </header>

      {/* TIMELINE DESKTOP */}
      {mounted && !isMobile && (
        <div className="gh-time">
          <div className="gh-time-top">
            <div className="gh-time-range">
              <span>{period.start < 0 ? `${Math.abs(period.start)} a.C.` : `${period.start} d.C.`}</span>
              <span>→</span>
              <span>{period.end < 0 ? `${Math.abs(period.end)} a.C.` : `${period.end} d.C.`}</span>
            </div>
            <button className="gh-btn-reset" onClick={doReset}>Reset Range</button>
          </div>

          <TimelineSlider
            min={bounds.min}
            max={bounds.max}
            start={period.start}
            end={period.end}
            onChange={onTimelineChange}
            onWiden={onWidenBounds}
            compact={false}
          />
        </div>
      )}

      {/* TIMELINE MOBILE */}
      {mounted && isMobile && (
        <div className="gh-time-m">
          <div className="gh-time-top">
            <div className="gh-time-range">
              <span>{period.start < 0 ? `${Math.abs(period.start)} a.C.` : `${period.start} d.C.`}</span>
              <span>→</span>
              <span>{period.end < 0 ? `${Math.abs(period.end)} a.C.` : `${period.end} d.C.`}</span>
            </div>
            <button className="gh-btn-reset" onClick={doReset}>Reset</button>
          </div>
          <div className="gh-time-m-slider">
            <TimelineSlider
              min={bounds.min}
              max={bounds.max}
              start={period.start}
              end={period.end}
              onChange={onTimelineChange}
              onWiden={onWidenBounds}
              compact={true}
            />
          </div>
        </div>
      )}

      {/* MAP + DETAILS */}
      <div className="gh-main">
        <section className="gh-map-panel">
          <MapView
            markers={activated ? (markers.length ? markers : events) : []}
            selectedId={selected?.id ?? null}
            onSelect={onSelectEvent}
            focusEvent={focusEvent}
            panOffsetPx={panOffsetPx}
            fitSignal={fitSignal}
            fitPadding={isMobile
              ? { top: 24, right: 24, bottom: 260, left: 24 }
              : { top: 24, right: 444, bottom: 24, left: 24 }}
            resetSignal={mapResetSignal}
            isSpeaking={isPlaying}
          />
        </section>

        {!isMobile && selected && (
          <aside className={`gh-details ${isPlaying ? "gh-speaking" : ""}`} ref={bottomSheetRef}>
            <div className="gh-desk-reading">
              {whenSelected && <div className="gh-desk-when">{whenSelected}</div>}
              <div className="gh-desk-title">{selected.event || selected.title || "Event"}</div>
              <div className="gh-desk-meta">
                {selected.group_event && <span className="meta-chip">{selected.group_event}</span>}
                {selected.location && <span className="meta-chip">{selected.location}</span>}
                {(selected.country || selected.continent) && (
                  <span className="meta-chip">{[selected.country, selected.continent].filter(Boolean).join(" · ")}</span>
                )}
              </div>
              <div className="gh-desk-desc">
                <p>{String(selected.description || selected.event || "")}</p>
                {selected.wikipedia && (
                  <p className="gh-desk-wiki">
                    <a href={selected.wikipedia} target="_blank" rel="noreferrer">Wikipedia ↗</a>
                  </p>
                )}
              </div>
            </div>
          </aside>
        )}
      </div>

      {isMobile && selected && (
        <div className={`gh-mob-sheet ${isPlaying ? "gh-speaking" : ""}`} role="dialog" aria-label="Event details" ref={bottomSheetRef}>
          <div className="gh-mob-handle" />
          <div className="gh-mob-header">
            <div className="gh-mob-title">{selected.event || selected.title || "Event"}</div>
            <button className="gh-mob-close" onClick={() => setSelected(null)} aria-label="Close">×</button>
          </div>
          <div className="gh-mob-meta">
            {whenSelected && <span className="meta-chip">{whenSelected}</span>}
            {selected.group_event && <span className="meta-chip">{selected.group_event}</span>}
            {selected.location && <span className="meta-chip">{selected.location}</span>}
            {(selected.country || selected.continent) && (
              <span className="meta-chip">{[selected.country, selected.continent].filter(Boolean).join(" · ")}</span>
            )}
          </div>
          <div className="gh-mob-desc">
            <p>{String(selected.description || selected.event || "")}</p>
            {selected.wikipedia && (
              <p className="gh-mob-wiki">
                <a href={selected.wikipedia} target="_blank" rel="noreferrer">Wikipedia ↗</a>
              </p>
            )}
          </div>
        </div>
      )}

      {hasResults && (
        <div className={isMobile ? "gh-tour-fixed" : "gh-tour-inline"}>
          <TourControls
            lang={(lang || "it").toLowerCase() === "en" ? "en" : "it"}
            isPlaying={isPlaying}
            selectedEvent={selected}
            hasResults={hasResults}
            resumeSignal={resumeSignal}
            speakSignal={speakSignal}
            onPlay={onPlay}
            onPause={onPause}
            onPrev={onPrev}
            onNext={onNext}
          />
        </div>
      )}

      <button className="gh-fab" onClick={() => setFiltersOpen(true)} aria-label="Open Filters" title="Open Filters">
        Filters
      </button>

      {filtersOpen && (
        <div className="gh-overlay" onClick={() => setFiltersOpen(false)}>
          <div className="gh-sheet" onClick={(e)=>e.stopPropagation()}>
            <div className="gh-sheet-header">
              <div className="gh-sheet-title">Filters</div>
              <button className="gh-close" onClick={async ()=>{
                setActivated(true);
                await fetchEventsApply();
                setFitSignal(v=>v+1);
                setFiltersOpen(false);
              }}>Apply & Close</button>
            </div>

            <div className="gh-sheet-body">
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
                      width:`${(100*(period.end - bounds.min))/(bounds.max - bounds.min) - (100*(period.start - bounds.min))/(bounds.max - bounds.min)}%`
                    }}
                  />
                </div>
                <div className="gh-note">Stato condiviso con lo slider in alto.</div>
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

      <style jsx>{`
        :global(html), :global(body), :global(#__next) { height: 100%; }
        .gh-app { min-height: 100svh; background: #fff; color: #111827; }
        .gh-header { position: sticky; top: 0; z-index: 60; height: 56px; background: #fff; border-bottom: 1px solid #e5e7eb; }
        .gh-logo { position: relative; width: 200px; height: 100%; }
        .gh-time { position: sticky; top: 56px; z-index: 55; background: rgba(255,255,255,0.96); backdrop-filter: saturate(180%) blur(6px); border-bottom: 1px solid #e5e7eb; display: grid; grid-template-rows: auto auto; gap: 6px; padding: 10px 14px; min-height: 84px; }
        .gh-time-top { display:flex; align-items:center; justify-content: space-between; gap: 10px; }
        .gh-time-range { display: flex; gap: 6px; align-items: baseline; color: #374151; font-size: 13px; font-weight: 700; }
        .gh-btn-reset { height: 36px; padding: 0 12px; border: 1px solid #e5e7eb; border-radius: 10px; background: #fff; font-weight: 700; }
        .gh-time-m { position: sticky; top: 56px; z-index: 55; background: rgba(255,255,255,0.96); backdrop-filter: saturate(180%) blur(6px); border-bottom: 1px solid #e5e7eb; padding: 8px 10px 10px; display: grid; gap: 8px; }
        .gh-time-m .gh-time-top { display:flex; align-items:center; justify-content: space-between; gap: 10px; }
        .gh-time-m-slider { padding-bottom: 0; }
        .gh-main { display: grid; grid-template-columns: 1fr 420px; height: calc(100svh - 56px - 84px); }
        @media (max-width: 768px){ .gh-main { grid-template-columns: 1fr; height: calc(100svh - 56px - 96px); } }
        .gh-map-panel { position: relative; min-height: 0; }
        .gh-details { border-left: 1px solid #e5e7eb; overflow: auto; background: #fff; }
        .gh-desk-reading { padding: 12px; }
        .gh-desk-when { font-weight: 600; margin-bottom: 4px; }
        .gh-desk-title { font-weight: 800; font-size: 16px; color: #111827; margin-bottom: 6px; transition: background 150ms ease; }
        .gh-speaking .gh-desk-title { background: #fff7ed; box-shadow: 0 0 0 2px #fdba74 inset; border-radius: 8px; padding: 4px 6px; }
        .gh-desk-meta { display:flex; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }
        .meta-chip { font-size: 12px; color:#374151; background:#f3f4f6; border:1px solid #e5e7eb; border-radius: 999px; padding: 2px 8px; }
        .gh-mob-sheet { position: fixed; left: 0; right: 0; bottom: 0; z-index: 1200; background: #fff; border-top: 1px solid #e5e7eb; border-top-left-radius: 14px; border-top-right-radius: 14px; max-height: 45vh; height: min(45vh, 48%); box-shadow: 0 -10px 24px rgba(0,0,0,0.1); display: grid; grid-template-rows: 6px auto 1fr; padding-bottom: env(safe-area-inset-bottom, 8px); }
        .gh-mob-handle { width: 44px; height: 4px; background: #e5e7eb; border-radius: 999px; margin: 8px auto 4px; }
        .gh-mob-header { display:flex; align-items:center; justify-content: space-between; padding: 6px 12px; }
        .gh-mob-title { font-weight: 800; font-size: 15px; color: #111827; line-height: 1.2; padding-right: 8px; }
        .gh-mob-close { height: 30px; width: 30px; border: 1px solid #e5e7eb; border-radius: 8px; background:#fff; font-size: 18px; font-weight: 700; }
        .gh-mob-meta { display:flex; gap: 6px; flex-wrap: wrap; padding: 0 12px 4px; }
        .gh-mob-desc { padding: 4px 12px 10px; overflow: auto; color:#1f2937; }
        .gh-mob-wiki a { color:#2563eb; text-decoration: underline; }
        .gh-tour-inline { position: sticky; top: calc(56px + 84px); z-index: 54; }
        .gh-tour-fixed { position: fixed; left: 50%; transform: translateX(-50%); bottom: 12px; z-index: 1250; }
        .gh-fab { position: fixed; right: 14px; bottom: 14px; z-index: 1000; width: 56px; height: 56px; border-radius: 999px; border: 1px solid #0b0b0b; background: #111827; color: #fff; display: grid; place-items: center; box-shadow: 0 6px 16px rgba(0,0,0,0.18); font-size: 11px; font-weight: 800; letter-spacing: .02em; }
        .gh-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.35); z-index: 1100; display: flex; align-items: flex-end; }
        .gh-sheet { width: 100%; max-height: 85vh; background: #fff; border-top-left-radius: 14px; border-top-right-radius: 14px; overflow: hidden; }
        .gh-sheet-header { display:flex; align-items:center; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid #e5e7eb; }
        .gh-close { height: 36px; padding:0 12px; border: 1px solid #e5e7eb; border-radius: 10px; background:#fff; font-weight:700; }
        .gh-sheet-body { padding: 12px; overflow: auto; max-height: calc(85vh - 48px); }
        .gh-card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; background: #fff; margin-bottom: 12px; }
        .gh-card-title { font-weight: 700; color: #374151; margin-bottom: 6px; }
        .gh-card-meta { display: flex; gap: 8px; align-items: baseline; color: #4b5563; font-size: 14px; }
        .gh-mini-track { position: relative; height: 8px; border-radius: 999px; background: #e5e7eb; margin-top: 8px; overflow: hidden; }
        .gh-mini-fill { position: absolute; top: 0; bottom: 0; background: #3b82f6; }
      `}</style>
    </div>
  );
}

