// frontend/app/module/group_event/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import maplibregl, { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { supabase } from "@/lib/supabaseBrowserClient";

/* =========================================================================
   SCHEMA (confermato)
   - group_events: id, title, pitch, cover_url, description, ...
   - event_group_event: (event_id, group_event_id)
   - events_list: id, latitude, longitude, exact_date, year_from, year_to, location, ...
   - event_translations: event_id, lang, title, description, description_short, wikipedia_url
   ========================================================================= */

type AnyObj = Record<string, any>;
type EventCore = {
  id: string;
  latitude: number | null;
  longitude: number | null;
  exact_date?: string | null;
  year_from?: number | null;
  year_to?: number | null;
  location?: string | null;
};
type EventVM = EventCore & {
  title: string;
  description: string;
  wiki_url: string | null;
  order_key: number;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function dateOrderKey(e: { exact_date?: string | null; year_from?: number | null; year_to?: number | null }) {
  if (e.exact_date) return new Date(e.exact_date).getTime();
  if (typeof e.year_from === "number") return e.year_from * 10000;
  if (typeof e.year_to === "number") return e.year_to * 10000 + 1;
  return 9_999_999_999;
}

// Stile fallback OSM (se manca MAPTILER)
const OSM_STYLE: any = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: [
        "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

export default function GroupEventModulePage() {
  const router = useRouter();
  const sp = useSearchParams();

  // ----- DEBUG -----
  const debug =
    sp.get("debug") === "1" ||
    (sp.get("gid") ? sp.get("gid")!.includes("debug=1") : false);

  // ----- GID sanitize -----
  const [gid, setGid] = useState<string | null>(null);
  useEffect(() => {
    const raw = sp.get("gid")?.trim() ?? null;
    if (raw) {
      const clean = raw.split("?")[0].split("&")[0].trim();
      if (UUID_RE.test(clean)) {
        setGid(clean);
        if (debug) console.log("[GE] gid OK:", clean);
        return;
      } else {
        if (debug) console.warn("[GE] gid non valido:", raw);
      }
    }
    try {
      const ls = typeof window !== "undefined" ? localStorage.getItem("active_group_event_id") : null;
      if (ls && UUID_RE.test(ls)) {
        setGid(ls);
        if (debug) console.log("[GE] gid from localStorage:", ls);
      } else {
        setErr('Missing/invalid gid. Usa /module/group_event?gid=<UUID>&debug=1 oppure apri da Favourites.');
        setLoading(false);
      }
    } catch {
      setErr('Missing/invalid gid. Usa /module/group_event?gid=<UUID>&debug=1 oppure apri da Favourites.');
      setLoading(false);
    }
  }, [sp, debug]);

  // ----- Landing href -----
  const [landingHref, setLandingHref] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const ref = (typeof document !== "undefined" && document.referrer) || "";
        if (ref) {
          try {
            const u = new URL(ref);
            if (/^\/landing\/[^/]+$/i.test(u.pathname)) {
              setLandingHref(u.pathname);
              return;
            }
          } catch {}
        }
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData?.user?.id ?? null;
        if (!uid) {
          setLandingHref("/landing");
          return;
        }
        const { data: prof } = await supabase
          .from("profiles")
          .select("landing_slug, persona, persona_code")
          .eq("id", uid)
          .maybeSingle();
        const slug =
          (prof as any)?.landing_slug ?? (prof as any)?.persona ?? (prof as any)?.persona_code ?? null;
        setLandingHref(slug ? `/landing/${slug}` : "/landing");
      } catch {
        setLandingHref("/landing");
      }
    })();
  }, []);

  // ----- Dati -----
  const [ge, setGe] = useState<AnyObj | null>(null);
  const [rows, setRows] = useState<EventVM[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [noGeoBanner, setNoGeoBanner] = useState(false);

  // ----- Mappa & stato -----
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<MapLibreMarker[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);

  // ---- INIT MAP: forzata client-only + retry fino a container pronto ----
  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 40; // ~40 frame

    function tryInit() {
      if (cancelled) return;
      if (typeof window === "undefined") {
        if (debug) console.warn("[GE] window undefined, skip");
        return;
      }
      if (mapRef.current) {
        if (debug) console.log("[GE] mapRef esiste già");
        return;
      }
      const container = document.getElementById("gehj-map");
      if (!container) {
        attempts++;
        if (attempts <= MAX_ATTEMPTS) {
          if (debug) console.log("[GE] container non trovato, retry", attempts);
          requestAnimationFrame(tryInit);
        } else {
          console.error("[GE] container mappa non trovato dopo i retry");
        }
        return;
      }

      // forza dimensioni utili
      (container as HTMLDivElement).style.minHeight = "60vh";
      (container as HTMLDivElement).style.height = "100%";
      (container as HTMLDivElement).style.width = "100%";

      const apiKey = process.env.NEXT_PUBLIC_MAPTILER_KEY;
      const style = apiKey
        ? `https://api.maptiler.com/maps/hybrid/style.json?key=${apiKey}`
        : OSM_STYLE;

      try {
        const map = new maplibregl.Map({
          container,
          style,
          center: [9.19, 45.46],
          zoom: 4,
          cooperativeGestures: true,
        });
        map.addControl(new maplibregl.NavigationControl(), "top-right");
        mapRef.current = map;
        setMapReady(true);
        if (debug) console.log("[GE] Map created ✓ (style:", apiKey ? "MapTiler" : "OSM", ")");

        map.on("load", () => {
          setMapLoaded(true);
          if (debug) console.log("[GE] Map loaded ✓");
        });

        map.on("error", (e) => {
          console.error("[GE] Map error:", e);
        });

        // resize safe
        const ro = new ResizeObserver(() => {
          try {
            map.resize();
          } catch {}
        });
        ro.observe(container);
      } catch (e) {
        console.error("[GE] new maplibregl.Map error:", e);
      }
    }

    // parte il ciclo di retry
    requestAnimationFrame(tryInit);
    return () => {
      cancelled = true;
    };
  }, [debug]);

  // ---- Fetch dati ----
  useEffect(() => {
    if (!gid) return;
    let active = true;

    (async () => {
      try {
        setLoading(true);
        setErr(null);
        if (debug) console.log("[GE] Fetch start", { gid });

        // 1) group_event
        const { data: geRows, error: geErr } = await supabase
          .from("group_events")
          .select("*")
          .eq("id", gid)
          .limit(1);
        if (geErr) throw geErr;
        if (!geRows?.length) throw new Error("Group event not found");
        const geData = geRows[0];

        // 2) event link → events_list(*)
        const { data: links, error: linkErr } = await supabase
          .from("event_group_event")
          .select("event_id, events_list(*)")
          .eq("group_event_id", gid);
        if (linkErr) throw linkErr;

        const cores: EventCore[] =
          (links ?? [])
            .map((r: any) => r.events_list)
            .filter(Boolean)
            .map((e: any) => ({
              id: String(e.id),
              latitude: typeof e.latitude === "number" ? e.latitude : null,
              longitude: typeof e.longitude === "number" ? e.longitude : null,
              exact_date: e.exact_date ?? null,
              year_from: e.year_from ?? null,
              year_to: e.year_to ?? null,
              location: e.location ?? null,
            })) || [];

        // 3) translations (prefer it)
        const ids = cores.map((c) => c.id);
        const trMap = new Map<
          string,
          { title?: string | null; description?: string | null; description_short?: string | null; wikipedia_url?: string | null }
        >();
        if (ids.length) {
          const { data: trs } = await supabase
            .from("event_translations")
            .select("event_id, lang, title, description, description_short, wikipedia_url")
            .in("event_id", ids);

          (trs ?? []).forEach((t: any) => {
            if (!trMap.has(t.event_id)) trMap.set(t.event_id, t);
          });
          (trs ?? [])
            .filter((t: any) => t.lang === "it")
            .forEach((t: any) => trMap.set(t.event_id, t));
        }

        const vms: EventVM[] = cores.map((c) => {
          const tr = trMap.get(c.id) || ({} as any);
          return {
            ...c,
            title: (tr?.title ?? c.location ?? "Untitled").toString(),
            description: (tr?.description ?? tr?.description_short ?? "").toString(),
            wiki_url: tr?.wikipedia_url ? String(tr.wikipedia_url) : null,
            order_key: dateOrderKey(c),
          };
        });

        vms.sort((a, b) => a.order_key - b.order_key);

        if (active) {
          setGe(geData);
          setRows(vms);
          setSelectedIndex(0);
          setNoGeoBanner(!vms.some((v) => v.latitude !== null && v.longitude !== null));
          if (debug)
            console.log("[GE] Fetch ok", {
              events: vms.length,
              withCoords: vms.filter((v) => v.latitude !== null && v.longitude !== null).length,
            });
        }
      } catch (e: any) {
        if (active) setErr(e?.message ?? "Unknown error");
        console.error("[GE] Fetch error:", e);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [gid, debug]);

  // ---- Markers + fit (dopo mappa pronta) ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    // pulizia
    (markersRef.current || []).forEach((m) => m.remove());
    markersRef.current = [];

    const pts: [number, number][] = [];

    rows.forEach((ev, idx) => {
      if (ev.latitude === null || ev.longitude === null) return;
      const el = document.createElement("div");
      el.className =
        "rounded-full border border-black/30 bg-amber-400/95 text-black text-[11px] font-bold px-2 py-1 shadow cursor-pointer";
      el.textContent = `${idx + 1}`;
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([ev.longitude, ev.latitude])
        .addTo(map);
      el.addEventListener("click", () => setSelectedIndex(idx));
      markersRef.current.push(marker);
      pts.push([ev.longitude, ev.latitude]);
    });

    if (debug) console.log("[GE] Markers placed:", markersRef.current.length);

    if (pts.length) {
      // TIPIZZAZIONE ESPLICITA del reduce + initialValue coerente
      const bounds = pts.reduce<[[number, number], [number, number]]>(
        (b, c) => [
          [Math.min(b[0][0], c[0]), Math.min(b[0][1], c[1])],
          [Math.max(b[1][0], c[0]), Math.max(b[1][1], c[1])],
        ],
        [
          [pts[0][0], pts[0][1]],
          [pts[0][0], pts[0][1]],
        ]
      );

      try {
        map.fitBounds(bounds as any, { padding: 72, duration: 700 });
      } catch (e) {
        if (debug) console.log("[GE] fitBounds error:", e);
      }
    } else {
      try {
        map.flyTo({ center: [9.19, 45.46], zoom: 3.5, duration: 500 });
      } catch {}
    }
  }, [rows, mapReady, debug]);

  // ---- Player ----
  useEffect(() => {
    let t: any = null;
    if (isPlaying && rows.length > 0) {
      t = setInterval(() => {
        setSelectedIndex((i) => (i + 1) % rows.length);
      }, 3200);
    }
    return () => t && clearInterval(t);
  }, [isPlaying, rows.length]);

  // ---- Pan selezione ----
  useEffect(() => {
    const map = mapRef.current;
    const ev = rows[selectedIndex];
    if (!map || !ev || ev.latitude === null || ev.longitude === null) return;
    try {
      map.flyTo({ center: [ev.longitude, ev.latitude], zoom: Math.max(map.getZoom(), 6), speed: 0.8 });
    } catch {}
  }, [selectedIndex, rows]);

  const selected = useMemo(() => rows[selectedIndex] ?? null, [rows, selectedIndex]);

  // ---- Back ----
  function onBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(landingHref || "/module/favourites");
  }

  // ---- Render ----
  const geTitle = (ge?.title ?? "Journey").toString();
  const geSubtitle = (ge?.pitch ?? "").toString();
  const geCover = ge?.cover_url ?? null;

  if (loading) return <div className="p-6 text-sm text-gray-600">Loading Journey…</div>;

  if (err)
    return (
      <div className="p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800 shadow-sm">
          <div className="mb-1 font-semibold">Error</div>
          <div>{err}</div>
        </div>
        <div className="mt-4">
          <button onClick={onBack} className="rounded-lg border bg-white px-3 py-1.5 hover:bg-gray-50">
            ← Back
          </button>
        </div>
      </div>
    );

  return (
    <div className="flex h-[100dvh] flex-col">
      {/* HEADER (estetica) */}
      <header className="w-full border-b bg-gradient-to-r from-amber-50 via-white to-white">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          {geCover ? (
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl ring-1 ring-black/10 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={geCover} alt={geTitle} className="h-full w-full object-cover" />
            </div>
          ) : (
            <div className="h-14 w-14 shrink-0 rounded-xl bg-amber-100 ring-1 ring-black/10" />
          )}
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold leading-tight">{geTitle}</h1>
            {geSubtitle ? <p className="line-clamp-2 text-sm text-gray-600">{geSubtitle}</p> : null}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
              title="Back"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Back
            </button>
          </div>
        </div>
      </header>

      {/* DEBUG BAR (se &debug=1) */}
      {debug && (
        <div className="border-b bg-yellow-50 px-4 py-2 text-xs text-yellow-900">
          <div className="mx-auto max-w-7xl flex flex-wrap gap-x-6 gap-y-1">
            <div><b>gid:</b> {gid || "—"}</div>
            <div><b>events:</b> {rows.length}</div>
            <div><b>withCoords:</b> {rows.filter(r => r.latitude !== null && r.longitude !== null).length}</div>
            <div><b>mapReady:</b> {String(mapReady)}</div>
            <div><b>mapLoaded:</b> {String(mapLoaded)}</div>
            <div><b>markers:</b> {(markersRef.current || []).length}</div>
            <div><b>landingHref:</b> {landingHref || "—"}</div>
          </div>
        </div>
      )}

      {/* BODY */}
      <div className="grid flex-1 grid-cols-12 gap-0">
        {/* MAP */}
        <div className="relative col-span-12 border-r lg:col-span-8">
          <div id="gehj-map" className="absolute inset-0" />
          {noGeoBanner && (
            <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs text-amber-800 shadow">
              Nessun evento geolocalizzato per questo Journey
            </div>
          )}
          {/* Player */}
          <div className="absolute left-0 right-0 bottom-0 border-t bg-white/90 backdrop-blur">
            <div className="mx-auto flex max-w-5xl items-center gap-2 px-3 py-2">
              <button
                onClick={() => setSelectedIndex((i) => (rows.length ? (i - 1 + rows.length) % rows.length : 0))}
                className="inline-flex items-center justify-center rounded-md border bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
                title="Previous"
              >
                ⏮
              </button>
              <button
                onClick={() => setIsPlaying((p) => !p)}
                className="inline-flex items-center justify-center rounded-md border bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
                title={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? "⏸" : "▶"}
              </button>
              <button
                onClick={() => setSelectedIndex((i) => (rows.length ? (i + 1) % rows.length : 0))}
                className="inline-flex items-center justify-center rounded-md border bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
                title="Next"
              >
                ⏭
              </button>

              <div className="ml-3 text-sm text-gray-600">
                {rows.length ? (
                  <>
                    Event <span className="font-semibold">{selectedIndex + 1}</span> of{" "}
                    <span className="font-semibold">{rows.length}</span>
                  </>
                ) : (
                  "No events"
                )}
              </div>

              <div className="ml-auto truncate text-sm text-gray-500">{selected ? selected.title : "—"}</div>
            </div>
          </div>
        </div>

        {/* SIDEBAR */}
        <aside className="col-span-12 h-full overflow-auto bg-gray-50 lg:col-span-4">
          <div className="flex h-full flex-col">
            <div className="border-b bg-white/90 px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-gray-500">Selected event</div>
              <div className="text-base font-semibold">{selected ? selected.title : "—"}</div>
            </div>

            <div className="flex-1 overflow-auto p-4">
              {selected ? (
                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="space-y-3">
                    <p className="whitespace-pre-wrap text-sm text-gray-700">
                      {selected.description || "No description available."}
                    </p>

                    <div className="text-sm text-gray-600">
                      {selected.exact_date ? (
                        <div>
                          <span className="font-medium">Date:</span>{" "}
                          {new Date(selected.exact_date).toLocaleDateString()}
                        </div>
                      ) : selected.year_from ? (
                        <div>
                          <span className="font-medium">Year:</span> {selected.year_from}
                          {selected.year_to ? ` – ${selected.year_to}` : ""}
                        </div>
                      ) : null}
                    </div>

                    <div className="text-xs text-gray-500">
                      {selected.latitude !== null && selected.longitude !== null
                        ? `Lat/Lng: ${selected.latitude.toFixed(5)}, ${selected.longitude.toFixed(5)}`
                        : "Lat/Lng: —"}
                    </div>

                    {selected.wiki_url ? (
                      <div className="pt-1">
                        <a
                          href={selected.wiki_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-blue-700 underline"
                        >
                          Open Wikipedia
                        </a>
                      </div>
                    ) : null}
                  </div>

                  {/* Jump rapido */}
                  <div className="mt-6">
                    <div className="mb-2 text-sm font-medium">Jump to event</div>
                    <div className="grid grid-cols-6 gap-2">
                      {rows.map((ev, idx) => (
                        <button
                          key={ev.id}
                          onClick={() => setSelectedIndex(idx)}
                          className={`rounded-lg border px-2 py-1 text-xs ${
                            idx === selectedIndex ? "border-black bg-black text-white" : "bg-white hover:bg-gray-50"
                          }`}
                          title={ev.title}
                        >
                          {idx + 1}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-500">Select a marker on the map.</div>
              )}
            </div>

            {(ge?.description) ? (
              <div className="border-t bg-white/90 px-4 py-3">
                <div className="mb-1 text-sm font-semibold">About this Journey</div>
                <div className="whitespace-pre-wrap text-sm text-gray-700">
                  {ge.description?.toString?.() ?? ""}
                </div>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
