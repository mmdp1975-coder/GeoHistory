"use client";
// frontend/app/module/group_event/page_inner.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import maplibregl, { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { supabase } from "@/lib/supabaseBrowserClient";
import RatingStars from "../../components/RatingStars"; // ★ stelle rating (media + voti)

/* =========================================================================
   SCHEMA (campi usati)
   - group_events: id, title, pitch, cover_url
   - group_event_translations: group_event_id, lang, title, pitch, description, video_url
   - event_group_event: event_id, group_event_id
   - events_list: id, latitude, longitude, era, year_from, year_to, exact_date, location, image_url
   - event_translations: event_id, lang, title, description, description_short, wikipedia_url, video_url
   - group_event_favourites: id, group_event_id, profile_id, created_at   <-- per CUORE
   ========================================================================= */

type AnyObj = Record<string, any>;

type EventCore = {
  id: string;
  latitude: number | null;
  longitude: number | null;
  era?: string | null;         // "BC" | "AD"
  year_from?: number | null;
  year_to?: number | null;
  exact_date?: string | null;
  location?: string | null;
  image_url?: string | null;
};

type EventVM = EventCore & {
  title: string;
  description: string;
  wiki_url: string | null;
  video_url: string | null;
  order_key: number;
};

// ===== Icone inline (fallback) =====
const MODERN_ICONS: Record<string, string> = {
  pin: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z"/><circle cx="12" cy="11" r="3"/></svg>`,
};
const isUrlIcon = (s: string) => {
  const t = s.toLowerCase();
  
  const currentEvent = rows?.[selectedIndex];
  const currentYear = currentEvent ? getEventYear(currentEvent) : (timelineData?.min ?? 0);
  const currentPct = (timelineData ? computePercent(currentYear, timelineData.min, timelineData.max) : 50);
return (
    t.startsWith("http://") ||
    t.startsWith("https://") ||
    t.startsWith("/") ||
    t.endsWith(".png") ||
    t.endsWith(".svg") ||
    t.endsWith(".jpg") ||
    t.endsWith(".jpeg") ||
    t.endsWith(".webp")
  );
};
const isEmojiish = (s: string) => s.trim().length <= 4;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ---- Cuore (SVG) ----
function HeartIcon({ filled, className = "" }: { filled: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      role="img"
      width="22"
      height="22"
    >
      <path
        d="M12.001 20.727s-7.2-4.397-9.6-8.318C.77 9.55 2.027 6.5 4.93 5.57c1.91-.61 4.06.03 5.37 1.65 1.31-1.62 3.46-2.26 5.37-1.65 2.903.93 4.16 3.98 2.53 6.84-2.4 3.92-9.6 8.317-9.6 8.317Z"
        fill={filled ? "#ef4444" : "none"}
        stroke="#ef4444"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function normEra(era?: string | null): "BC" | "AD" {
  if (!era) return "AD";
  const e = era.toUpperCase().trim();
  if (e === "BC" || e === "BCE") return "BC";
  return "AD";
}
function chronoOrderKey(e: { era?: string | null; year_from?: number | null; year_to?: number | null }) {
  const era = normEra(e.era);
  const from = typeof e.year_from === "number" ? e.year_from : null;
  const to   = typeof e.year_to   === "number" ? e.year_to   : null;
  let y = from ?? to ?? Number.POSITIVE_INFINITY;
  if (era === "BC" && isFinite(y)) y = -Math.abs(y);
  if (era === "AD" && isFinite(y)) y = Math.abs(y);
  const bias = from != null ? 0 : 0.5;
  if (!isFinite(y)) return 9_999_999_999;
  return y * 100 + bias;
}
function formatWhen(ev: EventVM) {
  const e = normEra(ev.era);
  if (typeof ev.year_from === "number" && typeof ev.year_to === "number" && ev.year_to !== ev.year_from) {
    return `${Math.abs(ev.year_from)} ${e === "BC" ? "BC" : "AD"} – ${Math.abs(ev.year_to)} ${e === "BC" ? "BC" : "AD"}`;
  }
  if (typeof ev.year_from === "number") return `${Math.abs(ev.year_from)} ${e === "BC" ? "BC" : "AD"}`;
  if (typeof ev.year_to === "number") return `${Math.abs(ev.year_to)} ${e === "BC" ? "BC" : "AD"}`;
  if (ev.exact_date) { try { return new Date(ev.exact_date).toLocaleDateString(); } catch {} }
  return "—";
}
function parseExactDateYear(date?: string | null): number | null {
  if (!date) return null;
  try { const d = new Date(date); if (Number.isNaN(d.getTime())) return null; return d.getUTCFullYear(); } catch { return null; }
}
function signedYear(value: number | null | undefined, era?: string | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const abs = Math.abs(value);
  return normEra(era) === "BC" ? -abs : abs;
}
type TimelineSpan = { min: number; max: number; center: number; start: number };
type TimelineItem = { ev: EventVM; index: number; min: number; max: number; center: number; start: number; progress: number };
type TimelineData = { min: number; max: number; range: number; items: TimelineItem[] };
function buildTimelineSpan(ev: EventVM): TimelineSpan | null {
  const values: number[] = [];
  const from = signedYear(ev.year_from, ev.era);
  const to = signedYear(ev.year_to, ev.era);
  if (from != null) values.push(from);
  if (to != null) values.push(to);
  if (!values.length) {
    const exact = parseExactDateYear(ev.exact_date);
    if (exact != null) values.push(exact);
  }
  if (!values.length) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const center = values.length >= 2 ? (min + max) / 2 : values[0];
  const start = from != null ? from : values[0];
  return { min, max, center, start };
}
function formatTimelineYearLabel(year: number) {
  if (!Number.isFinite(year)) return "n/a";
  const rounded = Math.round(year);
  if (rounded < 0) return `${Math.abs(rounded)} BC`;
  if (rounded === 0) return "0";
  return `${rounded} AD`;
}
function buildTimelineTicks(min: number, max: number, targetTicks = 8) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return [];
  const span = Math.abs(max - min);
  const rawStep = span / Math.max(1, targetTicks);
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(1, rawStep))));
  const normalized = rawStep / magnitude;
  let nice = 1;
  if (normalized <= 1) nice = 1;
  else if (normalized <= 2) nice = 2;
  else if (normalized <= 2.5) nice = 2.5;
  else if (normalized <= 5) nice = 5;
  else nice = 10;
  const step = nice * magnitude;
  const ticks: number[] = [];
  const first = Math.ceil(min / step) * step;
  for (let value = first; value < max; value += step) {
    if (value <= min || value >= max) continue;
    ticks.push(Math.round(value));
  }
  return ticks;
}
const POINTER_STYLE = `
@keyframes timeline-pointer-glow { 0% { opacity: 0.45; transform: scale(0.9); } 50% { opacity: 0.7; transform: scale(1.05); } 100% { opacity: 0.45; transform: scale(0.9); } }
`;
function TimelinePointer({ className = "", animated = false }: { className?: string; animated?: boolean }): JSX.Element {
  return (
    <span className={className} role="presentation">
      <style>{POINTER_STYLE}</style>
      <span className="relative block h-full w-full">
        <span
          className="absolute inset-0 -translate-y-[35%] rounded-full bg-gradient-to-br from-indigo-400/40 via-sky-500/30 to-blue-600/25 blur-sm"
          style={animated ? { animation: "timeline-pointer-glow 2.6s ease-in-out infinite" } : undefined}
        />
        <svg viewBox="0 0 38 34" className="relative h-full w-full">
          <defs>
            <linearGradient id="timeline-pointer-fill" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#f8fafc" />
              <stop offset="40%" stopColor="#dbeafe" />
              <stop offset="100%" stopColor="#1d4ed8" />
            </linearGradient>
            <linearGradient id="timeline-pointer-edge" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#1e3a8a" />
              <stop offset="100%" stopColor="#0f172a" />
            </linearGradient>
          </defs>
          <polygon points="19 2 34 28 4 28" fill="url(#timeline-pointer-fill)" />
          <polygon points="19 2 26 28 12 28" fill="rgba(255,255,255,0.25)" />
          <path d="M4 28h30" stroke="url(#timeline-pointer-edge)" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </span>
    </span>
  );
}

// Stile OSM fallback (se manca MAPTILER)
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

  // ---- lingua desiderata ----
  const desiredLang = (sp.get("lang") || (typeof navigator !== "undefined" ? navigator.language?.slice(0,2) : "it") || "it").toLowerCase();

  // ---------- GID ----------
  const [gid, setGid] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [landingHref, setLandingHref] = useState<string | null>(null);

  // ---- Utente corrente (serve per CUORE) ----
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const raw = sp.get("gid")?.trim() ?? null;
    if (raw) {
      const clean = raw.split("?")[0].split("&")[0].trim();
      if (UUID_RE.test(clean)) setGid(clean);
      else setErr("Missing/invalid gid. Usa /module/group_event?gid=<UUID>.");
    } else {
      try {
        const ls = typeof window !== "undefined" ? localStorage.getItem("active_group_event_id") : null;
        if (ls && UUID_RE.test(ls)) setGid(ls);
        else setErr("Missing/invalid gid. Usa /module/group_event?gid=<UUID>.");
      } catch {
        setErr("Missing/invalid gid. Usa /module/group_event?gid=<UUID>.");
      }
    }
  }, [sp]);

  // ---------- Landing + utente ----------
  useEffect(() => {
    (async () => {
      try {
        const ref = (typeof document !== "undefined" && document.referrer) || "";
        if (ref) {
          try {
            const u = new URL(ref);
            if (/^\/landing\/[^/]+$/i.test(u.pathname)) {
              setLandingHref(u.pathname);
            }
          } catch {}
        }
        const { data: userData } = await supabase.auth.getUser();
        const myUid = userData?.user?.id ?? null;
        setUserId(myUid);
        if (!myUid) {
          setLandingHref("/landing");
          return;
        }
        const { data: prof } = await supabase
          .from("profiles")
          .select("landing_slug, persona, persona_code")
          .eq("id", myUid)
          .maybeSingle();
        const slug =
          (prof as any)?.landing_slug ?? (prof as any)?.persona ?? (prof as any)?.persona_code ?? null;
        setLandingHref(slug ? `/landing/${slug}` : "/landing");
      } catch {
        setLandingHref("/landing");
      }
    })();
  }, []);

  // ---------- Stato ----------
  const [ge, setGe] = useState<AnyObj | null>(null);
  const [geTr, setGeTr] = useState<{ title?: string; pitch?: string; description?: string; video_url?: string } | null>(null);
  const [rows, setRows] = useState<EventVM[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [iconByEventId, setIconByEventId] = useState<Map<string, { raw: string; keyword: string | null }>>(new Map());

  // ---------- MAPPA (unico blocco) ----------
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<MapLibreMarker[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Liste/scroll refs (unico blocco)
  const mobileListRef = useRef<HTMLDivElement | null>(null);
  const bottomListRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  function getVisibleMapContainer(): HTMLElement | null {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-map="gehj"]'));
    for (const el of nodes) {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      if (rect.width >= 120 && rect.height >= 120 && style.display !== "none" && style.visibility !== "hidden") {
        return el;
      }
    }
    return null;
  }

  useEffect(() => {
    if (typeof window === "undefined" || mapRef.current) return;

    let cancelled = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 120;

    const init = () => {
      if (cancelled || mapRef.current) return;
      const container = getVisibleMapContainer();
      if (!container) {
        attempts++; if (attempts <= MAX_ATTEMPTS) return setTimeout(init, 50);
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
          setTimeout(() => { try { map.resize(); } catch {} }, 120);
        });

        const ro = new ResizeObserver(() => { try { map.resize(); } catch {} });
        ro.observe(container);
        window.addEventListener("resize", () => { try { map.resize(); } catch {} });
        window.addEventListener("orientationchange", () => { try { map.resize(); } catch {} });
        document.addEventListener("visibilitychange", () => { try { map.resize(); } catch {} });
      } catch (e) {
        console.error("[GE] Map init error:", e);
      }
    };

    init();
    return () => { cancelled = true; };
  }, []);

  // ---------- Fetch + ordine + icone ----------
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

        let geTrData: any = null;
        const { data: geTrExact } = await supabase
          .from("group_event_translations")
          .select("title, pitch, description, video_url, lang")
          .eq("group_event_id", gid)
          .eq("lang", desiredLang)
          .maybeSingle();

        if (geTrExact) geTrData = geTrExact;
        else {
          const { data: geTrAny } = await supabase
            .from("group_event_translations")
            .select("title, pitch, description, video_url, lang")
            .eq("group_event_id", gid)
            .limit(1);
          geTrData = geTrAny?.[0] || null;
        }

        const { data: links, error: linkErr } = await supabase
          
const { data: vjRows, error: vjErr } = await supabase
  .from("v_journey")
  .select(`id, event_title, event_description, event_translation_lang2, wikipedia_url, video_url,
           lat, lon, continent, country, region, city, address,
           era, year_from, year_to, exact_date, event_cover_url`)
  .eq("journey_id", gid);
if (vjErr) throw vjErr;

const vms: EventVM[] = (vjRows ?? []).map((r: any) => {
  const location = r.city ?? r.region ?? r.country ?? r.continent ?? null;
  const core: EventCore = {
    id: String(r.id),
    latitude: typeof r.lat === "number" ? r.lat : null,
    longitude: typeof r.lon === "number" ? r.lon : null,
    era: r.era ?? null,
    year_from: r.year_from ?? null,
    year_to: r.year_to ?? null,
    exact_date: r.exact_date ?? null,
    location,
    image_url: r.event_cover_url ?? null,
  };
  return {
    ...core,
    title: (r.event_title ?? location ?? "Untitled").toString(),
    description: (r.event_description ?? "").toString(),
    wiki_url: r.wikipedia_url ? String(r.wikipedia_url) : null,
    video_url: r.video_url ? String(r.video_url) : null,
    order_key: chronoOrderKey(core),
  };
});
vms.sort((a, b) => a.order_key - b.order_key);

setGe(geData);
setGeTr(geTrData);
setRows(vms);

        setSelectedIndex(0);
      } catch (e: any) {
        setErr(e?.message ?? "Unknown error");
        console.error("[GE] Fetch error:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [gid, desiredLang]);

  // ---------- Preferiti (CUORE) ----------
  const [isFav, setIsFav] = useState<boolean>(false);
  const [savingFav, setSavingFav] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      if (!gid) return;
      if (!userId) { setIsFav(false); return; }
      try {
        // prova con profile_id (schema più probabile)
        let { data, error } = await supabase
          .from("group_event_favourites")
          .select("id")
          .eq("group_event_id", gid)
          .eq("profile_id", userId)
          .maybeSingle();
        if (error) {
          // fallback: alcuni schemi usano user_id
          const alt = await supabase
            .from("group_event_favourites")
            .select("id")
            .eq("group_event_id", gid)
            .eq("user_id", userId)
            .maybeSingle();
          data = alt.data as any;
        }
        setIsFav(!!data);
      } catch (e) {
        // in caso di errore lascio false senza rompere la UI
        setIsFav(false);
      }
    })();
  }, [gid, userId]);

  async function toggleFavourite() {
    if (!gid) return;
    if (!userId) {
      alert("Per usare i preferiti devi accedere.");
      router.push(landingHref || "/landing");
      return;
    }
    if (savingFav) return;
    setSavingFav(true);
    try {
      if (isFav) {
        // DELETE
        const del1 = await supabase
          .from("group_event_favourites")
          .delete()
          .eq("group_event_id", gid)
          .eq("profile_id", userId);
        if (del1.error) {
          await supabase
            .from("group_event_favourites")
            .delete()
            .eq("group_event_id", gid)
            .eq("user_id", userId);
        }
        setIsFav(false);
      } else {
        // INSERT
        const ins = await supabase
          .from("group_event_favourites")
          .insert({ group_event_id: gid, profile_id: userId, created_at: new Date().toISOString() } as any);
        if (ins.error) {
          await supabase
            .from("group_event_favourites")
            .insert({ group_event_id: gid, user_id: userId, created_at: new Date().toISOString() } as any);
        }
        setIsFav(true);
      }
    } finally {
      setSavingFav(false);
    }
  }

  // ---------- MARKERS con anti-overlap + selezione ----------
  function computePixelOffsetsForSameCoords(ids: string[], radiusBase = 16) {
    const n = ids.length;
    const arr: [number, number][] = [];
    if (n === 1) { arr.push([0, 0]); return arr; }
    const radius = radiusBase + Math.min(12, Math.round(n * 1.2));
    for (let i = 0; i < n; i++) {
      const angle = (2 * Math.PI * i) / n;
      arr.push([Math.round(radius * Math.cos(angle)), Math.round(radius * Math.sin(angle))]);
    }
    return arr;
  }

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    (markersRef.current || []).forEach((m) => m.remove());
    markersRef.current = [];

    const groups = new Map<string, { ids: string[]; lng: number; lat: number }>();
    rows.forEach((ev) => {
      if (ev.latitude == null || ev.longitude == null) return;
      const key = `${ev.longitude.toFixed(6)}_${ev.latitude.toFixed(6)}`;
      if (!groups.has(key)) groups.set(key, { ids: [], lng: ev.longitude!, lat: ev.latitude! });
      groups.get(key)!.ids.push(ev.id);
    });

    const pixelOffsetById = new Map<string, [number, number]>();
    groups.forEach((g) => {
      const offs = computePixelOffsetsForSameCoords(g.ids);
      g.ids.forEach((id, i) => pixelOffsetById.set(id, offs[i]));
    });

    const pts: [number, number][] = [];

    function makeMarkerEl(ev: EventVM, idx: number) {
      const isSelected = idx === selectedIndex;

      const wrap = document.createElement("div");
      wrap.className =
        "relative rounded-full bg-white/95 backdrop-blur ring-1 ring-black/15 shadow-[0_2px_8px_rgba(0,0,0,0.15)] cursor-pointer transition-all duration-200 ease-out";
      wrap.style.width = isSelected ? "46px" : "34px";
      wrap.style.height = isSelected ? "46px" : "34px";
      wrap.style.display = "grid";
      wrap.style.placeItems = "center";
      if (isSelected) {
        wrap.style.boxShadow = "0 6px 14px rgba(0,0,0,0.20)";
        wrap.style.border = "2px solid rgba(245, 158, 11, 0.45)";
        wrap.style.zIndex = "1000";
      }

      // basic pin
      const holder = document.createElement("div");
      holder.innerHTML = MODERN_ICONS["pin"];
      const svg = holder.firstChild as SVGElement | null;
      if (svg) {
        svg.setAttribute("width", isSelected ? "28" : "22");
        svg.setAttribute("height", isSelected ? "28" : "22");
        (svg as any).style.color = "#111827";
        wrap.appendChild(svg);
      }

      return wrap;
    }

    rows.forEach((ev, idx) => {
      if (ev.latitude == null || ev.longitude == null) return;

      const el = makeMarkerEl(ev, idx);
      const pxOff = pixelOffsetById.get(ev.id) ?? [0, 0];

      const marker = new maplibregl.Marker({ element: el, offset: pxOff as any })
        .setLngLat([ev.longitude!, ev.latitude!])
        .addTo(map);

      try { (marker as any).setZIndex?.(idx === selectedIndex ? 1000 : 0); } catch {}

      el.addEventListener("click", () => setSelectedIndex(idx));

      markersRef.current.push(marker);
      pts.push([ev.longitude!, ev.latitude!]);
    });

    try {
      if (pts.length) {
        const bounds = pts.reduce<[[number, number], [number, number]]>(
          (b, c) => [
            [Math.min(b[0][0], c[0]), Math.min(b[0][1], c[1])],
            [Math.max(b[1][0], c[0]), Math.max(b[1][1], c[1])],
          ],
          [[pts[0][0], pts[0][1]], [pts[0][0], pts[0][1]]]
        );
        map.fitBounds(bounds as any, { padding: 84, duration: 800 });
      } else {
        map.flyTo({ center: [9.19, 45.46], zoom: 3.5, duration: 600 });
      }
    } catch {}
  }, [rows, mapReady, selectedIndex]);

  useEffect(() => {
    const map = mapRef.current;
    const ev = rows[selectedIndex];
    if (map && ev && ev.latitude !== null && ev.longitude !== null) {
      try {
        map.flyTo({ center: [ev.longitude, ev.latitude], zoom: Math.max(map.getZoom(), 6), speed: 0.8 });
      } catch {}
    }
  }, [selectedIndex, rows]);

  // ---- scroll attivo nelle liste ----
  useEffect(() => {
    const ev = rows[selectedIndex];
    if (!ev) return;
    const el = itemRefs.current.get(ev.id);
    if (!el) return;

    if (mobileListRef.current && mobileListRef.current.contains(el)) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
    if (bottomListRef.current && bottomListRef.current.contains(el)) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }
  }, [selectedIndex, rows]);

  function onBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(landingHref || "/landing");
  }

  const timelineData = useMemo(() => {
    if (!rows.length) return null;

    const annotated: { ev: EventVM; index: number; min: number; max: number; center: number }[] = [];
    rows.forEach((ev, index) => {
      const span = buildTimelineSpan(ev);
      if (span) {
        annotated.push({
          ev,
          index,
          min: span.min,
          max: span.max,
          center: span.center,
        });
      }
    });

    if (!annotated.length) return null;

    let min = annotated[0].min;
    let max = annotated[0].max;
    for (const item of annotated) {
      if (item.min < min) min = item.min;
      if (item.max > max) max = item.max;
    }

    const spanValue = max - min;
    const safeSpan = spanValue === 0 ? 1 : spanValue;

    const items = annotated.map((item) => {
      const startValue = item.min;
      const startProgress = Math.min(1, Math.max(0, (startValue - min) / safeSpan));
      return { ...item, progress: startProgress, start: startValue } as TimelineItem;
    });

    return { min, max, range: safeSpan, items } as TimelineData;
  }, [rows]);

  const timelineTicks = useMemo(() => {
    if (!timelineData) return [];
    return buildTimelineTicks(timelineData.min, timelineData.max);
  }, [timelineData]);

  const timelineMinorTicks = useMemo(() => {
    if (!timelineData) return [];
    if (!timelineTicks.length) return [];
    const points = [timelineData.min, ...timelineTicks, timelineData.max];
    const mids: number[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const start = points[i];
      const end = points[i + 1];
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      const mid = (start + end) / 2;
      if (mid > timelineData.min && mid < timelineData.max) mids.push(mid);
    }
    return mids;
  }, [timelineData, timelineTicks]);

  // ——— Progress avatar (spostato prima dei return condizionali) ———
  const avatarProgress = useMemo(() => {
    if (!timelineData || !timelineData.items.length) return 0;
    const currentId = rows[selectedIndex]?.id;
    const fallback = timelineData.items[0];
    const target = currentId
      ? timelineData.items.find((item) => item.ev.id === currentId) || fallback
      : fallback;
    return target ? target.progress : 0;
  }, [timelineData, rows, selectedIndex]);

  const geTitle = (geTr?.title || ge?.title || "Journey").toString();
  const geSubtitle = (geTr?.pitch || ge?.pitch || "").toString();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="rounded-2xl border bg-white/70 px-5 py-3 text-sm text-gray-700 shadow">
          Loading Journey…
        </div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="min-h-screen bg-rose-50 p-6">
        <div className="mx-auto max-w-2xl rounded-2xl border border-red-200 bg-white/70 p-5 text-red-800 shadow">
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
    <div className="flex min-h-screen flex-col bg-white">
      {timelineData ? (
  /* HEADER principale: 2 box (Titolo + Timeline) */
  <section className="border-b border-slate-200 bg-white/95 shadow-sm">
    <div className="mx-auto grid max-w-7xl grid-cols-[320px_minmax(0,1fr)] items-center gap-6 px-8 py-4">

        {/* 1️⃣ Titolo del Journey + Cuore + Stelle */}
        <div className="flex flex-col justify-start rounded-xl border border-slate-200 bg-white p-5 shadow-[inset_0_2px_6px_rgba(0,0,0,0.06)]">
          <h1 className="text-xl font-semibold text-slate-900 text-left leading-snug break-words whitespace-pre-line">
            {geTr?.title ?? ge?.title ?? ge?.code ?? (rows?.[0]?.title ?? "Journey")}
          </h1>

          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={toggleFavourite}
              disabled={!userId || savingFav}
              className={`rounded-full border px-3 py-1 text-sm transition ${
                isFav
                  ? "border-rose-400 bg-rose-50 text-rose-700 hover:bg-rose-100"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {isFav ? "♥ Favourite" : "♡ Favourite"}
            </button>

            <RatingStars journeyId={gid} size={18} />
          </div>

        </div>

      {/* 2️⃣ Timeline in box 3D */}
      <div className="relative flex flex-col items-center justify-center rounded-2xl border border-slate-300 bg-gradient-to-b from-white to-slate-50 px-10 py-6 shadow-[inset_0_2px_8px_rgba(255,255,255,0.8),0_4px_8px_rgba(0,0,0,0.08)]">

        {/* Triangolo blu a testa in giù sopra l’asse */}
        <div
          className="absolute left-1/2 top-2 -translate-x-1/2"
          style={{
            width: 0,
            height: 0,
            borderLeft: "8px solid transparent",
            borderRight: "8px solid transparent",
            borderBottom: "10px solid #1e40af", // blu profondo
          }}
        />

        {/* Asse del tempo blu (in rilievo) */}
        <div className="relative w-full h-[8px] rounded-full bg-gradient-to-r from-blue-800 via-blue-600 to-blue-800 shadow-inner">
          <div
            className="absolute top-1/2 left-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rotate-45 border-2 border-white bg-blue-500 shadow"
            style={{ boxShadow: "0 0 6px rgba(30,64,175,0.6)" }}
          />
        </div>

      {/* Timeframe min-max sotto l’asse */}
      <div className="mt-3 flex w-full justify-between text-xs font-semibold text-blue-700">
        <span>{formatTimelineYearLabel(timelineData.min)}</span>
        <span>{formatTimelineYearLabel(timelineData.max)}</span>
      </div>
    </div>
    </div>
  </section>
) : null}

      {/* ============== MOBILE (<lg) ============== */}
      <div className="mx-auto w-full max-w-7xl flex-1 lg:hidden">
        {/* MAPPA — mezzo schermo */}
        <section className="relative h-[50svh] min-h-[320px] border-b border-black/10">
          <div data-map="gehj" className="h-full w-full bg-[linear-gradient(180deg,#eef2ff,transparent)]" aria-label="Map canvas" />
          {!mapLoaded && (
            <div className="absolute left-3 top-3 z-10 rounded-full border border-indigo-200 bg-indigo-50/90 px-3 py-1 text-xs text-indigo-900 shadow">
              Inizializzazione mappa…
            </div>
          )}
        </section>

        {/* LISTA EVENTI — una riga, scroll orizzontale */}
        <section className="border-b border-black/10 bg-white/90 backdrop-blur">
          <div ref={mobileListRef} className="overflow-x-auto overflow-y-hidden">
            <div className="flex items-stretch gap-3 px-4 py-3 min-w-max">
              {rows.map((ev, idx) => {
                const active = idx === selectedIndex;
                return (
                  <button
                    key={ev.id}
                    ref={(el) => { if (el) itemRefs.current.set(ev.id, el!); }}
                    onClick={() => setSelectedIndex(idx)}
                    className={`shrink-0 w-[78vw] max-w-[520px] rounded-xl border px-3 py-2 text-left transition ${
                      active
                        ? "border-black bg-black text-white shadow-sm"
                        : "border-black/10 bg-white/80 text-gray-800 hover:bg-white"
                    }`}
                    title={ev.title}
                  >
                    <div className="flex items-start gap-2">
                      <div className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs ${
                        active ? "bg-white text-black" : "bg-gray-900 text-white"
                      }`}>
                        {idx + 1}
                      </div>
                      <div className="min-w-0">
                        <div className={`truncate text-[13.5px] font-semibold ${active ? "text-white" : "text-gray-900"}`}>
                          {ev.title}
                        </div>
                        <div className={`text-[12px] ${active ? "text-white/80" : "text-gray-600"}`}>
                          {formatWhen(ev)}{ev.location ? ` • ${ev.location}` : ""}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* DESCRIZIONE */}
        <section className="bg-white/70 backdrop-blur">
          <div className="px-4 py-3">
            <div className="mx-auto w-full max-w-[820px]">
              <div className="rounded-2xl border border-black/10 bg-white/95 shadow-sm flex flex-col">
                {/* Header sintetico */}
                <div className="px-4 pt-3">
                  <div className="text-sm font-semibold text-gray-900 truncate">{rows[selectedIndex]?.title ?? "—"}</div>
                  <div className="text-[12.5px] text-gray-600">
                    {rows[selectedIndex] ? formatWhen(rows[selectedIndex] as EventVM) : "—"}
                    {rows[selectedIndex]?.location ? ` • ${rows[selectedIndex]!.location}` : ""}
                  </div>
                </div>

                {rows[selectedIndex]?.image_url ? (
                  <div className="px-4 pt-3">
                    <div className="relative overflow-hidden rounded-xl ring-1 ring-black/10">
                      <img src={rows[selectedIndex]!.image_url!} alt={rows[selectedIndex]!.title} className="h-48 w-full object-cover" />
                    </div>
                  </div>
                ) : null}

                <div className="px-4 pt-3">
                  <div
                    className="h-[28svh] overflow-y-auto pr-2 text-[13.5px] leading-6 text-gray-800 whitespace-pre-wrap"
                    style={{ scrollbarWidth: "thin" }}
                  >
                    {rows[selectedIndex]?.description || "No description available."}
                  </div>
                  {rows[selectedIndex]?.wiki_url ? (
                    <div className="pt-2">
                      <a
                        href={rows[selectedIndex]!.wiki_url!}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-800"
                      >
                        Wikipedia →
                      </a>
                    </div>
                  ) : null}
                </div>

                <div className="mt-3 border-t border-black/10 bg-white/95 px-3 py-2 rounded-b-2xl">
                  <div className="flex items-center gap-2">
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

                    <div className="ml-auto text:[12px] text-gray-600">
                      {rows.length ? <>Event <span className="font-medium">{selectedIndex + 1}</span> / <span className="font-medium">{rows.length}</span></> : "No events"}
                    </div>

                    {rows[selectedIndex]?.video_url ? (
                      <div className="pt-2">
                        <a
                          href={rows[selectedIndex]!.video_url!}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white/80 px-3 py-1.5 text-sm text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-800"
                          title="Guarda il video dell'evento"
                        >
                          ▶ Guarda il video dell'evento
                        </a>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ============== DESKTOP (≥lg) ============== */}
      <div className="mx-auto hidden w-full max-w-7xl flex-1 lg:block">
        <div className="grid grid-cols-[500px_minmax(0,1fr)] gap-0 h-[calc(100svh-38svh)]">
          {/* PANNELLO SINISTRO */}
          <section className="overflow-y-auto bg-white/70 backdrop-blur">
            <div className="px-4 py-4">
              <div className="mb-2 text-sm font-semibold text-gray-900">
                {rows[selectedIndex]?.title ?? "—"}
              </div>
              <div className="text-[12.5px] text-gray-600 mb-2">
                {rows[selectedIndex] ? formatWhen(rows[selectedIndex] as EventVM) : "—"}
                {rows[selectedIndex]?.location ? ` • ${rows[selectedIndex]!.location}` : ""}
              </div>

              {rows[selectedIndex]?.image_url ? (
                <div className="mb-3">
                  <div className="relative overflow-hidden rounded-xl ring-1 ring-black/10">
                    <img src={rows[selectedIndex]!.image_url!} alt={rows[selectedIndex]!.title} className="h-44 w-full object-cover" />
                  </div>
                </div>
              ) : null}

              <div className="whitespace-pre-wrap text-[13.5px] leading-6 text-gray-800">
                {rows[selectedIndex]?.description || "No description available."}
              </div>
              {rows[selectedIndex]?.wiki_url ? (
                <div className="pt-2">
                  <a
                    href={rows[selectedIndex]!.wiki_url!}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-800"
                  >
                    Open Wikipedia
                  </a>
                </div>
              ) : null}

              {rows[selectedIndex]?.video_url ? (
                <div className="pt-3">
                  <a
                    href={rows[selectedIndex]!.video_url!}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-black/10 bg-white/80 px-3 py-1.5 text-sm text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-800"
                    title="Guarda il video dell'evento"
                  >
                    ▶ Guarda il video dell'evento
                  </a>
                </div>
              ) : null}
            </div>

            <div className="sticky bottom-0 border-t border-black/10 bg-white/80 px-4 py-3 backdrop-blur">
              <div className="flex items-center gap-2">
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

                <div className="ml-auto text-[12px] text-gray-600">
                  {rows.length ? <>Event <span className="font-medium">{selectedIndex + 1}</span> / <span className="font-medium">{rows.length}</span></> : "No events"}
                </div>
              </div>
            </div>
          </section>

          {/* MAPPA DESTRA */}
          <section className="relative min-h-[320px]">
            <div data-map="gehj" className="h-full w-full bg-[linear-gradient(180deg,#eef2ff,transparent)]" aria-label="Map canvas" />
            {!mapLoaded && (
              <div className="absolute left-3 top-3 z-10 rounded-full border border-indigo-200 bg-indigo-50/90 px-3 py-1 text-xs text-indigo-900 shadow">
                Inizializzazione mappa…
              </div>
            )}
          </section>
        </div>

        {/* BANDA EVENTI */}
        <aside className="h-[32svh] bg-white/90 backdrop-blur">
          <div ref={bottomListRef} className="h-full overflow-hidden px-4 py-3">
            <div className="mb-2 text-sm font-medium text-gray-900">Eventi (ordine cronologico)</div>
            <ol className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
              {rows.map((ev, idx) => {
                const active = idx === selectedIndex;
                const span = buildTimelineSpan(ev);
                const label = span ? formatTimelineYearLabel(span.start) : formatWhen(ev);
                return (
                  <li key={ev.id} className="min-w-[240px] flex-shrink-0">
                    <button
                      ref={(el) => { if (el) itemRefs.current.set(ev.id, el!); }}
                      onClick={() => setSelectedIndex(idx)}
                      className={`w-full text-left rounded-xl border transition px-3 py-2 ${
                        active
                          ? "border-black bg-black text-white shadow-sm"
                          : "border-black/10 bg-white/80 text-gray-800 hover:bg-white"
                      }`}
                      title={ev.title}
                    >
                      <div className="flex items-start gap-2">
                        <div className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs ${
                          active ? "bg-white text-black" : "bg-gray-900 text-white"
                        }`}>
                          {idx + 1}
                        </div>
                        <div className="min-w-0">
                          <div className={`truncate text-[13.5px] font-semibold ${active ? "text-white" : "text-gray-900"}`}>
                            {ev.title}
                          </div>
                          <div className={`text-[12px] ${active ? "text-white/80" : "text-gray-600"}`}>
                            {label}{ev.location ? ` - ${ev.location}` : ""}
                          </div>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        </aside>
      </div>
    </div>
  );
}