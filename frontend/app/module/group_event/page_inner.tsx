// frontend/app/module/group_event/page_inner.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import maplibregl, { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { supabase } from "@/lib/supabaseBrowserClient";

/* =========================================================================
   SCHEMA
   - events_list: id, latitude, longitude, exact_date, year_from, year_to, location, ...
   - event_group_event: event_id → group_event_id
   - event_translations: event_id, lang, title, description, description_short, wikipedia_url
   - event_type_map: event_id, type_code
   - event_types: code (PK), icon, icon_name
   - group_events: id, title, pitch, cover_url, description, ...
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

// Fallback OSM se manca MAPTILER
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

/* Libreria icone inline */
const MODERN_ICONS: Record<string, string> = {
  pin: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z"/><circle cx="12" cy="11" r="3"/></svg>`,
  battle: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9l-1-1 7-7 1 1-7 7z"/><path d="M3 21l6-6"/><path d="M3 17l4 4"/></svg>`,
  castle: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 22V8l3-2 3 2 3-2 3 2 3-2 3 2v14"/><path d="M3 14h18"/><path d="M8 22v-6h8v6"/></svg>`,
  museum: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10l9-6 9 6"/><path d="M21 10v9H3V10"/><path d="M7 21v-8m5 8v-8m5 8v-8"/></svg>`,
  ship: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 19s3 2 9 2 9-2 9-2"/><path d="M5 18l2-7h10l2 7"/><path d="M7 11V6h10v5"/></svg>`,
  church: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v6"/><path d="M8 8h8"/><path d="M6 22V12l6-4 6 4v10"/><path d="M10 22v-6h4v6"/></svg>`,
  monument: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3h4l3 6-5 5-5-5 3-6z"/><path d="M4 21h16"/></svg>`,
  dig: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 22h20"/><path d="M7 22v-7l4-4 4 4v7"/></svg>`,
  person: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7" r="4"/><path d="M5.5 21a8.5 8.5 0 0 1 13 0"/></svg>`,
};
function normalizeIconKey(s?: string | null): string | null {
  if (!s) return null;
  const k = s.toLowerCase().trim();
  const key = k.replace(/[^a-z0-9_-]+/g, "");
  return key || null;
}

export default function GroupEventModulePage() {
  const router = useRouter();
  const sp = useSearchParams();
  const debug =
    sp.get("debug") === "1" ||
    (sp.get("gid") ? sp.get("gid")!.includes("debug=1") : false);

  // GID sanitize
  const [gid, setGid] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [landingHref, setLandingHref] = useState<string | null>(null);

  useEffect(() => {
    const raw = sp.get("gid")?.trim() ?? null;
    if (raw) {
      const clean = raw.split("?")[0].split("&")[0].trim();
      if (UUID_RE.test(clean)) setGid(clean);
      else setErr("Missing/invalid gid. Usa /module/group_event?gid=<UUID>&debug=1 oppure apri da Favourites.");
    } else {
      try {
        const ls = typeof window !== "undefined" ? localStorage.getItem("active_group_event_id") : null;
        if (ls && UUID_RE.test(ls)) setGid(ls);
        else setErr("Missing/invalid gid. Usa /module/group_event?gid=<UUID>&debug=1 oppure apri da Favourites.");
      } catch {
        setErr("Missing/invalid gid. Usa /module/group_event?gid=<UUID>&debug=1 oppure apri da Favourites.");
      }
    }
  }, [sp]);

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

  // Dati
  const [ge, setGe] = useState<AnyObj | null>(null);
  const [rows, setRows] = useState<EventVM[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [noGeoBanner, setNoGeoBanner] = useState(false);

  // Icone
  const [iconByEventId, setIconByEventId] = useState<Map<string, { raw: string; keyword: string | null }>>(new Map());

  // Mappa
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<MapLibreMarker[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapDims, setMapDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  // ---- INIT MAP (mobile-safe: usa svh, evita absolute) ----
  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 100; // ~100 rAF
    const MIN_W = 50;
    const MIN_H = 120;

    function forceHeights(container: HTMLElement) {
      // se il parent non ha altezza, forzala (mobile)
      const parent = container.parentElement as HTMLElement | null;
      if (parent) {
        parent.style.minHeight = "60svh";
        parent.style.height = "60svh";
      }
      (container as HTMLDivElement).style.width = "100%";
      (container as HTMLDivElement).style.height = "100%";
    }

    function tryInit() {
      if (cancelled || typeof window === "undefined" || mapRef.current) return;

      const container = document.getElementById("gehj-map");
      if (!container) {
        attempts++;
        if (attempts <= MAX_ATTEMPTS) requestAnimationFrame(tryInit);
        return;
      }

      // Assicura dimensioni iniziali
      forceHeights(container);

      const rect = container.getBoundingClientRect();
      const h = Math.floor(rect.height);
      const w = Math.floor(rect.width);
      setMapDims({ w, h });

      if (h < MIN_H || w < MIN_W) {
        attempts++;
        if (attempts <= MAX_ATTEMPTS) {
          // prova anche un piccolo delay per iOS toolbar/layout
          setTimeout(() => requestAnimationFrame(tryInit), 50);
        }
        return;
      }

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

        map.on("load", () => {
          setMapLoaded(true);
          try { map.resize(); } catch {}
          setTimeout(() => { try { map.resize(); } catch {} }, 100);
        });
        map.on("error", (e) => console.error("[GE] Map error:", e));

        const ro = new ResizeObserver(() => {
          try {
            const r = container.getBoundingClientRect();
            setMapDims({ w: Math.floor(r.width), h: Math.floor(r.height) });
            map.resize();
          } catch {}
        });
        ro.observe(container);

        const onVis = () => { try { map.resize(); } catch {} };
        const onOrient = () => { try { map.resize(); } catch {} };
        document.addEventListener("visibilitychange", onVis);
        window.addEventListener("orientationchange", onOrient);
        window.addEventListener("load", onVis);
      } catch (e) {
        console.error("[GE] new maplibregl.Map error:", e);
      }
    }

    requestAnimationFrame(tryInit);
    return () => { cancelled = true; };
  }, []);

  // ---- Fetch dati + icone ----
  useEffect(() => {
    if (!gid) return;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const { data: geRows, error: geErr } = await supabase
          .from("group_events")
          .select("*")
          .eq("id", gid)
          .limit(1);
        if (geErr) throw geErr;
        if (!geRows?.length) throw new Error("Group event not found");
        const geData = geRows[0];

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

        const ids = cores.map((c) => c.id);
        const trMap = new Map<string, { title?: string | null; description?: string | null; description_short?: string | null; wikipedia_url?: string | null }>();
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

        // icone
        const iconMap = new Map<string, { raw: string; keyword: string | null }>();
        if (ids.length) {
          const { data: etmRows, error: etmErr } = await supabase
            .from("event_type_map")
            .select("event_id, type_code")
            .in("event_id", ids);
          if (etmErr) throw etmErr;

          const typeCodes = Array.from(new Set((etmRows ?? []).map((r: any) => String(r.type_code)).filter(Boolean)));
          let typeInfo = new Map<string, { raw?: string | null; name?: string | null }>();
          if (typeCodes.length) {
            const { data: teRows, error: teErr } = await supabase
              .from("event_types")
              .select("code, icon, icon_name")
              .in("code", typeCodes);
            if (teErr) throw teErr;
            (teRows ?? []).forEach((t: any) => {
              typeInfo.set(String(t.code), { raw: t.icon ?? null, name: t.icon_name ?? null });
            });
          }

          (etmRows ?? []).forEach((m: any) => {
            const evId = String(m.event_id);
            if (iconMap.has(evId)) return;
            const code = m?.type_code ? String(m.type_code) : null;
            if (!code) return;
            const t = typeInfo.get(code);
            const raw = (t?.raw && t.raw.trim())
              ? t.raw.trim()
              : (t?.name && t.name.trim())
              ? t.name.trim()
              : code.trim();
            iconMap.set(evId, { raw, keyword: normalizeIconKey(raw) || normalizeIconKey(code) });
          });
        }

        setGe(geData);
        setRows(vms);
        setIconByEventId(iconMap);
        setSelectedIndex(0);
        setNoGeoBanner(!vms.some((v) => v.latitude !== null && v.longitude !== null));
      } catch (e: any) {
        setErr(e?.message ?? "Unknown error");
        console.error("[GE] Fetch error:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [gid]);

  // ---- MARKERS (raggiere + selezione) ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    (markersRef.current || []).forEach((m) => m.remove());
    markersRef.current = [];

    type GroupItem = { row: EventVM; idx: number };
    const groups = new Map<string, GroupItem[]>();
    const pts: [number, number][] = [];

    rows.forEach((ev, idx) => {
      if (ev.latitude === null || ev.longitude === null) return;
      const key = `${ev.longitude.toFixed(6)},${ev.latitude.toFixed(6)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push({ row: ev, idx });
      pts.push([ev.longitude, ev.latitude]);
    });

    const isUrlIcon = (s: string) => {
      const t = s.toLowerCase();
      return t.startsWith("http://") || t.startsWith("https://") || t.startsWith("/") ||
             t.endsWith(".png") || t.endsWith(".svg") || t.endsWith(".jpg") || t.endsWith(".jpeg") || t.endsWith(".webp");
    };
    const isEmojiish = (s: string) => s.trim().length <= 4;

    function makeMarkerEl(ev: EventVM, idx: number) {
      const iconInfo = iconByEventId.get(ev.id);
      const raw = iconInfo?.raw ?? "";
      const keyword = iconInfo?.keyword ?? null;
      const isSelected = idx === selectedIndex;

      const wrap = document.createElement("div");
      wrap.className = "relative rounded-full bg-white/95 backdrop-blur ring-1 ring-black/15 shadow-[0_2px_8px_rgba(0,0,0,0.15)] cursor-pointer transition-all duration-200 ease-out";
      wrap.style.width = isSelected ? "44px" : "34px";
      wrap.style.height = isSelected ? "44px" : "34px";
      wrap.style.display = "grid";
      wrap.style.placeItems = "center";
      if (isSelected) {
        wrap.style.boxShadow = "0 6px 14px rgba(0,0,0,0.20)";
        wrap.style.border = "2px solid rgba(245, 158, 11, 0.45)";
      }

      if (raw) {
        if (isUrlIcon(raw)) {
          const img = document.createElement("img");
          img.src = raw;
          img.alt = "icon";
          img.style.width = isSelected ? "30px" : "24px";
          img.style.height = isSelected ? "30px" : "24px";
          img.style.objectFit = "contain";
          img.referrerPolicy = "no-referrer";
          wrap.appendChild(img);
          return wrap;
        }
        if (isEmojiish(raw) && !MODERN_ICONS[keyword || ""]) {
          const span = document.createElement("span");
          span.textContent = raw;
          span.style.fontSize = isSelected ? "22px" : "18px";
          span.style.lineHeight = "1";
          wrap.appendChild(span);
          return wrap;
        }
      }

      const svgHtml = (keyword && MODERN_ICONS[keyword]) || MODERN_ICONS["pin"];
      const holder = document.createElement("div");
      holder.innerHTML = svgHtml;
      const svg = holder.firstChild as SVGElement | null;
      if (svg) {
        svg.setAttribute("width", isSelected ? "26" : "22");
        svg.setAttribute("height", isSelected ? "26" : "22");
        (svg as any).style.color = "#111827";
        wrap.appendChild(svg);
      } else {
        const span = document.createElement("span");
        span.textContent = String(idx + 1);
        span.style.fontSize = isSelected ? "14px" : "12px";
        span.style.fontWeight = "700";
        wrap.appendChild(span);
      }
      return wrap;
    }

    const BASE_R = 22;

    for (const [_key, items] of groups) {
      const n = items.length;

      if (n === 1) {
        const { row, idx } = items[0];
        const el = makeMarkerEl(row, idx);
        const marker = new maplibregl.Marker({ element: el, offset: [0, 0] })
          .setLngLat([row.longitude as number, row.latitude as number])
          .addTo(map);
        el.addEventListener("click", () => setSelectedIndex(idx));
        markersRef.current.push(marker);
        continue;
      }

      const radius = Math.min(38, BASE_R + Math.floor(n / 4) * 6);
      const angleStep = (2 * Math.PI) / n;
      const centerLngLat: [number, number] = [
        items[0].row.longitude as number,
        items[0].row.latitude as number,
      ];

      for (let i = 0; i < n; i++) {
        const { row, idx } = items[i];
        const angle = i * angleStep;
        const dx = Math.round(radius * Math.cos(angle));
        const dy = Math.round(radius * Math.sin(angle));

        const el = makeMarkerEl(row, idx);
        const marker = new maplibregl.Marker({ element: el, offset: [dx, dy] })
          .setLngLat(centerLngLat)
          .addTo(map);
        el.addEventListener("click", () => setSelectedIndex(idx));
        markersRef.current.push(marker);
      }
    }

    try {
      if (pts.length) {
        const bounds = pts.reduce<[[number, number], [number, number]]>(
          (b, c) => [
            [Math.min(b[0][0], c[0]), Math.min(b[0][1], c[1])],
            [Math.max(b[1][0], c[0]), Math.max(b[1][1], c[1])],
          ],
          [[pts[0][0], pts[0][1]],[pts[0][0], pts[0][1]]]
        );
        map.fitBounds(bounds as any, { padding: 84, duration: 800 });
      } else {
        map.flyTo({ center: [9.19, 45.46], zoom: 3.5, duration: 600 });
      }
    } catch {}
  }, [rows, mapReady, iconByEventId, selectedIndex]);

  // Auto-play
  useEffect(() => {
    let t: any = null;
    if (isPlaying && rows.length > 0) {
      t = setInterval(() => setSelectedIndex((i) => (i + 1) % rows.length), 3200);
    }
    return () => t && clearInterval(t);
  }, [isPlaying, rows.length]);

  // Pan sulla selezione
  useEffect(() => {
    const map = mapRef.current;
    const ev = rows[selectedIndex];
    if (!map || !ev || ev.latitude === null || ev.longitude === null) return;
    try {
      map.flyTo({ center: [ev.longitude, ev.latitude], zoom: Math.max(map.getZoom(), 6), speed: 0.8 });
    } catch {}
  }, [selectedIndex, rows]);

  const selected = useMemo(() => rows[selectedIndex] ?? null, [rows, selectedIndex]);

  function onBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(landingHref || "/landing");
  }

  // UI
  const geTitle = (ge?.title ?? "Journey").toString();
  const geSubtitle = (ge?.pitch ?? "").toString();
  const geCover = ge?.cover_url ?? null;

  if (loading) {
    return (
      <div className="flex h-[100svh] items-center justify-center bg-gradient-to-b from-amber-50 via-white to-white">
        <div className="rounded-2xl border bg-white/70 px-5 py-3 text-sm text-gray-700 shadow backdrop-blur">
          Loading Journey…
        </div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="min-h-[100svh] bg-gradient-to-b from-rose-50 via-white to-white p-6">
        <div className="mx-auto max-w-2xl rounded-2xl border border-red-200 bg-white/70 p-5 text-red-800 shadow backdrop-blur">
          <div className="mb-1 text-base font-semibold">Error</div>
          <div className="text-sm">{err}</div>
          <div className="mt-4">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-1.5 text-sm hover:bg-gray-50 transition"
            >
              <span aria-hidden>←</span> Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[100svh] flex-col bg-[radial-gradient(1200px_600px_at_20%_-10%,#fff7e6,transparent),linear-gradient(to_bottom,#ffffff,60%,#fafafa)]">
      {/* HEADER */}
      <header className="sticky top-0 z-10 w-full border-b border-black/5 bg-white/60 backdrop-blur supports-[backdrop-filter]:bg-white/40">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-2 py-2">
          <a href={landingHref || "/landing"} className="flex shrink-0 items-center" title="GeoHistory Journey">
            <img src="/logo.png" alt="GeoHistory" className="h-10 w-auto object-contain" />
          </a>

          {geCover ? (
            <div className="relative hidden h-10 w-10 overflow-hidden rounded-xl ring-1 ring-black/10 shadow-sm md:block">
              <img src={geCover} alt={geTitle} className="h-full w-full object-cover" />
            </div>
          ) : (
            <div className="hidden h-10 w-10 rounded-xl bg-amber-100 ring-1 ring-black/10 md:block" />
          )}

          <div className="min-w-0">
            <h1 className="truncate text-[17px] font-semibold leading-tight text-gray-900">{geTitle}</h1>
            {geSubtitle ? <p className="line-clamp-1 text-[13px] text-gray-600">{geSubtitle}</p> : null}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-2 rounded-lg border border-black/10 bg-white/70 px-3 py-1.5 text-sm text-gray-800 shadow-sm hover:bg-white transition focus:outline-none focus:ring-2 focus:ring-amber-500/40"
              title="Back"
            >
              ← Back
            </button>
          </div>
        </div>

        {debug && (
          <div className="border-t border-amber-200/60 bg-amber-50/70 px-4 py-2 text-xs text-amber-900">
            <div className="mx-auto max-w-7xl flex flex-wrap gap-x-6 gap-y-1">
              <div><b>gid:</b> {gid || "—"}</div>
              <div><b>events:</b> {rows.length}</div>
              <div><b>withCoords:</b> {rows.filter(r => r.latitude !== null && r.longitude !== null).length}</div>
              <div><b>mapReady:</b> {String(mapReady)}</div>
              <div><b>mapLoaded:</b> {String(mapLoaded)}</div>
              <div><b>markers:</b> {(markersRef.current || []).length}</div>
              <div><b>landingHref:</b> {landingHref || "—"}</div>
              <div><b>selectedIndex:</b> {selectedIndex}</div>
              <div><b>mapDims:</b> {mapDims.w}×{mapDims.h}px</div>
            </div>
          </div>
        )}
      </header>

      {/* BODY */}
      {/* Mobile: 2 righe → mappa 60svh; Desktop: 12 colonne */}
      <div className="grid flex-1 gap-0 grid-rows-[60svh_auto] lg:grid-rows-1 lg:grid-cols-12">
        {/* MAP WRAPPER (NO absolute; h piena) */}
        <div className="relative h-[60svh] min-h-[60svh] border-b border-black/5 lg:h-auto lg:min-h-0 lg:border-b-0 lg:border-r lg:col-span-8 lg:row-auto">
          <div id="gehj-map" className="h-full w-full bg-[linear-gradient(180deg,#eef2ff,transparent)]" aria-label="Map canvas" />
          {!mapLoaded && (
            <div className="pointer-events-none absolute inset-x-0 top-2 z-10 mx-auto w-fit rounded-full border border-indigo-200 bg-indigo-50/90 px-3 py-1 text-xs text-indigo-900 shadow backdrop-blur">
              Inizializzazione mappa… ({mapDims.w}×{mapDims.h}px)
            </div>
          )}
          {noGeoBanner && (
            <div className="pointer-events-none absolute left-1/2 top-10 z-10 -translate-x-1/2 rounded-full border border-amber-200 bg-amber-50/90 px-3 py-1 text-xs text-amber-900 shadow backdrop-blur">
              Nessun evento geolocalizzato per questo Journey
            </div>
          )}
        </div>

        {/* SIDEBAR */}
        <aside className="h-full bg-transparent overflow-hidden lg:col-span-4">
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-3 border-b border-black/5 bg-white/60 px-4 py-3 backdrop-blur">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-wide text-gray-500">Selected event</div>
                <div className="truncate text-[15px] font-semibold text-gray-900">{rows[selectedIndex]?.title ?? "—"}</div>
                <div className="text-[11px] text-gray-500">
                  {rows.length ? <>Event <span className="font-medium">{selectedIndex + 1}</span> of <span className="font-medium">{rows.length}</span></> : "No events"}
                </div>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => setSelectedIndex((i) => (rows.length ? (i - 1 + rows.length) % rows.length : 0))}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-black/10 bg-white/80 text-sm text-gray-800 shadow-sm transition hover:scale-105 hover:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                  title="Previous"
                >
                  ⏮
                </button>
                <button
                  onClick={() => setIsPlaying((p) => !p)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-black/10 bg-white/80 text-sm text-gray-800 shadow-sm transition hover:scale-105 hover:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                  title={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? "⏸" : "▶"}
                </button>
                <button
                  onClick={() => setSelectedIndex((i) => (rows.length ? (i + 1) % rows.length : 0))}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-black/10 bg-white/80 text-sm text-gray-800 shadow-sm transition hover:scale-105 hover:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                  title="Next"
                >
                  ⏭
                </button>
              </div>
            </div>

            <div className="flex-1 px-4 py-3 overflow-hidden">
              {selected ? (
                <div className="flex h-full flex-col rounded-2xl border border-black/10 bg-white/60 p-4 shadow-sm backdrop-blur transition hover:bg-white/70">
                  <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                    <p className="whitespace-pre-wrap text-[13.5px] leading-6 text-gray-800">
                      {selected.description || "No description available."}
                    </p>

                    <div className="text-[13px] text-gray-700">
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

                    <div className="text-[12px] text-gray-500">
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
                          className="inline-flex items-center gap-1.5 text-sm text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-800"
                        >
                          Open Wikipedia
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                            <path d="M14 3h7v7M21 3l-9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                            <path d="M5 21l8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                          </svg>
                        </a>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-4">
                    <div className="mb-2 text-sm font-medium text-gray-900">Jump to event</div>
                    <div className="grid grid-cols-6 gap-2">
                      {rows.map((ev, idx) => (
                        <button
                          key={ev.id}
                          onClick={() => setSelectedIndex(idx)}
                          className={`rounded-lg border px-2 py-1 text-xs transition ${
                            idx === selectedIndex
                              ? "border-black bg-black text-white"
                              : "border-black/10 bg-white/80 text-gray-800 hover:bg-white"
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
                <div className="rounded-2xl border border-dashed border-black/10 bg-white/40 p-4 text-sm text-gray-600 backdrop-blur">
                  Select a marker on the map.
                </div>
              )}
            </div>

            {ge?.description ? (
              <div className="border-t border-black/5 bg-white/60 px-4 py-3 backdrop-blur">
                <div className="mb-1 text-sm font-semibold text-gray-900">About this Journey</div>
                <div className="whitespace-pre-wrap text-sm leading-6 text-gray-800">
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
