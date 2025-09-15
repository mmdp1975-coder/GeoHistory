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
function signedRange(ev){
  const era = inferEra(ev);
  const yf = toNum(ev?.year_from), yt = toNum(ev?.year_to);
  if (yf !== undefined && yt !== undefined){
    if (era === "BC") return { s: -Math.max(yf, yt), e: -Math.min(yf, yt) };
    return { s: Math.min(yf, yt), e: Math.max(yf, yt) };
  }
  if (yf !== undefined){ const y = era === "BC" ? -yf : yf; return { s: y, e: y }; }
  if (yt !== undefined){ const y = era === "BC" ? -yt : yt; return { s: y, e: y }; }
  return { s: undefined, e: undefined };
}
function rangeFromRows(rows, ABS_MIN, ABS_MAX){
  let min = +Infinity, max = -Infinity;
  for (const r of rows || []){
    const { s, e } = signedRange(r);
    if (s !== undefined) min = Math.min(min, s);
    if (e !== undefined) max = Math.max(max, e);
  }
  if (!Number.isFinite(min)) min = ABS_MIN;
  if (!Number.isFinite(max)) max = ABS_MAX;
  if (min > max) [min, max] = [max, min];
  return { min, max };
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
  const { s, e } = signedRange(ev);
  ev.__start = s; ev.__end = e;
  ev.__era = inferEra(ev);
  return ev;
}

/* ------------ search helpers ------------ */
const norm = (s) => String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[’'`"“”„]/g,"'").replace(/\s+/g," ").trim();
const toks = (t) => norm(t).split(/[^a-z0-9]+/).filter(Boolean);
function searchMatch(ev, q){
  if (!q) return true;
  const hay = [
    ev.event, ev.event_it, ev.event_en,
    ev.title, ev.title_it, ev.title_en,
    ev.description, ev.description_it, ev.description_en,
    ev.group_event, ev.group_event_it, ev.group_event_en,
    ev.tags, ev.figures, ev.continent, ev.country, ev.location
  ].filter(Boolean).join(" | ");
  const H = new Set(toks(hay));
  return toks(q).every(t => H.has(t));
}

/* ======= year formatting (for desktop header) ======= */
const eraIsBC = (era) => String(era||"").toUpperCase() === "BC";
function fmtYearByEra(y, era, lang="it"){
  if (y === undefined || y === null) return "";
  const it = (lang||"it").toLowerCase() === "it";
  if (it) return eraIsBC(era) ? `${y} a.c.` : `${y} d.c.`;
  return eraIsBC(era) ? `${y} BC` : `${y} AD`;
}
function fmtRangeByEra(from, to, era, lang="it"){
  if (from !== undefined && to !== undefined){
    if (from === to) return fmtYearByEra(from, era, lang);
    return `${fmtYearByEra(from, era, lang)} – ${fmtYearByEra(to, era, lang)}`;
  }
  if (from !== undefined) return fmtYearByEra(from, era, lang);
  if (to   !== undefined) return fmtYearByEra(to,   era, lang);
  return "";
}

/* ============== Speech Synthesis (TTS) with highlighting ============== */
function pickVoiceForLang(voices, lang){
  const L = (lang || "it").toLowerCase();
  const want = L === "en" ? "en" : "it";
  const exact = voices.find(v => v.lang?.toLowerCase().startsWith(want));
  return exact || voices[0] || null;
}
function nextWordEnd(text, startIdx){
  const m = /[\s,.;:!?()\[\]{}"“”'’\-–—]|$/.exec(text.slice(startIdx+1));
  return m ? startIdx + 1 + m.index : startIdx + 1;
}

/* ------------ component ------------ */
export default function Page(){
  const [lang, setLang] = useState((process.env.NEXT_PUBLIC_LANG || "it").toLowerCase());
  const [q, setQ] = useState("");
  const [continent, setContinent] = useState("");
  const [country, setCountry] = useState("");
  const [location, setLocation] = useState("");
  const [group, setGroup] = useState("");

  const [activated, setActivated] = useState(false);

  const ABS_MIN = -5000;
  const ABS_MAX = new Date().getFullYear();
  const [bounds, setBounds] = useState({ min: ABS_MIN, max: ABS_MAX });
  const [period, setPeriod] = useState({ start: ABS_MIN, end: ABS_MAX });

  const [events, setEvents] = useState([]);
  const [markers, setMarkers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [focusEvent, setFocusEvent] = useState(null);

  const [fitSignal, setFitSignal] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const bottomSheetRef = useRef(null);
  const [panOffsetPx, setPanOffsetPx] = useState({ x: 0, y: 0 });

  // anti-flash
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // breakpoint flag
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const q = () => setIsMobile(window.matchMedia("(max-width: 768px)").matches);
    q(); window.addEventListener("resize", q);
    return () => window.removeEventListener("resize", q);
  }, []);

  // list reference
  const listRef = useMemo(() => (markers.length ? markers : events), [markers, events]);

  /* ------------ fetch & filter ------------ */
  const fetchEventsApply = useCallback(async () => {
    const rows = await getEvents({
      lang: (lang || "it").toUpperCase(),
      q, group, continent, country, location,
      limit: 20000
    });
    let list = (rows || []).map(r => normalizeRow(r, lang));

    if (q) list = list.filter(ev => searchMatch(ev, q));

    list = list.filter(ev => {
      const s = ev.__start, e = ev.__end;
      if (s === undefined && e === undefined) return true;
      const from = s ?? e, to = e ?? s;
      return !(to < period.start || from > period.end);
    });

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

    if (list.length >= 10){
      const { min, max } = rangeFromRows(list, ABS_MIN, ABS_MAX);
      setBounds({ min, max });
    }

    // forza fit su nuovi risultati
    setFitSignal(v => v + 1);
  }, [lang, q, group, continent, country, location, period.start, period.end]);

  // timeline changes
  const userTouchedTimeline = useRef(false);
  const deb = useRef(0);

  const onTimelineChange = useCallback((s, e) => {
    userTouchedTimeline.current = true;
    setActivated(true);
    setPeriod({ start: clamp(s, bounds.min, bounds.max), end: clamp(e, bounds.min, bounds.max) });
  }, [bounds.min, bounds.max]);

  useEffect(() => {
    if (!userTouchedTimeline.current) return;
    clearTimeout(deb.current);
    deb.current = setTimeout(() => {
      fetchEventsApply();
      setFitSignal(v => v + 1);
    }, 250);
    return () => clearTimeout(deb.current);
  }, [period.start, period.end, fetchEventsApply]);

  const onMinInput = (v) => {
    userTouchedTimeline.current = true; setActivated(true);
    const val = clamp(parseInt(v || 0, 10), bounds.min, Math.min(bounds.max, period.end));
    setPeriod(p => ({ ...p, start: val }));
  };
  const onMaxInput = (v) => {
    userTouchedTimeline.current = true; setActivated(true);
    const val = clamp(parseInt(v || 0, 10), Math.max(bounds.min, period.start), bounds.max);
    setPeriod(p => ({ ...p, end: val }));
  };

  const doReset = () => {
    const NOW = new Date().getFullYear();
    userTouchedTimeline.current = false;
    setActivated(false);
    setBounds({ min: -5000, max: NOW });
    setPeriod({ start: -5000, end: NOW });
    setEvents([]); setMarkers([]); setSelected(null); setFocusEvent(null);
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try { window.speechSynthesis.cancel(); } catch {}
    }
  };

  /* ------------ tour ------------ */
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused,  setIsPaused ] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [resumeSignal, setResumeSignal] = useState(0);
  const [speakSignal,  setSpeakSignal ] = useState(0);

  const setByIndex = useCallback((idx) => {
    const list = listRef; if (!list.length) return;
    const i = Math.max(0, Math.min(idx, list.length - 1));
    const ev = list[i];
    setCurrentIndex(i);
    setSelected(ev);
    const h = (bottomSheetRef.current?.getBoundingClientRect()?.height || 0);
    setPanOffsetPx({ x: 0, y: Math.round(h * 0.45) });
    setFocusEvent(ev);
    setFitSignal(v => v + 1); // forza recenter su selezione
  }, [listRef]);

  // timeline mobile visibility toggle
  const [mobileTimelineVisible, setMobileTimelineVisible] = useState(true);

  const onPlay = useCallback(() => {
    const list = listRef; if (!list.length) return;
    if (isPaused && selected) { setIsPaused(false); setIsPlaying(true); setResumeSignal(s => s + 1); }
    else {
      setIsPaused(false); setIsPlaying(true);
      if (currentIndex < 0 || !selected) { setByIndex(0); setTimeout(()=>setSpeakSignal(s=>s+1),0); }
      else { setSpeakSignal(s=>s+1); }
    }
    if (isMobile) setMobileTimelineVisible(false); // nascondi timeline in lettura
  }, [listRef, isPaused, selected, currentIndex, setByIndex, isMobile]);

  const onPause = useCallback(() => {
    setIsPaused(true); setIsPlaying(false);
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try { window.speechSynthesis.pause(); } catch {}
    }
  }, []);

  const onNext  = useCallback(() => {
    const list=listRef; if (!list.length) return;
    setIsPaused(false); setIsPlaying(true);
    setByIndex((currentIndex<0?0:currentIndex+1));
    setTimeout(()=>setSpeakSignal(s=>s+1),0);
    if (isMobile) setMobileTimelineVisible(false);
  }, [listRef,currentIndex,setByIndex,isMobile]);

  const onPrev  = useCallback(() => {
    const list=listRef; if (!list.length) return;
    setIsPaused(false); setIsPlaying(true);
    setByIndex((currentIndex<0?0:currentIndex-1));
    setTimeout(()=>setSpeakSignal(s=>s+1),0);
    if (isMobile) setMobileTimelineVisible(false);
  }, [listRef,currentIndex,setByIndex,isMobile]);

  /* ------------ Filters modal ------------ */
  const onApplyAndClose = useCallback(async () => {
    setActivated(true);
    await fetchEventsApply();
    setFitSignal(v => v + 1);
    setFiltersOpen(false);
  }, [fetchEventsApply]);

  /* ========== TTS state for highlighting ========== */
  const ttsAvail = typeof window !== "undefined" && "speechSynthesis" in window;
  const utterRef = useRef(null);
  const voicesRef = useRef([]);
  const [hl, setHl] = useState({ start: -1, end: -1 });

  // Load voices once
  useEffect(() => {
    if (!ttsAvail) return;
    const synth = window.speechSynthesis;
    const load = () => { voicesRef.current = synth.getVoices() || []; };
    load();
    synth.onvoiceschanged = load;
    return () => { synth.onvoiceschanged = null; };
  }, [ttsAvail]);

  const speakSelected = useCallback(() => {
    if (!ttsAvail || !selected) return;
    try { window.speechSynthesis.cancel(); } catch {}
    const text = String(selected.description || selected.event || "").replace(/\s+/g, " ").trim();
    if (!text) return;

    const u = new SpeechSynthesisUtterance(text);
    const voice = pickVoiceForLang(voicesRef.current, lang);
    if (voice) u.voice = voice;
    u.lang = (lang === "en" ? "en-US" : "it-IT");
    u.rate = 1; u.pitch = 1;

    u.onstart = () => setHl({ start: 0, end: 0 });
    u.onboundary = (ev) => {
      const i = typeof ev.charIndex === "number" ? ev.charIndex : -1;
      if (i < 0) return;
      const len = (ev.charLength && ev.charLength > 0) ? ev.charLength : (nextWordEnd(text, i) - i);
      setHl({ start: i, end: i + len });
    };
    u.onend = () => setHl({ start: -1, end: -1 });

    utterRef.current = u;
    try { window.speechSynthesis.speak(u); } catch {}
  }, [ttsAvail, selected, lang]);

  // Triggers from tour controls
  useEffect(() => { if (speakSignal) speakSelected(); }, [speakSignal, speakSelected]);
  useEffect(() => {
    if (!ttsAvail) return;
    if (!resumeSignal) return;
    try { window.speechSynthesis.resume(); } catch {}
  }, [resumeSignal, ttsAvail]);

  // Cancel speech on unmount
  useEffect(() => () => {
    if (ttsAvail) {
      try { window.speechSynthesis.cancel(); } catch {}
    }
  }, [ttsAvail]);

  // Show/hide timeline on mobile:
  // Nascondi la timeline quando i filtri sono aperti per evitare sovrapposizioni
  const showMobileTimeline = isMobile ? (mobileTimelineVisible && !filtersOpen) : true;

  // forza fit su cambio selezione (aiuta centratura in MapView)
  useEffect(() => { if (selected) setFitSignal(v => v + 1); }, [selected]);

  // calcolo padding dinamico per la mappa:
  const detailsWidthDesktop = 420;
  const bottomH = (bottomSheetRef.current?.getBoundingClientRect()?.height || 0);
  const fitPadding = isMobile
    ? { top: 24, right: 24, bottom: Math.min(260, Math.round(bottomH * 1.1) + 32), left: 24 }
    : { top: 24, right: detailsWidthDesktop + 24, bottom: 24, left: 24 };

  /* ===================== RENDER ===================== */
  return (
    <div className="gh-app">
      <header className="gh-header">
        <div className="gh-logo">
          <Image src="/logo.png" alt="GeoHistory Journey" fill sizes="(max-width: 768px) 160px, 200px" priority style={{ objectFit: "contain" }} />
        </div>
      </header>

      {/* === TIMELINE — DESKTOP === */}
      {mounted && (
        <div className="gh-time" aria-hidden={false}>
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
            compact={false}
          />

          <label className="gh-mm">
            <span>Max</span>
            <input type="number" value={period.end} onChange={(e) => onMaxInput(e.target.value)} />
          </label>

          <button className="gh-btn-reset" onClick={doReset} title="Ripristina dominio e range iniziali">
            Reset Range
          </button>
        </div>
      )}

      {/* === TIMELINE — MOBILE COMPACT (toggle visibilità) === */}
      {mounted && showMobileTimeline && (
        <div className="gh-time-m">
          <div className="gh-time-m-row">
            <div className="gh-time-m-range">
              <span>{period.start < 0 ? `${Math.abs(period.start)} a.C.` : `${period.start} d.C.`}</span>
              <span className="arrow">→</span>
              <span>{period.end < 0 ? `${Math.abs(period.end)} a.C.` : `${period.end} d.C.`}</span>
            </div>
            <div className="gh-time-m-actions">
              <button className="gh-btn-reset-m" onClick={doReset} title="Reset">Reset</button>
              {/* NUOVO: bottone Hide per far scomparire la timeline su mobile */}
              <button className="gh-btn-hide-m" onClick={() => setMobileTimelineVisible(false)} title="Hide">Hide</button>
            </div>
          </div>

          <div className="gh-time-m-slider">
            <TimelineSlider
              min={bounds.min}
              max={bounds.max}
              start={period.start}
              end={period.end}
              onChange={onTimelineChange}
              compact={true}
            />
          </div>
        </div>
      )}

      {/* Pulsante per far RI-comparire la timeline durante la lettura (mobile) */}
      {isMobile && !showMobileTimeline && (
        <button className="gh-timeline-fab" onClick={() => setMobileTimelineVisible(true)} aria-label="Show Timeline" title="Timeline">
          Timeline
        </button>
      )}

      {/* === LAYOUT PRINCIPALE: mappa + sidebar (desktop) === */}
      <div className="gh-main">
        <section className="gh-map-panel">
          <MapView
            markers={activated ? (markers.length ? markers : events) : []}
            selectedId={selected?.id ?? null}
            onSelect={(ev) => {
              setSelected(ev);
              const h = (bottomSheetRef.current?.getBoundingClientRect()?.height || 0);
              setPanOffsetPx({ x: 0, y: Math.round(h * 0.45) });
              setFocusEvent(ev);
              setFitSignal(v => v + 1); // forza recenter su select
              if (isPlaying) setSpeakSignal(s => s + 1);
            }}
            focusEvent={focusEvent}
            panOffsetPx={panOffsetPx}
            fitSignal={fitSignal}
            fitPadding={fitPadding}
          />
        </section>

        {/* DESKTOP: manteniamo UNA sola descrizione (quella "sopra") con 'dal–al' in testa */}
        {!isMobile && selected && (
          <aside className="gh-details" ref={bottomSheetRef}>
            <div className="gh-desk-reading">
              {/* when/dal–al */}
              <div className="gh-desk-when">
                {fmtRangeByEra(
                  toNum(selected?.year_from),
                  toNum(selected?.year_to),
                  selected?.__era || inferEra(selected),
                  lang
                )}
              </div>
              <div className="gh-desk-title">{selected.event || selected.title || "Event"}</div>
              <div className="gh-desk-meta">
                {selected.group_event && <span className="meta-chip">{selected.group_event}</span>}
                {selected.location && <span className="meta-chip">{selected.location}</span>}
                {(selected.country || selected.continent) && (
                  <span className="meta-chip">{[selected.country, selected.continent].filter(Boolean).join(" · ")}</span>
                )}
              </div>
              <div className="gh-desk-desc">
                {(() => {
                  const text = String(selected.description || selected.event || "");
                  const s = Math.max(0, hl.start);
                  const e = Math.max(s, hl.end);
                  const before = s >= 0 ? text.slice(0, s) : text;
                  const mid    = s >= 0 ? text.slice(s, e) : "";
                  const after  = s >= 0 ? text.slice(e) : "";
                  return (
                    <p>
                      {before}
                      {s >= 0 && <mark className="gh-tts-hl">{mid}</mark>}
                      {after}
                    </p>
                  );
                })()}
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

      {/* === FAB Filters — NERO === */}
      <button className="gh-fab" onClick={() => setFiltersOpen(true)} aria-label="Open Filters" title="Open Filters">
        Filters
      </button>

      {filtersOpen && (
        <div className="gh-overlay" onClick={() => setFiltersOpen(false)}>
          <div className="gh-sheet" onClick={(e)=>e.stopPropagation()}>
            <div className="gh-sheet-header">
              <div className="gh-sheet-title">Filters</div>
              <button className="gh-close" onClick={onApplyAndClose}>Apply & Close</button>
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

      {/* === MOBILE BOTTOM-SHEET: descrizione evento (< 50% schermo) === */}
      {isMobile && selected && (
        <div className="gh-mob-sheet" role="dialog" aria-label="Event details" ref={bottomSheetRef}>
          <div className="gh-mob-handle" />
          <div className="gh-mob-header">
            <div className="gh-mob-title">
              {/* when/dal–al davanti al titolo anche su mobile (compatto) */}
              <span className="gh-mob-when">
                {fmtRangeByEra(
                  toNum(selected?.year_from),
                  toNum(selected?.year_to),
                  selected?.__era || inferEra(selected),
                  lang
                )} —{" "}
              </span>
              {selected.event || selected.title || "Event"}
            </div>
            <button className="gh-mob-close" onClick={() => setSelected(null)} aria-label="Close">×</button>
          </div>
          <div className="gh-mob-meta">
            {selected.group_event && <span className="meta-chip">{selected.group_event}</span>}
            {selected.location && <span className="meta-chip">{selected.location}</span>}
            {(selected.country || selected.continent) && (
              <span className="meta-chip">{[selected.country, selected.continent].filter(Boolean).join(" · ")}</span>
            )}
          </div>
          <div className="gh-mob-desc">
            {(() => {
              const text = String(selected.description || selected.event || "");
              const s = Math.max(0, hl.start);
              const e = Math.max(s, hl.end);
              const before = s >= 0 ? text.slice(0, s) : text;
              const mid    = s >= 0 ? text.slice(s, e) : "";
              const after  = s >= 0 ? text.slice(e) : "";
              return (
                <p>
                  {before}
                  {s >= 0 && <mark className="gh-tts-hl">{mid}</mark>}
                  {after}
                </p>
              );
            })()}
            {selected.wikipedia && (
              <p className="gh-mob-wiki">
                <a href={selected.wikipedia} target="_blank" rel="noreferrer">Wikipedia ↗</a>
              </p>
            )}
          </div>
        </div>
      )}

      {/* TourControls fisso su mobile (sempre visibile sopra al bottom-sheet) */}
      {(activated && (markers.length || events.length)) && (
        <div className={isMobile ? "gh-tour-fixed" : "gh-tour-inline"}>
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
        </div>
      )}

      <style jsx>{`
        /* HEADER */
        .gh-header { position: sticky; top: 0; z-index: 60; height: 56px; background: #fff; border-bottom: 1px solid #e5e7eb; }
        .gh-logo { position: relative; width: 200px; height: 100%; }

        /* TIMELINE — DESKTOP */
        .gh-time {
          position: sticky;
          top: 56px;
          z-index: 55;
          background: rgba(255,255,255,0.96);
          backdrop-filter: saturate(180%) blur(6px);
          border-bottom: 1px solid #e5e7eb;
          display: grid;
          grid-template-columns: 140px 1fr 140px 120px;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          min-height: 62px;
        }
        .gh-mm { display: grid; grid-template-columns: 34px 1fr; align-items: center; gap: 8px; }
        .gh-mm span { font-size: 12px; font-weight: 700; color: #6b7280; }
        .gh-mm input {
          height: 40px; padding: 6px 10px; border: 1px solid #e5e7eb; border-radius: 10px; font-size: 14px;
        }
        .gh-mm input:focus { border-color: #93c5fd; box-shadow: 0 0 0 3px rgba(59,130,246,0.25); }
        .gh-btn-reset { height: 40px; border: 1px solid #e5e7eb; border-radius: 10px; background: #fff; font-weight: 700; }
        .gh-btn-reset:hover { background: #f9fafb; }

        /* MAIN desktop: mappa + sidebar */
        .gh-main {
          display: grid;
          grid-template-columns: 1fr 420px;
          height: calc(100vh - 56px - 62px);
        }
        .gh-map-panel { position: relative; }
        .gh-details { border-left: 1px solid #e5e7eb; overflow: auto; background: #fff; }

        /* Reading view desktop */
        .gh-desk-reading { padding: 12px; }
        .gh-desk-when { font-weight: 700; color:#111827; margin-bottom: 4px; }
        .gh-desk-title { font-weight: 800; font-size: 16px; color: #111827; margin-bottom: 6px; }
        .gh-desk-meta { display:flex; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }
        .meta-chip { font-size: 12px; color:#374151; background:#f3f4f6; border:1px solid #e5e7eb; border-radius: 999px; padding: 2px 8px; }
        .gh-desk-desc p { font-size: 14px; line-height: 1.55; margin: 0; white-space: pre-wrap; user-select: text; }
        .gh-desk-wiki a { color:#2563eb; text-decoration: underline; }

        /* evidenziazione parola corrente */
        .gh-tts-hl { background: #fff3bf; border-radius: 4px; padding: 0 1px; }

        /* FAB Filters — NERO */
        .gh-fab {
          position: fixed; right: 16px; bottom: 16px; z-index: 1000;
          height: 46px; padding: 0 18px; border: 0; border-radius: 999px; background: #000;
          color: #fff; font-weight: 800; box-shadow: 0 6px 16px rgba(0,0,0,0.18);
        }
        .gh-fab:hover { filter: brightness(1.05); }

        /* Pulsante Timeline (mobile) per ri-mostrarla durante la lettura */
        .gh-timeline-fab {
          position: fixed; left: 50%; transform: translateX(-50%);
          top: 64px; z-index: 1205;
          height: 34px; padding: 0 12px; border: 0; border-radius: 999px; background: #111827;
          color: #fff; font-weight: 700; box-shadow: 0 6px 16px rgba(0,0,0,0.18);
        }

        /* Filters modal */
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

        /* --- MOBILE LAYOUT --- */
        .gh-time { display: grid; }
        .gh-time-m { display: none; }

        @media (max-width: 768px) {
          /* nascondi timeline desktop, mostra mobile (se visibile) */
          .gh-time { display: none; }
          .gh-time-m {
            position: sticky;
            top: 56px;
            z-index: 55;
            background: rgba(255,255,255,0.96);
            backdrop-filter: saturate(180%) blur(6px);
            border-bottom: 1px solid #e5e7eb;
            padding: 8px 10px 10px;
            display: grid;
            gap: 8px;
          }
          .gh-time-m-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
          .gh-time-m-range { display: flex; gap: 6px; align-items: baseline; color: #374151; font-size: 14px; font-weight: 600; }
          .gh-time-m-range .arrow { opacity: .7; }
          .gh-time-m-actions { display: flex; gap: 8px; }
          .gh-btn-reset-m, .gh-btn-hide-m { height: 36px; padding: 0 12px; border: 1px solid #e5e7eb; border-radius: 10px; background: #fff; font-weight: 700; }
          .gh-time-m-slider { overflow-x: auto; padding-bottom: 2px; }

          /* layout mobile: solo mappa, dettagli via bottom-sheet */
          .gh-main {
            grid-template-columns: 1fr;
            height: calc(100vh - 56px - 64px);
          }
          .gh-details { display: none; }
        }

        /* --- MOBILE EVENT BOTTOM-SHEET --- */
        .gh-mob-sheet {
          position: fixed; left: 0; right: 0; bottom: 0; z-index: 1200;
          background: #fff; border-top: 1px solid #e5e7eb;
          border-top-left-radius: 14px; border-top-right-radius: 14px;
          max-height: 45vh; height: min(45vh, 48%); box-shadow: 0 -10px 24px rgba(0,0,0,0.1);
          display: grid; grid-template-rows: 6px auto 1fr; padding-bottom: env(safe-area-inset-bottom, 8px);
        }
        .gh-mob-handle { width: 44px; height: 4px; background: #e5e7eb; border-radius: 999px; margin: 8px auto 4px; }
        .gh-mob-header { display:flex; align-items:center; justify-content: space-between; padding: 6px 12px; }
        .gh-mob-title { font-weight: 800; font-size: 15px; color: #111827; line-height: 1.2; padding-right: 8px; }
        .gh-mob-when { font-weight: 700; color:#111827; }
        .gh-mob-close { height: 30px; width: 30px; border: 1px solid #e5e7eb; border-radius: 8px; background:#fff; font-size: 18px; font-weight: 700; }

        .gh-mob-meta { display:flex; gap: 6px; flex-wrap: wrap; padding: 0 12px 4px; }
        .gh-mob-desc { padding: 4px 12px 10px; overflow: auto; color:#1f2937; }
        .gh-mob-desc p { font-size: 14px; line-height: 1.5; margin: 0; white-space: pre-wrap; user-select: text; }
        .gh-mob-wiki a { color:#2563eb; text-decoration: underline; }

        /* TourControls — fisso su mobile sopra al bottom-sheet */
        .gh-tour-inline { position: static; z-index: 100; }
        .gh-tour-fixed {
          position: fixed; left: 50%; transform: translateX(-50%);
          bottom: calc((min(45vh, 48%)) + 8px); /* appena sopra il bottom-sheet */
          z-index: 1250;
        }
      `}</style>
    </div>
  );
}

