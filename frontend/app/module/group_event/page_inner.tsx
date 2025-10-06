// frontend/app/module/group_event/page_inner.tsx
"use client";

import type { JSX } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import maplibregl, { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { supabase } from "@/lib/supabaseBrowserClient";

/* =========================================================================
   SCHEMA (campi usati)
   - group_events: id, title, pitch, cover_url
   - group_event_translations: group_event_id, lang, title, pitch, description, video_url
   - event_group_event: event_id, group_event_id
   - events_list: id, latitude, longitude, era, year_from, year_to, exact_date, location, image_url
   - event_translations: event_id, lang, title, description, description_short, wikipedia_url, video_url
   - event_type_map: event_id, type_code
   - event_types: code, icon, icon_name
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
  image_url?: string | null;   // <-- immagine non localizzata
};

type EventVM = EventCore & {
  title: string;
  description: string;
  wiki_url: string | null;
  video_url: string | null;    // <-- video localizzato
  order_key: number;           // era + year_from (fallback year_to)
};

// ===== Icone inline (fallback) =====
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
const isUrlIcon = (s: string) => {
  const t = s.toLowerCase();
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

/** Normalizza l'era in "BC" | "AD" (default AD) */
function normEra(era?: string | null): "BC" | "AD" {
  if (!era) return "AD";
  const e = era.toUpperCase().trim();
  if (e === "BC" || e === "BCE") return "BC";
  return "AD";
}

/** Chiave di ordinamento cronologico */
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

/** Formattazione date/anni */
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
  try {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return null;
    return d.getUTCFullYear();
  } catch {
    return null;
  }
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

function CartoonGuy({ className = "h-16 w-16", animated = false }: { className?: string; animated?: boolean }): JSX.Element {
  return (
    <svg
      viewBox="0 0 120 160"
      className={className}
      role="img"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="walker-coat" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#1d4ed8" />
          <stop offset="80%" stopColor="#1e3a8a" />
        </linearGradient>
        <linearGradient id="walker-trouser" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#0f172a" />
          <stop offset="90%" stopColor="#1e293b" />
        </linearGradient>
      </defs>
      <style>
        {`
          .walker-limb--back,
          .walker-arm--back {
            opacity: 0.78;
          }
          .walker-animated .walker-limb,
          .walker-animated .walker-arm,
          .walker-animated .walker-body {
            transform-box: fill-box;
          }
          .walker-animated .walker-limb {
            transform-origin: center;
            animation: walker-swing 0.9s ease-in-out infinite alternate;
          }
          .walker-animated .walker-limb--back {
            animation-delay: 0.45s;
          }
          .walker-animated .walker-arm {
            transform-origin: center;
            animation: walker-arm 0.9s ease-in-out infinite alternate;
          }
          .walker-animated .walker-arm--back {
            animation-delay: 0.45s;
          }
          .walker-animated .walker-body {
            transform-origin: center;
            animation: walker-bob 0.9s ease-in-out infinite alternate;
          }
          @keyframes walker-swing {
            from { transform: rotate(-9deg); }
            to { transform: rotate(11deg); }
          }
          @keyframes walker-arm {
            from { transform: rotate(9deg); }
            to { transform: rotate(-9deg); }
          }
          @keyframes walker-bob {
            from { transform: translateY(-1.5px); }
            to { transform: translateY(1.5px); }
          }
        `}
      </style>
      <rect x="30" y="92" width="34" height="26" rx="12" fill="#1f2937" opacity="0.18" />
      <g className={animated ? "walker-animated" : undefined}>
        <g className="walker-body">
          <path d="M56 18c14-6 28 2 30 14" stroke="#0b1120" strokeWidth="4" strokeLinecap="round" fill="none" />
          <circle cx="60" cy="36" r="18" fill="#fed7aa" stroke="#f97316" strokeWidth="3.5" />
          <path d="M70 32c5 0 9 2 11 6" stroke="#9a3412" strokeWidth="2.2" strokeLinecap="round" fill="none" />
          <circle cx="72" cy="30" r="3.8" fill="#0f172a" />
          <path d="M66 44c4 2.8 9.6 2.8 14-0.2" stroke="#0f172a" strokeWidth="2.8" strokeLinecap="round" fill="none" />
          <path d="M60 58c12 0 22 10 22 26v10c0 3.7-2.9 6.4-6.6 6.4H44.2c-3.7 0-6.6-2.7-6.6-6.4V84c0-14.5 9.6-26 22-26Z" fill="url(#walker-coat)" stroke="#1e3a8a" strokeWidth="4" />
          <path d="M50 66h8l-3.2 16H42" fill="#1e3a8a" stroke="#1e3a8a" strokeWidth="2" opacity="0.35" />
          <g className="walker-arm walker-arm--back" style={{ transformOrigin: "42px 72px" }}>
            <path d="M44 66c-5.2 8.2-9.8 20-6.4 26.5L50 90" fill="#fed7aa" stroke="#f97316" strokeWidth="5.5" strokeLinecap="round" />
          </g>
          <g className="walker-arm" style={{ transformOrigin: "84px 72px" }}>
            <path d="M82 66c5.2 8.2 9.8 20 6.4 26.5L72 90" fill="#fed7aa" stroke="#f97316" strokeWidth="5.5" strokeLinecap="round" />
          </g>
        </g>
        <g className="walker-limb walker-limb--back" style={{ transformOrigin: "48px 124px" }}>
          <path d="M52 100l-18 28 9 8 18-22" fill="url(#walker-trouser)" stroke="#0f172a" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M38 136c-5 6-6 11-1 12s14-2 18-6" stroke="#0f172a" strokeWidth="5.5" strokeLinecap="round" />
        </g>
        <g className="walker-limb" style={{ transformOrigin: "74px 124px" }}>
          <path d="M70 100l24 20-6 10-20-12" fill="url(#walker-trouser)" stroke="#0f172a" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M88 130c6 6 10 9 7 13-2.5 4-12 4-18 1" stroke="#0f172a" strokeWidth="5.5" strokeLinecap="round" />
        </g>
      </g>
    </svg>
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

  // ---------- Landing ----------
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

  // ---------- Stato ----------
  const [ge, setGe] = useState<AnyObj | null>(null);
  const [geTr, setGeTr] = useState<{ title?: string; pitch?: string; description?: string; video_url?: string } | null>(null);
  const [rows, setRows] = useState<EventVM[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);

  // Icone per event type
  const [iconByEventId, setIconByEventId] = useState<Map<string, { raw: string; keyword: string | null }>>(new Map());

  // ---------- MAPPA ----------
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<MapLibreMarker[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Contenitore visibile per la mappa (mobile/desktop)
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

  // Init mappa robusto
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

        // group_event base
        const { data: geRows, error: geErr } = await supabase
          .from("group_events")
          .select("*")
          .eq("id", gid)
          .limit(1);
        if (geErr) throw geErr;
        if (!geRows?.length) throw new Error("Group event not found");
        const geData = geRows[0];

        // group_event_translations (per lingua desiderata, fallback a qualsiasi)
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

        // event links
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
              era: e.era ?? null,
              year_from: e.year_from ?? null,
              year_to: e.year_to ?? null,
              exact_date: e.exact_date ?? null,
              location: e.location ?? null,
              image_url: e.image_url ?? null, // <-- nuova cover evento
            })) || [];

        const ids = cores.map((c) => c.id);

        // event_translations: mappa per event_id con priorità desiredLang
        const trMap = new Map<string, { title?: string | null; description?: string | null; description_short?: string | null; wikipedia_url?: string | null; video_url?: string | null }>();
        if (ids.length) {
          const { data: trs } = await supabase
            .from("event_translations")
            .select("event_id, lang, title, description, description_short, wikipedia_url, video_url")
            .in("event_id", ids);

          // fallback generico
          (trs ?? []).forEach((t: any) => {
            if (!trMap.has(t.event_id)) trMap.set(t.event_id, t);
          });
          // override lingua desiderata
          (trs ?? [])
            .filter((t: any) => t.lang?.toLowerCase() === desiredLang)
            .forEach((t: any) => trMap.set(t.event_id, t));
        }

        // ViewModels + ordine
        const vms: EventVM[] = cores.map((c) => {
          const tr = trMap.get(c.id) || ({} as any);
          return {
            ...c,
            title: (tr?.title ?? c.location ?? "Untitled").toString(),
            description: (tr?.description ?? tr?.description_short ?? "").toString(),
            wiki_url: tr?.wikipedia_url ? String(tr.wikipedia_url) : null,
            video_url: tr?.video_url ? String(tr.video_url) : null,
            order_key: chronoOrderKey(c),
          };
        });
        vms.sort((a, b) => a.order_key - b.order_key);

        // Icone type
        const iconMap = new Map<string, { raw: string; keyword: string | null }>();
        if (ids.length) {
          const { data: etmRows } = await supabase
            .from("event_type_map")
            .select("event_id, type_code")
            .in("event_id", ids);

          const typeCodes = Array.from(new Set((etmRows ?? []).map((r: any) => String(r.type_code)).filter(Boolean)));
          let typeInfo = new Map<string, { raw?: string | null; name?: string | null }>();
          if (typeCodes.length) {
            const { data: teRows } = await supabase
              .from("event_types")
              .select("code, icon, icon_name")
              .in("code", typeCodes);
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
        setGeTr(geTrData);
        setRows(vms);
        setIconByEventId(iconMap);
        setSelectedIndex(0);
      } catch (e: any) {
        setErr(e?.message ?? "Unknown error");
        console.error("[GE] Fetch error:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [gid, desiredLang]);

  // ---------- MARKERS con anti-overlap + selezione grande ----------
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

  // Refs per auto-scroll
  const mobileListRef = useRef<HTMLDivElement | null>(null);
  const bottomListRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    (markersRef.current || []).forEach((m) => m.remove());
    markersRef.current = [];

    // Gruppi stesse coordinate
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
      const iconInfo = iconByEventId.get(ev.id);
      const raw = iconInfo?.raw ?? "";
      const keyword = iconInfo?.keyword ?? null;
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

      if (raw) {
        if (isUrlIcon(raw)) {
          const img = document.createElement("img");
          img.src = raw;
          img.alt = "icon";
          img.style.width = isSelected ? "30px" : "22px";
          img.style.height = isSelected ? "30px" : "22px";
          img.style.objectFit = "contain";
          img.referrerPolicy = "no-referrer";
          wrap.appendChild(img);
          return wrap;
        }
        if (isEmojiish(raw) && !MODERN_ICONS[keyword || ""]) {
          const span = document.createElement("span");
          span.textContent = raw;
          span.style.fontSize = isSelected ? "24px" : "18px";
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
        svg.setAttribute("width", isSelected ? "28" : "22");
        svg.setAttribute("height", isSelected ? "28" : "22");
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
  }, [rows, mapReady, selectedIndex, iconByEventId]);

  // Pan selezione + autoplay
  useEffect(() => {
    const map = mapRef.current;
    const ev = rows[selectedIndex];
    if (map && ev && ev.latitude !== null && ev.longitude !== null) {
      try {
        map.flyTo({ center: [ev.longitude, ev.latitude], zoom: Math.max(map.getZoom(), 6), speed: 0.8 });
      } catch {}
    }
  }, [selectedIndex, rows]);

  useEffect(() => {
    let t: any = null;
    if (isPlaying && rows.length > 0) {
      t = setInterval(() => setSelectedIndex((i) => (i + 1) % rows.length), 3200);
    }
    return () => t && clearInterval(t);
  }, [isPlaying, rows.length]);

  // Auto-scroll dell'evento selezionato (mobile orizzontale, desktop verticale)
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


  const current = rows[selectedIndex] ?? null;

  const timelineData = useMemo<TimelineData | null>(() => {
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

    const items: TimelineItem[] = annotated.map((item) => {
      const startValue = item.min; // ← prima era item.start
      const startProgress = Math.min(1, Math.max(0, (startValue - min) / safeSpan));
      return { ...item, progress: startProgress, start: startValue };
    });

    return { min, max, range: safeSpan, items };
  }, [rows]);

  const [isAvatarMoving, setIsAvatarMoving] = useState(false);
  const avatarMoveTimeout = useRef<number | null>(null);
  const previousIndexRef = useRef<number | null>(null);

  useEffect(() => {
    const itemCount = timelineData?.items.length ?? 0;

    if (!timelineData || itemCount <= 1) {
      if (avatarMoveTimeout.current) {
        window.clearTimeout(avatarMoveTimeout.current);
        avatarMoveTimeout.current = null;
      }
      previousIndexRef.current = selectedIndex;
      setIsAvatarMoving(false);
      return;
    }

    const prevIndex = previousIndexRef.current;
    if (prevIndex !== null && prevIndex !== selectedIndex) {
      setIsAvatarMoving(true);
      if (avatarMoveTimeout.current) {
        window.clearTimeout(avatarMoveTimeout.current);
      }
      avatarMoveTimeout.current = window.setTimeout(() => {
        setIsAvatarMoving(false);
        avatarMoveTimeout.current = null;
      }, 900);
    }

    previousIndexRef.current = selectedIndex;
  }, [selectedIndex, timelineData?.items.length]);

  useEffect(() => () => {
    if (avatarMoveTimeout.current) {
      window.clearTimeout(avatarMoveTimeout.current);
      avatarMoveTimeout.current = null;
    }
  }, []);

  const avatarProgress = useMemo(() => {
    if (!timelineData || !timelineData.items.length) return 0;
    const currentId = current?.id;
    const fallback = timelineData.items[0];
    const target = currentId
      ? timelineData.items.find((item) => item.ev.id === currentId) || fallback
      : fallback;
    return target ? target.progress : 0;
  }, [timelineData, current?.id]);

  const timelineTicks = useMemo(() => {
    if (!timelineData) return [];
    return buildTimelineTicks(timelineData.min, timelineData.max);
  }, [timelineData]);

  // ------------ Derived text ------------
  const geTitle = (geTr?.title || ge?.title || "Journey").toString();
  const geSubtitle = (geTr?.pitch || ge?.pitch || "").toString();
  const geCover = ge?.cover_url ?? null;
  const geVideo = geTr?.video_url || null;

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

  // ---------- UI ----------

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {timelineData ? (
        <section className="border-b border-slate-200 bg-gradient-to-b from-slate-50 via-white to-white/80">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-sm sm:pr-6">
              <h2 className="text-xl font-semibold text-slate-900 sm:text-2xl">{geTitle}</h2>
              {geSubtitle ? (
                <p className="mt-3 text-sm leading-6 text-slate-600">{geSubtitle}</p>
              ) : null}
            </div>

            <div className="flex-1 sm:flex sm:justify-end">
              <div className="w-full max-w-[720px] rounded-3xl border border-slate-200 bg-white/95 px-4 py-4 shadow-sm sm:px-6 sm:py-5">
                <div className="relative ml-auto h-[84px] w-full max-w-[820px] sm:h-[108px]">
                  <div className="absolute inset-x-0 top-1/2 -translate-y-1/2">
                    <div className="relative mx-auto h-4 w-full max-w-[780px]">
                      <div
                        className="absolute inset-0 rounded-full"
                        style={{
                          background: 'linear-gradient(180deg, #f8fafc 0%, #e2e8f0 40%, #cbd5f5 100%)',
                          boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.7), inset 0 -4px 8px rgba(30,64,175,0.35), 0 14px 16px rgba(15,23,42,0.18)'
                        }}
                      />
                      <div className="absolute left-1/2 top-full h-4 w-[92%] -translate-x-1/2 -translate-y-1 rounded-full bg-slate-900/15 blur-md" />
                    </div>
                  </div>

                  <div
                    className="pointer-events-none absolute top-[calc(50%-42px)] sm:top-[calc(50%-52px)]"
                    style={{
                      left: `${avatarProgress * 100}%`,
                      transform: "translate(-50%, 0)",
                      transition: "left 360ms cubic-bezier(0.22, 1, 0.36, 1)",
                    }}
                  >
                    <CartoonGuy
                      animated={isAvatarMoving}
                      className="h-16 w-16 sm:h-20 sm:w-20 drop-shadow-[0_8px_22px_rgba(15,23,42,0.22)]"
                    />
                  </div>

                  <div className="absolute inset-x-0 top-[calc(50%+10px)]">
                    <div className="relative h-9">
                      {timelineTicks.map((tick) => (
                        <div
                          key={`timeline-tick-${tick}`}
                          className="absolute -translate-x-1/2 text-center"
                          style={{
                            left: `${((tick - timelineData.min) / timelineData.range) * 100}%`,
                          }}
                        >
                          <div className="mx-auto h-4 w-[2px] rounded-full bg-slate-300" />
                          <div className="mt-1 whitespace-nowrap text-[10px] font-medium text-slate-500">
                            {formatTimelineYearLabel(tick)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="absolute inset-x-0 top-[calc(50%+30px)] flex justify-between text-[11px] font-semibold text-slate-600">
                    <span>{formatTimelineYearLabel(timelineData.min)}</span>
                    <span>{formatTimelineYearLabel(timelineData.max)}</span>
                  </div>
                </div>
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
                const span = buildTimelineSpan(ev);
                const label = span ? formatTimelineYearLabel(span.start) : formatWhen(ev);
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

        {/* DESCRIZIONE — box con immagine evento (se presente), testo scroll, wikipedia, player e video */}
        <section className="bg-white/70 backdrop-blur">
          <div className="px-4 py-3">
            <div className="mx-auto w-full max-w-[820px]">
              <div className="rounded-2xl border border-black/10 bg-white/95 shadow-sm flex flex-col">
                {/* Header sintetico */}
                <div className="px-4 pt-3">
                  <div className="text-sm font-semibold text-gray-900 truncate">{current?.title ?? "—"}</div>
                  <div className="text-[12.5px] text-gray-600">
                    {current ? formatWhen(current as EventVM) : "—"}
                    {current?.location ? ` • ${current.location}` : ""}
                  </div>
                </div>

                {/* Immagine evento (se presente) */}
                {current?.image_url ? (
                  <div className="px-4 pt-3">
                    <div className="relative overflow-hidden rounded-xl ring-1 ring-black/10">
                      <img src={current.image_url} alt={current.title} className="h-48 w-full object-cover" />
                    </div>
                  </div>
                ) : null}

                {/* Area testo scrollabile */}
                <div className="px-4 pt-3">
                  <div
                    className="h-[28svh] overflow-y-auto pr-2 text-[13.5px] leading-6 text-gray-800 whitespace-pre-wrap"
                    style={{ scrollbarWidth: "thin" }}
                  >
                    {current?.description || "No description available."}
                  </div>
                  {current?.wiki_url ? (
                    <div className="pt-2">
                      <a
                        href={current.wiki_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-800"
                      >
                        Wikipedia →
                      </a>
                    </div>
                  ) : null}
                </div>

                {/* PLAYER */}
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

                    <div className="ml-auto text-[12px] text-gray-600">
                      {rows.length ? <>Event <span className="font-medium">{selectedIndex + 1}</span> / <span className="font-medium">{rows.length}</span></> : "No events"}
                    </div>
                  </div>

                  {/* Bottone video evento (se presente) */}
                  {current?.video_url ? (
                    <div className="pt-2">
                      <a
                        href={current.video_url}
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
        </section>
      </div>

      {/* ============== DESKTOP (≥lg) ============== */}
      <div className="mx-auto hidden w-full max-w-7xl flex-1 lg:block">
        <div
          className="
            grid
            grid-cols-[500px_minmax(0,1fr)]
            gap-0
            h-[calc(100svh-38svh)]
          "
        >
          {/* PANNELLO SINISTRO: descrizione + player + video evento */}
          <section className="overflow-y-auto bg-white/70 backdrop-blur">
            <div className="px-4 py-4">
              <div className="mb-2 text-sm font-semibold text-gray-900">
                {current?.title ?? "—"}
              </div>
              <div className="text-[12.5px] text-gray-600 mb-2">
                {current ? formatWhen(current as EventVM) : "—"}
                {current?.location ? ` • ${current.location}` : ""}
              </div>

              {/* Immagine evento (se presente) */}
              {current?.image_url ? (
                <div className="mb-3">
                  <div className="relative overflow-hidden rounded-xl ring-1 ring-black/10">
                    <img src={current.image_url} alt={current.title} className="h-44 w-full object-cover" />
                  </div>
                </div>
              ) : null}

              <div className="whitespace-pre-wrap text-[13.5px] leading-6 text-gray-800">
                {current?.description || "No description available."}
              </div>
              {current?.wiki_url ? (
                <div className="pt-2">
                  <a
                    href={current.wiki_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-800"
                  >
                    Open Wikipedia
                  </a>
                </div>
              ) : null}

              {/* Bottone video evento (se presente) */}
              {current?.video_url ? (
                <div className="pt-3">
                  <a
                    href={current.video_url}
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

            {/* Player */}
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

        {/* BANDA EVENTI (singola riga scrollabile) */}
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

