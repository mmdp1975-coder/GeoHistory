// src/app/explore/page.tsx
"use client";

import { useMemo, useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { getEvents } from "../../lib/api";

const MapView = dynamic(async () => (await import("../../components/MapView.jsx")).default, { ssr: false });
const FiltersBar = dynamic(async () => (await import("../../components/FiltersBar.jsx")).default, { ssr: false });
const TimelineSlider = dynamic(async () => (await import("../../components/TimelineSlider.jsx")).default, { ssr: false });

const MIN_YEAR = -5000;
const MAX_YEAR = 2025;

type Ev = any;

export default function ExplorePage() {
  const router = useRouter();

  /* Timeline */
  const [min] = useState(MIN_YEAR);
  const [max] = useState(MAX_YEAR);
  const [start, setStart] = useState(MIN_YEAR);
  const [end, setEnd] = useState(MAX_YEAR);

  /* Filtri */
  const baseLang = (process.env.NEXT_PUBLIC_LANG || "it").toLowerCase();
  const [lang, setLang] = useState(baseLang);
  const [q, setQ] = useState("");
  const [continent, setContinent] = useState("");
  const [country, setCountry] = useState("");
  const [location, setLocation] = useState("");
  const [group, setGroup] = useState("");

  /* Mappa / drawer */
  const [markers, setMarkers] = useState<Ev[]>([]);
  const [fitSignal, setFitSignal] = useState(0);
  const [isFiltersOpen, setFiltersOpen] = useState(false);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);

  const onTimelineChange = (s: number, e: number) => { setStart(s); setEnd(e); };
  const onWiden = (side: "left" | "right") => {
    if (side === "left") setStart((s) => Math.max(MIN_YEAR, s - Math.ceil((end - start) * 0.2)));
    else setEnd((e) => Math.min(MAX_YEAR, e + Math.ceil((end - start) * 0.2)));
  };

  // Aggiorna querystring
  const updateUrl = () => {
    const params = new URLSearchParams();
    if (group)     params.set("group", group);
    if (continent) params.set("continent", continent);
    if (country)   params.set("country", country);
    if (location)  params.set("location", location);
    if (q)         params.set("q", q);
    params.set("year_start", String(start));
    params.set("year_end",   String(end));
    params.set("lang",       String(lang).toLowerCase());
    const url = `/explore?${params.toString()}`;
    window.history.replaceState(null, "", url);
  };

  // Normalizza coordinate
  const normalizeEvents = (evs: Ev[]) => {
    return (evs || []).map(e => {
      const latitude  = Number(e.latitude ?? e.lat ?? e.y ?? null);
      const longitude = Number(e.longitude ?? e.lng ?? e.x ?? null);
      return {
        ...e,
        latitude: Number.isFinite(latitude) ? latitude : null,
        longitude: Number.isFinite(longitude) ? longitude : null,
      };
    });
  };

  // APPLY: carica eventi, chiude drawer, fit
  const applyFilters = async () => {
    try {
      setIsLoadingEvents(true);
      updateUrl();

      const res = await getEvents({
        group,
        continent,
        country,
        location,
        q,
        year_start: start,
        year_end: end,
        lang,
        limit: 20000,
      });

      const evs = normalizeEvents(res);
      setMarkers(evs);
      setFitSignal(n => n + 1);   // trigger fit
      setFiltersOpen(false);
    } finally {
      setIsLoadingEvents(false);
    }
  };

  // ESC chiude filtri
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setFiltersOpen(false); };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, []);

  const initialMarkers = useMemo(() => [], []);

  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#F9FAFB", color: "#111827" }}>
      {/* Header */}
      <header
        style={{
          background: "#FFFFFF",
          color: "#111827",
          borderBottom: "1px solid rgba(17,24,39,.08)",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "10px 12px", display: "flex", alignItems: "center", gap: 12 }}>
          <img
            src="/logo.png"
            alt="GeoHistory Journey"
            style={{ height: 36, cursor: "pointer" }}
            onClick={() => router.back()}
          />
          <strong>Explorer Map</strong>
        </div>
      </header>

      {/* Timeline */}
      <section style={{ padding: "10px 12px", background: "#fff", borderBottom: "1px solid #e5e7eb" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <TimelineSlider min={min} max={max} start={start} end={end} onChange={onTimelineChange} onWiden={onWiden} />
        </div>
      </section>

      {/* Map */}
      <section style={{ flex: 1, minHeight: 0 }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", height: "100%", padding: "10px 12px" }}>
          <div style={{ position: "relative", background: "#FFFFFF", border: "1px solid rgba(17,24,39,.08)", borderRadius: 12, overflow: "hidden", height: "calc(100vh - 180px)" }}>
            {/* Badge conteggio eventi */}
            <div style={{ position: "absolute", zIndex: 5, top: 8, left: 8, background: "rgba(17,24,39,.75)", color: "#fff", borderRadius: 8, padding: "4px 8px", fontSize: 12 }}>
              {markers.length} events
            </div>

            <MapView
              markers={markers.length ? markers : initialMarkers}
              fitSignal={fitSignal}
              fitPadding={{ top: 12, right: 12, bottom: 12, left: 12 }}
              defaultBase="sat"     // <<< satellite di default
            />
          </div>
        </div>
      </section>

      {/* Pulsante floating Filters */}
      <button
        onClick={() => setFiltersOpen(true)}
        aria-label="Open filters"
        style={{
          position: "fixed",
          right: 16,
          bottom: 16,
          zIndex: 120,
          display: "flex",
          alignItems: "center",
          gap: 10,
          cursor: "pointer",
          background: "#111827",
          color: "#fff",
          borderRadius: 999,
          padding: "10px 14px",
          boxShadow: "0 8px 22px rgba(17,24,39,.18)",
          border: "1px solid rgba(255,255,255,.08)"
        }}
        disabled={isLoadingEvents}
      >
        <span style={{ height: 28, width: 28, background: "rgba(255,255,255,.12)", borderRadius: 999, display: "grid", placeItems: "center", fontSize: 16 }}>☰</span>
        <span style={{ fontWeight: 700 }}>{isLoadingEvents ? "Loading…" : "Filters"}</span>
      </button>

      {/* Drawer Filtri — zIndex alto per non sovrapporsi ai controlli mappa */}
      {isFiltersOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1500,
            display: "flex",
            pointerEvents: "none",
          }}
          onClick={() => setFiltersOpen(false)}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(17,24,39,.35)",
              zIndex: 0,
            }}
          />
          <aside
            style={{
              marginLeft: "auto",
              width: "min(520px, 90vw)",
              height: "100%",
              background: "transparent",
              pointerEvents: "auto",
              display: "flex",
              alignItems: "stretch",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ width: "100%", height: "100%", padding: 12, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <h3 style={{ fontWeight: 800, fontSize: 16 }}>Filters</h3>
                <button
                  onClick={() => setFiltersOpen(false)}
                  style={{ fontSize: 13, padding: "6px 10px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff" }}
                >
                  Close
                </button>
              </div>

              <div style={{ overflowY: "auto" }}>
                <FiltersBar
                  lang={lang} setLang={setLang}
                  q={q} setQ={setQ}
                  continent={continent} setContinent={setContinent}
                  country={country} setCountry={setCountry}
                  location={location} setLocation={setLocation}
                  group={group} setGroup={setGroup}
                  period={{ start, end }}
                  onApply={applyFilters}       // chiude + carica eventi + fit
                  onFiltersChanged={updateUrl}
                  onClose={() => setFiltersOpen(false)}
                />
              </div>
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}
