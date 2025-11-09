// frontend/app/module/group_event/page_inner.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import maplibregl, { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import RatingStars from "../../components/RatingStars";
import { useCurrentUser } from "@/lib/useCurrentUser";

/* ===================== Tipi ===================== */
type AnyObj = Record<string, any>;

type MediaItem = {
  media_id: string;
  type: "image" | "video" | "audio" | "document" | string;
  role?: string | null;
  url: string;
  preview?: string | null;
  source?: string | null;
  mime?: string | null;
  lang?: string | null;
  sort_order?: number | null;
};

type EventCore = {
  id: string;
  latitude: number | null;
  longitude: number | null;
  era?: string | null;
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
  event_media?: MediaItem[];
  event_media_first?: string | null;
};

/* ===================== Util responsive ===================== */
function useIsLg() {
  const [isLg, setIsLg] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsLg(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isLg;
}

/* ===================== Costanti/UI ===================== */
const MODERN_ICONS: Record<string, string> = {
  pin: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z"/><circle cx="12" cy="11" r="3"/></svg>`,
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/* ===================== Util date/ordine ===================== */
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

/** Tick “belli” e più densi per il timeframe sotto la barra */
function buildTimelineTicks(min: number, max: number, targetTicks = 12) {
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

/* ===================== Stile mappa fallback ===================== */
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

type OverlayMode = "overlay" | "full";

/* ===================== Player Overlay (2 livelli, autoplay mobile) ===================== */
function MediaOverlay({
  open,
  mode,
  media,
  autoplay,
  onClose,
  onToggleMode,
}: {
  open: boolean;
  mode: OverlayMode;
  media: MediaItem | null;
  autoplay?: boolean;
  onClose: () => void;
  onToggleMode: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    if (mode === "full") {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [open, mode]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !media) return null;

  const isVideo = media.type === "video";
  const isYouTube = isVideo && /youtu\.?be/.test(media.url);

  const base =
    mode === "full"
      ? "fixed inset-0 z-[1000] flex items-center justify-center bg-black/80"
      : "fixed right-4 bottom-4 z-[900]";

  const box =
    mode === "full"
      ? "relative w-[min(96vw,1200px)] aspect-video rounded-2xl overflow-hidden shadow-2xl bg-black"
      : "relative w-[min(90vw,560px)] aspect-video rounded-2xl overflow-hidden shadow-xl bg-black";

  const ytSrc =
    media.url
      .replace("watch?v=", "embed/")
      .replace("youtu.be/", "www.youtube.com/embed/") +
    (media.url.includes("?") ? "" : "?") +
    "&rel=0&modestbranding=1&playsinline=1" +
    (autoplay ? "&autoplay=1&mute=1" : "");

  return (
    <div className={base} aria-modal="true" role="dialog">
      <div className={box}>
        <div className="absolute top-2 right-2 z-[5] flex items-center gap-2">
          <button
            onClick={onToggleMode}
            className="inline-flex items-center justify-center rounded-lg bg-white/90 px-2 py-1 text-xs text-gray-800 shadow hover:bg-white"
            title={mode === "full" ? "Riduci finestra" : "Schermo intero"}
          >
            {mode === "full" ? "↘" : "↗"}
          </button>
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-lg bg-white/90 px-2 py-1 text-xs text-gray-800 shadow hover:bg-white"
            title="Chiudi"
          >
            ✕
          </button>
        </div>

        {isVideo ? (
          isYouTube ? (
            <iframe
              className="w-full h-full"
              src={ytSrc}
              title="Journey video"
              allow="autoplay; accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : (
            <video
              className="w-full h-full object-contain bg-black"
              src={media.url}
              poster={media.preview || undefined}
              controls
              playsInline
              autoPlay={!!autoplay}
              muted={!!autoplay}
              controlsList="nodownload"
            />
          )
        ) : (
          <img src={media.url || media.preview || ""} alt="media" className="w-full h-full object-contain bg-black" />
        )}
      </div>
    </div>
  );
}

/* ===================== MediaBox (play → overlay con autoplay) ===================== */
function MediaBox({
  items,
  firstPreview,
  onOpenOverlay,
  compact = false,
  hideHeader = false,
  height = "md",
}: {
  items: MediaItem[];
  firstPreview?: string | null;
  onOpenOverlay: (item: MediaItem, opts?: { autoplay?: boolean }) => void;
  compact?: boolean;
  hideHeader?: boolean;
  height?: "xs" | "sm" | "md" | "lg";
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!items?.length) return;
    if (!firstPreview) { setIndex(0); return; }
    const i = items.findIndex((m) => (m.preview || m.url) === firstPreview);
    setIndex(i >= 0 ? i : 0);
  }, [items, firstPreview]);

  if (!items || items.length === 0) return null;

  const curr = items[index];
  const isVideo = curr?.type === "video";

  const goPrev = () => setIndex((i) => (i - 1 + items.length) % items.length);
  const goNext = () => setIndex((i) => (i + 1) % items.length);

  const heightClass =
    height === "xs" ? "h-24" :
    height === "sm" ? "h-32" :
    height === "lg" ? "h-56" :
    "h-40";

  return (
    <div className={`rounded-2xl border border-slate-200 bg-white/90 shadow-sm ${compact ? "p-2" : "p-3"} relative`}>
      {hideHeader ? (
        <div className="absolute left-2 top-2 z-[3] rounded-full bg-black/70 px-2 py-[2px] text-[11px] text-white">
          {index + 1}/{items.length}
        </div>
      ) : null}

      <div className={`relative ${heightClass} w-full rounded-xl overflow-hidden ring-1 ring-black/10 bg-slate-100`}>
        {isVideo ? (
          <div className="relative w-full h-full bg-black/80 flex items-center justify-center">
            {curr.preview ? (
              <img src={curr.preview} alt="video preview" className="absolute inset-0 w-full h-full object-cover opacity-60" />
            ) : null}
            <button
              onClick={() => onOpenOverlay(curr, { autoplay: true })}
              className="relative inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-sm font-medium text-gray-900 shadow hover:bg-white"
              title="Riproduci video"
            >
              ▶
            </button>
          </div>
        ) : (
          <button onClick={() => onOpenOverlay(curr)} className="block w-full h-full" title="Apri immagine">
            <img src={curr.preview || curr.url} alt="media" className="w-full h-full object-cover" />
          </button>
        )}

        {items.length > 1 ? (
          <>
            <button
              onClick={goPrev}
              className="absolute left-2 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/85 text-gray-800 shadow hover:bg-white"
              title="Precedente"
            >
              ◀
            </button>
            <button
              onClick={goNext}
              className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/85 text-gray-800 shadow hover:bg-white"
              title="Successivo"
            >
              ▶
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

/* ===================== Pagina ===================== */
export default function GroupEventModulePage() {
  const router = useRouter();
  const sp = useSearchParams();
  const supabase = useMemo(() => createClientComponentClient(), []);
  const { userId } = useCurrentUser();
  const isLg = useIsLg();

  const desiredLang =
    (sp.get("lang") ||
      (typeof navigator !== "undefined" ? navigator.language?.slice(0, 2) : "it") ||
      "it").toLowerCase();

  const [gid, setGid] = useState<string | null>(null);
  const group_event_id = gid;

  const [err, setErr] = useState<string | null>(null);
  const [landingHref, setLandingHref] = useState<string | null>(null);

  useEffect(() => {
    const raw = sp.get("gid")?.trim ?? null;
    const value = typeof raw === "function" ? sp.get("gid")?.trim() : sp.get("gid");
    const input = (value ?? undefined) as string | undefined;

    if (input) {
      const clean = input.split("?")[0].split("&")[0].trim();
      if (UUID_RE.test(clean)) setGid(clean);
      else setErr("Missing/invalid gid. Usa /module/group_event?gid=<UUID>.");
    } else {
      try {
        const ls =
          typeof window !== "undefined"
            ? localStorage.getItem("active_group_event_id")
            : null;
        if (ls && UUID_RE.test(ls)) setGid(ls);
        else setErr("Missing/invalid gid. Usa /module/group_event?gid=<UUID>.");
      } catch {
        setErr("Missing/invalid gid. Usa /module/group_event?gid=<UUID>.");
      }
    }
  }, [sp]);

  useEffect(() => {
    try {
      const ref = (typeof document !== "undefined" && document.referrer) || "";
      if (!ref) return;
      const u = new URL(ref);
      if (/^\/landing\/[^/]+$/i.test(u.pathname)) setLandingHref(u.pathname);
    } catch {}
  }, []);

  const [ge, setGe] = useState<AnyObj | null>(null);
  const [geTr, setGeTr] = useState<{ title?: string; pitch?: string; description?: string; video_url?: string } | null>(null);
  const [rows, setRows] = useState<EventVM[]>([]);
  const [journeyTitle, setJourneyTitle] = useState<string | null>(null);

  const [journeyMedia, setJourneyMedia] = useState<MediaItem[]>([]);
  const [journeyMediaFirst, setJourneyMediaFirst] = useState<string | null>(null);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);

  const [overlayOpen, setOverlayOpen] = useState(false);
  const [overlayMode, setOverlayMode] = useState<"overlay" | "full">("overlay");
  const [overlayMedia, setOverlayMedia] = useState<MediaItem | null>(null);
  const [overlayAutoplay, setOverlayAutoplay] = useState<boolean>(false);

  const openOverlay = useCallback((m: MediaItem, opts?: { autoplay?: boolean }) => {
    setOverlayMedia(m);
    setOverlayMode("overlay");
    setOverlayAutoplay(!!opts?.autoplay);
    setOverlayOpen(true);
  }, []);
  const closeOverlay = useCallback(() => {
    setOverlayOpen(false);
    setTimeout(() => { setOverlayMedia(null); setOverlayAutoplay(false); }, 180);
  }, []);
  const toggleOverlayMode = useCallback(() => {
    setOverlayMode((prev) => (prev === "overlay" ? "full" : "overlay"));
  }, []);

  /* ===== Mappa ===== */
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<MapLibreMarker[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);

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
    let attempts = 120;

    const tick = () => {
      if (cancelled || mapRef.current) return;
      const container = getVisibleMapContainer();
      if (!container) {
        if (attempts-- > 0) return setTimeout(tick, 50);
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
        } as any);
        map.addControl(new maplibregl.NavigationControl(), "top-right");
        mapRef.current = map as any;
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
      } catch (e) { console.error("[GE] Map init error:", e); }
    };

    tick();
    return () => { cancelled = true; };
  }, []);

  /* ===== Fetch ===== */
  useEffect(() => {
    if (!gid) return;
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const { data: geRows, error: geErr } = await supabase
          .from("group_events").select("*").eq("id", gid).limit(1);
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

        const { data: vjRows, error: vjErr } = await supabase
          .from("v_journey")
          .select(
            `event_id, group_event_id, description, lang, title, video_url, wikipedia_url,
             continent, country, era, exact_date, id, image_url, latitude, longitude, year_from, year_to,
             journey_title, journey_media, journey_media_first, event_media, event_media_first`
          )
          .eq("group_event_id", gid);
        if (vjErr) throw vjErr;

        const vms: EventVM[] = (vjRows ?? []).map((r: any) => {
          const location = r.city ?? r.region ?? r.country ?? r.continent ?? null;
          const core: EventCore = {
            id: String(r.id),
            latitude: typeof r.latitude === "number" ? r.latitude : null,
            longitude: typeof r.longitude === "number" ? r.longitude : null,
            era: r.era ?? null,
            year_from: r.year_from ?? null,
            year_to: r.year_to ?? null,
            exact_date: r.exact_date ?? null,
            location,
            image_url: r.image_url ?? null,
          };
          const ev: EventVM = {
            ...core,
            title: (r.title ?? location ?? "Untitled").toString(),
            description: (r.description ?? "").toString(),
            wiki_url: r.wikipedia_url ? String(r.wikipedia_url) : null,
            video_url: r.video_url ? String(r.video_url) : null,
            order_key: chronoOrderKey(core),
            event_media: Array.isArray(r.event_media) ? (r.event_media as MediaItem[]) : [],
            event_media_first: r.event_media_first ?? null,
          };
          return ev;
        });
        vms.sort((a, b) => a.order_key - b.order_key);

        const j0 = (vjRows ?? [])[0] as any;
        const jm: MediaItem[] = Array.isArray(j0?.journey_media) ? j0.journey_media : [];
        const jmFirst: string | null = j0?.journey_media_first ?? null;

        setGe(geData);
        setGeTr(geTrData);
        setRows(vms);
        setJourneyTitle(j0?.journey_title ?? null);
        setJourneyMedia(jm);
        setJourneyMediaFirst(jmFirst);
        setSelectedIndex(0);
      } catch (e: any) {
        setErr(e?.message ?? "Unknown error");
        console.error("[GE] Fetch error:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [gid, desiredLang, supabase]);

  /* ===== Preferiti ===== */
  const { userId: _uid } = useCurrentUser();
  const [isFav, setIsFav] = useState<boolean>(false);
  const [savingFav, setSavingFav] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      if (!gid) return;
      try {
        if (!_uid) { setIsFav(false); return; }
        let { data: fav, error } = await supabase
          .from("group_event_favourites").select("id")
          .eq("group_event_id", gid).eq("profile_id", _uid).maybeSingle();
        if (error) {
          const alt = await supabase
            .from("group_event_favourites").select("id")
            .eq("group_event_id", gid).eq("user_id", _uid).maybeSingle();
          setIsFav(!!alt.data);
        } else setIsFav(!!fav);
      } catch { setIsFav(false); }
    })();
  }, [gid, supabase, _uid]);

  async function toggleFavourite() {
    if (!gid) return;
    if (!userId) { alert("Per usare i preferiti devi accedere."); return; }
    if (savingFav) return;

    setSavingFav(true);
    try {
      if (isFav) {
        const del1 = await supabase
          .from("group_event_favourites").delete()
          .eq("group_event_id", gid).eq("profile_id", userId);
        if (del1.error) {
          await supabase.from("group_event_favourites").delete()
            .eq("group_event_id", gid).eq("user_id", userId);
        }
        setIsFav(false);
      } else {
        const ins = await supabase.from("group_event_favourites").insert({
          group_event_id: gid, profile_id: userId, created_at: new Date().toISOString(),
        } as any);
        if (ins.error) {
          await supabase.from("group_event_favourites").insert({
            group_event_id: gid, user_id: userId, created_at: new Date().toISOString(),
          } as any);
        }
        setIsFav(true);
      }
    } finally { setSavingFav(false); }
  }

  /* ===== Marker rendering ===== */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    (markersRef.current || []).forEach((m) => m.remove());
    markersRef.current = [];

    const groups = new Map<string, { ids: string[]; lng: number; lat: number }>();
    rows.forEach((ev) => {
      if (ev.latitude == null || ev.longitude == null) return;
      const key = `${ev.longitude.toFixed(6)}_${ev.latitude.toFixed(6)}`;
      if (!groups.has(key))
        groups.set(key, { ids: [], lng: ev.longitude!, lat: ev.latitude! });
      groups.get(key)!.ids.push(ev.id);
    });

    const pixelOffsetById = new Map<string, [number, number]>();
    groups.forEach((g) => {
      const offs = (function computePixelOffsetsForSameCoords(ids: string[], radiusBase = 16) {
        const n = ids.length;
        if (n === 1) return [[0, 0]] as [number, number][];
        const arr: [number, number][] = [];
        const radius = radiusBase + Math.min(12, Math.round(n * 1.2));
        for (let i = 0; i < n; i++) {
          const angle = (2 * Math.PI * i) / n;
          arr.push([Math.round(radius * Math.cos(angle)), Math.round(radius * Math.sin(angle))]);
        }
        return arr;
      })(g.ids);
      g.ids.forEach((id, i) => pixelOffsetById.set(id, offs[i]));
    });

    const pts: [number, number][] = [];

    function makeMarkerEl(idx: number) {
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

      const el = makeMarkerEl(idx);
      const pxOff = pixelOffsetById.get(ev.id) ?? [0, 0];

      const marker = new maplibregl.Marker({ element: el, offset: pxOff as any })
        .setLngLat([ev.longitude!, ev.latitude!])
        .addTo(map as any);

      try { (marker as any).setZIndex?.(idx === selectedIndex ? 1000 : 0); } catch {}

      el.addEventListener("click", () => setSelectedIndex(idx));

      markersRef.current.push(marker as any);
      pts.push([ev.longitude!, ev.latitude!]);
    });

    try {
      if (pts.length) {
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
        (map as any).fitBounds(bounds as any, { padding: 84, duration: 800 });
      } else {
        (map as any).flyTo({ center: [9.19, 45.46], zoom: 3.5, duration: 600 });
      }
    } catch {}
  }, [rows, mapReady, selectedIndex]);

  useEffect(() => {
    const map = mapRef.current as any;
    const ev = rows[selectedIndex];
    if (map && ev && ev.latitude !== null && ev.longitude !== null) {
      try {
        map.flyTo({ center: [ev.longitude, ev.latitude], zoom: Math.max(map.getZoom(), 6), speed: 0.8 });
      } catch {}
    }
  }, [selectedIndex, rows]);

  /* ===== Refs per banda eventi ===== */
  const bandRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  useEffect(() => {
    const ev = rows[selectedIndex];
    if (!ev) return;
    const el = itemRefs.current.get(ev.id);
    if (!el) return;
    if (bandRef.current && bandRef.current.contains(el)) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [selectedIndex, rows]);

  function onBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      (router as any).jump?.(-1);
      router.back();
      return;
    }
    router.push(landingHref || "/landing");
  }

  /* ===== Timeline ridotta con timeframe ricco ===== */
  const timelineData = useMemo(() => {
    if (!rows.length) return null;

    const annotated: { ev: EventVM; index: number; min: number; max: number; center: number }[] = [];
    rows.forEach((ev, index) => {
      const span = buildTimelineSpan(ev);
      if (span) annotated.push({ ev, index, min: span.min, max: span.max, center: span.center });
    });
    if (!annotated.length) return null;

    let min = annotated[0].min, max = annotated[0].max;
    for (const item of annotated) { if (item.min < min) min = item.min; if (item.max > max) max = item.max; }
    const safeSpan = max - min === 0 ? 1 : max - min;

    const items = annotated.map((item) => {
      const startValue = item.min;
      const startProgress = Math.min(1, Math.max(0, (startValue - min) / safeSpan));
      return { ...item, progress: startProgress, start: startValue } as TimelineItem;
    });

    return { min, max, range: safeSpan, items } as TimelineData;
  }, [rows]);

  function Timeline3D() {
    const data = timelineData;
    if (!data) return null;

    const ticks = buildTimelineTicks(data.min, data.max, 12);
    const axisH = "h-[8px]";
    const diamondSize = 12;

    let pct = 50;
    {
      const ev = rows[selectedIndex];
      if (ev) {
        const span = buildTimelineSpan(ev);
        if (span) {
          pct = ((span.start - data.min) / Math.max(1, data.range)) * 100;
          pct = Math.max(0, Math.min(100, pct));
        }
      }
    }

    return (
      <div className="relative flex flex-col justify-between h-full">
        {/* Barra timeline */}
        <div className="relative w-full h-[8px] rounded-full bg-gradient-to-r from-blue-900 via-blue-700 to-blue-900 shadow-inner">
          <div
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-white bg-blue-500 shadow"
            style={{ left: `${pct}%`, width: `${diamondSize}px`, height: `${diamondSize}px`, boxShadow: "0 0 6px rgba(30,64,175,0.45)" }}
          />
          {ticks.map((t, i) => {
            const pos = ((t - data.min) / data.range) * 100;
            return (
              <div
                key={`tick-${i}`}
                className="absolute top-0 h-[6px] w-[2px] -translate-x-1/2 bg-blue-900/60"
                style={{ left: `${pos}%` }}
              />
            );
          })}
        </div>

        {/* Etichette sotto la barra */}
        <div className="relative mt-1 h-5">
          <span className="absolute left-0 -translate-x-0 text-[10px] text-slate-700">
            {formatTimelineYearLabel(data.min)}
          </span>
          {ticks.map((t, i) => {
            const pos = ((t - data.min) / data.range) * 100;
            return (
              <span
                key={`lbl-${i}`}
                className="absolute top-0 text-[10px] text-slate-600 -translate-x-1/2 whitespace-nowrap"
                style={{ left: `${pos}%` }}
              >
                {formatTimelineYearLabel(t)}
              </span>
            );
          })}
          <span className="absolute right-0 translate-x-0 text-[10px] text-slate-700">
            {formatTimelineYearLabel(data.max)}
          </span>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="rounded-2xl border bg-white/70 px-5 py-3 text-sm text-gray-700 shadow">Loading Journey…</div>
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
            <button onClick={onBack} className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-1.5 text-sm hover:bg-gray-50 transition">
              <span aria-hidden>←</span> Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  const selectedEvent = rows[selectedIndex];

  /* ===================== RENDER ===================== */
  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* ===== HEADER: mobile colonna, desktop 3 colonne; mobile h-auto, desktop h-32 ===== */}
      <section className="border-b border-slate-200 bg-white/95 shadow-sm">
        <div className="mx-auto max-w-7xl px-3 py-3 lg:px-8 lg:py-4">
          <div className="grid grid-cols-1 lg:grid-cols-[1.8fr_0.9fr_2.3fr] gap-3 items-stretch">
            {/* [1] Titolo + Favourite */}
            <div className="h-auto lg:h-32 rounded-xl border border-slate-200 bg-white p-3 shadow-[inset_0_2px_6px_rgba(0,0,0,0.05)] flex flex-col justify-between">
              <h1 className="text-base lg:text-xl font-semibold text-slate-900 leading-snug break-words whitespace-pre-line line-clamp-2">
                {(journeyTitle ?? geTr?.title ?? ge?.title ?? "Journey").toString()}
              </h1>
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={toggleFavourite}
                  disabled={!group_event_id || savingFav}
                  className={`rounded-full border px-3 py-1 text-xs lg:text-sm transition ${
                    isFav ? "border-rose-400 bg-rose-50 text-rose-700 hover:bg-rose-100" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {isFav ? "♥ Favourite" : "♡ Favourite"}
                </button>
                {group_event_id ? <RatingStars group_event_id={group_event_id} journeyId={group_event_id} size={18} /> : null}
              </div>
            </div>

            {/* [2] Media del Journey – altezza xs su desktop, più comodo su mobile */}
            <div className="h-auto lg:h-32 rounded-xl border border-slate-200 bg-white p-2 shadow-[inset_0_2px_6px_rgba(0,0,0,0.05)] flex">
              <div className="flex-1">
                {journeyMedia?.length ? (
                  <MediaBox
                    items={journeyMedia}
                    firstPreview={journeyMediaFirst || undefined}
                    onOpenOverlay={openOverlay}
                    hideHeader
                    height={isLg ? "xs" : "sm"}
                    compact
                  />
                ) : (
                  <div className="h-full rounded-xl bg-slate-100 flex items-center justify-center text-xs text-slate-500">
                    Nessun media del journey
                  </div>
                )}
              </div>
            </div>

            {/* [3] Timeline – più larga su desktop; sotto mostra più anni */}
            <div className="h-auto lg:h-32 rounded-xl border border-slate-200 bg-white p-2 shadow-[inset_0_2px_6px_rgba(0,0,0,0.05)] flex">
              <div className="flex-1">
                <Timeline3D />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== BANDA EVENTI ===== */}
      <section className="border-b border-black/10 bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-2" ref={bandRef}>
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[13px] font-medium text-gray-900">Eventi (ordine cronologico)</div>
            {rows.length ? (
              <div className="text-[11.5px] text-gray-600">
                Evento <span className="font-medium">{selectedIndex + 1}</span> / <span className="font-medium">{rows.length}</span>
              </div>
            ) : null}
          </div>

          <div className="overflow-x-auto overflow-y-hidden" style={{ scrollbarWidth: "thin" }}>
            <div className="flex items-stretch gap-2 min-w-max">
              {rows.map((ev, idx) => {
                const active = idx === selectedIndex;
                const span = buildTimelineSpan(ev);
                const label = span ? formatTimelineYearLabel(span.start) : "";
                return (
                  <button
                    key={ev.id}
                    ref={(el) => { if (el) itemRefs.current.set(ev.id, el); }}
                    onClick={() => setSelectedIndex(idx)}
                    className={`shrink-0 w-[60vw] md:w-[280px] max-w-[320px] rounded-xl border px-2 py-1.5 text-left transition h-[64px] ${
                      active ? "border-black bg-black text-white shadow-sm" : "border-black/10 bg-white/80 text-gray-800 hover:bg-white"
                    }`}
                    title={ev.title}
                  >
                    <div className="flex items-start gap-2">
                      <div className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] ${
                        active ? "bg-white text-black" : "bg-gray-900 text-white"
                      }`}>
                        {idx + 1}
                      </div>
                      <div className="min-w-0 leading-tight">
                        <div className={`truncate text-[13px] font-semibold ${active ? "text-white" : "text-gray-900"}`}>
                          {ev.title}
                        </div>
                        <div className={`truncate text-[11.5px] ${active ? "text-white/85" : "text-gray-600"}`}>
                          {label}{ev.location ? ` • ${ev.location}` : ""}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ===== MOBILE: Descrizione + Media evento + Mappa ===== */}
      <div className="mx-auto w-full max-w-7xl lg:hidden overflow-hidden">
        <section className="bg-white/70 backdrop-blur">
          <div className="px-4 py-2">
            <div className="mx-auto w-full max-w-[820px]">
              <div className="rounded-2xl border border-black/10 bg-white/95 shadow-sm flex flex-col">
                <div className="flex items-center justify-end gap-1.5 px-3 py-2 border-b border-black/10">
                  <button
                    onClick={() => setSelectedIndex((i) => rows.length ? (i - 1 + rows.length) % rows.length : 0)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-black/10 bg-white/80 text-xs text-gray-800 shadow-sm transition hover:scale-105 hover:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                    title="Previous"
                  >⏮</button>
                  <button
                    onClick={() => setIsPlaying((p) => !p)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-black/10 bg-white/80 text-xs text-gray-800 shadow-sm transition hover:scale-105 hover:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                    title={isPlaying ? "Pause" : "Play"}
                  >{isPlaying ? "⏸" : "▶"}</button>
                  <button
                    onClick={() => setSelectedIndex((i) => rows.length ? (i + 1) % rows.length : 0)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-black/10 bg-white/80 text-xs text-gray-800 shadow-sm transition hover:scale-105 hover:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                    title="Next"
                  >⏭</button>
                </div>

                {selectedEvent?.event_media?.length ? (
                  <div className="px-3 pt-2">
                    <MediaBox
                      items={selectedEvent.event_media}
                      firstPreview={selectedEvent.event_media_first || undefined}
                      onOpenOverlay={openOverlay}
                      compact
                      height="sm"
                    />
                  </div>
                ) : selectedEvent?.image_url ? (
                  <div className="px-3 pt-2">
                    <div className="relative overflow-hidden rounded-xl ring-1 ring-black/10">
                      <img
                        src={selectedEvent.image_url}
                        alt={selectedEvent.title}
                        className="h-36 w-full object-cover"
                      />
                    </div>
                  </div>
                ) : null}

                {selectedEvent?.location ? (
                  <div className="px-3 pt-2 text-[11.5px] text-gray-600">
                    {selectedEvent.location}
                  </div>
                ) : null}

                <div className="px-3 pt-1 pb-3">
                  <div
                    className="max-h-[35svh] overflow-y-auto pr-2 text-[13px] leading-6 text-gray-800 whitespace-pre-wrap"
                    style={{ scrollbarWidth: "thin" }}
                  >
                    {selectedEvent?.description || "No description available."}
                  </div>

                  <div className="pt-2 flex items-center gap-3">
                    {selectedEvent?.wiki_url ? (
                      <a
                        href={selectedEvent.wiki_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-[12.5px] text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-800"
                      >
                        Wikipedia →
                      </a>
                    ) : null}
                    {selectedEvent?.video_url ? (
                      <a
                        href={selectedEvent.video_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-lg border border-black/10 bg-white/80 px-2.5 py-1 text-[12.5px] text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-800"
                        title="Guarda il video dell'evento"
                      >
                        ▶ Guarda il video
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="relative h-[28svh] min-h-[240px] border-t border-black/10">
          <div data-map="gehj" className="h-full w-full bg-[linear-gradient(180deg,#eef2ff,transparent)]" aria-label="Map canvas" />
          {!mapLoaded && (
            <div className="absolute left-3 top-3 z-10 rounded-full border border-indigo-200 bg-indigo-50/90 px-3 py-1 text-xs text-indigo-900 shadow">
              Inizializzazione mappa…
            </div>
          )}
        </section>
      </div>

      {/* ===== DESKTOP ===== */}
      <div className="mx-auto hidden w-full max-w-7xl lg:block">
        <div className="grid grid-cols-[500px_minmax(0,1fr)] gap-0">
          {/* DESCRIZIONE */}
          <section className="overflow-y-auto bg-white/70 backdrop-blur">
            <div className="px-4 py-4">
              <div className="flex items-center justify-end gap-2 mb-3">
                <button
                  onClick={() => setSelectedIndex((i) => rows.length ? (i - 1 + rows.length) % rows.length : 0)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-black/10 bg-white/80 text-sm text-gray-800 shadow-sm transition hover:scale-105 hover:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                  title="Previous"
                >⏮</button>
                <button
                  onClick={() => setIsPlaying((p) => !p)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-black/10 bg-white/80 text-sm text-gray-800 shadow-sm transition hover:scale-105 hover:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                  title={isPlaying ? "Pause" : "Play"}
                >{isPlaying ? "⏸" : "▶"}</button>
                <button
                  onClick={() => setSelectedIndex((i) => rows.length ? (i + 1) % rows.length : 0)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-black/10 bg-white/80 text-sm text-gray-800 shadow-sm transition hover:scale-105 hover:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                  title="Next"
                >⏭</button>
              </div>

              {selectedEvent?.location ? (
                <div className="text-[12.5px] text-gray-600 mb-2">
                  {selectedEvent.location}
                </div>
              ) : null}

              {selectedEvent?.event_media?.length ? (
                <div className="mb-3">
                  <MediaBox
                    items={selectedEvent.event_media}
                    firstPreview={selectedEvent.event_media_first || undefined}
                    onOpenOverlay={openOverlay}
                    compact
                    height="sm"
                  />
                </div>
              ) : selectedEvent?.image_url ? (
                <div className="mb-3">
                  <div className="relative overflow-hidden rounded-xl ring-1 ring-black/10">
                    <img
                      src={selectedEvent.image_url}
                      alt={selectedEvent.title}
                      className="h-44 w-full object-cover"
                    />
                  </div>
                </div>
              ) : null}

              <div className="whitespace-pre-wrap text-[13.5px] leading-6 text-gray-800">
                {selectedEvent?.description || "No description available."}
              </div>

              <div className="pt-2 flex items-center gap-3">
                {selectedEvent?.wiki_url ? (
                  <a
                    href={selectedEvent.wiki_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-800"
                  >
                    Wikipedia →
                  </a>
                ) : null}
                {selectedEvent?.video_url ? (
                  <a
                    href={selectedEvent.video_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-black/10 bg-white/80 px-3 py-1.5 text-sm text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-800"
                    title="Guarda il video dell'evento"
                  >
                    ▶ Guarda il video
                  </a>
                ) : null}
              </div>
            </div>
          </section>

          {/* MAPPA */}
          <section className="relative min-h-[320px]">
            <div data-map="gehj" className="h-full w-full bg-[linear-gradient(180deg,#eef2ff,transparent)]" aria-label="Map canvas" />
            {!mapLoaded && (
              <div className="absolute left-3 top-3 z-10 rounded-full border border-indigo-200 bg-indigo-50/90 px-3 py-1 text-xs text-indigo-900 shadow">
                Inizializzazione mappa…
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Overlay/Full-screen player */}
      <MediaOverlay
        open={overlayOpen}
        mode={overlayMode}
        media={overlayMedia}
        autoplay={overlayAutoplay}
        onClose={closeOverlay}
        onToggleMode={toggleOverlayMode}
      />
    </div>
  );
}
