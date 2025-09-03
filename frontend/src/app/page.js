"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FiltersBar from "../components/FiltersBar";
import DetailsPanel from "../components/DetailsPanel";
import { getEvents } from "../lib/api";

const MapView = dynamic(() => import("../components/MapView"), { ssr: false });

function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

/* ===== RangeSlider (immutato nell’aspetto) ===== */
function RangeSlider({ min, max, start, end, onChange, onCommit, disabled = false }) {
  const trackRef = useRef(null);
  const draggingRef = useRef(null);
  const range = Math.max(1, (max - min));
  const clampPct = (pct) => Math.max(0, Math.min(100, pct));
  const pctToValue = (pct) => Math.round(clamp(min + (pct/100) * range, min, max));
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
        onMouseDown={(e)=>{ draggingRef.current=pick(e.clientX); onDown(e.clientX, draggingRef.current); const mm=(ev)=>onDown(ev.clientX, draggingRef.current); const mu=()=>{ draggingRef.current=null; window.removeEventListener("mousemove",mm); window.removeEventListener("mouseup",mu); onCommit?.(); }; window.addEventListener("mousemove",mm); window.addEventListener("mouseup",mu); e.preventDefault(); }}
        onTouchStart={(e)=>{ const t=e.touches[0]; if(!t) return; draggingRef.current=pick(t.clientX); onDown(t.clientX, draggingRef.current); const tm=(ev)=>{ const tt=ev.touches[0]; if(tt) onDown(tt.clientX, draggingRef.current); }; const te=()=>{ draggingRef.current=null; window.removeEventListener("touchmove",tm); window.removeEventListener("touchend",te); onCommit?.(); }; window.addEventListener("touchmove",tm,{passive:false}); window.addEventListener("touchend",te); }}
      >
        <div className="gh-range-fill" style={{ left: `${(start-min)/(max-min)*100}%`, width: `${Math.max(0, ((end-start)/(max-min))*100)}%` }} />
        <button className="gh-handle" style={{ left: `${(start-min)/(max-min)*100}%` }} aria-label="Start year" />
        <button className="gh-handle" style={{ left: `${(end-min)/(max-min)*100}%` }} aria-label="End year" />
      </div>
      <style jsx>{`
        .gh-track { flex: 1 1 auto; position: relative; height: 8px; background: #e5e7eb; border-radius: 999px; cursor: pointer; user-select: none; touch-action: none; }
        .gh-range-fill { position: absolute; top: 0; bottom: 0; background: #3b82f6; border-radius: 999px; }
        .gh-handle { position: absolute; top: 50%; transform: translate(-50%, -50%); width: 18px; height: 18px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 0 1px rgba(0,0,0,.2); background: #111827; cursor: grab; }
      `}</style>
    </>
  );
}

export default function Page() {
  const [lang, setLang] = useState((process.env.NEXT_PUBLIC_LANG || "it").toLowerCase());
  const [q, setQ] = useState("");
  const [continent, setContinent] = useState("");
  const [country, setCountry] = useState("");
  const [location, setLocation] = useState("");
  const [group, setGroup] = useState("");

  const [activated, setActivated] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const DEFAULT_MIN = -3000;
  const DEFAULT_MAX = new Date().getFullYear();
  const [bounds, setBounds] = useState({ min: DEFAULT_MIN, max: DEFAULT_MAX, source: "default" });
  const [period, setPeriod] = useState({ start: null, end: null });

  const [events, setEvents] = useState([]);
  const [markers, setMarkers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [focusEvent, setFocusEvent] = useState(null);

  // === NUOVO: fit dopo Apply ===
  const [fitSignal, setFitSignal] = useState(0);
  const fitNextRef = useRef(false);

  const typingTimer = useRef(null);
  const synthRef = useRef(null), utterRef = useRef(null), readerIndexRef = useRef(0);
  useEffect(() => { synthRef.current = window.speechSynthesis; }, []);

  const hasAnyFilter = useMemo(() => !!(q || continent || country || location || group || period.start !== null || period.end !== null), [q, continent, country, location, group, period]);
  const canQuery = activated && hasAnyFilter;
  const resultsLen = useMemo(() => (markers.length || events.length), [markers.length, events.length]);
  const noOtherFilters = useMemo(() => !(q || continent || country || location || group), [q, continent, country, location, group]);

  /* ===== Bounds ===== */
  const fetchBounds = useCallback(async ({ hardReset = false } = {}) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (continent) params.set("continent", continent);
    if (country) params.set("country", country);
    if (location) params.set("location", location);
    if (group) params.set("group", group);
    try {
      const res = await fetch(`/api/events/bounds?${params.toString()}`, { cache: "no-store" });
      const data = res.ok ? await res.json() : null;
      const min = Number.isFinite(data?.min_year) ? data.min_year : DEFAULT_MIN;
      const max = Number.isFinite(data?.max_year) ? data.max_year : DEFAULT_MAX;
      const normMin = Math.min(min, max), normMax = Math.max(min, max);
      setBounds({ min: normMin, max: normMax, source: data ? "api" : "default" });
      setPeriod(p => {
        if (hardReset) return { start: normMin, end: normMax };
        let s = p.start == null ? normMin : clamp(p.start, normMin, normMax);
        let e = p.end == null ? normMax : clamp(p.end, normMin, normMax);
        if (s > e) s = e;
        return { start: s, end: e };
      });
    } catch {
      setBounds({ min: DEFAULT_MIN, max: DEFAULT_MAX, source: "default" });
      setPeriod(p => {
        if (hardReset) return { start: DEFAULT_MIN, end: DEFAULT_MAX };
        let s = p.start == null ? DEFAULT_MIN : clamp(p.start, DEFAULT_MIN, DEFAULT_MAX);
        let e = p.end == null ? DEFAULT_MAX : clamp(p.end, DEFAULT_MIN, DEFAULT_MAX);
        if (s > e) s = e;
        return { start: s, end: e };
      });
    }
  }, [q, continent, country, location, group]);

  const prevGroupRef = useRef(group);
  useEffect(() => {
    const groupChanged = prevGroupRef.current !== group;
    prevGroupRef.current = group;
    if (!activated && !groupChanged) return;
    fetchBounds({ hardReset: groupChanged });
  }, [q, continent, country, location, group, activated, fetchBounds]);

  /* ===== i18n normalize ===== */
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

  /* ===== Fetch eventi ===== */
  const applyFilters = useCallback(() => {
    if (!canQuery) { setEvents([]); setMarkers([]); setSelected(null); setFocusEvent(null); return; }
    const params = {
      lang: lang.toUpperCase(),
      q, continent, country, location, group,
      year_start: period.start, year_end: period.end,
      limit: 2000
    };
    getEvents(params)
      .then(rows => {
        const normalized = (rows || []).map(r => normalizeI18n(r, lang));
        const m = normalized.filter(r => Number.isFinite(r.latitude) && Number.isFinite(r.longitude));
        setEvents(normalized);
        setMarkers(m);
        setSelected(null);
        setFocusEvent(null);
        readerIndexRef.current = 0;

        // segnala che al prossimo render va fatto fit
        if (fitNextRef.current) {
          // verrà triggerato dall'effetto su "markers"
        }
      })
      .catch(() => {
        setEvents([]); setMarkers([]); setSelected(null); setFocusEvent(null);
      });
  }, [canQuery, lang, q, continent, country, location, group, period.start, period.end, normalizeI18n]);

  // === Fit automatico quando i marker cambiano ed è stato richiesto da "Apply"
  useEffect(() => {
    if (!fitNextRef.current) return;
    fitNextRef.current = false;
    setFitSignal(v => v + 1);
  }, [markers]);

  /* ===== Notifiche dai filtri (digita/cambia) ===== */
  const onFiltersChanged = useCallback((action) => {
    if (typingTimer.current) { clearTimeout(typingTimer.current); typingTimer.current = null; }

    if (action === "reset") {
      setActivated(false);
      setQ(""); setContinent(""); setCountry(""); setLocation(""); setGroup("");
      setEvents([]); setMarkers([]); setSelected(null); setFocusEvent(null);
      setPeriod({ start: null, end: null });
      return;
    }

    if (action !== "lang" && !activated) setActivated(true);
    typingTimer.current = setTimeout(() => {
      if (activated || action !== "lang") applyFilters();
    }, 250);
  }, [activated, applyFilters]);

  // Periodo/Lingua
  useEffect(() => { if (canQuery) applyFilters(); }, [period, lang]); // eslint-disable-line
  // Ricerca testuale
  useEffect(() => {
    if (!canQuery) return;
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => applyFilters(), 350);
  }, [q, canQuery, applyFilters]); // eslint-disable-line

  /* ===== Apply “forte” dal pannello: forza update + fit ===== */
  const onApplyAndClose = useCallback(async () => {
    if (!activated) setActivated(true);
    fitNextRef.current = true;           // dopo l'update, fai fit
    await fetchBounds({ hardReset: true }); // aggiorna range dai filtri correnti
    applyFilters();                        // aggiorna eventi e marker SUBITO
    setFiltersOpen(false);                 // chiudi overlay
  }, [activated, fetchBounds, applyFilters]);

  /* ===== Reset Range ===== */
  const onResetRange = useCallback(() => {
    if (noOtherFilters) {
      setActivated(false);
      setPeriod({ start: null, end: null });
      setEvents([]); setMarkers([]); setSelected(null); setFocusEvent(null);
    } else {
      if (!activated) setActivated(true);
      setPeriod({ start: bounds.min, end: bounds.max });
    }
  }, [noOtherFilters, activated, bounds.min, bounds.max]);

  /* ===== Sintesi vocale ===== */
  const speakEvent = useCallback((ev) => {
    const synth = synthRef.current;
    if (!synth || !ev) return;
    if (utterRef.current) synth.cancel();
    const targetLang = lang.toLowerCase() === "it" ? "it-IT" : "en-US";
    const u = new SpeechSynthesisUtterance(`${ev.event}. ${ev.description || ""}`);
    u.lang = targetLang;
    const voices = synth.getVoices();
    const v =
      voices.find(v => v.lang === targetLang && v.name.toLowerCase().includes("google")) ||
      voices.find(v => v.lang === targetLang) ||
      voices[0] || null;
    if (v) u.voice = v;
    u.pitch = 1.15; u.rate = 0.93; u.volume = 1;
    utterRef.current = u;
    synth.speak(u);
  }, [lang]);

  /* ===== Offset per centraggio (misura reale bottom-sheet su mobile) ===== */
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

  useEffect(() => { setPanOffsetPx(computeOffset()); }, [selected, computeOffset]);
  useEffect(() => {
    const onResize = () => setPanOffsetPx(computeOffset());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [computeOffset]);

  /* ===== Fit padding adattivo (desktop: spazio per pannello destro) ===== */
  const fitPadding = useMemo(() => {
    const isDesktop = typeof window !== "undefined" && window.innerWidth >= 1025;
    if (isDesktop) {
      return { top: 24, right: 420, bottom: 24, left: 24 }; // pannello destro ~380 + margine
    }
    return { top: 24, right: 24, bottom: 24, left: 24 };
  }, []);

  /* ===== Lista corrente e tour ===== */
  const listRef = useRef([]);
  useEffect(() => { listRef.current = markers.length ? markers : events; }, [markers, events]);

  const setByIndex = useCallback((idx) => {
    const list = listRef.current;
    if (!list.length) return;
    const clamped = Math.max(0, Math.min(idx, list.length - 1));
    const ev = list[clamped];
    setSelected(ev);                  // apre sheet su mobile
    setPanOffsetPx(computeOffset());  // offset pronto
    readerIndexRef.current = clamped;
    setFocusEvent(ev);                // centra usando offset
    speakEvent(ev);
  }, [computeOffset, speakEvent]);

  const onPlay = useCallback(() => {
    const synth = synthRef.current;
    if (synth?.paused) { synth.resume(); return; }
    if (!listRef.current.length) return;
    setByIndex(readerIndexRef.current || 0);
  }, [setByIndex]);
  const onNext = useCallback(() => { if (listRef.current.length) setByIndex((readerIndexRef.current || 0) + 1); }, [setByIndex]);
  const onPrev = useCallback(() => { if (listRef.current.length) setByIndex((readerIndexRef.current || 0) - 1); }, [setByIndex]);
  const onPause = useCallback(() => { const s = synthRef.current; if (s?.speaking && !s.paused) s.pause(); }, []);

  return (
    <div className="gh-app">
      {/* Header con logo */}
      <header className="gh-header">
        <div className="gh-logo">
          <Image src="/logo.png" alt="GeoHistory Journey" fill sizes="(max-width: 768px) 160px, 200px" priority style={{ objectFit: "contain" }}/>
        </div>
      </header>

      {/* Time range */}
      <div className="gh-time">
        <label className="gh-mm">
          <span>Min</span>
          <input
            type="number"
            value={(period.start ?? bounds.min)}
            onChange={(e)=>{
              const v = clamp(parseInt(e.target.value || 0, 10), bounds.min, (period.end ?? bounds.max));
              if (!activated) setActivated(true);
              setPeriod(p => ({ start: v, end: (p.end ?? bounds.max) }));
            }}
          />
        </label>

        <RangeSlider
          min={bounds.min} max={bounds.max}
          start={period.start ?? bounds.min}
          end={period.end ?? bounds.max}
          onChange={(s,e) => { if (!activated) setActivated(true); setPeriod({ start: clamp(s, bounds.min, bounds.max), end: clamp(e, bounds.min, bounds.max) }); }}
          onCommit={()=>{}}
          disabled={bounds.min === bounds.max}
        />

        <label className="gh-mm">
          <span>Max</span>
          <input
            type="number"
            value={(period.end ?? bounds.max)}
            onChange={(e)=>{
              const v = clamp(parseInt(e.target.value || 0, 10), (period.start ?? bounds.min), bounds.max);
              if (!activated) setActivated(true);
              setPeriod(p => ({ start: (p.start ?? bounds.min), end: v }));
            }}
          />
        </label>

        <button onClick={onResetRange} className="gh-btn-reset">Reset Range</button>
      </div>

      {/* Main */}
      <div className="gh-main">
        <section className="gh-map-panel">
          <MapView
            markers={canQuery ? markers : []}
            selectedId={selected?.id ?? null}
            onSelect={(ev) => {
              setSelected(ev);
              setPanOffsetPx(computeOffset());
              const list = markers.length ? markers : events;
              const idx = Math.max(0, list.findIndex(x => x.id === ev.id));
              readerIndexRef.current = idx;
              setFocusEvent(ev);
            }}
            focusEvent={focusEvent}
            panOffsetPx={panOffsetPx}
            fitSignal={fitSignal}
            fitPadding={fitPadding}
          />
        </section>

        {/* Dettagli laterale (desktop) */}
        <aside className="gh-details">
          <DetailsPanel event={selected} />
        </aside>
      </div>

      {/* FAB Filters (desktop+mobile) */}
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
                onFiltersChanged={(k)=>{ onFiltersChanged(k); }}
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

      {/* Reader Bar */}
      {(canQuery && resultsLen > 0) && (
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

