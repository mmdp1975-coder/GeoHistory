"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FiltersBar from "../components/FiltersBar";
import DetailsPanel from "../components/DetailsPanel";
import { getEvents } from "../lib/api";

const MapView = dynamic(() => import("../components/MapView"), { ssr: false });

function makeTimeline(start=-3000, end=(new Date().getFullYear()), step=500) {
  const arr = [];
  for (let y = start; y <= end; y += step) {
    const e = y + step - 1;
    arr.push({ start: y, end: e, label: `${y<0?(-y+' BC'):y} – ${e<0?(-e+' BC'):e}` });
  }
  return arr;
}

export default function Page() {
  const [lang, setLang] = useState((process.env.NEXT_PUBLIC_LANG || "it").toLowerCase());
  const [q, setQ] = useState("");
  const [continent, setContinent] = useState("");
  const [country, setCountry] = useState("");
  const [location, setLocation] = useState("");
  const [group, setGroup] = useState("");
  const [period, setPeriod] = useState({ start: null, end: null });
  const [activeSeg, setActiveSeg] = useState(null);

  const [events, setEvents] = useState([]);    // elenco eventi filtrati (per reader)
  const [markers, setMarkers] = useState([]);  // solo quelli con coordinate
  const [selected, setSelected] = useState(null);
  const [focusEvent, setFocusEvent] = useState(null);

  const timeline = useMemo(() => makeTimeline(), []);
  const typingTimer = useRef(null);

  // Speech
  const synthRef = useRef(null);
  const utterRef = useRef(null);
  const readerIndexRef = useRef(0);

  useEffect(() => { synthRef.current = window.speechSynthesis; }, []);

  const filtersActive = useMemo(() => {
    return !!(q || continent || country || location || group || period.start !== null || period.end !== null);
  }, [q, continent, country, location, group, period]);

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

  const applyFilters = useCallback(() => {
    if (!filtersActive) {
      setEvents([]); setMarkers([]); setSelected(null); setFocusEvent(null);
      return;
    }
    getEvents({
      lang: lang.toUpperCase(),
      q, continent, country, location, group,
      year_start: period.start, year_end: period.end,
      limit: 2000
    })
    .then(rows => {
      setEvents(rows);
      const m = rows.filter(r =>
        r.latitude !== null && r.longitude !== null && isFinite(r.latitude) && isFinite(r.longitude)
      );
      setMarkers(m);
      setSelected(null);
      setFocusEvent(null);
      readerIndexRef.current = 0;
    })
    .catch(err => {
      console.error(err);
      setEvents([]); setMarkers([]); setSelected(null); setFocusEvent(null);
    });
  }, [filtersActive, lang, q, continent, country, location, group, period.start, period.end]);

  const onFiltersChanged = useCallback((action) => {
    if (action === "reset") {
      setQ(""); setContinent(""); setCountry(""); setLocation(""); setGroup("");
      setPeriod({ start: null, end: null }); setActiveSeg(null);
      setEvents([]); setMarkers([]); setSelected(null); setFocusEvent(null);
      readerIndexRef.current = 0;
      return;
    }
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => applyFilters(), 250);
  }, [applyFilters]);

  useEffect(() => { applyFilters(); }, [continent, country, location, group, period, lang]); // eslint-disable-line
  useEffect(() => {
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => applyFilters(), 350);
  }, [q]); // eslint-disable-line

  // Reader controls
  const onPlay = useCallback(() => {
    const synth = synthRef.current;
    if (synth?.paused) { synth.resume(); return; }
    const list = markers.length ? markers : events;
    if (!list.length) return;
    const idx = readerIndexRef.current || 0;
    const ev = list[idx] || list[0];
    setSelected(ev);
    setFocusEvent(ev);
    speakEvent(ev);
  }, [events, markers, speakEvent]);

  const onNext = useCallback(() => {
    const list = markers.length ? markers : events;
    if (!list.length) return;
    const from = readerIndexRef.current || 0;
    const to = Math.min(from + 1, list.length - 1);
    readerIndexRef.current = to;
    const ev = list[to];
    setSelected(ev);
    setFocusEvent(ev);
    speakEvent(ev);
  }, [events, markers, speakEvent]);

  const onPrev = useCallback(() => {
    const list = markers.length ? markers : events;
    if (!list.length) return;
    const from = readerIndexRef.current || 0;
    const to = Math.max(from - 1, 0);
    readerIndexRef.current = to;
    const ev = list[to];
    setSelected(ev);
    setFocusEvent(ev);
    speakEvent(ev);
  }, [events, markers, speakEvent]);

  const onPause = useCallback(() => {
    const synth = synthRef.current;
    if (synth?.speaking && !synth.paused) synth.pause();
  }, []);

  return (
    <div className="app">
      <header className="site-header">
        GeoHistory Journey – MVP-02 (React-Leaflet + Backend)
      </header>

      <div className="toolbar">
        <FiltersBar
          lang={lang} setLang={setLang}
          q={q} setQ={setQ}
          continent={continent} setContinent={setContinent}
          country={country} setCountry={setCountry}
          location={location} setLocation={setLocation}
          group={group} setGroup={setGroup}
          onFiltersChanged={onFiltersChanged}
        />
        <span className="spacer" />
        <strong>Visible events: {markers.length}</strong>
      </div>

      <div className="timeline">
        {timeline.map((seg, idx) => (
          <button
            key={idx}
            className={activeSeg === idx ? "active" : ""}
            onClick={() => {
              setActiveSeg(idx);
              setPeriod({ start: seg.start, end: seg.end });
            }}
          >
            {seg.label}
          </button>
        ))}
        <button
          onClick={() => { setActiveSeg(null); setPeriod({ start: null, end: null }); }}
          style={{ marginLeft: ".5rem" }}
        >
          Clear Period
        </button>
      </div>

      <div className="main">
        <section className="panel">
          <MapView
            markers={filtersActive ? markers : []}
            onSelect={(ev) => {
              setSelected(ev);
              const list = markers.length ? markers : events;
              const idx = Math.max(0, list.findIndex(x => x.id === ev.id));
              readerIndexRef.current = idx;
            }}
            focusEvent={focusEvent}
          />
        </section>
        <DetailsPanel
          event={selected}
          onPrev={onPrev}
          onPlay={onPlay}
          onPause={onPause}
          onNext={onNext}
        />
      </div>
    </div>
  );
}
