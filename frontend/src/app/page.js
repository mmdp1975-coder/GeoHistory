"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FiltersBar from "../components/FiltersBar";
import DetailsPanel from "../components/DetailsPanel";
import { getEvents } from "../lib/api";

const MapView = dynamic(() => import("../components/MapView"), { ssr: false });

/* ===== Helpers ===== */
function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

/* ===== RangeSlider (solo track+maniglie; input e reset sono esterni, sulla stessa riga) ===== */
function RangeSlider({
  min, max,
  start, end,
  onChange,      // (s, e) => void — durante il drag/keypress
  onCommit,      // () => void     — al rilascio
  disabled = false,
}) {
  const trackRef = useRef(null);
  const draggingRef = useRef(null); // 'start' | 'end' | null

  const range = Math.max(1, (max - min));
  const valueToPct = (v) => range === 0 ? 0 : ((v - min) / range) * 100;
  const pctToValue = (pct) => {
    const raw = min + (pct/100) * range;
    return Math.round(clamp(raw, min, max));
  };

  const posStartPct = valueToPct(clamp(start ?? min, min, max));
  const posEndPct   = valueToPct(clamp(end   ?? max, min, max));

  const pickHandleByPointer = (clientX) => {
    const rect = trackRef.current.getBoundingClientRect();
    const pxStart = rect.left + (posStartPct/100) * rect.width;
    const pxEnd   = rect.left + (posEndPct/100) * rect.width;
    return Math.abs(clientX - pxStart) <= Math.abs(clientX - pxEnd) ? "start" : "end";
  };

  const moveToPointer = (which, clientX) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const pct = clamp(((clientX - rect.left) / rect.width) * 100, 0, 100);
    const val = pctToValue(pct);
    if (which === "start") {
      const s = clamp(val, min, (end ?? max));
      onChange?.(Math.min(s, end ?? max), end ?? max);
    } else {
      const e = clamp(val, (start ?? min), max);
      onChange?.(start ?? min, Math.max(e, start ?? min));
    }
  };

  const onMouseDown = (e) => {
    if (disabled || !trackRef.current) return;
    const which = pickHandleByPointer(e.clientX);
    draggingRef.current = which;
    moveToPointer(which, e.clientX);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    e.preventDefault();
  };
  const onMouseMove = (e) => {
    if (!draggingRef.current) return;
    moveToPointer(draggingRef.current, e.clientX);
  };
  const onMouseUp = () => {
    if (!draggingRef.current) return;
    draggingRef.current = null;
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
    onCommit?.();
  };

  const onTouchStart = (e) => {
    if (disabled || !trackRef.current) return;
    const t = e.touches[0]; if (!t) return;
    const which = pickHandleByPointer(t.clientX);
    draggingRef.current = which;
    moveToPointer(which, t.clientX);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
  };
  const onTouchMove = (e) => {
    if (!draggingRef.current) return;
    const t = e.touches[0]; if (!t) return;
    moveToPointer(draggingRef.current, t.clientX);
  };
  const onTouchEnd = () => {
    if (!draggingRef.current) return;
    draggingRef.current = null;
    window.removeEventListener("touchmove", onTouchMove);
    window.removeEventListener("touchend", onTouchEnd);
    onCommit?.();
  };

  const handleKeyDown = (which) => (e) => {
    if (disabled) return;
    const step = e.shiftKey ? 10 : 1;
    if (["ArrowLeft","ArrowRight","Home","End","PageDown","PageUp"].includes(e.key)) {
      e.preventDefault();
    }
    if (which === "start") {
      let s = start ?? min;
      if (e.key === "ArrowLeft" || e.key === "PageDown") s -= step;
      if (e.key === "ArrowRight"|| e.key === "PageUp")   s += step;
      if (e.key === "Home") s = min;
      if (e.key === "End")  s = end ?? max;
      s = clamp(s, min, (end ?? max));
      onChange?.(s, end ?? max);
      if (["ArrowLeft","ArrowRight","Home","End","PageDown","PageUp"].includes(e.key)) onCommit?.();
    } else {
      let eVal = end ?? max;
      if (e.key === "ArrowLeft" || e.key === "PageDown") eVal -= step;
      if (e.key === "ArrowRight"|| e.key === "PageUp")   eVal += step;
      if (e.key === "Home") eVal = start ?? min;
      if (e.key === "End")  eVal = max;
      eVal = clamp(eVal, (start ?? min), max);
      onChange?.(start ?? min, eVal);
      if (["ArrowLeft","ArrowRight","Home","End","PageDown","PageUp"].includes(e.key)) onCommit?.();
    }
  };

  return (
    <>
      <div
        ref={trackRef}
        className="gh-track"
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        role="group"
        aria-label="Time range"
      >
        <div
          className="gh-range-fill"
          style={{
            left: `${posStartPct}%`,
            width: `${Math.max(0, posEndPct - posStartPct)}%`
          }}
        />
        <button
          className="gh-handle"
          style={{ left: `${posStartPct}%` }}
          aria-label="Start year"
          onKeyDown={handleKeyDown("start")}
        />
        <button
          className="gh-handle"
          style={{ left: `${posEndPct}%` }}
          aria-label="End year"
          onKeyDown={handleKeyDown("end")}
        />
      </div>

      <style jsx>{`
        .gh-track {
          flex: 1 1 auto;
          position: relative;
          height: 8px;
          background: #e5e7eb;
          border-radius: 999px;
          cursor: pointer;
          user-select: none;
          touch-action: none;
        }
        .gh-range-fill {
          position: absolute;
          top: 0; bottom: 0;
          background: #3b82f6;
          border-radius: 999px;
        }
        .gh-handle {
          position: absolute;
          top: 50%;
          transform: translate(-50%, -50%);
          width: 18px; height: 18px;
          border-radius: 50%;
          border: 2px solid #fff;
          box-shadow: 0 0 0 1px rgba(0,0,0,.2);
          background: #111827;
          cursor: grab;
        }
        .gh-handle:focus { outline: none; box-shadow: 0 0 0 3px rgba(59,130,246,.35); }
      `}</style>
    </>
  );
}

/* ===== Page ===== */
export default function Page() {
  const [lang, setLang] = useState((process.env.NEXT_PUBLIC_LANG || "it").toLowerCase());
  const [q, setQ] = useState("");
  const [continent, setContinent] = useState("");
  const [country, setCountry] = useState("");
  const [location, setLocation] = useState("");
  const [group, setGroup] = useState("");

  // Attivazione esplicita: finché non interagisci, NON mostro marker
  const [activated, setActivated] = useState(false);

  // Bounds + periodo
  const DEFAULT_MIN = -3000;
  const DEFAULT_MAX = new Date().getFullYear();
  const [bounds, setBounds] = useState({ min: DEFAULT_MIN, max: DEFAULT_MAX, source: "default" });
  const [period, setPeriod] = useState({ start: null, end: null });

  // Stato eventi
  const [events, setEvents] = useState([]);
  const [markers, setMarkers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [focusEvent, setFocusEvent] = useState(null);

  const typingTimer = useRef(null);

  // Reader
  const synthRef = useRef(null), utterRef = useRef(null), readerIndexRef = useRef(0);
  useEffect(() => { synthRef.current = window.speechSynthesis; }, []);

  const hasAnyFilter = useMemo(
    () => !!(q || continent || country || location || group || period.start !== null || period.end !== null),
    [q, continent, country, location, group, period]
  );
  const canQuery = activated && hasAnyFilter;
  const noOtherFilters = useMemo(
    () => !(q || continent || country || location || group),
    [q, continent, country, location, group]
  );

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
      if (!res.ok) throw new Error("bounds not available");
      const data = await res.json();

      const min = Number.isFinite(data?.min_year) ? data.min_year : DEFAULT_MIN;
      const max = Number.isFinite(data?.max_year) ? data.max_year : DEFAULT_MAX;
      const normMin = Math.min(min, max);
      const normMax = Math.max(min, max);

      setBounds({ min: normMin, max: normMax, source: "api" });

      setPeriod((p) => {
        if (hardReset) return { start: normMin, end: normMax };
        let s = p.start == null ? normMin : clamp(p.start, normMin, normMax);
        let e = p.end == null ? normMax : clamp(p.end, normMin, normMax);
        if (s > e) s = e;
        return { start: s, end: e };
      });
    } catch {
      setBounds({ min: DEFAULT_MIN, max: DEFAULT_MAX, source: "default" });
      setPeriod((p) => {
        if (hardReset) return { start: DEFAULT_MIN, end: DEFAULT_MAX };
        let s = p.start == null ? DEFAULT_MIN : clamp(p.start, DEFAULT_MIN, DEFAULT_MAX);
        let e = p.end == null ? DEFAULT_MAX : clamp(p.end, DEFAULT_MIN, DEFAULT_MAX);
        if (s > e) s = e;
        return { start: s, end: e };
      });
    }
  }, [q, continent, country, location, group]);

  // Ricalcolo bounds SOLO quando serve:
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
        try { console.log(`[getEvents] rows=${normalized.length}, markers=${m.length}`); } catch {}
      })
      .catch(err => {
        console.error(err);
        setEvents([]); setMarkers([]); setSelected(null); setFocusEvent(null);
      });
  }, [canQuery, lang, q, continent, country, location, group, period.start, period.end, normalizeI18n]);

  /* ===== Notifiche dai filtri ===== */
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

  /* ===== Reset Range (richiesta #2) ===== */
  const onResetRange = useCallback(() => {
    if (noOtherFilters) {
      // Nessun filtro selezionato → niente marker in mappa
      setActivated(false);
      setPeriod({ start: null, end: null });
      setEvents([]); setMarkers([]); setSelected(null); setFocusEvent(null);
    } else {
      if (!activated) setActivated(true);
      setPeriod({ start: bounds.min, end: bounds.max });
    }
  }, [noOtherFilters, activated, bounds.min, bounds.max]);

  /* ===== Reader ===== */
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

  const onPlay = useCallback(() => {
    const synth = synthRef.current;
    if (synth?.paused) { synth.resume(); return; }
    const list = markers.length ? markers : events;
    if (!list.length) return;
    const idx = readerIndexRef.current || 0;
    const ev = list[idx] || list[0];
    setSelected(ev); setFocusEvent(ev); speakEvent(ev);
  }, [events, markers, speakEvent]);

  const onNext = useCallback(() => {
    const list = markers.length ? markers : events;
    if (!list.length) return;
    const from = readerIndexRef.current || 0;
    const to = Math.min(from + 1, list.length - 1);
    readerIndexRef.current = to;
    const ev = list[to];
    setSelected(ev); setFocusEvent(ev); speakEvent(ev);
  }, [events, markers, speakEvent]);

  const onPrev = useCallback(() => {
    const list = markers.length ? markers : events;
    if (!list.length) return;
    const from = readerIndexRef.current || 0;
    const to = Math.max(from - 1, 0);
    readerIndexRef.current = to;
    const ev = list[to];
    setSelected(ev); setFocusEvent(ev); speakEvent(ev);
  }, [events, markers, speakEvent]);

  const onPause = useCallback(() => {
    const synth = synthRef.current;
    if (synth?.speaking && !synth.paused) synth.pause();
  }, []);

  /* ===== UI ===== */
  return (
    <div className="app">
      {/* ===== BANDA SUPERIORE (bianca) con SOLO LOGO a sinistra ===== */}
      <header className="site-header">
        <div className="logo-wrap">
          <Image
            src="/logo.png"
            alt="GeoHistory Journey"
            fill
            sizes="(max-width: 768px) 160px, 200px"
            priority
            style={{ objectFit: "contain" }}
          />
        </div>
      </header>

      <div className="toolbar">
        <FiltersBar
          lang={lang} setLang={setLang}
          q={q} setQ={setQ}
          continent={continent} setContinent={setContinent}
          country={country} setCountry={setCountry}
          location={location} setLocation={setLocation}
          group={group} setGroup={setGroup}
          period={period}
          onFiltersChanged={onFiltersChanged}
        />
        <span className="spacer" />
        <strong>Visible events: {canQuery ? markers.length : 0} / {canQuery ? events.length : 0}</strong>
      </div>

      {/* ===== RIGA UNICA: Min | Slider | Max | Reset ===== */}
      <div className="time-inline">
        <label className="mm">
          <span>Min</span>
          <input
            type="number"
            value={(period.start ?? bounds.min)}
            onChange={(e)=>{
              const v = clamp(parseInt(e.target.value || 0, 10), bounds.min, (period.end ?? bounds.max));
              if (!activated) setActivated(true);
              setPeriod(p => ({ start: v, end: (p.end ?? bounds.max) }));
            }}
            onBlur={()=>{ if (canQuery) /* commit */ null; }}
          />
        </label>

        <RangeSlider
          min={bounds.min}
          max={bounds.max}
          start={period.start ?? bounds.min}
          end={period.end ?? bounds.max}
          onChange={(s,e) => {
            if (!activated) setActivated(true);
            setPeriod({ start: clamp(s, bounds.min, bounds.max), end: clamp(e, bounds.min, bounds.max) });
          }}
          onCommit={() => { if (canQuery) /* commit → fetch */ null; }}
          disabled={bounds.min === bounds.max}
        />

        <label className="mm">
          <span>Max</span>
          <input
            type="number"
            value={(period.end ?? bounds.max)}
            onChange={(e)=>{
              const v = clamp(parseInt(e.target.value || 0, 10), (period.start ?? bounds.min), bounds.max);
              if (!activated) setActivated(true);
              setPeriod(p => ({ start: (p.start ?? bounds.min), end: v }));
            }}
            onBlur={()=>{ if (canQuery) /* commit */ null; }}
          />
        </label>

        <button onClick={onResetRange} className="btn-reset">Reset Range</button>
      </div>

      <div className="main">
        <section className="panel">
          <MapView
            markers={canQuery ? markers : []}
            onSelect={(ev) => {
              setSelected(ev);
              const list = markers.length ? markers : events;
              const idx = Math.max(0, list.findIndex(x => x.id === ev.id));
              readerIndexRef.current = idx;
            }}
            focusEvent={focusEvent}
          />
        </section>
        <DetailsPanel event={selected} onPrev={onPrev} onPlay={onPlay} onPause={onPause} onNext={onNext} />
      </div>

      <style jsx>{`
        /* ===== HEADER (banda bianca) ===== */
        .site-header{
          position: relative;
          z-index: 20;
          display: flex;
          align-items: center;
          padding: 8px 12px;
          background: #ffffff;               /* banda bianca */
          border-bottom: 1px solid #e5e7eb;
          height: 64px;                      /* altezza barra */
        }
        .logo-wrap{
          position: relative;
          height: 100%;                      /* logo alto quanto la barra */
          width: 220px;                      /* spazio per non schiacciare il logo */
        }

        .time-inline {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 12px 0 12px;
        }
        .mm {
          display: inline-flex;
          flex-direction: column;
          gap: 4px;
          min-width: 120px;
          font-size: 12px;
          color: #6b7280;
        }
        .mm input {
          width: 120px;
          padding: 6px 8px;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 14px;
        }
        .btn-reset {
          border: 1px solid #d1d5db;
          background: #f9fafb;
          border-radius: 8px;
          padding: 8px 12px;
          font-size: 14px;
          white-space: nowrap;
        }
      `}</style>
    </div>
  );
}

