// frontend/app/module/group_event/page_inner.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback, CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import maplibregl, { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import RatingStars from "../../components/RatingStars";
import { Scorecard } from "@/app/components/Scorecard";
import { tUI } from "@/lib/i18n/uiLabels";
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
 metadata?: any;
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
 event_type_icon?: string | null;
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

type CorrelatedJourney = {
  id: string;
  slug: string | null;
  title: string | null;
  coverUrl: string | null;
};

type ConcurrentJourney = {
  evId: string;
  geId: string;
  geTitle?: string | null;
  coverUrl?: string | null;
  evTitle: string;
  evRangeLabel?: string | null;
  startYear?: number;
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
const BOX_3D =
 "rounded-2xl border border-slate-200 bg-white/95 shadow-[0_12px_28px_rgba(15,23,42,0.16)] ring-1 ring-white/70";


const TTS_VOICE_OPTIONS = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "onyx",
  "nova",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
] as const;
const TTS_TONE_OPTIONS = ["calm", "neutral", "energetic"] as const;
type TTSTone = (typeof TTS_TONE_OPTIONS)[number];

/* ===================== Util date/ordine ===================== */
function normEra(era?: string | null): "BC" | "AD" {
 if (!era) return "AD";
 const e = era.toUpperCase().trim();
 if (e === "BC" || e === "BCE") return "BC";
 return "AD";
}
function chronoOrderKey(e: {
 era?: string | null;
 year_from?: number | null;
 year_to?: number | null;
 exact_date?: string | null;
}) {
 const era = normEra(e.era);
 const from = typeof e.year_from === "number" ? e.year_from : null;
 const to = typeof e.year_to === "number" ? e.year_to : null;
 if (from != null) {
  const signed = era === "BC" ? -Math.abs(from) : Math.abs(from);
  return signed * 100;
 }
 if (e.exact_date) {
  try {
   const exactMs = new Date(e.exact_date).getTime();
   if (Number.isFinite(exactMs)) return exactMs;
  } catch {}
 }
 if (to != null) {
  const signed = era === "BC" ? -Math.abs(to) : Math.abs(to);
  return signed * 100 + 0.5;
 }
 return 9_999_999_999;
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
 return `${rounded}`;
}

function formatEventRange(ev: EventVM) {
  const from = signedYear(ev.year_from, ev.era);
  const to = signedYear(ev.year_to, ev.era);
  const exact = parseExactDateYear(ev.exact_date);
  if (from != null && to != null) {
    return `${formatTimelineYearLabel(from)} - ${formatTimelineYearLabel(to)}`;
  }
  const single = from ?? to ?? exact;
  return single != null ? formatTimelineYearLabel(single) : "n/a";
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

// Verifica sovrapposizione tra due intervalli timeline
function spansOverlap(a: { min: number; max: number }, b: { min: number; max: number }, tol = 0) {
 return a.max + tol >= b.min && b.max + tol >= a.min;
}

function makeEventMarkerElement(ev: EventVM, isSelected: boolean) {
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

 const iconUrl = ev.event_type_icon ? normalizeMediaUrl(ev.event_type_icon) : null;
 if (iconUrl) {
  const img = document.createElement("img");
  img.src = iconUrl;
  img.alt = ev.title || "Evento";
  img.style.width = isSelected ? "28px" : "22px";
  img.style.height = isSelected ? "28px" : "22px";
  img.style.objectFit = "contain";
  img.style.filter = "drop-shadow(0 2px 4px rgba(0,0,0,0.15))";
  wrap.appendChild(img);
 } else {
  const holder = document.createElement("div");
  holder.innerHTML = MODERN_ICONS["pin"];
  const svg = holder.firstChild as SVGElement | null;
  if (svg) {
   svg.setAttribute("width", isSelected ? "28" : "22");
   svg.setAttribute("height", isSelected ? "28" : "22");
   (svg as any).style.color = "#111827";
   wrap.appendChild(svg);
  }
 }

 return wrap;
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

const isAudioMedia = (m: MediaItem | null | undefined) => {
  if (!m) return false;
  const t = (m.type || "").toLowerCase();
  return t === "audio";
};

function getYouTubePreview(url?: string | null) {
  if (!url) return null;
  try {
    const normalized = url.startsWith("http") ? url : `https://${url}`;
    const u = new URL(normalized);
    const host = u.hostname.replace(/^www\./, "");
    const isYT = host.includes("youtube.com") || host === "youtu.be";
    if (!isYT) return null;

    const pathParts = u.pathname.split("/").filter(Boolean);
    const searchId = u.searchParams.get("v");
    const idFromShorts = pathParts[0] === "shorts" ? pathParts[1] : null;
    const idFromEmbed = pathParts[0] === "embed" ? pathParts[1] : null;
    const idFromWatch = pathParts[0] === "watch" ? searchId : null;
    const idFromLive = pathParts[0] === "live" ? pathParts[1] : null;
    const idFromYoutu = host === "youtu.be" ? pathParts[0] : null;
    const fallbackId = searchId || idFromShorts || idFromEmbed || idFromWatch || idFromLive || idFromYoutu;

    const finalId =
      fallbackId && /^[0-9A-Za-z_-]{6,}/.test(fallbackId)
        ? fallbackId
        : pathParts.find((p) => /^[0-9A-Za-z_-]{6,}/.test(p)) || null;

    if (finalId) return `https://img.youtube.com/vi/${finalId}/hqdefault.jpg`;
  } catch {
    return null;
  }
  return null;
}

// Normalizza URL di media (copre percorsi storage con \ o /public/)
function normalizeMediaUrl(raw?: string | null) {
  if (!raw) return "";
  const url = raw.trim();
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/")) {
    return url;
  }
  const withForwardSlashes = url.replace(/\\/g, "/");
  // Supabase storage bucket paths without domain -> prepend public object path
  const bucketMatch = withForwardSlashes.match(/^((journey-covers|media|journey-audio)\/.+)$/i);
  if (bucketMatch) {
    return `/storage/v1/object/public/${bucketMatch[1]}`;
  }
  // Supabase storage paths without protocol: keep full storage prefix
  if (withForwardSlashes.includes("storage/v1/object/public/")) {
    return encodeURI(`/${withForwardSlashes.replace(/^\/+/, "")}`);
  }
  const fromPublic = withForwardSlashes.split("/public/");
  if (fromPublic.length > 1 && fromPublic[1]) {
    return encodeURI(`/${fromPublic[1]}`);
  }
  return encodeURI(withForwardSlashes);
}

function parseStorageFromUrl(url: string) {
  try {
    const withoutQuery = url.split("?")[0];
    const marker = "/storage/v1/object/public/";
    const idx = withoutQuery.indexOf(marker);
    if (idx === -1) return null;
    const tail = withoutQuery.slice(idx + marker.length);
    const [bucket, ...rest] = tail.split("/");
    if (!bucket || !rest.length) return null;
    return { bucket, path: rest.join("/") };
  } catch {
    return null;
  }
}

function normalizeMediaItem(m: MediaItem): MediaItem {
  const normalizedUrl = normalizeMediaUrl(m.url || null);
  const normalizedPreview = normalizeMediaUrl(m.preview || null);
  const youtubeThumb = getYouTubePreview(normalizedUrl || m.url || "") || null;
  const fallbackPreview =
    normalizedPreview ||
    youtubeThumb ||
    normalizeMediaUrl(m.url || null) ||
    m.preview ||
    m.url ||
    null;
  const looksVideo =
    (m.type && m.type.toLowerCase() === "video") ||
    /youtu\.?be|vimeo\.com/i.test(normalizedUrl || m.url || "");
  const looksAudio =
    (m.type && m.type.toLowerCase() === "audio") ||
    (m.mime && m.mime.toLowerCase().startsWith("audio/"));
  return {
    ...m,
    type: looksVideo ? "video" : looksAudio ? "audio" : m.type,
    url: normalizedUrl || m.url,
    preview: fallbackPreview || null,
    metadata: m.metadata,
  };
}

function coerceMediaItem(raw: any): MediaItem | null {
  if (!raw) return null;
  const url =
    raw.url ||
    raw.public_url ||
    raw.source_url ||
    raw.media_url ||
    raw.path ||
    "";
  const preview =
    raw.preview ||
    raw.public_url ||
    raw.source_url ||
    raw.media_url ||
    url ||
    null;
  const looksLikeVideo =
    (typeof url === "string" && /youtu\.?be|vimeo\.com/i.test(url)) ||
    (typeof url === "string" && /\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(url)) ||
    (raw.media_type && String(raw.media_type).toLowerCase().startsWith("video/"));
  const looksLikeAudio =
    (raw.media_type && String(raw.media_type).toLowerCase().startsWith("audio/")) ||
    (raw.type && String(raw.type).toLowerCase() === "audio");
  const type =
    raw.type ||
    raw.media_type ||
    (looksLikeVideo ? "video" : looksLikeAudio ? "audio" : "image");
  const previewOrThumb =
    preview ||
    (looksLikeVideo ? getYouTubePreview(typeof url === "string" ? url : "") : null) ||
    null;
  return {
    media_id: String(raw.media_id || raw.id || url || Math.random().toString(36).slice(2)),
    type,
    role: raw.role ?? null,
    url: typeof url === "string" ? url : "",
    preview: typeof previewOrThumb === "string" ? previewOrThumb : null,
    source: raw.source_url ?? raw.public_url ?? raw.url ?? null,
    metadata: raw.asset_metadata ?? raw.metadata ?? raw.attachment_metadata ?? null,
    mime: raw.mime ?? raw.media_type ?? null,
    lang: raw.lang ?? null,
    sort_order: raw.sort_order ?? null,
  };
}

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

 const isVideo = media.type === "video" || /youtu\.?be|vimeo\.com/i.test(media.url || "");
 const isYouTube = isVideo && /youtu\.?be/.test(media.url);

 const base =
 mode === "full"
 ? "fixed inset-0 z-[5000] flex items-center justify-center bg-black/80"
 : "fixed right-4 bottom-4 z-[4000]";

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
 className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 text-gray-800 shadow hover:bg-white"
 title={mode === "full" ? "Riduci finestra" : "Schermo intero"}
 aria-label={mode === "full" ? "Riduci finestra" : "Schermo intero"}
 >
 {mode === "full" ? (
 <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
 <path d="M10 14v4h-4" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
 <path d="M14 10V6h4" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
 <path d="M10 14 6 18M14 10l4-4" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
 </svg>
 ) : (
 <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
 <path d="M14 10h4v4" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
 <path d="M10 14H6v-4" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
 <path d="m14 10 4-4M10 14 6 18" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
 </svg>
 )}
 </button>
 <button
 onClick={onClose}
 className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 text-gray-800 shadow hover:bg-white"
 title="Chiudi"
 aria-label="Chiudi"
 >
 <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
 <path d="m7 7 10 10M17 7 7 17" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
 </svg>
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

/* ===================== Quiz Overlay ===================== */
function QuizOverlay({
  open,
  onClose,
  src = "/module/quiz",
}: {
  open: boolean;
  onClose: () => void;
  src?: string;
}) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[5200] flex items-center justify-center bg-black/72 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true">
      <div className="relative h-[100svh] w-full overflow-hidden bg-[#090b12] shadow-2xl sm:h-[82vh] sm:max-w-6xl sm:rounded-2xl sm:bg-white sm:ring-1 sm:ring-black/10">
        <div className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-10 flex items-center gap-2 sm:top-3">
          {!loaded ? (
            <div className="rounded-full border border-[#f6c86a]/25 bg-[#f6c86a]/14 px-3 py-1 text-xs font-medium text-[#f4dca0] shadow-sm sm:border-amber-200 sm:bg-amber-100 sm:text-amber-900">
              Caricamento...
            </div>
          ) : null}
        </div>
        <iframe
          src={src}
          title="Quiz"
          className="h-full w-full border-0"
          onLoad={() => setLoaded(true)}
        />
      </div>
    </div>
  );
}

/* ===================== MediaBox (play ? overlay con autoplay) ===================== */
function MediaBox({
 items,
 firstPreview,
 onOpenOverlay,
 compact = false,
 hideHeader = false,
 height = "md",
 hoverPreviewList = false,
 hoverPreviewDirection = "vertical",
 alwaysShowList = false,
 listMaxHeight,
}: {
 items: MediaItem[];
 firstPreview?: string | null;
 onOpenOverlay: (item: MediaItem, opts?: { autoplay?: boolean }) => void;
 compact?: boolean;
 hideHeader?: boolean;
 height?: "xs" | "sm" | "md" | "lg" | "xl";
 hoverPreviewList?: boolean;
 hoverPreviewDirection?: "vertical" | "horizontal";
 alwaysShowList?: boolean;
 listMaxHeight?: string;
}) {
 const [index, setIndex] = useState(0);
 const [hovering, setHovering] = useState(false);

  useEffect(() => {
    if (!items?.length) { setIndex(0); return; }
    const maxIdx = items.length - 1;
    if (!firstPreview) { setIndex((i) => Math.min(i, maxIdx)); return; }
    const i = items.findIndex((m) => (m.preview || m.url) === firstPreview);
    setIndex(i >= 0 ? i : (prev) => Math.min(prev, maxIdx));
  }, [items, firstPreview]);

 // Se non ci sono media, mostra comunque un contenitore placeholder
 if (!items || items.length === 0) {
 const heightClass =
 height === "xs" ? "h-24" :
 height === "sm" ? "h-32" :
 height === "lg" ? "h-56" :
 "h-40";
 const baseHeightPx = height === "xs" ? 108 : height === "sm" ? 150 : height === "lg" ? 260 : 200;
 return (
 <div className={`${BOX_3D} ${compact ? "p-2" : "p-3"} relative`}>
 {hideHeader ? null : (
 <div className="absolute left-2 top-2 z-[50] rounded-full bg-black/70 px-2 py-[2px] text-[11px] text-white backdrop-blur-sm">
 0/0
 </div>
 )}
  <div
    className={`relative ${heightClass} w-full rounded-xl overflow-hidden ring-1 ring-black/10 bg-slate-100`}
    style={{ height: `${baseHeightPx}px`, minHeight: `${baseHeightPx}px` }}
  >
  <div className="flex h-full w-full items-center justify-center text-xs text-slate-500">
  Nessun media disponibile
   </div>
   </div>
  </div>
  );
 }

  const safeIndex = Math.max(0, Math.min(index, items.length - 1));
  const curr = items[safeIndex];
 const isVideo = curr?.type === "video" || /youtu\.?be|vimeo\.com/i.test(curr?.url || "");
 const videoPreview =
 getYouTubePreview(curr?.url) ||
 getYouTubePreview(curr?.preview) ||
 curr?.preview ||
 null;

 const goPrev = () => setIndex((i) => (i - 1 + items.length) % items.length);
 const goNext = () => setIndex((i) => (i + 1) % items.length);

 const heightClass =
  height === "xs" ? "h-24" :
  height === "sm" ? "h-32" :
  height === "xl" ? "h-[260px]" :
  height === "lg" ? "h-56" :
  "h-40";
 const listVisible = hoverPreviewList && (hovering || alwaysShowList) && items.length > 1;
 const baseHeightPx =
  height === "xs" ? 108 :
  height === "sm" ? 150 :
  height === "xl" ? 260 :
  height === "lg" ? 260 :
  200;

 return (
 <div
   className={`${BOX_3D} ${compact ? "p-2" : "p-3"} relative`}
   onMouseEnter={() => setHovering(true)}
   onMouseLeave={() => setHovering(false)}
 >
 {hideHeader ? (
 <div className="absolute left-2 top-2 z-[50] rounded-full bg-black/70 px-2 py-[2px] text-[11px] text-white backdrop-blur-sm">
 {index + 1}/{items.length}
 </div>
 ) : null}

 <div
  className={`relative ${heightClass} w-full rounded-xl ring-1 ring-black/10 bg-slate-100`}
  style={{
    height: `${baseHeightPx}px`,
    minHeight: `${baseHeightPx}px`,
    overflow: listVisible ? "visible" : "hidden",
  }}
 >
 {listVisible ? (
    <div
      className={`absolute z-30 ${hoverPreviewDirection === "vertical" ? "left-0 right-0 top-0 w-full" : "top-0 left-0 h-full"}`}
      style={
        hoverPreviewDirection === "vertical"
          ? { maxHeight: listMaxHeight ?? "70vh", overflowY: "auto", padding: "8px", scrollbarWidth: "thin" }
          : { maxWidth: "90vw", overflowX: "auto", padding: "8px", scrollbarWidth: "thin" }
      }
    >
      <div className={hoverPreviewDirection === "vertical" ? "grid grid-cols-2 gap-2" : "flex items-stretch gap-3"}>
      {items.map((m, i) => {
        const rawThumb = m.preview || m.url || "";
        const ytThumb = getYouTubePreview(rawThumb) || getYouTubePreview(m.url || "") || getYouTubePreview(m.preview || "");
        const normalizedThumb =
          normalizeMediaUrl(rawThumb) ||
          normalizeMediaUrl(m.url || "") ||
          normalizeMediaUrl(m.preview || "") ||
          "";
        const thumb = ytThumb || normalizedThumb || m.url || m.preview || "";
        const isSel = i === index;
        const isVid = (m.type || "").toLowerCase() === "video" || /youtu\.?be|vimeo\.com/i.test(m.url || m.preview || "");
        return (
          <button
            key={m.media_id || i}
            onClick={() => {
              setIndex(i);
              onOpenOverlay(m, { autoplay: isVid });
            }}
            className={`overflow-hidden rounded-lg border transition ${isSel ? "border-amber-300 ring-1 ring-amber-200 bg-amber-50/80" : "border-slate-200 bg-white/95 hover:border-slate-300"}`}
            style={{
              padding: "0",
              display: "block",
              width: hoverPreviewDirection === "vertical" ? "100%" : "180px",
              minWidth: hoverPreviewDirection === "vertical" ? "100%" : "180px",
            }}
          >
            <div className={`w-full ${hoverPreviewDirection === "vertical" ? "h-28" : "h-32"} rounded-md bg-slate-100 overflow-hidden ring-1 ring-black/5`}>
              {thumb ? (
                <img src={thumb} alt={m.type || "media"} className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-[11px] text-slate-500">No preview</div>
              )}
            </div>
          </button>
        );
      })}
      </div>
    </div>
 ) : (
   <>
     {isVideo ? (
       <div className="relative h-full w-full overflow-hidden bg-slate-900">
         {videoPreview ? (
           <img src={videoPreview} alt="video preview" className="absolute inset-0 h-full w-full object-contain bg-black brightness-[0.9]" />
         ) : (
           <div className="absolute inset-0 bg-gradient-to-br from-slate-800 via-slate-900 to-black" aria-hidden="true" />
         )}
         <div className="absolute inset-0 bg-black/35" aria-hidden="true" />
         <div className="absolute inset-0 flex items-center justify-center">
           <button
             onClick={() => onOpenOverlay(curr, { autoplay: true })}
             className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/95 text-blue-600 shadow-lg ring-1 ring-black/10 transition hover:bg-white hover:shadow-xl"
             title="Riproduci video"
             aria-label="Riproduci video"
           >
             <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
               <path d="M9 7.5 17 12l-8 4.5Z" fill="currentColor" />
             </svg>
           </button>
         </div>
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
           <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
         </button>
         <button
           onClick={goNext}
           className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/85 text-gray-800 shadow hover:bg-white"
           title="Successivo"
         >
           <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
         </button>
       </>
     ) : null}
   </>
 )}
  </div>
  </div>
  );
}

/* ===================== Pagina ===================== */
export default function GroupEventModulePage() {
 const router = useRouter();
const sp = useSearchParams();
const debugPlayer = sp.get("debug") === "1";
 const supabase = useMemo(() => createClientComponentClient(), []);
 const { userId } = useCurrentUser();
 const isLg = useIsLg();

const queryLang = sp.get("lang");
const [desiredLang, setDesiredLang] = useState<string>(() => {
  const qp = queryLang;
  if (qp && qp.trim()) return qp.trim().slice(0, 2).toLowerCase();
  return "it";
});
const [preferredAudioLang, setPreferredAudioLang] = useState<string>("it");
const [audioPreferenceReady, setAudioPreferenceReady] = useState(false);

useEffect(() => {
  let active = true;
  const qp = queryLang;
  const queryLangShort = qp && qp.trim() ? qp.trim().slice(0, 2).toLowerCase() : null;
  if (queryLangShort) {
    setDesiredLang(queryLangShort);
  }
  (async () => {
    const browserLang =
      typeof window !== "undefined" ? window.navigator.language : "en";
    const browserShort = browserLang.slice(0, 2).toLowerCase();
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) {
        console.warn("[GE] auth.getUser error:", userError.message);
      }
      if (!user) {
        if (active) {
          setPreferredAudioLang(browserShort);
          if (!queryLangShort) setDesiredLang(browserShort);
          setAudioPreferenceReady(true);
        }
        return;
      }
      const { data, error } = await supabase
        .from("profiles")
        .select("language_code")
        .eq("id", user.id)
        .maybeSingle();
      if (error) {
        console.warn("[GE] profiles.language_code error:", error.message);
        if (active) {
          setPreferredAudioLang(browserShort);
          if (!queryLangShort) setDesiredLang(browserShort);
          setAudioPreferenceReady(true);
        }
        return;
      }
      if (!data || typeof data.language_code !== "string") {
        if (active) {
          setPreferredAudioLang(browserShort);
          if (!queryLangShort) setDesiredLang(browserShort);
          setAudioPreferenceReady(true);
        }
        return;
      }
      const dbLang = (data.language_code as string).trim() || browserShort;
      if (active) {
        const nextLang = dbLang.slice(0, 2).toLowerCase();
        setPreferredAudioLang(nextLang);
        if (!queryLangShort) setDesiredLang(nextLang);
        setAudioPreferenceReady(true);
      }
    } catch (err: any) {
      console.warn("[GE] Unexpected error loading language:", err?.message);
      if (active) {
        setPreferredAudioLang(browserShort);
        if (!queryLangShort) setDesiredLang(browserShort);
        setAudioPreferenceReady(true);
      }
    }
  })();
  return () => { active = false; };
}, [queryLang, supabase]);

const [ge, setGe] = useState<AnyObj | null>(null);
 const [geTr, setGeTr] = useState<{ title?: string; description?: string; lang?: string } | null>(null);

const resolvedLang = useMemo(
  () => geTr?.lang?.toLowerCase?.() || desiredLang,
  [geTr, desiredLang]
);
const uiLang = desiredLang || resolvedLang;

const [rows, setRows] = useState<EventVM[]>([]);
const [journeyTitle, setJourneyTitle] = useState<string | null>(null);
const [journeyDescription, setJourneyDescription] = useState<string>("");
const [journeyMedia, setJourneyMedia] = useState<MediaItem[]>([]);
const [journeyMediaFirst, setJourneyMediaFirst] = useState<string | null>(null);
const [journeyAudioTracks, setJourneyAudioTracks] = useState<Array<{ lang: "it" | "en" | null; url: string; label: string; timeline?: any }>>([]);
const [selectedIndex, setSelectedIndex] = useState(0);
const [loading, setLoading] = useState(true);
const [isPlaying, setIsPlaying] = useState(false);
const [isBuffering, setIsBuffering] = useState(false);
const [mapMode, setMapMode] = useState<"normal" | "fullscreen">("normal");
const [mobileSheetSnap, setMobileSheetSnap] = useState<"peek" | "half">("peek");
const [mobileTab, setMobileTab] = useState<"event" | "related">("event");
const [mobileJourneyDescOpen, setMobileJourneyDescOpen] = useState(false);
const [mobileTopMediaOpen, setMobileTopMediaOpen] = useState(false);
const [mobileTopTabOpen, setMobileTopTabOpen] = useState(false);
const [mobilePlayerOpen, setMobilePlayerOpen] = useState(false);
const [mobileJourneyMenuOpen, setMobileJourneyMenuOpen] = useState(false);
const [mobileEventMenuOpen, setMobileEventMenuOpen] = useState(false);
const mobileMediaRef = useRef<HTMLDivElement | null>(null);
const mobileTopTabRef = useRef<HTMLDivElement | null>(null);
const mobileTopOverlayRef = useRef<HTMLDivElement | null>(null);
const mobileBandOverlayRef = useRef<HTMLDivElement | null>(null);
const mobileBottomOverlayRef = useRef<HTMLDivElement | null>(null);
const mobileConcurrentRef = useRef<HTMLDivElement | null>(null);
const mobileMapHostRef = useRef<HTMLDivElement | null>(null);
const desktopMapHostRef = useRef<HTMLDivElement | null>(null);
const [mobileOverlayHeights, setMobileOverlayHeights] = useState({ top: 0, band: 0, sheet: 0 });
const [mobileConcurrentHeight, setMobileConcurrentHeight] = useState(0);

useEffect(() => {
  if (isLg || !mobilePlayerOpen) return;
  const prev = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") setMobilePlayerOpen(false);
  };
  window.addEventListener("keydown", onKey);
  return () => {
    document.body.style.overflow = prev;
    window.removeEventListener("keydown", onKey);
  };
}, [isLg, mobilePlayerOpen]);
const BRAND_BLUE = "#0f3c8c";

const toggleMapModeView = useCallback(() => {
  setMapMode((m) => (m === "normal" ? "fullscreen" : "normal"));
}, []);

useEffect(() => {
  setMapMode(isLg ? "normal" : "fullscreen");
}, [isLg]);

useEffect(() => {
  if (isLg) {
    setMobileOverlayHeights({ top: 0, band: 0, sheet: 0 });
    return;
  }

  const measure = () => {
    setMobileOverlayHeights({
      top: mobileTopOverlayRef.current?.getBoundingClientRect().height ?? 0,
      band: mobileBandOverlayRef.current?.getBoundingClientRect().height ?? 0,
      sheet: mobileBottomOverlayRef.current?.getBoundingClientRect().height ?? 0,
    });
    setMobileConcurrentHeight(
      mobileConcurrentRef.current?.getBoundingClientRect().height ?? 0
    );
  };

  measure();
  const ro = new ResizeObserver(() => measure());
  const nodes = [
    mobileTopOverlayRef.current,
    mobileBandOverlayRef.current,
    mobileBottomOverlayRef.current,
    mobileConcurrentRef.current,
  ].filter(Boolean) as Element[];
  nodes.forEach((node) => ro.observe(node));
  window.addEventListener("resize", measure);
  window.addEventListener("orientationchange", measure);
  document.addEventListener("fullscreenchange", measure);
  return () => {
    ro.disconnect();
    window.removeEventListener("resize", measure);
    window.removeEventListener("orientationchange", measure);
    document.removeEventListener("fullscreenchange", measure);
  };
}, [
  isLg,
  mobileJourneyDescOpen,
  mobileTopMediaOpen,
  mobileTopTabOpen,
  mobilePlayerOpen,
  mobileSheetSnap,
  mobileTab,
  rows.length,
]);

const [gid, setGid] = useState<string | null>(null);
const [eidParam, setEidParam] = useState<string | null>(null);
const group_event_id = gid;

const geUrl = useCallback(
   (targetGid: string, eid?: string | null) => {
     const base = `/module/group_event?gid=${targetGid}`;
     const extras: string[] = [];
     if (eid) extras.push(`eid=${eid}`);
     if (gid && gid !== targetGid) extras.push(`from=${gid}`);
     return extras.length ? `${base}&${extras.join("&")}` : base;
   },
   [gid]
 );

 const [err, setErr] = useState<string | null>(null);
 const [landingHref, setLandingHref] = useState<string | null>(null);

 useEffect(() => {
 const raw = sp.get("gid")?.trim ?? null;
 const value = typeof raw === "function" ? sp.get("gid")?.trim() : sp.get("gid");
 const input = (value ?? undefined) as string | undefined;
 const eidRaw = sp.get("eid")?.trim ?? null;
 const eidVal = typeof eidRaw === "function" ? sp.get("eid")?.trim() : sp.get("eid");
 setEidParam(eidVal || null);

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


// ===== TTS (OpenAI via /api/tts) =====
const [voice, setVoice] = useState<string>(() => {
  if (typeof window === "undefined") return "alloy";
  try {
    const stored = localStorage.getItem("geohistory_tts_voice") || "";
    return (TTS_VOICE_OPTIONS as readonly string[]).includes(stored) ? stored : "alloy";
  } catch {
    return "alloy";
  }
});
const [tone, setTone] = useState<TTSTone>(() => {
  if (typeof window === "undefined") return "neutral";
  try {
    const stored = localStorage.getItem("geohistory_tts_tone") || "";
    return (TTS_TONE_OPTIONS as readonly string[]).includes(stored) ? (stored as TTSTone) : "neutral";
  } catch {
    return "neutral";
  }
});

type PlaybackQueueItem = {
  kind: "intro" | "event";
  index?: number;
  text?: string;
  src?: string;
  start?: number;
  end?: number;
};

const audioRef = useRef<HTMLAudioElement | null>(null);
const abortRef = useRef<AbortController | null>(null);
const queueRef = useRef<PlaybackQueueItem[]>([]);
const autoAdvanceRef = useRef(false);
const currentQueuePosRef = useRef(0);
const playStartIndexRef = useRef<number | null>(null);
const audioUrlRef = useRef<string | null>(null);
const isPlayingRef = useRef(false);
const selectedIndexRef = useRef(0);
const ignoreNextSelectedIndexRef = useRef(false);
const ttsCacheRef = useRef<Map<string, ArrayBuffer>>(new Map());
const prefetchAbortRef = useRef<AbortController | null>(null);
const jingleTimerRef = useRef<number | null>(null);
const jinglePlayedRef = useRef(false);
const jingleAudioRef = useRef<HTMLAudioElement | null>(null);
const jingleSrcRef = useRef<string | null>(null);
const jinglePrimedRef = useRef(false);
const jinglePlayingRef = useRef(false);
const jingleCtxRef = useRef<AudioContext | null>(null);
const jingleGainRef = useRef<GainNode | null>(null);
const jingleIntervalRef = useRef<number | null>(null);
const playAfterSelectRef = useRef(false);
const ignoreNextSeekRef = useRef(false);
const playOnSelectRef = useRef(false);
const manualSeekUntilRef = useRef(0);
const introSkippedRef = useRef(false);
const manualSeekTargetRef = useRef<number | null>(null);
const manualSeekIndexRef = useRef<number | null>(null);
const MP3_SEEK_LEAD_SEC = 0;
const [audioSource, setAudioSource] = useState<string>("");
const [audioCurrentTime, setAudioCurrentTime] = useState(0);
const [audioDuration, setAudioDuration] = useState(0);
const [autoScrollActive, setAutoScrollActive] = useState(false);
const autoScrollTimerRef = useRef<number | null>(null);
const audioCacheBustRef = useRef<number>(Date.now());
const segmentGapTimerRef = useRef<number | null>(null);
const playSegmentRef = useRef<((pos: number) => Promise<void>) | null>(null);

useEffect(() => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("geohistory_tts_voice", voice);
    localStorage.setItem("geohistory_tts_tone", tone);
  } catch {}
}, [voice, tone]);

useEffect(() => {
  if (!journeyAudioTracks.length) return;
  if (audioSource) return;
  if (!audioPreferenceReady) return;
  const preferred = (preferredAudioLang || "").slice(0, 2).toLowerCase();
  const preferredIdx = journeyAudioTracks.findIndex((t) => (t.lang || "").toLowerCase() === preferred);
  const sameFamilyIdx =
    preferredIdx >= 0
      ? preferredIdx
      : journeyAudioTracks.findIndex((t) => (t.lang || "").toLowerCase().startsWith(preferred));
  const itIdx = journeyAudioTracks.findIndex((t) => t.lang === "it");
  const enIdx = journeyAudioTracks.findIndex((t) => t.lang === "en");
  const nextIdx = sameFamilyIdx >= 0 ? sameFamilyIdx : itIdx >= 0 ? itIdx : enIdx >= 0 ? enIdx : 0;
  setAudioSource(`mp3:${nextIdx}`);
}, [journeyAudioTracks, audioSource, preferredAudioLang, audioPreferenceReady]);

useEffect(() => {
  setAudioSource("");
}, [gid]);

useEffect(() => {
  isPlayingRef.current = isPlaying;
}, [isPlaying]);
useEffect(() => {
  selectedIndexRef.current = selectedIndex;
}, [selectedIndex]);

const enableTts = false;
const ttsLang = useMemo(() => {
  const v = (resolvedLang || desiredLang || "it").toString().slice(0, 2).toLowerCase();
  return v || "it";
}, [resolvedLang, desiredLang]);
const audioSourceOptions = useMemo(() => {
  return journeyAudioTracks.map((t, idx) => ({
    value: `mp3:${idx}`,
    label: t.label,
    url: t.url,
    lang: t.lang,
    timeline: t.timeline,
  }));
}, [journeyAudioTracks]);
const selectedAudioSource = audioSourceOptions.find((opt) => opt.value === audioSource) ?? audioSourceOptions[0];
const selectedAudioUrl = (selectedAudioSource as any)?.url as string | undefined;
const selectedAudioTimeline = (selectedAudioSource as any)?.timeline as any | undefined;
const selectedAudioCacheBuster = useMemo(() => {
  const raw = Number((selectedAudioTimeline as any)?.cacheBuster);
  return Number.isFinite(raw) && raw > 0 ? raw : audioCacheBustRef.current;
}, [selectedAudioTimeline]);
const appendCacheBuster = useCallback(
  (url?: string | null) => {
    if (!url) return "";
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}v=${selectedAudioCacheBuster}`;
  },
  [selectedAudioCacheBuster]
);
const selectedAudioSegments = useMemo(() => {
  const segments = selectedAudioTimeline?.segments as any[] | undefined;
  if (!Array.isArray(segments) || !segments.length) return [];
  return segments
    .map((seg) => ({
      kind: String(seg?.kind || ""),
      index: Number.isFinite(seg?.index) ? Number(seg.index) : undefined,
      eventId: seg?.eventId ? String(seg.eventId) : null,
      start: Number.isFinite(seg?.start) ? Number(seg.start) : 0,
      end: Number.isFinite(seg?.end) ? Number(seg.end) : 0,
      duration: Number.isFinite(seg?.duration) ? Number(seg.duration) : undefined,
      url: typeof seg?.url === "string" ? seg.url : "",
    }))
    .filter((seg) => !!seg.kind);
}, [selectedAudioTimeline]);
const rowIndexByEventId = useMemo(() => {
  const map = new Map<string, number>();
  rows.forEach((row, index) => {
    if (row?.id) {
      map.set(String(row.id), index);
    }
  });
  return map;
}, [rows]);
const resolveAudioSegmentForIndex = useCallback(
  (index: number) => {
    if (index < 0 || index >= rows.length) return null;
    const rowId = rows[index]?.id ? String(rows[index].id) : "";
    const byId = rowId
      ? selectedAudioSegments.find((seg) => seg.kind === "event_header" && seg.eventId === rowId)
      : null;
    if (byId) return byId;
    const byIndex = selectedAudioSegments.find((seg) => seg.kind === "event_header" && seg.index === index);
    return byIndex ?? null;
  },
  [rows, selectedAudioSegments]
);
const hasSegmentedMp3 = useMemo(() => {
  if (!selectedAudioSegments.length) return false;
  const introReady =
    !selectedAudioSegments.some((seg) => seg.kind === "intro") ||
    selectedAudioSegments.some((seg) => seg.kind === "intro" && !!seg.url);
  const eventReady = rows.some((_, index) => !!resolveAudioSegmentForIndex(index)?.url);
  return introReady && eventReady;
}, [selectedAudioSegments, rows, resolveAudioSegmentForIndex]);

const audioEventStarts = useMemo(() => {
  const map = new Map<string, number>();
  const segments = selectedAudioTimeline?.segments as any[] | undefined;
  if (Array.isArray(segments)) {
    segments.forEach((seg) => {
      if (seg?.eventId && String(seg.kind || "") === "event_header" && Number.isFinite(seg.start)) {
        const key = String(seg.eventId);
        if (!map.has(key)) {
          map.set(key, Math.max(0, Number(seg.start)));
        }
      }
    });
  }
  return map;
}, [selectedAudioTimeline]);

const audioEventBoundaries = useMemo(() => {
  const segments = selectedAudioTimeline?.segments as any[] | undefined;
  if (!Array.isArray(segments) || !segments.length) return [];
  return segments
    .filter((seg) => String(seg?.kind || "") === "event_header" && Number.isFinite(seg?.start))
    .map((seg) => {
      const eventId = seg?.eventId ? String(seg.eventId) : null;
      const resolvedIndex =
        eventId && rowIndexByEventId.has(eventId)
          ? rowIndexByEventId.get(eventId)
          : Number(seg?.index);
      return {
        index: Number(resolvedIndex),
        eventId,
        start: Number(seg.start),
      };
    })
    .filter((seg) => Number.isInteger(seg.index) && seg.index >= 0)
    .sort((a, b) => a.start - b.start);
}, [selectedAudioTimeline, rowIndexByEventId]);

const firstEventStart = useMemo(() => {
  const segments = selectedAudioTimeline?.segments as any[] | undefined;
  if (!Array.isArray(segments)) return null;
  const header = segments.find((seg) => String(seg?.kind || "") === "event_header" && Number.isFinite(seg.start));
  return header ? Math.max(0, Number(header.start)) : null;
}, [selectedAudioTimeline]);
const hasMp3Audio = journeyAudioTracks.length > 0;
const isMp3Mode = hasMp3Audio && !!selectedAudioUrl;
const selectedAudioLang =
  (selectedAudioSource as any)?.lang ||
  (selectedAudioUrl && /\b_en\b|_en(\.|\/|$)/i.test(selectedAudioUrl) ? "en" : selectedAudioUrl && /\b_it\b|_it(\.|\/|$)/i.test(selectedAudioUrl) ? "it" : null) ||
  ttsLang;
const loadingClipSrc = useMemo(
  () => (ttsLang.startsWith("it") ? "/audio/IT_audio.m4a" : "/audio/EN_audio.m4a"),
  [ttsLang]
);
const journeyTitleForSpeech = useMemo(
  () => (journeyTitle ?? geTr?.title ?? ge?.title ?? "Journey").toString(),
  [journeyTitle, geTr, ge]
);
const hasIntroSegment = useMemo(() => {
  const title = (journeyTitleForSpeech || "").trim();
  const desc = (journeyDescription || "").trim();
  return !!(title || desc);
}, [journeyTitleForSpeech, journeyDescription]);
const isIntroPlaybackActive = useMemo(() => {
  if (!isMp3Mode || !hasIntroSegment) return false;
  const current = Number.isFinite(audioCurrentTime) ? audioCurrentTime : 0;
  if (firstEventStart == null) {
    return current <= 0.25;
  }
  return current < Math.max(0, firstEventStart - 0.2);
}, [isMp3Mode, hasIntroSegment, audioCurrentTime, firstEventStart]);
const activeEventIndex = selectedIndex;

const audioTimeline = useMemo(() => {
  const overrideSegments = selectedAudioTimeline?.segments;
  if (Array.isArray(overrideSegments) && overrideSegments.length) {
    const cumulative = overrideSegments.map((s: any) => Number(s?.end) || 0);
    return {
      cumulative,
      hasIntro: !!selectedAudioTimeline?.hasIntro,
      segments: overrideSegments,
      total: Number(selectedAudioTimeline?.total) || (cumulative.length ? cumulative[cumulative.length - 1] : 0),
    };
  }
  if (!audioDuration || !rows.length) return null;
  const lang = (selectedAudioLang || "it").toString();
  const segments: string[] = [];
  if (hasIntroSegment) {
    segments.push(buildIntroText(lang, journeyDescription, journeyTitleForSpeech));
  }
  rows.forEach((ev) => {
    segments.push(buildEventSpeechText(ev, lang));
  });
  if (!segments.length) return null;
  const weights = segments.map((s) => Math.max(80, (s || "").length));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const cumulative: number[] = [];
  let acc = 0;
  weights.forEach((w) => {
    acc += (w / total) * audioDuration;
    cumulative.push(acc);
  });
  return { cumulative, hasIntro: hasIntroSegment, total: audioDuration };
}, [
  audioDuration,
  rows,
  hasIntroSegment,
  journeyDescription,
  journeyTitleForSpeech,
  selectedAudioLang,
  selectedAudioTimeline,
]);

function formatExactDateForSpeech(value?: string | null, lang?: string) {
  if (!value) return "";
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    const locale = (lang || "it").startsWith("it") ? "it-IT" : "en-US";
    return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric" }).format(d);
  } catch {
    return value || "";
  }
}

function buildIntroText(lang: string, description: string, title: string) {
  const desc = (description || "").trim();
  const safeTitle = (title || "").trim() || (lang.startsWith("it") ? "questo viaggio" : "this journey");
  if (lang.startsWith("it")) {
    return desc ? `${safeTitle}. ${desc}` : `${safeTitle}.`;
  }
  return desc ? `${safeTitle}. ${desc}` : `${safeTitle}.`;
}

function buildStandaloneEventLead(ev: EventVM, lang: string) {
  const isIt = lang.startsWith("it");
  const place = ev.location ? ev.location : "";
  const placeChunk = place ? (isIt ? `, a ${place}` : `, in ${place}`) : "";
  if (ev.exact_date) {
    const dateText = formatExactDateForSpeech(ev.exact_date, lang);
    return isIt ? `Il ${dateText}${placeChunk}.` : `On ${dateText}${placeChunk}.`;
  }
  const period = formatSpeechPeriod(ev, lang);
  const timeChunk = isIt ? `${period}${placeChunk}.` : `${period}${placeChunk}.`;
  return timeChunk;
}

const formatClockTime = (seconds?: number | null) => {
  const s = Math.max(0, Math.floor(seconds ?? 0));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

const estimateSpeechSeconds = (text: string) => {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const secs = Math.round(words * 0.42);
  return Math.max(5, secs || 5);
};

function formatSpeechPeriod(ev: EventVM, lang: string) {
  const isIt = lang.startsWith("it");
  const from = typeof ev.year_from === "number" ? Math.abs(ev.year_from) : null;
  const to = typeof ev.year_to === "number" ? Math.abs(ev.year_to) : null;
  const era = normEra(ev.era);
  const bcSuffix = isIt ? "avanti Cristo" : "before Christ";

  if (from != null && to != null) {
    if (from === to) {
      if (era === "BC") return isIt ? `${from} ${bcSuffix}` : `${from} ${bcSuffix}`;
      return `${from}`;
    }
    if (era === "BC") {
      return isIt ? `tra il ${from} e il ${to} ${bcSuffix}` : `between ${from} and ${to} ${bcSuffix}`;
    }
    return isIt ? `tra il ${from} e il ${to}` : `between ${from} and ${to}`;
  }

  const single = from ?? to ?? parseExactDateYear(ev.exact_date);
  if (single != null) {
    if (era === "BC") return isIt ? `${single} ${bcSuffix}` : `${single} ${bcSuffix}`;
    return `${single}`;
  }

  return isIt ? "un periodo non precisato" : "an unspecified period";
}

function buildEventSpeechText(ev: EventVM, lang: string) {
  const isIt = lang.startsWith("it");
  const title = ev.title || (isIt ? "Evento" : "Event");
  const description = (ev.description || "").trim();
  const base = `${title}. ${buildStandaloneEventLead(ev, lang)}`;
  return description ? `${base} ${description}` : base;
}

const buildQueueFrom = useCallback(
  (startIndex: number, includeIntro: boolean) => {
    const items: PlaybackQueueItem[] = [];
    if (includeIntro) {
      items.push({ kind: "intro", text: buildIntroText(ttsLang, journeyDescription, journeyTitleForSpeech) });
    }
    for (let i = startIndex; i < rows.length; i += 1) {
      const ev = rows[i];
      items.push({ kind: "event", index: i, text: buildEventSpeechText(ev, ttsLang) });
    }
    return items;
  },
  [rows, journeyDescription, ttsLang, journeyTitleForSpeech]
);

const buildMp3QueueFrom = useCallback(
  (startIndex: number, includeIntro: boolean) => {
    const items: PlaybackQueueItem[] = [];
    if (!selectedAudioSegments.length) return items;
    if (includeIntro) {
      const intro = selectedAudioSegments.find((seg) => seg.kind === "intro" && seg.url);
      if (intro?.url) {
        items.push({ kind: "intro", src: intro.url, start: intro.start, end: intro.end });
      }
    }
    for (let i = startIndex; i < rows.length; i += 1) {
      const eventSegment = resolveAudioSegmentForIndex(i);
      if (eventSegment?.url) {
        items.push({
          kind: "event",
          index: i,
          src: eventSegment.url,
          start: eventSegment.start,
          end: eventSegment.end,
        });
      }
    }
    return items;
  },
  [rows, selectedAudioSegments, resolveAudioSegmentForIndex]
);

const buildTtsCacheKey = useCallback(
  (text: string) => `${ttsLang}|${voice}|${tone}|${text}`,
  [ttsLang, voice, tone]
);

const abortCurrentAudio = useCallback(() => {
  abortRef.current?.abort();
  abortRef.current = null;
  if (segmentGapTimerRef.current != null) {
    window.clearTimeout(segmentGapTimerRef.current);
    segmentGapTimerRef.current = null;
  }
  const audio = audioRef.current;
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
    audio.playbackRate = 1;
    audio.defaultPlaybackRate = 1;
  }
  if (audioUrlRef.current) {
    URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
  }
}, []);

const stopJingle = useCallback(() => {
  if (jingleTimerRef.current != null) {
    window.clearTimeout(jingleTimerRef.current);
    jingleTimerRef.current = null;
  }
  if (jingleIntervalRef.current != null) {
    window.clearInterval(jingleIntervalRef.current);
    jingleIntervalRef.current = null;
  }
  if (jingleGainRef.current) {
    try { jingleGainRef.current.gain.value = 0; } catch {}
  }
  jinglePlayedRef.current = false;
  jinglePrimedRef.current = false;
  jinglePlayingRef.current = false;
  const audio = jingleAudioRef.current;
  if (audio) {
    audio.loop = false;
    audio.pause();
    audio.currentTime = 0;
    audio.muted = true;
  }
}, []);

const fadeOutJingle = useCallback((durationMs = 400) => {
  const audio = jingleAudioRef.current;
  if (!audio) return;
  const startVol = audio.volume ?? 1;
  const steps = 6;
  const stepMs = Math.max(30, Math.floor(durationMs / steps));
  let i = 0;
  if (jingleTimerRef.current != null) {
    window.clearTimeout(jingleTimerRef.current);
    jingleTimerRef.current = null;
  }
  const tick = () => {
    i += 1;
    const next = startVol * (1 - i / steps);
    audio.volume = Math.max(0, next);
    if (i >= steps) {
      stopJingle();
      return;
    }
    jingleTimerRef.current = window.setTimeout(tick, stepMs);
  };
  tick();
}, [stopJingle]);

const stopAllPlayback = useCallback(() => {
  abortCurrentAudio();
  queueRef.current = [];
  currentQueuePosRef.current = 0;
  playStartIndexRef.current = null;
  setIsBuffering(false);
  stopJingle();
}, [abortCurrentAudio, stopJingle]);

useEffect(() => {
  if (!isMp3Mode) return;
  const audio = audioRef.current;
  if (!audio) return;
  stopAllPlayback();
  audio.playbackRate = 1;
  audio.defaultPlaybackRate = 1;
  audio.pause();
  audio.currentTime = 0;
  setAudioCurrentTime(0);
  setAudioDuration(0);
  introSkippedRef.current = false;
  if (selectedAudioUrl && !hasSegmentedMp3) {
    audio.src = appendCacheBuster(selectedAudioUrl);
  }
  setIsPlaying(false);
  setAutoScrollActive(false);
  if (playAfterSelectRef.current && selectedAudioUrl) {
    playAfterSelectRef.current = false;
    if (hasSegmentedMp3) {
      const queue = buildMp3QueueFrom(selectedIndexRef.current, false);
      if (queue.length) {
        queueRef.current = queue;
        currentQueuePosRef.current = 0;
        isPlayingRef.current = true;
        setIsPlaying(true);
        window.setTimeout(() => {
          void playSegmentRef.current?.(0);
        }, 0);
      }
    } else {
      window.setTimeout(() => {
        audio.currentTime = 0;
        isPlayingRef.current = true;
        void audio.play().then(() => setIsPlaying(true)).catch(() => {
          isPlayingRef.current = false;
        });
      }, 0);
    }
  }
}, [audioSource, selectedAudioUrl, isMp3Mode, stopAllPlayback, hasSegmentedMp3, appendCacheBuster, buildMp3QueueFrom]);

useEffect(() => {
  if (!hasIntroSegment || firstEventStart == null) return;
  if ((audioCurrentTime || 0) >= Math.max(0, firstEventStart - 0.2)) {
    introSkippedRef.current = true;
  }
}, [audioCurrentTime, firstEventStart, hasIntroSegment]);

useEffect(() => {
  if (!selectedAudioUrl) return;
  if (selectedAudioTimeline && Array.isArray(selectedAudioTimeline?.segments)) return;
  const storage = parseStorageFromUrl(selectedAudioUrl);
  if (!storage) return;

  (async () => {
    const { data, error } = await supabase
      .from("media_assets")
      .select("id,storage_bucket,storage_path,metadata")
      .eq("storage_bucket", storage.bucket)
      .eq("storage_path", storage.path)
      .maybeSingle();
    if (error || !data) return;
    const timeline = (data as any)?.metadata?.audio_timeline ?? null;
    if (!timeline) return;
    setJourneyAudioTracks((prev) =>
      prev.map((track) =>
        track.url === selectedAudioUrl ? { ...track, timeline } : track
      ),
    );
  })();
}, [selectedAudioUrl, selectedAudioTimeline, supabase]);

useEffect(() => {
  const missing = journeyAudioTracks.filter((t) => t.url && !t.timeline);
  if (!missing.length) return;
  (async () => {
    const updates = new Map<string, any>();
    for (const track of missing) {
      const storage = parseStorageFromUrl(track.url);
      if (!storage) continue;
      const { data } = await supabase
        .from("media_assets")
        .select("metadata")
        .eq("storage_bucket", storage.bucket)
        .eq("storage_path", storage.path)
        .maybeSingle();
      const timeline = (data as any)?.metadata?.audio_timeline ?? null;
      if (timeline) {
        updates.set(track.url, timeline);
      }
    }
    if (updates.size) {
      setJourneyAudioTracks((prev) =>
        prev.map((track) =>
          updates.has(track.url) ? { ...track, timeline: updates.get(track.url) } : track,
        ),
      );
    }
  })();
}, [journeyAudioTracks, supabase]);

useEffect(() => {
  if (!autoScrollActive) {
    if (autoScrollTimerRef.current) {
      window.clearTimeout(autoScrollTimerRef.current);
      autoScrollTimerRef.current = null;
    }
    return;
  }
  if (!rows.length) return;
  const lang = (selectedAudioLang || ttsLang || "it").toString();
  const ev = rows[selectedIndex];
  if (!ev) return;
  const text = buildEventSpeechText(ev, lang);
  const waitMs = estimateSpeechSeconds(text) * 1000;
  if (autoScrollTimerRef.current) {
    window.clearTimeout(autoScrollTimerRef.current);
  }
  autoScrollTimerRef.current = window.setTimeout(() => {
    setSelectedIndex((i) => (rows.length ? (i + 1) % rows.length : 0));
  }, waitMs);
  return () => {
    if (autoScrollTimerRef.current) {
      window.clearTimeout(autoScrollTimerRef.current);
      autoScrollTimerRef.current = null;
    }
  };
}, [autoScrollActive, rows, selectedIndex, selectedAudioLang, ttsLang]);

useEffect(() => {
  if (!isPlaying) {
    setAutoScrollActive(false);
  }
}, [isPlaying]);

useEffect(() => {
  if (!isMp3Mode) return;
  if (hasSegmentedMp3) return;
  if (!audioTimeline?.cumulative?.length) return;
  const segmentsMeta = (audioTimeline as any)?.segments as any[] | undefined;
  if (ignoreNextSeekRef.current) {
    ignoreNextSeekRef.current = false;
    return;
  }
  const audio = audioRef.current;
  if (!audio) return;
  let target = 0;
  if (segmentsMeta && segmentsMeta.length) {
    const match = segmentsMeta.find((s) => s?.kind === "event_header" && Number(s?.index) === selectedIndex);
    if (match && Number.isFinite(match.start)) {
      target = Math.max(0, Number(match.start) - MP3_SEEK_LEAD_SEC);
    }
  } else {
    const segIndex = selectedIndex + (audioTimeline?.hasIntro ? 1 : 0);
    const prevTime = segIndex > 0 ? audioTimeline.cumulative[segIndex - 1] : 0;
    target = Number.isFinite(prevTime) ? Math.max(0, prevTime - MP3_SEEK_LEAD_SEC) : 0;
  }
  if (Number.isFinite(target) && Math.abs((audio.currentTime || 0) - target) > 0.25) {
    const wasPlaying = isPlayingRef.current;
    audio.pause();
    audio.currentTime = target;
    setAudioCurrentTime(target);
    if (wasPlaying) {
      void audio.play().catch(() => {});
    }
  }
}, [selectedIndex, isMp3Mode, audioTimeline, hasSegmentedMp3]);

useEffect(() => () => stopAllPlayback(), [stopAllPlayback]);

const syncSelectedIndexFromTime = useCallback(
  (time: number, duration: number) => {
    if (hasSegmentedMp3) return;
    if (!rows.length || !duration || duration <= 0) return;
    if (Date.now() < manualSeekUntilRef.current) return;
    if (manualSeekTargetRef.current != null) {
      const target = manualSeekTargetRef.current;
      if (time < Math.max(0, target - 0.25)) {
        return;
      }
      manualSeekTargetRef.current = null;
      manualSeekIndexRef.current = null;
    }
    const timeline = audioTimeline?.cumulative;
    if (timeline && timeline.length) {
      const segIndex = timeline.findIndex((t) => time <= t);
      const safeSegIndex = segIndex === -1 ? timeline.length - 1 : segIndex;
      if (audioEventBoundaries.length) {
        let resolvedIndex = audioEventBoundaries[0]?.index ?? 0;
        for (let i = 0; i < audioEventBoundaries.length; i += 1) {
          const currentBoundary = audioEventBoundaries[i];
          const nextBoundary = audioEventBoundaries[i + 1];
          const start = currentBoundary.start;
          const end = nextBoundary?.start ?? Number.POSITIVE_INFINITY;
          if (time >= start && time < end) {
            resolvedIndex = currentBoundary.index;
            break;
          }
          if (time >= start) {
            resolvedIndex = currentBoundary.index;
          }
        }
        if (resolvedIndex !== selectedIndexRef.current) {
          ignoreNextSeekRef.current = true;
          autoAdvanceRef.current = true;
          setSelectedIndex(resolvedIndex);
          setTimeout(() => { autoAdvanceRef.current = false; }, 0);
        }
        return;
      }
    let idx = safeSegIndex;
    let eventIndex = idx - (audioTimeline?.hasIntro ? 1 : 0);
    if (eventIndex < 0) eventIndex = 0;
    if (eventIndex >= rows.length) eventIndex = rows.length - 1;
    if (eventIndex !== selectedIndexRef.current) {
      ignoreNextSeekRef.current = true;
      autoAdvanceRef.current = true;
      setSelectedIndex(eventIndex);
      setTimeout(() => { autoAdvanceRef.current = false; }, 0);
    }
    return;
  }
    const segments = rows.length + (hasIntroSegment ? 1 : 0);
    if (segments <= 0) return;
    const segLen = duration / segments;
    if (!segLen || !Number.isFinite(segLen)) return;
    let segIndex = Math.floor(time / segLen);
    if (segIndex < 0) segIndex = 0;
    if (segIndex >= segments) segIndex = segments - 1;
    let eventIndex = segIndex - (hasIntroSegment ? 1 : 0);
    if (eventIndex < 0) eventIndex = 0;
    if (eventIndex >= rows.length) eventIndex = rows.length - 1;
    if (eventIndex !== selectedIndexRef.current) {
      ignoreNextSeekRef.current = true;
      autoAdvanceRef.current = true;
      setSelectedIndex(eventIndex);
      setTimeout(() => { autoAdvanceRef.current = false; }, 0);
    }
  },
  [rows.length, hasIntroSegment, audioTimeline, audioEventBoundaries, hasSegmentedMp3],
);

const ensureJingleContext = useCallback(() => {
  if (jingleCtxRef.current) return jingleCtxRef.current;
  const Ctx = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctx) return null;
  const ctx = new Ctx();
  jingleCtxRef.current = ctx;
  const gain = ctx.createGain();
  gain.gain.value = 0.15;
  gain.connect(ctx.destination);
  jingleGainRef.current = gain;
  return ctx;
}, []);

const startWebAudioJingle = useCallback(() => {
  if (jingleIntervalRef.current != null) return;
  const ctx = ensureJingleContext();
  if (!ctx || !jingleGainRef.current) return;
  void ctx.resume().catch(() => {});
  const playNote = (freq: number, startAt: number, duration = 0.12, type: OscillatorType = "sine") => {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    osc.connect(jingleGainRef.current as GainNode);
    osc.start(startAt);
    osc.stop(startAt + duration);
  };
  const tick = () => {
    const now = ctx.currentTime;
    // Soft "loading" pulse: two low blips
    playNote(280, now + 0.00, 0.12);
    playNote(360, now + 0.18, 0.10);
  };
  tick();
  jingleIntervalRef.current = window.setInterval(tick, 900);
}, [ensureJingleContext]);

const startJingleLoop = useCallback(() => {
  const audio = jingleAudioRef.current;
  if (!audio) return;
  audio.src = loadingClipSrc;
  audio.currentTime = 0;
  audio.volume = 1.0;
  audio.muted = false;
  audio.loop = true;
  jinglePlayingRef.current = true;
  void audio.play().catch(() => {
    jinglePlayingRef.current = false;
  });
}, [loadingClipSrc]);

const primeJingleOnPlay = useCallback(() => {
  const ctx = ensureJingleContext();
  if (ctx) void ctx.resume().catch(() => {});
  const audio = jingleAudioRef.current;
  if (!audio || jinglePrimedRef.current) return;
  audio.src = loadingClipSrc;
  audio.muted = true;
  audio.volume = 0.0;
  audio.currentTime = 0;
  void audio.play().then(() => {
    jinglePrimedRef.current = true;
    audio.pause();
    audio.currentTime = 0;
  }).catch(() => {});
}, [ensureJingleContext, loadingClipSrc]);

useEffect(() => {
  if (!isBuffering) return;
  if (jinglePlayingRef.current) return;
  startJingleLoop();
}, [isBuffering, startJingleLoop, stopJingle]);

const playSegment = useCallback(
  async (pos: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const item = queueRef.current[pos];
    if (!item) {
      setIsPlaying(false);
      return;
    }
    abortCurrentAudio();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      if (item.src) {
        setIsBuffering(false);
        audio.src = appendCacheBuster(item.src);
        audio.currentTime = 0;
        audio.load();
        await audio.play();
        fadeOutJingle(450);
        return;
      }
      const text = item.text || "";
      const cacheKey = buildTtsCacheKey(text);
      let buf = ttsCacheRef.current.get(cacheKey);
      if (!buf) {
        setIsBuffering(true);
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, lang: ttsLang, voice, tone }),
          signal: controller.signal,
        });
        if (!res.ok) {
        throw new Error(`TTS ${res.status}`);
      }
        buf = await res.arrayBuffer();
        ttsCacheRef.current.set(cacheKey, buf);
      }
      setIsBuffering(false);
      const blob = new Blob([buf], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = url;
      audio.src = url;
      audio.currentTime = 0;
      audio.load();
      await audio.play();
      fadeOutJingle(450);
    } catch (err: any) {
      if (controller.signal.aborted) return;
      console.error("[GE] TTS error:", err?.message || err);
      setIsBuffering(false);
      setIsPlaying(false);
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  },
  [abortCurrentAudio, ttsLang, voice, tone, appendCacheBuster]
);

useEffect(() => {
  playSegmentRef.current = playSegment;
}, [playSegment]);

const handleAudioEnded = useCallback(() => {
  const pos = currentQueuePosRef.current;
  const item = queueRef.current[pos];
  if (item?.kind === "event" && typeof item.index === "number") {
    const nextIndex = item.index + 1;
    if (nextIndex < rows.length) {
      autoAdvanceRef.current = true;
      setSelectedIndex(nextIndex);
      setTimeout(() => { autoAdvanceRef.current = false; }, 0);
    }
  }
  const nextPos = pos + 1;
  if (nextPos < queueRef.current.length) {
    if (segmentGapTimerRef.current != null) {
      window.clearTimeout(segmentGapTimerRef.current);
      segmentGapTimerRef.current = null;
    }
    const gapMs = hasSegmentedMp3 ? 1000 : 0;
    segmentGapTimerRef.current = window.setTimeout(() => {
      segmentGapTimerRef.current = null;
      currentQueuePosRef.current = nextPos;
      if (isPlayingRef.current) {
        void playSegment(nextPos);
      }
    }, gapMs);
  } else {
    setIsPlaying(false);
  }
}, [rows.length, playSegment, hasSegmentedMp3]);

useEffect(() => {
  const audio = audioRef.current;
  if (!audio) return;
  const onEnded = () => {
    if (isMp3Mode && !hasSegmentedMp3) {
      setIsPlaying(false);
      return;
    }
    handleAudioEnded();
  };
  const onError = () => {
    console.warn("[GE] Audio element error");
    setIsPlaying(false);
  };
  const onLoaded = () => {
    if (!isMp3Mode) return;
    const dur = hasSegmentedMp3
      ? Number(audioTimeline?.total) || 0
      : Number.isFinite(audio.duration) ? audio.duration : 0;
    setAudioDuration(dur);
  };
  const onTime = () => {
    if (!isMp3Mode) return;
    const localTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    const currentItem = queueRef.current[currentQueuePosRef.current];
    const t = hasSegmentedMp3 ? Math.max(0, Number(currentItem?.start || 0) + localTime) : localTime;
    setAudioCurrentTime(t);
    const dur = hasSegmentedMp3
      ? Number(audioTimeline?.total) || audioDuration
      : Number.isFinite(audio.duration) ? audio.duration : audioDuration;
    if (dur) {
      setAudioDuration(dur);
      syncSelectedIndexFromTime(t, dur);
    }
  };
  const onPlay = () => {
    if (isMp3Mode) setIsPlaying(true);
  };
  const onPause = () => {
    if (isMp3Mode) setIsPlaying(false);
  };
  audio.addEventListener("ended", onEnded);
  audio.addEventListener("error", onError);
  audio.addEventListener("loadedmetadata", onLoaded);
  audio.addEventListener("timeupdate", onTime);
  audio.addEventListener("play", onPlay);
  audio.addEventListener("pause", onPause);
  return () => {
    audio.removeEventListener("ended", onEnded);
    audio.removeEventListener("error", onError);
    audio.removeEventListener("loadedmetadata", onLoaded);
    audio.removeEventListener("timeupdate", onTime);
    audio.removeEventListener("play", onPlay);
    audio.removeEventListener("pause", onPause);
  };
}, [handleAudioEnded, isMp3Mode, audioDuration, syncSelectedIndexFromTime, hasSegmentedMp3, audioTimeline]);

useEffect(() => {
  if (!enableTts) return;
  if (isMp3Mode || hasMp3Audio) return;
  if (!isPlaying) {
    stopAllPlayback();
    return;
  }
  if (!rows.length) return;
  if (playStartIndexRef.current == null) {
    playStartIndexRef.current = selectedIndexRef.current;
  }
  const startIndex = Math.max(0, Math.min(playStartIndexRef.current ?? 0, rows.length - 1));
  const includeIntro = startIndex === 0;
  queueRef.current = buildQueueFrom(startIndex, includeIntro);
  currentQueuePosRef.current = 0;
  playSegment(0);
}, [isPlaying, rows.length, buildQueueFrom, playSegment, stopAllPlayback, isMp3Mode, hasMp3Audio, enableTts]);

useEffect(() => {
  if (!enableTts) return;
  if (isMp3Mode || hasMp3Audio) return;
  if (!isPlaying) return;
  if (ignoreNextSelectedIndexRef.current) {
    ignoreNextSelectedIndexRef.current = false;
    return;
  }
  if (autoAdvanceRef.current) return;
  if (!rows.length) return;
  playStartIndexRef.current = selectedIndex;
  queueRef.current = buildQueueFrom(selectedIndex, false);
  currentQueuePosRef.current = 0;
  playSegment(0);
}, [selectedIndex, isPlaying, rows.length, buildQueueFrom, playSegment, isMp3Mode, hasMp3Audio, enableTts]);

const togglePlay = useCallback(() => {
  if (hasMp3Audio) {
    const audio = audioRef.current;
    if (!audio) return;
    if (!selectedAudioUrl && audioSourceOptions.length) {
      playAfterSelectRef.current = true;
      setAudioSource(audioSourceOptions[0].value);
      return;
    }
    if (!isPlayingRef.current) {
      if (hasSegmentedMp3) {
        const shouldRestartIntro =
          hasIntroSegment &&
          rows.length > 0 &&
          (audioCurrentTime || 0) <= 0.01 &&
          !introSkippedRef.current;
        const queue = shouldRestartIntro ? buildMp3QueueFrom(0, true) : buildMp3QueueFrom(selectedIndex, false);
        if (!queue.length) return;
        queueRef.current = queue;
        currentQueuePosRef.current = 0;
        if (shouldRestartIntro) {
          ignoreNextSeekRef.current = true;
          introSkippedRef.current = false;
          setSelectedIndex(0);
          setAudioCurrentTime(0);
        }
        isPlayingRef.current = true;
        setIsPlaying(true);
        void playSegment(0);
        return;
      }
      const resumeTime = Number.isFinite(audio.currentTime) ? audio.currentTime : audioCurrentTime || 0;
      const shouldRestartIntro =
        hasIntroSegment &&
        rows.length > 0 &&
        (audioCurrentTime || 0) <= 0.01 &&
        (resumeTime || 0) <= 0.01;
      if (shouldRestartIntro) {
        ignoreNextSeekRef.current = true;
        introSkippedRef.current = false;
        setSelectedIndex(0);
        audio.currentTime = 0;
        setAudioCurrentTime(0);
      }
      const nextAudioUrl = appendCacheBuster(selectedAudioUrl);
      if (selectedAudioUrl && audio.src !== nextAudioUrl) {
        audio.src = nextAudioUrl;
      }
      if (!shouldRestartIntro) {
        audio.currentTime = resumeTime || 0;
      }
      isPlayingRef.current = true;
      void audio.play().catch(() => {
        isPlayingRef.current = false;
      });
      setIsPlaying(true);
    } else {
      isPlayingRef.current = false;
      audio.pause();
      setIsPlaying(false);
    }
    return;
  }
  setAutoScrollActive((prev) => !prev);
  setIsPlaying((prev) => !prev);
}, [hasMp3Audio, selectedAudioUrl, audioCurrentTime, audioSourceOptions.length, audioSource, hasIntroSegment, rows.length, hasSegmentedMp3, buildMp3QueueFrom, selectedIndex, playSegment, appendCacheBuster]);

const prefetchFirstSegment = useCallback(
  async (index: number) => {
    if (!rows.length) return;
    const ev = rows[index];
    if (!ev) return;
    const text = buildEventSpeechText(ev, ttsLang);
    const cacheKey = buildTtsCacheKey(text);
    if (ttsCacheRef.current.has(cacheKey)) return;
    prefetchAbortRef.current?.abort();
    const controller = new AbortController();
    prefetchAbortRef.current = controller;
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, lang: ttsLang, voice, tone }),
        signal: controller.signal,
      });
      if (!res.ok) return;
      const buf = await res.arrayBuffer();
      if (!controller.signal.aborted) {
        ttsCacheRef.current.set(cacheKey, buf);
      }
    } catch {}
  },
  [rows, ttsLang, voice, tone, buildTtsCacheKey]
);

useEffect(() => {
  if (!enableTts) return;
  if (isMp3Mode || hasMp3Audio) return;
  if (!rows.length) return;
  if (isPlayingRef.current) return;
  prefetchFirstSegment(selectedIndex);
}, [rows.length, selectedIndex, prefetchFirstSegment, isMp3Mode, hasMp3Audio, enableTts]);

useEffect(() => {
  if (!enableTts) return;
  if (isMp3Mode || hasMp3Audio) return;
  if (!rows.length) return;
  if (isPlayingRef.current) return;
  prefetchFirstSegment(0);
}, [rows.length, prefetchFirstSegment, isMp3Mode, hasMp3Audio, enableTts]);

const prefetchIntroSegment = useCallback(async () => {
  if (!journeyDescription && !journeyTitleForSpeech) return;
  const text = buildIntroText(ttsLang, journeyDescription, journeyTitleForSpeech);
  const cacheKey = buildTtsCacheKey(text);
  if (ttsCacheRef.current.has(cacheKey)) return;
  prefetchAbortRef.current?.abort();
  const controller = new AbortController();
  prefetchAbortRef.current = controller;
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, lang: ttsLang, voice, tone }),
      signal: controller.signal,
    });
    if (!res.ok) return;
    const buf = await res.arrayBuffer();
    if (!controller.signal.aborted) {
      ttsCacheRef.current.set(cacheKey, buf);
    }
  } catch {}
}, [journeyDescription, journeyTitleForSpeech, ttsLang, voice, tone, buildTtsCacheKey]);

useEffect(() => {
  if (!enableTts) return;
  if (isMp3Mode || hasMp3Audio) return;
  if (isPlayingRef.current) return;
  if (selectedIndex !== 0) return;
  prefetchIntroSegment();
}, [selectedIndex, prefetchIntroSegment, isMp3Mode, hasMp3Audio, enableTts]);

const renderVoiceToneControls = useCallback(
  (opts?: { compact?: boolean }) => (
    <div className={`flex items-center gap-1 ${opts?.compact ? "" : ""}`}>
      <select
        value={voice}
        onChange={(e) => setVoice(e.target.value)}
        className="min-w-[84px] max-w-[140px] truncate rounded-md border border-slate-200 bg-white px-1 py-0.5 text-[10px] text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        aria-label="Voice"
      >
        {TTS_VOICE_OPTIONS.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
      <select
        value={tone}
        onChange={(e) => setTone(e.target.value as TTSTone)}
        className="min-w-[84px] max-w-[140px] truncate rounded-md border border-slate-200 bg-white px-1 py-0.5 text-[10px] text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        aria-label="Tone"
      >
        {TTS_TONE_OPTIONS.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </div>
  ),
  [voice, tone]
);

const renderAudioMeta = useCallback(() => {
  const timeLabel = `${formatClockTime(audioCurrentTime)} / ${audioDuration ? formatClockTime(audioDuration) : "--:--"}`;
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
      {timeLabel ? <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold">{timeLabel}</span> : null}
      {debugPlayer ? (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-900">
          idx:{selectedIndex} t:{audioCurrentTime.toFixed(1)} first:{firstEventStart ?? "-"}
        </span>
      ) : null}
    </div>
  );
}, [audioCurrentTime, audioDuration, debugPlayer, firstEventStart, selectedIndex]);

const handleMobilePlayerSeek = useCallback((nextValue: number) => {
  const audio = audioRef.current;
  if (!audio) return;
  const target = Math.max(0, Math.min(nextValue, audioDuration || nextValue));
  try {
    audio.currentTime = target;
    setAudioCurrentTime(target);
  } catch {}
}, [audioDuration]);

const seekToIntro = useCallback(
  (opts?: { autoplay?: boolean }) => {
    if (!isMp3Mode) return;
    if (hasSegmentedMp3) {
      const queue = buildMp3QueueFrom(0, true);
      if (!queue.length) return;
      manualSeekUntilRef.current = Date.now() + 1500;
      manualSeekTargetRef.current = 0;
      manualSeekIndexRef.current = -1;
      ignoreNextSeekRef.current = true;
      introSkippedRef.current = false;
      queueRef.current = queue;
      currentQueuePosRef.current = 0;
      setAudioCurrentTime(0);
      if (selectedIndexRef.current !== 0) {
        selectedIndexRef.current = 0;
        setSelectedIndex(0);
      }
      if (opts?.autoplay || isPlayingRef.current) {
        isPlayingRef.current = true;
        setIsPlaying(true);
        void playSegment(0);
      }
      return;
    }
    if (!audioTimeline?.cumulative?.length) return;
    const audio = audioRef.current;
    if (!audio) return;
    manualSeekUntilRef.current = Date.now() + 1500;
    manualSeekTargetRef.current = 0;
    manualSeekIndexRef.current = -1;
    ignoreNextSeekRef.current = true;
    introSkippedRef.current = false;
    audio.currentTime = 0;
    setAudioCurrentTime(0);
    if (selectedIndexRef.current !== 0) {
      selectedIndexRef.current = 0;
      setSelectedIndex(0);
    }
    if (opts?.autoplay || isPlayingRef.current) {
      isPlayingRef.current = true;
      void audio.play().catch(() => {
        isPlayingRef.current = false;
      });
      setIsPlaying(true);
    }
  },
  [isMp3Mode, audioTimeline, hasSegmentedMp3, buildMp3QueueFrom, playSegment],
);

const getEventStartTime = useCallback(
  (index: number) => {
    if (hasSegmentedMp3) {
      const seg = resolveAudioSegmentForIndex(index);
      return Number(seg?.start) || 0;
    }
    const targetId = rows[index]?.id;
    if (targetId && audioEventStarts.has(String(targetId))) {
      return Math.max(0, (audioEventStarts.get(String(targetId)) ?? 0) - MP3_SEEK_LEAD_SEC);
    }
    const segments = (audioTimeline as any)?.segments as any[] | undefined;
    if (Array.isArray(segments) && segments.length) {
      const byIndex = segments.find(
        (seg) =>
          String(seg?.kind || "") === "event_header" &&
          Number.isFinite(seg?.start) &&
          Number(seg?.index) === index,
      );
      if (byIndex && Number.isFinite(byIndex.start)) {
        return Math.max(0, Number(byIndex.start) - MP3_SEEK_LEAD_SEC);
      }
    }
    if (!audioTimeline?.cumulative?.length) return 0;
    const offset = audioTimeline.hasIntro ? 1 : 0;
    const segIndex = Math.max(0, Math.min(index + offset, audioTimeline.cumulative.length - 1));
    const prevTime = segIndex > 0 ? audioTimeline.cumulative[segIndex - 1] : 0;
    return Number.isFinite(prevTime) ? Math.max(0, prevTime - MP3_SEEK_LEAD_SEC) : 0;
  },
  [audioTimeline, rows, audioEventStarts, MP3_SEEK_LEAD_SEC, hasSegmentedMp3, selectedAudioSegments, resolveAudioSegmentForIndex],
);

const seekToEventIndex = useCallback(
  (nextIndex: number, opts?: { autoplay?: boolean }) => {
    if (debugPlayer) {
      console.log(
        `[GE] seekToEventIndex next=${nextIndex} autoplay=${!!opts?.autoplay} sel=${selectedIndex} time=${audioCurrentTime.toFixed(2)}`,
      );
    }
    manualSeekUntilRef.current = Date.now() + 1500;
    // Evita un secondo seek immediato nel listener su selectedIndex.
    ignoreNextSeekRef.current = true;
    pendingSelectedMapFocusRef.current = nextIndex;
    setMapViewportMode("focus-selected");
    selectedIndexRef.current = nextIndex;
    setSelectedIndex(nextIndex);
    if (hasSegmentedMp3) {
      manualSeekTargetRef.current = getEventStartTime(nextIndex);
      manualSeekIndexRef.current = nextIndex;
      introSkippedRef.current = true;
      queueRef.current = buildMp3QueueFrom(nextIndex, false);
      currentQueuePosRef.current = 0;
      setAudioCurrentTime(Number(manualSeekTargetRef.current) || 0);
      if (opts?.autoplay || isPlayingRef.current) {
        isPlayingRef.current = true;
        setIsPlaying(true);
        void playSegment(0);
      }
      return;
    }
    if (!isMp3Mode) return;
    if (!audioTimeline?.cumulative?.length) return;
    const audio = audioRef.current;
    if (!audio) return;
    const target = getEventStartTime(nextIndex);
    manualSeekTargetRef.current = Number.isFinite(target) ? target : 0;
    manualSeekIndexRef.current = nextIndex;
    if (debugPlayer) {
      const targetId = rows[nextIndex]?.id ?? "";
      console.log(
        `[GE] seek target=${target.toFixed(2)} eventId=${targetId} ready=${audio.readyState}`,
      );
    }
    if (Number.isFinite(target)) {
      audio.currentTime = target;
      setAudioCurrentTime(target);
      window.setTimeout(() => {
        if (!audioRef.current) return;
        if (manualSeekTargetRef.current == null) return;
        const drift = Math.abs(audioRef.current.currentTime - target);
        if (drift > 0.5) {
          audioRef.current.currentTime = target;
        }
      }, 200);
      if (opts?.autoplay || isPlayingRef.current) {
        isPlayingRef.current = true;
        void audio.play().catch(() => {
          isPlayingRef.current = false;
        });
        setIsPlaying(true);
      }
    }
  },
  [getEventStartTime, isMp3Mode, audioTimeline, hasSegmentedMp3, buildMp3QueueFrom, playSegment],
);

const handlePrevEvent = useCallback(() => {
  if (!rows.length) return;
  const audioTime = audioRef.current?.currentTime ?? audioCurrentTime;
  if (isMp3Mode && hasIntroSegment) {
    if (isIntroPlaybackActive || (selectedIndex === 0 && audioTime <= (firstEventStart ?? 0) + 0.35)) {
      seekToIntro({ autoplay: true });
      return;
    }
    if (selectedIndex === 0) {
      seekToIntro({ autoplay: true });
      return;
    }
  }
  const nextIndex = Math.max(0, selectedIndex - 1);
  seekToEventIndex(nextIndex, { autoplay: true });
}, [rows.length, selectedIndex, seekToEventIndex, isMp3Mode, hasIntroSegment, audioCurrentTime, firstEventStart, isIntroPlaybackActive, seekToIntro]);

const handleNextEvent = useCallback(() => {
  if (!rows.length) return;
  if (isMp3Mode && hasIntroSegment && selectedIndex === 0 && !introSkippedRef.current) {
    const audioTime = audioRef.current?.currentTime ?? audioCurrentTime;
    if (firstEventStart == null || audioTime < Math.max(0, firstEventStart + 0.35)) {
      if (debugPlayer) {
        console.log(
          `[GE] nextEvent intro->first sel=${selectedIndex} time=${audioTime.toFixed(2)} first=${firstEventStart}`,
        );
      }
      introSkippedRef.current = true;
      seekToEventIndex(0, { autoplay: true });
      return;
    }
  }
  const nextIndex = Math.min(rows.length - 1, selectedIndex + 1);
  if (debugPlayer) {
    console.log(`[GE] nextEvent normal sel=${selectedIndex} next=${nextIndex}`);
  }
  seekToEventIndex(nextIndex, { autoplay: true });
}, [rows.length, selectedIndex, seekToEventIndex, isMp3Mode, audioCurrentTime, firstEventStart, debugPlayer, hasIntroSegment]);

const handleSelectEvent = useCallback(
  (nextIndex: number) => {
    playOnSelectRef.current = true;
    pendingSelectedMapFocusRef.current = nextIndex;
    if (!isLg) {
      initialMobileMapFitDoneRef.current = true;
      hasCompletedInitialMobileViewportRef.current = true;
    }
    setMapViewportMode("focus-selected");
    const target = rows[nextIndex];
    const map = mapRef.current as any;
    if (target?.latitude != null && target?.longitude != null && map) {
      const focusTarget = () => {
        try { map.stop?.(); } catch {}
        try { map.resize?.(); } catch {}
        try {
          map.flyTo({
            center: [target.longitude!, target.latitude!],
            zoom: Math.max(map.getZoom?.() ?? (isLg ? 8 : 6), isLg ? 8 : 6),
            speed: 0.85,
            essential: true,
          });
        } catch {}
      };
      if (typeof window !== "undefined" && "requestAnimationFrame" in window) {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(focusTarget);
        });
      } else {
        focusTarget();
      }
    }
    seekToEventIndex(nextIndex, { autoplay: true });
  },
  [seekToEventIndex, rows, isLg],
);

const renderMapPlayerBox = useCallback(
  (opts?: { compact?: boolean }) => (
    <div className={`absolute left-3 top-[calc(env(safe-area-inset-top)+10px)] z-20 flex flex-wrap items-center gap-2 rounded-2xl border border-white/40 bg-white/88 px-2 py-2 shadow ${mapMode === "fullscreen" ? "backdrop-blur" : ""}`}>
      {!opts?.compact ? (
        <button
          onClick={toggleMapModeView}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-slate-800 shadow hover:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
          title={mapMode === "normal" ? "Schermo intero" : "Riduci mappa"}
          aria-label={mapMode === "normal" ? "Schermo intero" : "Riduci mappa"}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            {mapMode === "fullscreen" ? (
              <path d="M15 9h4V5m-4 10h4v4M5 15v4h4M5 5h4V1" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <path d="M9 5H5v4m10-4h4v4m0 6v4h-4M5 15v4h4" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            )}
          </svg>
        </button>
      ) : null}
      <button
        onClick={handlePrevEvent}
        className="inline-flex h-10 w-10 items-center justify-center rounded-md text-white shadow-sm transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[rgba(15,60,140,0.45)]"
        style={{ background: "linear-gradient(120deg, #0f3c8c 0%, #1a64d6 100%)" }}
        aria-label="Evento precedente"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2.1" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        onClick={togglePlay}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full text-white shadow-sm transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[rgba(15,60,140,0.45)]"
        style={{ background: "linear-gradient(120deg, #0f3c8c 0%, #1a64d6 100%)" }}
        aria-label={isPlaying ? "Ferma autoplay" : "Avvia autoplay"}
      >
        {isPlaying ? (
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <rect x="6" y="5" width="4" height="14" fill="currentColor" rx="1" />
            <rect x="14" y="5" width="4" height="14" fill="currentColor" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path d="M8 5l10 7-10 7V5Z" fill="currentColor" />
          </svg>
        )}
      </button>
      <button
        onClick={handleNextEvent}
        className="inline-flex h-10 w-10 items-center justify-center rounded-md text-white shadow-sm transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[rgba(15,60,140,0.45)]"
        style={{ background: "linear-gradient(120deg, #0f3c8c 0%, #1a64d6 100%)" }}
        aria-label="Evento successivo"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.1" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
        <button
          onClick={() => {
            if (!selectedEvent || selectedEvent.latitude == null || selectedEvent.longitude == null) return;
            setMapViewportMode("focus-selected");
            moveMapToVisibleCenter(selectedEvent.longitude, selectedEvent.latitude);
          }}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-slate-800 shadow hover:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
        aria-label="Centra evento selezionato"
        title="Centra evento selezionato"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
      {audioSourceOptions.length ? (
        <select
          value={audioSource}
          onChange={(e) => setAudioSource(e.target.value)}
          className="h-9 rounded-full border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300/40"
          title="Audio"
        >
          {audioSourceOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : null}
      {!opts?.compact && selectedEvent?.wiki_url ? (
        <a
          href={selectedEvent?.wiki_url as string}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white/92 text-slate-700 shadow-sm hover:bg-white"
          title={tUI(uiLang, "journey.tab.wiki")}
          aria-label={tUI(uiLang, "journey.tab.wiki")}
        >
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 ring-1 ring-slate-200/80">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icons/Wiki.png"
              alt=""
              aria-hidden="true"
              className="h-6 w-6 rounded-full object-cover opacity-90"
              loading="lazy"
            />
          </span>
        </a>
      ) : null}
      {!opts?.compact ? renderAudioMeta() : null}
    </div>
  ),
  [mapMode, rows, selectedIndex, isPlaying, renderAudioMeta, togglePlay, toggleMapModeView, audioSourceOptions, audioSource, handlePrevEvent, handleNextEvent, uiLang],
);


const [overlayOpen, setOverlayOpen] = useState(false);
const [overlayMode, setOverlayMode] = useState<"overlay" | "full">("overlay");
const [overlayMedia, setOverlayMedia] = useState<MediaItem | null>(null);
const [overlayAutoplay, setOverlayAutoplay] = useState<boolean>(false);
const [quizOpen, setQuizOpen] = useState(false);
const [quizUrl, setQuizUrl] = useState<string>("/module/quiz");
const [concurrentOther, setConcurrentOther] = useState<ConcurrentJourney[]>([]);
// Correlazioni: cache per event_id
const [corrByEvent, setCorrByEvent] = useState<Record<string, CorrelatedJourney[]>>({});

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
const openQuiz = useCallback(() => {
  const base = "/module/quiz";
  const params = new URLSearchParams();
  if (gid) params.set("gid", gid);
  if (resolvedLang || desiredLang) params.set("lang", resolvedLang || desiredLang);
  const withParams = params.toString() ? `${base}?${params.toString()}` : base;
  setQuizUrl(withParams);
  setQuizOpen(true);
}, [gid, resolvedLang, desiredLang]);
const closeQuiz = useCallback(() => setQuizOpen(false), []);

 /* ===== Mappa ===== */
const mapRef = useRef<MapLibreMap | null>(null);
const markersRef = useRef<MapLibreMarker[]>([]);
const mobilePlayerMapHostRef = useRef<HTMLDivElement | null>(null);
const mobilePlayerMapRef = useRef<MapLibreMap | null>(null);
const mobilePlayerMarkersRef = useRef<MapLibreMarker[]>([]);
const popupRef = useRef<maplibregl.Popup | null>(null);
const suppressMapRecenteringRef = useRef(false);
const initialMobileMapFitDoneRef = useRef(false);
const pendingSelectedMapFocusRef = useRef<number | null>(null);
const [mapViewportMode, setMapViewportMode] = useState<"fit-all" | "focus-selected">("fit-all");
const [mapReady, setMapReady] = useState(false);
const [mapLoaded, setMapLoaded] = useState(false);
 const [mapVersion, setMapVersion] = useState(0);
const hasCompletedInitialMobileViewportRef = useRef(false);

const mobileMapTopInset = useMemo(() => {
  if (isLg) return 0;
  return 0;
}, [isLg]);

const mobileMapBottomInset = useMemo(() => {
  if (isLg) return 0;
  return 0;
}, [isLg]);

const mobileTopStackOffset = useMemo(() => {
  if (isLg) return 0;
  const measuredTop = Math.ceil(mobileOverlayHeights.top);
  return measuredTop > 0 ? measuredTop : 220;
}, [isLg, mobileOverlayHeights.top]);

const desktopEventFocusZoom = 8;
const mobileEventFocusZoom = 6;

const moveMapToVisibleCenter = useCallback(
  (lng: number, lat: number, zoom?: number) => {
    const map = mapRef.current as any;
    if (!map) return;
    try {
      try { map.stop?.(); } catch {}
      if (isLg || (mobileMapBottomInset <= 0 && mobileMapTopInset <= 0)) {
        map.flyTo({
          center: [lng, lat],
          zoom: zoom ?? Math.max(map.getZoom(), 6),
          speed: 0.8,
        });
        return;
      }

      const point = map.project([lng, lat]);
      const visibleOffsetY = (mobileMapBottomInset - mobileMapTopInset) / 2;
      const shifted = {
        x: point.x,
        y: point.y + visibleOffsetY,
      };
      const targetCenter = map.unproject(shifted);
      map.flyTo({
        center: targetCenter,
        zoom: zoom ?? Math.max(map.getZoom(), 6),
        speed: 0.8,
      });
    } catch {}
  },
  [isLg, mobileMapBottomInset, mobileMapTopInset]
);

const fitMapToRows = useCallback(() => {
  const map = mapRef.current;
  if (!map || !mapReady) return;
  const pts = rows
    .filter((ev) => ev.latitude != null && ev.longitude != null)
    .map((ev) => [ev.longitude!, ev.latitude!] as [number, number]);
  if (!pts.length) return;
  try {
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
    const padding = isLg
      ? 100
      : {
          top: 24,
          right: 24,
          bottom: 24,
          left: 24,
        };
    (map as any).fitBounds(bounds as any, { padding, duration: 800 });
  } catch {}
}, [rows, mapReady, isLg, mobileMapBottomInset, mobileMapTopInset]);

const applyMapViewport = useCallback(
  (opts?: { forceFit?: boolean; minZoom?: number }) => {
    const map = mapRef.current as any;
    if (!map || !mapReady) return;
    if (opts?.forceFit || mapViewportMode === "fit-all") {
      fitMapToRows();
      return;
    }
    const selected = activeEventIndex >= 0 ? rows[activeEventIndex] : null;
    if (selected?.latitude != null && selected?.longitude != null) {
      moveMapToVisibleCenter(
        selected.longitude,
        selected.latitude,
        Math.max((opts?.minZoom ?? map.getZoom?.() ?? (isLg ? desktopEventFocusZoom : mobileEventFocusZoom)), isLg ? desktopEventFocusZoom : mobileEventFocusZoom),
      );
      return;
    }
    fitMapToRows();
  },
  [mapReady, mapViewportMode, activeEventIndex, rows, fitMapToRows, moveMapToVisibleCenter],
);

const latestApplyMapViewportRef = useRef(applyMapViewport);

useEffect(() => {
  latestApplyMapViewportRef.current = applyMapViewport;
}, [applyMapViewport]);

const showPopup = useCallback((ev?: EventVM | null) => {
  if (popupRef.current) {
    try { popupRef.current.remove(); } catch {}
    popupRef.current = null;
  }
}, [mapMode, mapReady]);

const recenterSelectedEvent = useCallback(() => {
  const ev = activeEventIndex >= 0 ? rows[activeEventIndex] : null;
  if (!ev || ev.latitude == null || ev.longitude == null) return;
  suppressMapRecenteringRef.current = true;
  moveMapToVisibleCenter(ev.longitude, ev.latitude, isLg ? desktopEventFocusZoom : mobileEventFocusZoom);
  if (typeof window !== "undefined") {
    window.setTimeout(() => {
      suppressMapRecenteringRef.current = false;
    }, 450);
  } else {
    suppressMapRecenteringRef.current = false;
  }
}, [activeEventIndex, rows, moveMapToVisibleCenter, isLg]);

// Lock scroll quando la mappa è full-screen
useEffect(() => {
  if (mapMode !== "fullscreen") return;
  const prev = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  return () => { document.body.style.overflow = prev; };
}, [mapMode]);

useEffect(() => {
  const className = "ge-map-fullscreen";
  if (typeof document === "undefined") return;
  if (isLg && mapMode === "fullscreen") {
    document.body.classList.add(className);
    return () => {
      document.body.classList.remove(className);
    };
  }
  document.body.classList.remove(className);
  return () => {
    document.body.classList.remove(className);
  };
}, [isLg, mapMode]);

// Forza resize + viewport coerente dopo toggle view
useEffect(() => {
  if (!mapRef.current || !mapReady) return;
  try { mapRef.current.resize(); } catch {}
  setTimeout(() => { try { mapRef.current?.resize(); } catch {} }, 120);
  if (mapMode === "fullscreen") {
    latestApplyMapViewportRef.current({ forceFit: true });
    return;
  }
  latestApplyMapViewportRef.current();
}, [mapMode, mapReady]);

useEffect(() => {
  const map = mapRef.current;
  if (!map || !mapReady || !mapLoaded || isLg) return;
  try { map.resize(); } catch {}
  if (!initialMobileMapFitDoneRef.current) {
    initialMobileMapFitDoneRef.current = true;
    hasCompletedInitialMobileViewportRef.current = false;
    latestApplyMapViewportRef.current({ forceFit: true });
    if (typeof window !== "undefined" && "requestAnimationFrame" in window) {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          hasCompletedInitialMobileViewportRef.current = true;
        });
      });
    } else {
      hasCompletedInitialMobileViewportRef.current = true;
    }
    return;
  }
  hasCompletedInitialMobileViewportRef.current = true;
  latestApplyMapViewportRef.current();
}, [
  isLg,
  mapReady,
  mapLoaded,
  mobileOverlayHeights.top,
  mobileOverlayHeights.band,
  mobileOverlayHeights.sheet,
  mobileConcurrentHeight,
]);

useEffect(() => {
  const pendingIndex = pendingSelectedMapFocusRef.current;
  if (pendingIndex == null || pendingIndex !== activeEventIndex) return;
  const map = mapRef.current as any;
  const ev = rows[pendingIndex];
  if (!map || !mapReady || !mapLoaded || !ev || ev.latitude == null || ev.longitude == null) return;
  pendingSelectedMapFocusRef.current = null;
  const focusLng = ev.longitude;
  const focusLat = ev.latitude;
  const applyFocus = () => {
    try { map.stop?.(); } catch {}
    try { map.resize?.(); } catch {}
    moveMapToVisibleCenter(
      focusLng,
      focusLat,
      Math.max(map.getZoom?.() ?? (isLg ? desktopEventFocusZoom : mobileEventFocusZoom), isLg ? desktopEventFocusZoom : mobileEventFocusZoom),
    );
  };
  const needsSettledInitialViewport = !isLg && !hasCompletedInitialMobileViewportRef.current;
  if (typeof window !== "undefined" && "requestAnimationFrame" in window) {
    const scheduleFocus = () => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(applyFocus);
      });
    };
    if (needsSettledInitialViewport) {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          hasCompletedInitialMobileViewportRef.current = true;
          scheduleFocus();
        });
      });
      return;
    }
    scheduleFocus();
    return;
  }
  applyFocus();
}, [activeEventIndex, rows, mapReady, mapLoaded, moveMapToVisibleCenter, isLg]);

// Popup evento quando la mappa Š full-screen
useEffect(() => {
  if (mapMode !== "fullscreen") {
    if (popupRef.current) { try { popupRef.current.remove(); } catch {} popupRef.current = null; }
    return;
  }
  const ev = activeEventIndex >= 0 ? rows[activeEventIndex] : null;
  if (!ev || !mapReady) return;
  showPopup(ev);
}, [mapMode, activeEventIndex, rows, mapReady, showPopup]);

// Reset cache/markers quando cambio journey
useEffect(() => {
  setCorrByEvent({});
  markersRef.current = [];
  initialMobileMapFitDoneRef.current = false;
  hasCompletedInitialMobileViewportRef.current = false;
  setMapViewportMode("fit-all");
  setMapVersion((v) => v + 1);
}, [gid]);

 function isUsableMapContainer(el: HTMLElement | null): el is HTMLElement {
 const rect = el?.getBoundingClientRect();
 if (!el || !rect) return false;
 const style = window.getComputedStyle(el);
 return rect.width >= 120 && rect.height >= 120 && style.display !== "none" && style.visibility !== "hidden";
 }
 
 function getVisibleMapContainer(): HTMLElement | null {
 const preferred = isLg ? desktopMapHostRef.current : mobileMapHostRef.current;
 if (isUsableMapContainer(preferred)) return preferred;
 const alternate = isLg ? mobileMapHostRef.current : desktopMapHostRef.current;
 if (isUsableMapContainer(alternate)) return alternate;
 const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-map="gehj"]'));
 for (const el of nodes) {
 if (isUsableMapContainer(el)) return el;
 }
 return null;
 }
 
useEffect(() => {
 if (typeof window === "undefined" || loading || !gid) return;

 let cancelled = false;

 // Cleanup eventuale mappa precedente
 if (mapRef.current) {
   try { mapRef.current.remove(); } catch {}
   mapRef.current = null;
 }
 document.querySelectorAll<HTMLElement>('[data-map="gehj"]').forEach((el) => {
   if (el.hasChildNodes()) {
     try { el.innerHTML = ""; } catch {}
   }
 });
 setMapReady(false);
 setMapLoaded(false);

 let attempts = 240;
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
       attributionControl: false,
     } as any);
     map.addControl(new maplibregl.NavigationControl(), "top-right");
     map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
     mapRef.current = map as any;
     setMapReady(true);

     map.on("load", () => {
       setMapLoaded(true);
       try { map.resize(); } catch {}
       setTimeout(() => { try { map.resize(); } catch {} }, 120);
     });

     const ro = new ResizeObserver(() => { try { map.resize(); } catch {} });
     ro.observe(container);
     const onWinResize = () => { try { map.resize(); } catch {} };
     window.addEventListener("resize", onWinResize);
     window.addEventListener("orientationchange", onWinResize);
     document.addEventListener("visibilitychange", onWinResize);

     // Cleanup listeners on teardown
     const cleanup = () => {
       try { ro.disconnect(); } catch {}
       window.removeEventListener("resize", onWinResize);
       window.removeEventListener("orientationchange", onWinResize);
       document.removeEventListener("visibilitychange", onWinResize);
     };
     (map as any)._gehjCleanup = cleanup;
   } catch (e) { console.error("[GE] Map init error:", e); }
 };

 tick();
 return () => {
   cancelled = true;
   if (popupRef.current) { try { popupRef.current.remove(); } catch {} popupRef.current = null; }
   if (mapRef.current) {
     try { (mapRef.current as any)._gehjCleanup?.(); } catch {}
     try { mapRef.current.remove(); } catch {}
     mapRef.current = null;
   }
 };
 }, [mapVersion, loading, gid, isLg]);

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
        .select("title, description, lang")
 .eq("group_event_id", gid)
 .eq("lang", desiredLang)
 .maybeSingle();
 if (geTrExact) geTrData = geTrExact;
 else {
 const { data: geTrAny } = await supabase
 .from("group_event_translations")
          .select("title, description, lang")
 .eq("group_event_id", gid)
 .limit(1);
 geTrData = geTrAny?.[0] || null;
 }

 const { data: vjRows, error: vjErr } = await supabase
 .from("v_journey")
 .select(
 `event_id, group_event_id, description, lang, title, wikipedia_url,
 location, continent, country, era, exact_date, id, latitude, longitude, year_from, year_to,
 journey_title, journey_description, journey_media, journey_media_first, event_media, event_media_first, event_type_icon`
 )
 .eq("group_event_id", gid);
 if (vjErr) throw vjErr;

 const vms: EventVM[] = (vjRows ?? []).map((r: any) => {
 const eventId = r.event_id ?? r.id;
 const location = r.location ?? r.country ?? r.continent ?? null;
 const eventMedia: MediaItem[] = Array.isArray(r.event_media)
   ? (r.event_media as any[]).map(coerceMediaItem).filter(Boolean) as MediaItem[]
   : [];
 const coverMedia = eventMedia.find(
   (m) =>
     (m?.role || "").toLowerCase() === "cover" &&
     (m.preview || m.url) &&
     ((m.type || "").toLowerCase() === "image" || m.mime?.startsWith?.("image/"))
 );
 const eventMediaOrdered = coverMedia ? [coverMedia, ...eventMedia.filter((m) => m !== coverMedia)] : eventMedia;
 const eventMediaNormalized = eventMediaOrdered.map(normalizeMediaItem);
 const coverPreview = normalizeMediaUrl(coverMedia?.preview || coverMedia?.url || null) || null;
 const coverUrl = normalizeMediaUrl(coverMedia?.url || coverMedia?.preview || null) || coverMedia?.url || null;
 const existingEventFirst = normalizeMediaUrl(r.event_media_first || null) || r.event_media_first || null;
 const firstVideo =
   (r as any)?.video_url ||
   eventMediaNormalized.find((m) => (m?.type === "video" || m?.mime?.startsWith?.("video/")) && (m?.url || m?.preview))?.url ||
   null;
 const fallbackImage =
   coverPreview ||
   existingEventFirst ||
   coverUrl ||
   eventMediaNormalized.find((m) => (m?.type === "image" || m?.mime?.startsWith?.("image/")) && (m?.preview || m?.url))?.preview ||
   eventMediaNormalized.find((m) => (m?.type === "image" || m?.mime?.startsWith?.("image/")) && (m?.preview || m?.url))?.url ||
   null;
 const core: EventCore = {
 id: String(eventId ?? r.id ?? ""),
  latitude: typeof r.latitude === "number" ? r.latitude : null,
  longitude: typeof r.longitude === "number" ? r.longitude : null,
  era: r.era ?? null,
 year_from: r.year_from ?? null,
 year_to: r.year_to ?? null,
 exact_date: r.exact_date ?? null,
 location,
 image_url: fallbackImage,
 event_type_icon: normalizeMediaUrl(r.event_type_icon ?? null) || r.event_type_icon || null,
 };
 // Build base event VM
 const ev: EventVM = {
 ...core,
 title: (r.title ?? location ?? "Untitled").toString(),
 description: (r.description ?? "").toString(),
 wiki_url: r.wikipedia_url ? String(r.wikipedia_url) : null,
 video_url: firstVideo ? String(firstVideo) : null,
 order_key: chronoOrderKey(core),
 event_media: eventMediaNormalized,
 event_media_first: coverPreview ?? existingEventFirst ?? coverUrl ?? null,
 };
 // Fallback: if no structured media but a video_url exists, create a single video media item
 if ((!ev.event_media || ev.event_media.length === 0) && ev.video_url) {
 ev.event_media = [
 {
 media_id: `video:${eventId ?? r.id}`,
 type: "video",
 url: String(ev.video_url),
 preview: r.image_url ?? null,
 role: "primary",
 } as MediaItem,
 ];
 ev.event_media_first = ev.event_media[0].preview || ev.event_media[0].url;
 }
 // Secondo fallback: usa image_url come media immagine
 if ((!ev.event_media || ev.event_media.length === 0) && core.image_url) {
 ev.event_media = [
 {
 media_id: `image:${eventId ?? r.id}`,
 type: "image",
 url: String(core.image_url),
 preview: String(core.image_url),
 role: "primary",
 } as MediaItem,
 ];
 ev.event_media_first = ev.event_media[0].preview || ev.event_media[0].url;
 }
 return ev;
 });
 vms.sort((a, b) => a.order_key - b.order_key);

const j0 = (vjRows ?? [])[0] as any;
  const journeyDesc = (j0?.journey_description ?? "").toString().trim();
const jm: MediaItem[] = Array.isArray(j0?.journey_media)
  ? (j0.journey_media as any[]).map(coerceMediaItem).filter(Boolean) as MediaItem[]
  : [];
const jmCover = jm.find(
  (m) =>
    (m?.role || "").toLowerCase() === "cover" &&
    (m.preview || m.url) &&
    ((m.type || "").toLowerCase() === "image" || m.mime?.startsWith?.("image/"))
);
const jmOrdered = jmCover ? [jmCover, ...jm.filter((m) => m !== jmCover)] : jm;
const rawJourneyFirst = j0?.journey_media_first || null;
const jmNormalized = jmOrdered.map((m, idx) => {
  const isCover = idx === 0 && !!jmCover;
  const normUrl = normalizeMediaUrl(m.url || null) || m.url;
  const normPreview =
    normalizeMediaUrl(m.preview || null) ||
    (isCover ? normalizeMediaUrl(rawJourneyFirst || null) : "");
  const preview = normPreview || normalizeMediaUrl(normUrl || null) || m.preview || m.url || rawJourneyFirst || null;
  return { ...m, url: normUrl || m.url, preview: preview || null };
});
 const jmFirst: string | null =
  normalizeMediaUrl(jmCover?.preview || jmCover?.url || null) ||
  normalizeMediaUrl(rawJourneyFirst || null) ||
  rawJourneyFirst ||
  jmNormalized[0]?.preview ||
  jmNormalized[0]?.url ||
  jmCover?.preview ||
  jmCover?.url ||
  null;

setGe(geData);
setGeTr(geTrData);
setRows(vms);
setJourneyTitle(j0?.journey_title ?? null);
setJourneyDescription(journeyDesc);
const extractLangFromFilename = (url: string): "it" | "en" | null => {
  if (!url) return null;
  const clean = url.split("?")[0].split("#")[0];
  const file = clean.split("/").pop() || "";
  const base = file.replace(/\.[a-z0-9]+$/i, "");
  if (!base) return null;
  const upper = base.toUpperCase();
  if (upper.endsWith("IT")) return "it";
  if (upper.endsWith("EN")) return "en";
  return null;
};

let audioTracks = jmNormalized
  .filter((m) => isAudioMedia(m))
  .map((m) => {
    const src = m.url || m.preview || "";
    const lang = extractLangFromFilename(src);
    const label = lang === "it" ? "Audio IT" : lang === "en" ? "Audio EN" : "Audio";
    const timeline = m.metadata?.audio_timeline ?? null;
    return { lang, url: src, label, timeline };
  })
  .filter((t) => t.url);

  const { data: audioRows, error: audioErr } = await supabase
    .from("v_media_attachments_expanded")
    .select("public_url,source_url,storage_path,media_type,asset_metadata")
    .eq("group_event_id", gid)
    .eq("entity_type", "group_event")
    .eq("media_type", "audio")
    .order("sort_order", { ascending: true });
if (audioErr) {
  console.warn("[GE] audio media lookup error:", audioErr.message);
} else if (audioRows?.length) {
    const attachmentTracks = (audioRows ?? [])
      .map((row: any) => {
        const src = row.public_url || row.source_url || row.storage_path || "";
        const normalized = normalizeMediaUrl(src);
        const lang = extractLangFromFilename(normalized || src);
        const label = lang === "it" ? "Audio IT" : lang === "en" ? "Audio EN" : "Audio";
        const timeline = row.asset_metadata?.audio_timeline ?? null;
        return { lang, url: normalized || src, label, timeline };
      })
      .filter((t) => t.url);
    if (attachmentTracks.length) {
      const deduped: typeof attachmentTracks = [];
      const seen = new Set<string>();
      attachmentTracks.forEach((t) => {
        const key = `${t.lang || "unk"}|${(t.url || "").split("?")[0]}`;
        if (seen.has(key)) return;
        seen.add(key);
        deduped.push(t);
      });
      audioTracks = deduped;
    }
  }

const visualJourneyMedia = jmNormalized.filter((m) => !isAudioMedia(m));
setJourneyMedia(visualJourneyMedia);
setJourneyAudioTracks(audioTracks);
setJourneyMediaFirst(jmFirst);
 if (eidParam) {
 const idx = vms.findIndex((ev) => ev.id === eidParam);
 setSelectedIndex(idx >= 0 ? idx : 0);
 } else {
 setSelectedIndex(0);
 }
 } catch (e: any) {
 setErr(e?.message ?? "Unknown error");
 console.error("[GE] Fetch error:", e);
 } finally {
 setLoading(false);
 }
 })();
 }, [gid, desiredLang, supabase, eidParam]);

 // Carica correlazioni per l'evento selezionato (lazy, senza viste)
 useEffect(() => {
 const ev = activeEventIndex >= 0 ? rows[activeEventIndex] : null;
 if (!ev?.id) return;
 if (corrByEvent[ev.id]) return; // cache
 (async () => {
 try {
  console.debug("[GE] fetch correlated journeys", { evId: ev.id });
  const { data, error } = await supabase
  .from("event_group_event_correlated")
  .select("group_event_id, group_events!inner(id, slug, visibility, approved_at, group_event_translations!left(title, lang))")
  .eq("event_id", ev.id);
 if (error) throw error;

  // Se non c'è traduzione nella lingua, prendi una qualsiasi
  let rowsCorr: any[] = data ?? [];
  if (!rowsCorr.length) {
  const { data: anyLang } = await supabase
  .from("event_group_event_correlated")
.select("group_event_id, group_events!inner(id, slug, visibility, approved_at, group_event_translations!left(title, lang))")
.eq("event_id", ev.id)
.limit(5);
  rowsCorr = anyLang ?? [];
  }

 let items: CorrelatedJourney[] = rowsCorr
  // tieni solo righe con journey valido (evita null)
  .filter((r: any) => !!(r.group_events?.id || r.group_event_id))
  .map((r: any) => {
    if (process?.env?.NODE_ENV === "development") {
      console.debug("[GE] corr row", r);
    }
    const translationsRaw = Array.isArray(r.group_events?.group_event_translations)
      ? r.group_events.group_event_translations
      : r.group_events?.group_event_translations
      ? [r.group_events.group_event_translations]
      : [];
     const translations = translationsRaw.map((t: any) => ({
       lang: (t?.lang || "").toLowerCase(),
       title: t?.title ?? null,
     }));
     const norm = (v: string | null | undefined) => (v || "").toLowerCase();
     const order = [norm(resolvedLang), "it", "en"].filter((v, idx, arr) => v && arr.indexOf(v) === idx);
     let title: string | null = null;
     for (const target of order) {
       const found = translations.find((t: any) => t.lang === target);
       if (found?.title) { title = found.title; break; }
     }
     if (!title) {
       const first = translations.find((t: any) => t?.title);
       title = first?.title ?? null;
     }
      return {
        id: r.group_events?.id ?? r.group_event_id,
      slug: r.group_events?.slug ?? null,
      title,
      coverUrl: null,
     };
   });
  if (items.length) {
    const corrIds = items.map((it) => it.id).filter(Boolean);
    const { data: coverRows } = await supabase
      .from("v_journey")
      .select("group_event_id, journey_media_first")
      .in("group_event_id", corrIds);
    if (Array.isArray(coverRows) && coverRows.length) {
      const coverByJourney = new Map<string, string>();
      for (const row of coverRows as any[]) {
        const jid = String(row?.group_event_id || "");
        if (!jid || coverByJourney.has(jid)) continue;
        const cover =
          normalizeMediaUrl(row?.journey_media_first ?? null) ||
          row?.journey_media_first ||
          null;
        if (cover) coverByJourney.set(jid, cover);
      }
      items = items.map((it) => ({ ...it, coverUrl: coverByJourney.get(it.id) ?? null }));
    }
  }
  console.debug("[GE] correlated journeys resolved", { evId: ev.id, count: items.length, items });
 setCorrByEvent((prev) => ({ ...prev, [ev.id]: items }));
  } catch (e) {
  // silenzioso: nessuna correlazione
  console.warn("[GE] correlated journeys fetch error", e);
  }
  })();
 }, [rows, activeEventIndex, resolvedLang, supabase, corrByEvent]);

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
if (!map || !mapReady || !gid) return;

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

 function makeMarkerEl(ev: EventVM, idx: number) {
 const isSelected = idx === activeEventIndex;
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
 const iconUrl = ev.event_type_icon ? normalizeMediaUrl(ev.event_type_icon) : null;
 if (iconUrl) {
   const img = document.createElement("img");
   img.src = iconUrl;
   img.alt = ev.title || "Evento";
   img.style.width = isSelected ? "28px" : "22px";
   img.style.height = isSelected ? "28px" : "22px";
   img.style.objectFit = "contain";
   img.style.filter = "drop-shadow(0 2px 4px rgba(0,0,0,0.15))";
   wrap.appendChild(img);
 } else {
   const holder = document.createElement("div");
   holder.innerHTML = MODERN_ICONS["pin"];
   const svg = holder.firstChild as SVGElement | null;
   if (svg) {
     svg.setAttribute("width", isSelected ? "28" : "22");
     svg.setAttribute("height", isSelected ? "28" : "22");
     (svg as any).style.color = "#111827";
     wrap.appendChild(svg);
   }
 }
 return wrap;
 }

 rows.forEach((ev, idx) => {
 if (ev.latitude == null || ev.longitude == null) return;

 const el = makeMarkerEl(ev, idx);
 const pxOff = pixelOffsetById.get(ev.id) ?? [0, 0];

 const marker = new maplibregl.Marker({ element: el, offset: pxOff as any })
 .setLngLat([ev.longitude!, ev.latitude!])
 .addTo(map as any);

 try { (marker as any).setZIndex?.(idx === activeEventIndex ? 1000 : 0); } catch {}

 el.addEventListener("click", () => {
   handleSelectEvent(idx);
   if (mapMode === "fullscreen") showPopup(ev);
 });

 markersRef.current.push(marker as any);
 pts.push([ev.longitude!, ev.latitude!]);
 });

 try {
  if (!pts.length) {
    (map as any).flyTo({ center: [9.19, 45.46], zoom: 3.5, duration: 600 });
  }
 } catch {}
 }, [rows, mapReady, activeEventIndex, mapMode, showPopup]);

useEffect(() => {
 if (typeof window === "undefined" || isLg || !mobilePlayerOpen) return;
 const container = mobilePlayerMapHostRef.current;
 if (!container) return;

 let cancelled = false;
 const apiKey = process.env.NEXT_PUBLIC_MAPTILER_KEY;
 const style = apiKey
   ? `https://api.maptiler.com/maps/hybrid/style.json?key=${apiKey}`
   : OSM_STYLE;

 if (mobilePlayerMapRef.current) {
  try { mobilePlayerMapRef.current.remove(); } catch {}
  mobilePlayerMapRef.current = null;
 }
 container.innerHTML = "";

 const map = new maplibregl.Map({
  container,
  style,
  center: [9.19, 45.46],
  zoom: 3.5,
  cooperativeGestures: true,
  attributionControl: false,
  interactive: true,
 } as any);
 mobilePlayerMapRef.current = map as any;

 const renderMarkers = (fitAll = false) => {
  (mobilePlayerMarkersRef.current || []).forEach((m) => m.remove());
  mobilePlayerMarkersRef.current = [];
  const pts: [number, number][] = [];

  rows.forEach((ev, idx) => {
   if (ev.latitude == null || ev.longitude == null) return;
   const isSelected = idx === activeEventIndex;
   const el = makeEventMarkerElement(ev, isSelected);
   const marker = new maplibregl.Marker({ element: el })
    .setLngLat([ev.longitude, ev.latitude])
    .addTo(map as any);
   el.addEventListener("click", () => handleSelectEvent(idx));
   mobilePlayerMarkersRef.current.push(marker as any);
   pts.push([ev.longitude, ev.latitude]);
  });

  if (!fitAll) return;
  try {
   if (pts.length === 1) {
    (map as any).flyTo({ center: pts[0], zoom: 5.5, duration: 500 });
    return;
   }
   if (pts.length > 1) {
    const bounds = pts.reduce<[[number, number], [number, number]]>(
     (b, c) => [
      [Math.min(b[0][0], c[0]), Math.min(b[0][1], c[1])],
      [Math.max(b[1][0], c[0]), Math.max(b[1][1], c[1])],
     ],
     [[pts[0][0], pts[0][1]], [pts[0][0], pts[0][1]]]
    );
    (map as any).fitBounds(bounds as any, { padding: 36, duration: 500 });
   }
  } catch {}
 };

 map.on("load", () => {
  if (cancelled) return;
  try { map.resize(); } catch {}
  renderMarkers(true);
 });

 const onResize = () => {
  try { map.resize(); } catch {}
 };
 window.addEventListener("resize", onResize);

 return () => {
  cancelled = true;
  window.removeEventListener("resize", onResize);
  (mobilePlayerMarkersRef.current || []).forEach((m) => m.remove());
  mobilePlayerMarkersRef.current = [];
  try { map.remove(); } catch {}
  if (mobilePlayerMapRef.current === map) mobilePlayerMapRef.current = null;
 };
}, [isLg, mobilePlayerOpen, rows, handleSelectEvent]);

useEffect(() => {
 if (isLg || !mobilePlayerOpen) return;
 const map = mobilePlayerMapRef.current as any;
 if (!map) return;

 (mobilePlayerMarkersRef.current || []).forEach((m) => m.remove());
 mobilePlayerMarkersRef.current = [];
 rows.forEach((ev, idx) => {
  if (ev.latitude == null || ev.longitude == null) return;
  const el = makeEventMarkerElement(ev, idx === activeEventIndex);
  const marker = new maplibregl.Marker({ element: el })
   .setLngLat([ev.longitude, ev.latitude])
   .addTo(map as any);
  el.addEventListener("click", () => handleSelectEvent(idx));
  mobilePlayerMarkersRef.current.push(marker as any);
 });
}, [isLg, mobilePlayerOpen, rows, activeEventIndex, handleSelectEvent]);

useEffect(() => {
 if (isLg || !mobilePlayerOpen) return;
 const map = mobilePlayerMapRef.current as any;
 const ev = activeEventIndex >= 0 ? rows[activeEventIndex] : null;
 if (!map || !ev || ev.latitude == null || ev.longitude == null) return;
 try {
  map.flyTo({
   center: [ev.longitude, ev.latitude],
   zoom: Math.max(map.getZoom?.() ?? 0, 10),
   speed: 0.95,
   essential: true,
  });
 } catch {}
}, [isLg, mobilePlayerOpen, activeEventIndex, rows]);

/* ===== Refs per elenchi eventi (mobile + desktop) ===== */
const bandRef = useRef<HTMLDivElement | null>(null);
const bandItemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
const listRef = useRef<HTMLDivElement | null>(null);
const listItemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

useEffect(() => {
 const ev = selectedIndex >= 0 && !isIntroPlaybackActive ? rows[selectedIndex] : null;
 if (!ev) return;
 const bandEl = bandItemRefs.current.get(ev.id);
 if (bandEl && bandRef.current?.contains(bandEl)) {
 bandEl.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
 }
 const listEl = listItemRefs.current.get(ev.id);
 if (listEl && listRef.current?.contains(listEl)) {
 listEl.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
 }
}, [selectedIndex, rows, isIntroPlaybackActive]);

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

  const tickTarget = isLg ? 12 : 6;
  const ticks = buildTimelineTicks(data.min, data.max, tickTarget);
  const tickYears = [data.min, ...ticks, data.max];
  // Minor ticks: per-event start years, dedup + thinning to avoid clutter
  const eventYearsAll = Array.from(
  new Set(
  (data.items || [])
 .map((it) => Math.round(it.start))
 .filter((y) => Number.isFinite(y) && y >= data.min && y <= data.max)
 )
 ).sort((a, b) => a - b);
 const majorSet = new Set(tickYears.map((y) => Math.round(y)));
 const eventYearsFiltered = eventYearsAll.filter((y) => !majorSet.has(Math.round(y)));
 const minorTicks = (() => {
 const kept: number[] = [];
 const minGapPct = 2.5; // prevent overlapping
 let lastPos = -Infinity;
 for (const y of eventYearsFiltered) {
 const pos = ((y - data.min) / Math.max(1, data.range)) * 100;
 if (pos - lastPos >= minGapPct) { kept.push(y); lastPos = pos; }
  }
  return kept;
  })();

  let activeItem: TimelineItem | null = null;
  let activeLabel: string | null = null;
  let activeStartPct = 50;
  let activeEndPct = 50;
   {
  const ev = selectedIndex >= 0 && !isIntroPlaybackActive ? rows[selectedIndex] : null;
   if (ev) {
   const span = buildTimelineSpan(ev);
   activeItem = data.items.find((it) => it.index === selectedIndex) ?? null;
   activeLabel = formatEventRange(ev);
   if (span) {
   activeStartPct = Math.max(0, Math.min(100, ((span.min - data.min) / Math.max(1, data.range)) * 100));
   activeEndPct = Math.max(0, Math.min(100, ((span.max - data.min) / Math.max(1, data.range)) * 100));
   }
   }
   }

 return (
  <div className="relative flex h-full flex-col justify-center">
   <div className="px-1 pt-0 pb-1">
    <div className="mb-2 flex items-center justify-between text-[11px] text-slate-500">
      <span>{formatTimelineYearLabel(data.min)}</span>
      <span>{formatTimelineYearLabel(data.max)}</span>
    </div>

    <div className="relative py-2">
     <div className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 bg-slate-200" />
     <div className="relative h-[18px] w-full overflow-visible">
      <div
        className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 bg-[#0f3c8c]/12"
      />
      {data.items.map((item) => {
        const spanWidthPct = Math.max(1.4, ((item.max - item.min) / Math.max(1, data.range)) * 100);
        const leftPct = Math.max(0, Math.min(100, ((item.min - data.min) / Math.max(1, data.range)) * 100));
        const active = item.index === activeEventIndex;
        return (
          <button
            key={`desktop-span-${item.ev.id}-${item.index}`}
            onClick={() => handleSelectEvent(item.index)}
            className={`absolute top-1/2 h-[10px] -translate-y-1/2 rounded-full transition ${
              active
                ? "bg-[#0f3c8c]"
                : "bg-slate-300 hover:bg-slate-400"
            }`}
            style={{
              left: `${leftPct}%`,
              width: `${spanWidthPct}%`,
              minWidth: "10px",
            }}
            aria-label={`Evento ${item.index + 1}`}
            title={`${item.ev.title} - ${formatEventRange(item.ev)}`}
          />
        );
      })}
      {activeItem && activeLabel ? (
        <div
          className="pointer-events-none absolute top-1/2 h-[14px] -translate-y-1/2 rounded-full border border-[#0f3c8c]/20 bg-[#0f3c8c]/10"
          style={{
            left: `${activeStartPct}%`,
            width: `${Math.max(0.8, activeEndPct - activeStartPct)}%`,
          }}
        >
          <span className="sr-only">{activeLabel}</span>
        </div>
      ) : null}
      {minorTicks.map((t, i) => {
       const pos = ((t - data.min) / data.range) * 100;
       return (
         <div
           key={`mtick-${i}`}
           className="absolute top-1/2 h-[8px] w-px -translate-x-1/2 -translate-y-1/2 bg-slate-300"
           style={{ left: `${pos}%` }}
         />
        );
      })}
      {tickYears.map((t, i) => {
       const pos = ((t - data.min) / data.range) * 100;
       return (
        <div
          key={`tick-${i}`}
          className="absolute top-1/2 h-[14px] w-px -translate-x-1/2 -translate-y-1/2 bg-slate-500"
          style={{ left: `${pos}%` }}
        />
       );
      })}
     </div>
    </div>
    {activeItem && activeLabel ? (
      <div className="mt-3 grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 text-[12px]">
        <div className="whitespace-nowrap text-left">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">From</div>
          <div className="font-medium text-slate-900">{formatTimelineYearLabel(activeItem.min)}</div>
        </div>
        <div className="min-w-0 text-center">
          <div className="truncate text-[12.5px] font-semibold text-slate-900">{activeItem.ev.title}</div>
          <div className="mt-0.5 text-[11px] text-slate-500">{activeLabel}</div>
        </div>
        <div className="whitespace-nowrap text-right">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">To</div>
          <div className="font-medium text-slate-900">{formatTimelineYearLabel(activeItem.max)}</div>
        </div>
      </div>
    ) : null}
   </div>
  </div>
 );
 }

 // Eventi contemporanei di altri journey (fetch + filtro DB, era-normalized)
 useEffect(() => {
 (async () => {
 try {
 const ev = activeEventIndex >= 0 ? rows[activeEventIndex] : null;
 if (!ev || !gid) { setConcurrentOther([]); return; }
 const s = buildTimelineSpan(ev);
 if (!s) return "";
 // Normalizza: DB ha anni positivi + campo era (BC/AD)

 let query = supabase
 .from("v_concurrent_events")
 .select("event_id, group_event_id, year_from, year_to, era, exact_date, latitude, longitude, image_url, title, lang")
 .neq("group_event_id", gid);
 const era = ev.era ? normEra(ev.era) : null;
 if (era) query = query.or(`era.eq.${era},era.is.null`);
  const { data, error } = await query;
if (error) { setConcurrentOther([]); return; }

 const pickTitle = (translations: any[], lang: string) => {
   const norm = (v: string | null | undefined) => (v || "").toLowerCase();
   const order = [lang, norm(resolvedLang), "it", "en"].filter((v, idx, arr) => v && arr.indexOf(v) === idx);
   for (const target of order) {
     const found = translations.find((t: any) => norm(t?.lang) === target);
     if (found?.title) return found.title;
   }
   const first = translations.find((t: any) => t?.title);
   return first?.title ?? null;
 };

 const grouped = new Map<string, any>();
 (data || []).forEach((r: any) => {
   const key = `${r.group_event_id}:${r.event_id}`;
   if (!grouped.has(key)) {
     grouped.set(key, {
       event_id: r.event_id,
       group_event_id: r.group_event_id,
       year_from: r.year_from ?? null,
       year_to: r.year_to ?? null,
       era: r.era ?? null,
       exact_date: r.exact_date ?? null,
       latitude: r.latitude ?? null,
       longitude: r.longitude ?? null,
       image_url: r.image_url ?? null,
       translations: [],
     });
   }
   const g = grouped.get(key);
   if (r.title) g.translations.push({ title: r.title, lang: r.lang });
 });

   const items = Array.from(grouped.values()).map((r: any) => {
   const yf = r.year_from != null ? Number(r.year_from) : null;
   const yt = r.year_to != null ? Number(r.year_to) : null;
   const yearFrom = Number.isFinite(yf as any) ? (yf as number) : null;
   const yearTo = Number.isFinite(yt as any) ? (yt as number) : null;
   const translations = Array.isArray(r.translations) ? r.translations : [];
   const title =
     pickTitle(translations, (desiredLang || "").toLowerCase()) ||
     "Event";
   const yy: EventVM = {
     id: String(r.event_id),
     title: String(title ?? "Event"),
     description: "",
     wiki_url: null,
     video_url: null,
     order_key: 0,
     latitude: r.latitude ?? null,
     longitude: r.longitude ?? null,
     era: r.era ?? null,
     year_from: yearFrom,
     year_to: yearTo,
     exact_date: r.exact_date ?? null,
     location: null,
     image_url: r.image_url ?? null,
   } as any;
   const spn = buildTimelineSpan(yy) || (yearFrom != null || yearTo != null
     ? {
         min: Math.min(yearFrom ?? yearTo ?? 0, yearTo ?? yearFrom ?? 0),
         max: Math.max(yearFrom ?? yearTo ?? 0, yearTo ?? yearFrom ?? 0),
         center: ((yearFrom ?? yearTo ?? 0) + (yearTo ?? yearFrom ?? 0)) / 2,
         start: yearFrom ?? yearTo ?? 0,
       }
     : null);
    return {
      evId: String(r.event_id),
      geId: String(r.group_event_id ?? ""),
      geTitle: null,
      evTitle: String(yy.title || "Event"),
      evRangeLabel: formatEventRange(yy),
      span: spn,
      startYear: spn?.start,
      ev: yy,
    } as any;
 }).filter((x) => x && x.geId && x.evId);
 // filtro su span reale; se manca span includo comunque
 if (!s) { setConcurrentOther([]); return; }
 const overlapping = items.filter((it) => {
 if (!it.span) return false;
 if (spansOverlap(s, it.span, 0)) return true;
 const sMin = Math.round(s.min);
 const sMax = Math.round(s.max);
 const iMin = Math.round(it.span.min);
 const iMax = Math.round(it.span.max);
 return sMin === sMax && iMin === iMax && iMin === sMin;
 });
  overlapping.sort((a, b) => {
  const da = a.startYear != null ? a.startYear : Number.POSITIVE_INFINITY;
  const db = b.startYear != null ? b.startYear : Number.POSITIVE_INFINITY;
  return da - db;
  });
  const limited = overlapping.slice(0, 20);
  if (limited.length) {
    const journeyIds = Array.from(new Set(limited.map((it) => it.geId).filter(Boolean)));
    const { data: journeyRows } = await supabase
      .from("v_journey")
      .select("group_event_id, journey_title, journey_media_first, lang")
      .in("group_event_id", journeyIds);
    if (Array.isArray(journeyRows) && journeyRows.length) {
      const journeyMeta = new Map<string, { title: string | null; coverUrl: string | null }>();
      for (const jid of journeyIds) {
        const rowsForJourney = (journeyRows as any[]).filter((row) => String(row?.group_event_id || "") === jid);
        if (!rowsForJourney.length) continue;
        const title = pickTitle(
          rowsForJourney.map((row) => ({ title: row?.journey_title ?? null, lang: row?.lang })),
          (desiredLang || "").toLowerCase()
        );
        const firstWithCover = rowsForJourney.find((row) => normalizeMediaUrl(row?.journey_media_first ?? null) || row?.journey_media_first);
        const coverUrl =
          normalizeMediaUrl(firstWithCover?.journey_media_first ?? null) ||
          firstWithCover?.journey_media_first ||
          null;
        journeyMeta.set(jid, { title, coverUrl });
      }
      setConcurrentOther(
        limited.map((item) => {
          const meta = journeyMeta.get(item.geId);
          return {
            ...item,
            geTitle: meta?.title ?? item.geTitle ?? null,
            coverUrl: meta?.coverUrl ?? item.coverUrl ?? null,
          };
        })
      );
      return;
    }
  }
  setConcurrentOther(limited);
  } catch { setConcurrentOther([]); }
  })();
}, [rows, activeEventIndex, gid, supabase, resolvedLang, desiredLang]);

const selectedEvent = activeEventIndex >= 0 ? rows[activeEventIndex] : null;
const selectedTimelineItem = timelineData?.items?.find((it) => it.index === activeEventIndex) ?? null;
const selectedTimelineLeftPct = selectedTimelineItem ? Math.max(6, Math.min(94, selectedTimelineItem.progress * 100)) : null;
const selectedTimelineRangeLabel = selectedEvent ? formatEventRange(selectedEvent) : null;
const panelDescription = selectedEvent?.description ?? "";
const mobilePlayerArtwork =
  normalizeMediaUrl(selectedEvent?.event_media_first || null) ||
  normalizeMediaUrl(journeyMediaFirst || null) ||
  null;
const mobilePlayerProgress = audioDuration > 0 ? Math.max(0, Math.min(100, (audioCurrentTime / audioDuration) * 100)) : 0;
const mobilePlayerSeekDisabled = !audioDuration || hasSegmentedMp3;
const mobilePlayerNarrationText = (panelDescription || journeyDescription || "").trim();
const concurrentDisplay = useMemo(() => {
 return concurrentOther || [];
}, [concurrentOther]);
const related = (() => {
 const sel = activeEventIndex >= 0 ? rows[activeEventIndex] : null;
 return sel ? corrByEvent[sel.id] ?? [] : [];
})();
const journeyAndEventMedia = useMemo(() => {
  const collected: MediaItem[] = [];
  if (journeyMedia?.length) collected.push(...journeyMedia);
  rows.forEach((ev) => {
    if (ev?.event_media?.length) collected.push(...ev.event_media);
  });
  return collected.filter((m) => !isAudioMedia(m));
}, [journeyMedia, rows]);

 if (loading) {
 return (
 <div className="flex min-h-screen items-center justify-center bg-white">
 <div className="rounded-2xl border bg-white/70 px-5 py-3 text-sm text-gray-700 shadow">{tUI(uiLang, "journey.loading")}</div>
 </div>
 );
 }

 if (err) {
 return (
 <div className="min-h-screen bg-rose-50 p-6">
 <div className="mx-auto max-w-2xl rounded-2xl border border-red-200 bg-white/70 p-5 text-red-800 shadow">
 <div className="mb-1 text-base font-semibold">{tUI(uiLang, "journey.error")}</div>
 <div className="text-sm">{err}</div>
 <div className="mt-4">
 <button onClick={onBack} className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-1.5 text-sm hover:bg-gray-50 transition">
 <span aria-hidden>?</span> {tUI(uiLang, "journey.back")}
 </button>
 </div>
 </div>
 </div>
 );
 }

 /* ===================== RENDER ===================== */
 return (
  <div
    className="relative flex min-h-screen flex-col overflow-hidden"
    style={
      isLg
        ? undefined
        : {
            marginTop: "calc(-1 * var(--gh-topbar-offset, calc(env(safe-area-inset-top) + 52px)))",
            minHeight: "calc(100dvh + var(--gh-topbar-offset, calc(env(safe-area-inset-top) + 52px)))",
          }
    }
  >
  <div
    aria-hidden
    className="pointer-events-none absolute inset-0 z-0"
    style={{
      backgroundImage: 'url("/bg/login-map.jpg")',
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
      filter: "grayscale(0.15) saturate(0.55) contrast(0.95)",
      opacity: 0.1,
    }}
  />
  <div
    aria-hidden
    className="pointer-events-none absolute inset-0 z-0"
    style={{
      background:
        "radial-gradient(circle at 12% 12%, rgba(199,147,67,0.18), transparent 24%), radial-gradient(circle at 84% 10%, rgba(28,77,117,0.2), transparent 18%), linear-gradient(180deg, rgba(247,244,237,0.7) 0%, rgba(243,239,230,0.92) 48%, rgba(238,233,224,0.98) 100%)",
    }}
  />
  <div className="relative z-10 flex min-h-screen flex-col">
  <style jsx global>{`
    .maplibregl-ctrl-attrib.maplibregl-compact {
      font-size: 0;
      line-height: 0;
    }
    .maplibregl-ctrl-attrib.maplibregl-compact:hover {
      font-size: 11px;
      line-height: 1.2;
    }
    .maplibregl-ctrl-attrib .maplibregl-ctrl-attrib-button {
      width: 22px;
      height: 22px;
      background: #ffffff;
      border-radius: 999px;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.18);
      background-image: none;
    }
    .maplibregl-ctrl-attrib .maplibregl-ctrl-attrib-button::before {
      content: "!";
      display: block;
      font-size: 14px;
      line-height: 22px;
      text-align: center;
      color: #111827;
      font-weight: 700;
    }
    :global(body.ge-map-fullscreen [data-topbar]) {
      display: none !important;
    }
  `}</style>
 {/* ===== MOBILE MAP-FIRST ===== */}
 <section className="fixed inset-x-0 bottom-0 z-[120] lg:hidden" style={{ top: "var(--gh-topbar-height, 52px)" }}>
  <div className="flex h-full flex-col bg-[#050816]">
    <div ref={mobileTopOverlayRef} className="shrink-0">
      <div className="relative w-full border-b border-white/10 bg-[linear-gradient(180deg,rgba(8,10,17,0.94)_0%,rgba(8,10,17,0.82)_100%)] px-3 py-3 text-white backdrop-blur-xl shadow-[0_24px_50px_-32px_rgba(0,0,0,0.78)]">
        <div className="pr-[56px]">
          <div className="flex min-w-0 items-center gap-3">
            <div className="h-9 w-[52px] shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/8">
              {journeyMediaFirst ? (
                <img
                  src={journeyMediaFirst}
                  alt=""
                  aria-hidden="true"
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="h-full w-full bg-[radial-gradient(circle_at_50%_0%,rgba(95,143,255,0.35),transparent_38%),linear-gradient(180deg,#111827_0%,#050816_100%)]" />
              )}
            </div>
            <h1 className="min-w-0 flex-1 truncate text-[24px] font-semibold leading-tight tracking-[-0.03em] text-white">
              {(journeyTitle ?? geTr?.title ?? ge?.title ?? "Journey").toString()}
            </h1>
          </div>
          {mobileJourneyDescOpen ? (
            <div className="mt-1 max-h-[18svh] overflow-y-auto pr-1 whitespace-pre-wrap text-[12px] leading-5 text-white/72" style={{ scrollbarWidth: "thin" }}>
              {journeyDescription || tUI(uiLang, "journey.description.none")}
            </div>
          ) : null}
        </div>
        {timelineData?.items?.length ? (
          <div className="mt-2 border-t border-white/10 pt-2">
            <div className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-white/55">
              <span>{formatTimelineYearLabel(timelineData.min)}</span>
              <span>{formatTimelineYearLabel(timelineData.max)}</span>
            </div>
            <div className="relative h-6 overflow-visible">
              <div className="absolute left-0 right-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-white/14" />
              {selectedTimelineItem && selectedTimelineLeftPct != null ? (
                <div
                  className="pointer-events-none absolute top-[calc(50%+8px)] -translate-x-1/2 rounded-full border border-white/10 bg-[#10131d]/92 px-2 py-[1px] text-[10px] font-semibold whitespace-nowrap text-white/72 shadow-sm"
                  style={{ left: `${selectedTimelineLeftPct}%` }}
                >
                  {selectedTimelineRangeLabel ?? formatTimelineYearLabel(selectedTimelineItem.start)}
                </div>
              ) : null}
              {selectedTimelineItem ? (
                <div
                  className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#f6c86a] shadow-[0_0_0_3px_rgba(246,200,106,0.18)]"
                  style={{ left: `${Math.max(0, Math.min(100, selectedTimelineItem.progress * 100))}%` }}
                  aria-hidden
                />
              ) : null}
              {timelineData.items.map((it) => {
                const active = it.index === activeEventIndex;
                const left = `${Math.max(0, Math.min(100, it.progress * 100))}%`;
                return (
                  <button
                    key={`mtl-top-${it.ev.id}-${it.index}`}
                    onClick={() => handleSelectEvent(it.index)}
                    className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${
                      active ? "border-white bg-[#f6c86a] shadow-[0_0_0_2px_rgba(246,200,106,0.18)]" : "border-white/28 bg-[#121724]"
                    }`}
                    style={{ left }}
                    aria-label={`Evento ${it.index + 1}`}
                    title={it.ev.title}
                  />
                );
              })}
            </div>
          </div>
        ) : null}
        {mobileTopTabOpen && mobileTab === "event" ? (
          <div ref={mobileTopTabRef} className="mt-2 rounded-2xl border border-white/10 bg-white/8 p-2.5 text-white shadow-[0_18px_42px_-26px_rgba(0,0,0,0.72)] backdrop-blur-md">
            <div className="space-y-2">
              <div className="max-h-[16svh] overflow-y-auto whitespace-pre-wrap text-[12px] leading-5 text-white/76" style={{ scrollbarWidth: "thin" }}>
                {panelDescription}
              </div>
              {selectedEvent?.video_url ? (
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={selectedEvent.video_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/10 px-3 py-1 text-[12px] font-semibold text-white"
                    title="Guarda il video dell'evento"
                  >
                    {tUI(uiLang, "journey.video.open")}
                  </a>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        {mobileTopTabOpen && mobileTab === "related" ? (
          <div ref={mobileTopTabRef} className="mt-2 rounded-2xl border border-white/10 bg-white/8 p-2.5 text-white shadow-[0_18px_42px_-26px_rgba(0,0,0,0.72)] backdrop-blur-md">
            {related?.length ? (
              <ul className="grid max-h-[22svh] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3" style={{ scrollbarWidth: "thin" }}>
                {related.map((r) => (
                  <Scorecard
                    key={r.id}
                    href={geUrl(r.id)}
                    title={r.title ?? r.slug ?? "Journey"}
                    coverUrl={r.coverUrl}
                    ctaLabel=""
                    compact
                    className="shadow-none"
                  />
                ))}
              </ul>
            ) : (
              <div className="text-[12.5px] text-white/60">
                {tUI(uiLang, "journey.related.none")}
              </div>
            )}
          </div>
        ) : null}
      </div>
      <div
        ref={(node) => {
          mobileBandOverlayRef.current = node;
          bandRef.current = node;
        }}
        className="overflow-x-auto border-t border-white/10 bg-[linear-gradient(180deg,rgba(8,10,17,0.9)_0%,rgba(8,10,17,0.78)_100%)] px-3 pt-1 pb-0 backdrop-blur-xl"
        style={{ scrollbarWidth: "thin" }}
      >
        <div className="flex min-w-max items-stretch gap-2 snap-x snap-mandatory">
          {rows.map((ev, idx) => {
            const active = idx === activeEventIndex;
            const fromY = signedYear(ev.year_from, ev.era);
            const toY = signedYear(ev.year_to, ev.era);
            const fromLabel = fromY != null ? formatTimelineYearLabel(fromY) : "";
            const toLabel = toY != null ? formatTimelineYearLabel(toY) : "";
            const info = [fromLabel, toLabel, ev.location || ""].filter(Boolean).join(" - ");
            return (
              <button
                key={ev.id}
                ref={(el) => { if (el) bandItemRefs.current.set(ev.id, el); }}
                onClick={() => handleSelectEvent(idx)}
                className={`snap-center h-[56px] w-[74vw] max-w-[320px] shrink-0 rounded-2xl border px-2.5 py-1.5 text-left transition ${
                  active ? "border-[#f6c86a]/45 bg-[linear-gradient(135deg,rgba(246,200,106,0.18),rgba(255,255,255,0.06))] text-white shadow-[0_18px_38px_-22px_rgba(0,0,0,0.82)]" : "border-white/10 bg-white/6 text-white/88 shadow-[0_18px_38px_-24px_rgba(0,0,0,0.72)]"
                }`}
                title={ev.title}
              >
                <div className="flex items-start gap-2">
                  <div
                    className="mt-0.5 inline-flex h-9 w-7 shrink-0 flex-col items-center justify-center rounded-md text-[10px] leading-tight"
                    style={
                      active
                        ? { backgroundColor: "#f6c86a", color: "#0b1020" }
                        : { backgroundColor: "#182033", color: "#ffffff" }
                    }
                  >
                    <span>{idx + 1}</span>
                    <span className="text-[9px]">/{rows.length}</span>
                  </div>
                  <div className="min-w-0 leading-tight">
                    <div className={`truncate text-[12px] font-semibold ${active ? "text-white" : "text-white/90"}`}>
                      {ev.title}
                    </div>
                    <div className={`truncate text-[10.5px] ${active ? "text-white/74" : "text-white/56"}`}>
                      {info}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
    <div className="relative min-h-[260px] flex-1 overflow-hidden bg-[#0b1020]">
      <div
        ref={mobileMapHostRef}
        data-map="gehj"
        key={`map-mobile-${gid ?? "unknown"}`}
        className="h-full w-full overflow-hidden bg-[#0b1020]"
        aria-label="Map canvas"
      />
      {mobileTopMediaOpen ? (
        <div
          className="pointer-events-none absolute z-20"
          style={{ left: "12px", right: "72px", bottom: "14px" }}
        >
          <div
            ref={mobileMediaRef}
            className="pointer-events-auto overflow-hidden rounded-[24px] border border-white/10 bg-[rgba(9,16,29,0.9)] p-2 shadow-[0_26px_52px_-24px_rgba(0,0,0,0.95)] backdrop-blur-xl"
          >
            {journeyMedia?.length ? (
              <MediaBox
                items={journeyMedia}
                firstPreview={journeyMediaFirst || undefined}
                onOpenOverlay={openOverlay}
                hideHeader
                compact
                height="sm"
                hoverPreviewList
                alwaysShowList
                hoverPreviewDirection="horizontal"
                listMaxHeight="92px"
              />
            ) : (
              <div className="flex h-[132px] items-center justify-center rounded-[18px] border border-dashed border-white/12 bg-white/6 text-xs text-white/60">
                Nessun media del journey
              </div>
            )}
          </div>
        </div>
      ) : null}
      {!mapLoaded && (
        <div className="absolute left-3 top-3 z-10 rounded-full border border-indigo-200 bg-indigo-50/90 px-3 py-1 text-xs text-indigo-900 shadow">
          Inizializzazione mappa.
        </div>
      )}
      <div
        className="pointer-events-none absolute z-20"
        style={{ top: "12px", left: "12px" }}
      >
        <div className="pointer-events-auto flex flex-col items-start gap-3">
          <button
            type="button"
            onClick={() => setMobileJourneyMenuOpen((v) => !v)}
            className={`inline-flex h-12 w-12 items-center justify-center rounded-full border text-white shadow-[0_16px_28px_-20px_rgba(0,0,0,0.82)] backdrop-blur-xl transition ${
              mobileJourneyMenuOpen
                ? "border-[#f6c86a]/75 bg-[#f6c86a]/28 ring-2 ring-[#f6c86a]/24"
                : "border-white/90 bg-[#050816]"
            }`}
            aria-label="Apri menu journey"
            title="Apri menu journey"
          >
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M6 7h12M6 12h12M6 17h8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
          {mobileJourneyMenuOpen ? (
            <div className="overflow-hidden rounded-[18px] border border-transparent bg-transparent p-1 shadow-none backdrop-blur-0">
              <div className="flex flex-col items-start gap-1">
                <button
                  onClick={toggleFavourite}
                  disabled={!group_event_id || savingFav}
                  aria-pressed={isFav}
                  className={`inline-flex h-11 w-11 items-center justify-center rounded-full border text-white shadow-[0_10px_18px_-14px_rgba(0,0,0,0.68)] transition ${isFav ? "border-rose-400/60 bg-[#2a0f14] text-rose-200 ring-2 ring-rose-400/16" : "border-white/20 bg-[#09101d]/88"}`}
                  aria-label={isFav ? "Rimuovi dai preferiti" : "Aggiungi ai preferiti"}
                >
                  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 6 4 4 6.5 4c1.74 0 3.41 1.01 4.22 2.53C11.09 5.01 12.76 4 14.5 4 17 4 19 6 19 8.5c0 3.78-3.4 6.86-8.55 11.54z" fill={isFav ? "#ef4444" : "none"} stroke={isFav ? "#ef4444" : "currentColor"} strokeWidth="1.6" />
                  </svg>
                </button>
                {group_event_id ? <RatingStars group_event_id={group_event_id} journeyId={group_event_id} size={17} compact allowTextFeedback compactStatsClassName="text-white/95" compactWrapClassName="inline-flex h-11 items-center justify-center rounded-full border border-white/20 bg-[#09101d]/88 px-2.5 shadow-[0_10px_18px_-14px_rgba(0,0,0,0.68)]" /> : null}
                <button
                  onClick={() => setMobileJourneyDescOpen((v) => !v)}
                  className={`inline-flex h-11 w-11 items-center justify-center rounded-full border text-white shadow-[0_10px_18px_-14px_rgba(0,0,0,0.68)] transition ${mobileJourneyDescOpen ? "border-[#f6c86a]/75 bg-[#f6c86a]/28 ring-2 ring-[#f6c86a]/16" : "border-white/20 bg-[#09101d]/88"}`}
                  title={mobileJourneyDescOpen ? tUI(uiLang, "journey.description.hide") : tUI(uiLang, "journey.description.show")}
                  aria-label={mobileJourneyDescOpen ? tUI(uiLang, "journey.description.hide") : tUI(uiLang, "journey.description.show")}
                >
                  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                    <path d="M5 7h14M5 12h10M5 17h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
                <button
                  onClick={openQuiz}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-[#09101d]/88 text-[17px] font-semibold text-white shadow-[0_10px_18px_-14px_rgba(0,0,0,0.68)]"
                  title={tUI(uiLang, "journey.quiz.open")}
                  aria-label={tUI(uiLang, "journey.quiz.open")}
                >
                  ?
                </button>
                <button
                  onClick={() => {
                    setMobileTopMediaOpen((v) => !v);
                    setMobilePlayerOpen(false);
                  }}
                  className={`inline-flex h-11 w-11 items-center justify-center rounded-full border text-white shadow-[0_10px_18px_-14px_rgba(0,0,0,0.68)] transition ${mobileTopMediaOpen ? "border-[#f6c86a]/75 bg-[#f6c86a]/28 ring-2 ring-[#f6c86a]/16" : "border-white/20 bg-[#09101d]/88"}`}
                  title={mobileTopMediaOpen ? tUI(uiLang, "journey.player.close") : tUI(uiLang, "journey.player.open")}
                  aria-label={mobileTopMediaOpen ? tUI(uiLang, "journey.player.close") : tUI(uiLang, "journey.player.open")}
                >
                  <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
                    {mobileTopMediaOpen ? (
                      <>
                        <rect x="4" y="5" width="12.5" height="14" rx="2.7" fill="currentColor" opacity="0.24" />
                        <rect x="4" y="5" width="12.5" height="14" rx="2.7" fill="none" stroke="currentColor" strokeWidth="2" />
                        <path d="M9.1 8.6 14.6 12l-5.5 3.4V8.6Z" fill="currentColor" />
                        <path d="M20.2 8.8 16.1 12l4.1 3.2V8.8Z" fill="currentColor" />
                      </>
                    ) : (
                      <>
                        <rect x="4" y="5" width="12.5" height="14" rx="2.7" fill="currentColor" opacity="0.2" />
                        <rect x="4" y="5" width="12.5" height="14" rx="2.7" fill="none" stroke="currentColor" strokeWidth="2" />
                        <path d="M8.6 8.2 14.8 12l-6.2 3.8V8.2Z" fill="currentColor" />
                        <path d="M20.2 8.8 16.1 12l4.1 3.2V8.8Z" fill="currentColor" opacity="0.96" />
                      </>
                    )}
                  </svg>
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <div
        className="pointer-events-none absolute z-20"
        style={{ right: "10px", bottom: "12px" }}
      >
        <div className="pointer-events-auto flex flex-col-reverse items-end gap-3">
          <button
            type="button"
            onClick={() => setMobileEventMenuOpen((v) => !v)}
            className={`inline-flex h-12 w-12 items-center justify-center rounded-full border text-white shadow-[0_16px_28px_-20px_rgba(0,0,0,0.82)] backdrop-blur-xl transition ${
              mobileEventMenuOpen || mobilePlayerOpen || mobileTopTabOpen
                ? "border-[#f6c86a]/75 bg-[#f6c86a]/28 ring-2 ring-[#f6c86a]/24"
                : "border-white/90 bg-[#050816]"
            }`}
            aria-label="Apri menu evento"
            title="Apri menu evento"
          >
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M6 7h12M6 12h12M10 17h8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
          {mobileEventMenuOpen ? (
            <div className="overflow-hidden rounded-[18px] border border-transparent bg-transparent p-1 shadow-none backdrop-blur-0">
              <div className="flex flex-col-reverse items-end gap-1">
                <button
                  onClick={() => setMobilePlayerOpen((v) => !v)}
                  className={`inline-flex h-11 w-11 items-center justify-center rounded-full border text-white shadow-[0_10px_18px_-14px_rgba(0,0,0,0.68)] transition ${mobilePlayerOpen ? "border-[#f6c86a]/75 bg-[#f6c86a]/28 ring-2 ring-[#f6c86a]/16" : "border-white/20 bg-[#09101d]/88"}`}
                  title={tUI(uiLang, "journey.player.open")}
                  aria-label={tUI(uiLang, "journey.player.open")}
                >
                  <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
                    {mobilePlayerOpen ? (
                      <path d="M6 5h3v14H6zm9 0h3v14h-3z" fill="currentColor" />
                    ) : (
                      <path d="M7.2 5.4 18.4 12 7.2 18.6V5.4Z" fill="currentColor" />
                    )}
                  </svg>
                </button>
                <button
                  onClick={() => {
                    const nextOpen = !(mobileTopTabOpen && mobileTab === "event");
                    setMobileTab("event");
                    setMobileTopTabOpen(nextOpen);
                    if (nextOpen) {
                      setMobileTopMediaOpen(false);
                      window.setTimeout(() => {
                        mobileTopTabRef.current?.scrollIntoView({ block: "nearest" });
                      }, 0);
                    }
                  }}
                  className={`inline-flex h-11 w-11 items-center justify-center rounded-full border text-white shadow-[0_10px_18px_-14px_rgba(0,0,0,0.68)] transition ${mobileTab === "event" && mobileTopTabOpen ? "border-[#f6c86a]/75 bg-[#f6c86a]/28 ring-2 ring-[#f6c86a]/16" : "border-white/20 bg-[#09101d]/88"}`}
                  title={tUI(uiLang, "journey.tab.description")}
                  aria-label={tUI(uiLang, "journey.tab.description")}
                >
                  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                    <path d="M5 7h14M5 12h14M5 17h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
                <button
                  onClick={() => {
                    const nextOpen = !(mobileTopTabOpen && mobileTab === "related");
                    setMobileTab("related");
                    setMobileTopTabOpen(nextOpen);
                    if (nextOpen) {
                      setMobileTopMediaOpen(false);
                      window.setTimeout(() => {
                        mobileTopTabRef.current?.scrollIntoView({ block: "nearest" });
                      }, 0);
                    }
                  }}
                  className={`inline-flex h-11 w-11 items-center justify-center rounded-full border text-white shadow-[0_10px_18px_-14px_rgba(0,0,0,0.68)] transition ${mobileTab === "related" && mobileTopTabOpen ? "border-[#f6c86a]/75 bg-[#f6c86a]/28 ring-2 ring-[#f6c86a]/16" : "border-white/20 bg-[#09101d]/88"}`}
                  title={tUI(uiLang, "journey.related.title")}
                  aria-label={tUI(uiLang, "journey.related.title")}
                >
                  <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
                    <rect x="5" y="6" width="8.5" height="11" rx="2.1" fill="none" stroke="currentColor" strokeWidth="1.9" />
                    <rect x="10.5" y="4.5" width="8.5" height="11" rx="2.1" fill="none" stroke="currentColor" strokeWidth="1.9" opacity="0.92" />
                    <path d="M8.4 11.5h5.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path d="M11.8 9.2 14.7 11.5 11.8 13.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {selectedEvent?.wiki_url ? (
                  <a
                    href={selectedEvent.wiki_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/20 bg-[#09101d]/88 text-white shadow-[0_10px_18px_-14px_rgba(0,0,0,0.68)]"
                    title={tUI(uiLang, "journey.tab.wiki")}
                    aria-label={tUI(uiLang, "journey.tab.wiki")}
                  >
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#0b1020] ring-1 ring-white/10">
                      <img
                        src="/icons/Wiki.png"
                        alt=""
                        aria-hidden="true"
                        className="h-10 w-10 rounded-full object-cover opacity-95 brightness-110"
                        loading="lazy"
                      />
                    </span>
                  </a>
                ) : (
                  <span
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/14 bg-[#101520]/90 text-white/42 shadow-[0_10px_18px_-14px_rgba(0,0,0,0.68)]"
                    title={tUI(uiLang, "journey.tab.wiki")}
                    aria-label={tUI(uiLang, "journey.tab.wiki")}
                  >
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#0b1020] ring-1 ring-white/10">
                      <img
                        src="/icons/Wiki.png"
                        alt=""
                        aria-hidden="true"
                        className="h-10 w-10 rounded-full object-cover opacity-38 grayscale"
                        loading="lazy"
                      />
                    </span>
                  </span>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
    <div
      ref={mobileConcurrentRef}
      className="shrink-0 border-t border-white/10 border-b border-white/10 bg-[linear-gradient(180deg,rgba(8,10,17,0.92)_0%,rgba(8,10,17,0.98)_100%)] text-white backdrop-blur-xl"
    >
      <div className="px-3 py-2.5">
        <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-white/52">
          {tUI(uiLang, "journey.concurrent.title")}
        </div>
        {concurrentOther && concurrentOther.length ? (
          <div className="overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
            <div className="flex min-w-full gap-3 px-1">
              {concurrentOther.map((c) => (
                <button
                  key={`${c.geId}:${c.evId}`}
                  type="button"
                  onClick={() => router.push(geUrl(c.geId, c.evId))}
                  className="w-[84vw] max-w-none shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/6 text-left shadow-[0_18px_38px_-24px_rgba(0,0,0,0.76)]"
                  title={c.geTitle ?? c.evTitle}
                >
                  <div className="flex items-stretch gap-3 p-3">
                    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-[#111827]">
                      {c.coverUrl ? (
                        <img
                          src={c.coverUrl}
                          alt=""
                          aria-hidden="true"
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#182033,#0b1020)] text-[9px] font-semibold uppercase tracking-wide text-white/55">
                          GH
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="line-clamp-1 text-[11px] font-semibold text-white/62">
                        {c.geTitle ?? c.evTitle}
                      </div>
                      <div className="line-clamp-2 text-[13px] font-medium leading-5 text-white">
                        {c.evTitle}
                      </div>
                      {c.evRangeLabel ? (
                        <div className="text-[11px] text-white/56">
                          {c.evRangeLabel}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="px-1 text-[11px] text-white/56">
            {tUI(uiLang, "journey.concurrent.none")}
          </div>
        )}
      </div>
    </div>
  </div>
 </section>

   {/* ===== DESKTOP (container allargato) ===== */}
<div className="mx-auto hidden w-full max-w-[120rem] lg:block">
  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)] gap-3 px-4 py-6 items-stretch">
    {/* Sinistra: Titolo + Media Journey */}
    <div className="flex flex-col gap-3 h-full">
      <div className={`${BOX_3D} p-3 flex flex-col gap-2 h-[440px] overflow-hidden`}>
        <h1 className="text-base lg:text-xl font-semibold text-slate-900 leading-snug break-words whitespace-pre-line line-clamp-2">
          {(journeyTitle ?? geTr?.title ?? ge?.title ?? "Journey").toString()}
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleFavourite}
            disabled={!group_event_id || savingFav}
            aria-pressed={isFav}
            className={`inline-flex items-center justify-center rounded-full p-1.5 text-2xl transition focus:outline-none focus:ring-2 focus:ring-rose-300/60 ${
              isFav ? "text-rose-600 hover:text-rose-700" : "text-slate-400 hover:text-slate-600"
            }`}
            aria-label={isFav ? "Rimuovi dai preferiti" : "Aggiungi ai preferiti"}
          >
            <span className="sr-only">{isFav ? "Rimuovi dai preferiti" : "Aggiungi dai preferiti"}</span>
            <span aria-hidden className="inline-flex h-7 w-7 items-center justify-center">
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                aria-hidden="true"
                className="transition-colors"
              >
                <path
                  d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 6 4 4 6.5 4c1.74 0 3.41 1.01 4.22 2.53C11.09 5.01 12.76 4 14.5 4 17 4 19 6 19 8.5c0 3.78-3.4 6.86-8.55 11.54z"
                  fill={isFav ? "currentColor" : "none"}
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
              </svg>
            </span>
          </button>
          {group_event_id ? <RatingStars group_event_id={group_event_id} journeyId={group_event_id} size={18} allowTextFeedback /> : null}
          <button
            onClick={openQuiz}
            className="ml-auto inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold text-white shadow-[0_8px_20px_rgba(15,60,140,0.35)] ring-1 ring-white/15 transition hover:-translate-y-[1px] hover:shadow-[0_10px_22px_rgba(15,60,140,0.42)] focus:outline-none focus:ring-2 focus:ring-indigo-300"
            style={{ background: "linear-gradient(120deg, #0f3c8c 0%, #1a64d6 100%)" }}
            title={tUI(uiLang, "journey.quiz.open")}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className="drop-shadow-sm">
              <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" stroke="currentColor" strokeWidth="1.8" fill="none" />
              <path d="M12 16.5v.2" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
              <path d="M9.75 9.4c0-1.3 1.1-2.35 2.45-2.35 1.2 0 2.3.85 2.3 2.05 0 1.6-1.85 1.95-2.3 3.1-.14.36-.2.78-.2 1.2" stroke="currentColor" strokeWidth="1.9" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Quiz</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto text-[12.5px] leading-5 text-gray-700 whitespace-pre-wrap text-justify" style={{ scrollbarWidth: "thin" }}>
          {journeyDescription || tUI(uiLang, "journey.description.none")}
        </div>
      </div>

      <div className="flex-[0.6]">
        {journeyAndEventMedia?.length ? (
          <MediaBox
            items={journeyAndEventMedia}
            firstPreview={journeyMediaFirst || undefined}
            onOpenOverlay={openOverlay}
            hideHeader
            height="xl"
            compact
            hoverPreviewList
            alwaysShowList
            hoverPreviewDirection="vertical"
            listMaxHeight="100%"
          />
        ) : (
          <div className="h-full min-h-[220px] w-full rounded-xl bg-slate-100 flex items-center justify-center text-xs text-slate-500">
            Nessun media del journey
          </div>
        )}
      </div>
    </div>

    {/* Centro: Eventi verticali + Contemporanei + Connected */}
    <div className="flex flex-col gap-3 h-full">
      <div className={`${BOX_3D} p-3 flex flex-col h-[380px]`}>
        <div className="flex items-center justify-between">
          <div className="text-[12px] font-semibold text-gray-800">Eventi</div>
          {rows.length ? (
            <div className="text-[11.5px] text-gray-600">
              Evento <span className="font-medium">{Math.max(1, Math.min(rows.length, activeEventIndex + 1))}</span> / <span className="font-medium">{rows.length}</span>
            </div>
          ) : null}
        </div>
        <div className="mt-2 flex-1 overflow-y-auto pr-1 space-y-2" style={{ scrollbarWidth: "thin" }} ref={listRef}>
          {rows.map((ev, idx) => {
            const active = idx === activeEventIndex;
            const fromY = signedYear(ev.year_from, ev.era);
            const toY = signedYear(ev.year_to, ev.era);
            const fromLabel = fromY != null ? formatTimelineYearLabel(fromY) : "";
            const toLabel = toY != null ? formatTimelineYearLabel(toY) : "";
            const info = [fromLabel, toLabel, ev.location || ""].filter(Boolean).join(" - ");
            return (
              <button
                key={ev.id}
                ref={(el) => { if (el) listItemRefs.current.set(ev.id, el); }}
                onClick={() => handleSelectEvent(idx)}
                className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                  active ? "text-white shadow-sm" : "border-black/10 bg-white/80 text-gray-800 hover:bg-white"
                }`}
                style={active ? { borderColor: BRAND_BLUE, backgroundColor: BRAND_BLUE } : undefined}
                title={ev.title}
              >
                <div className="flex items-start gap-2">
                  <div
                    className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px]"
                    style={
                      active
                        ? { backgroundColor: "#ffffff", color: BRAND_BLUE }
                        : { backgroundColor: BRAND_BLUE, color: "#ffffff" }
                    }
                  >
                    {idx + 1}
                  </div>
                  <div className="min-w-0 leading-tight">
                    <div className={`truncate text-[13px] font-semibold ${active ? "text-white" : "text-gray-900"}`}>
                      {ev.title}
                    </div>
                    <div className={`truncate text-[11.5px] ${active ? "text-white/85" : "text-gray-600"}`}>
                      {info}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className={`${BOX_3D} p-3 h-[180px] flex flex-col`}>
        <div className="text-[12px] font-semibold text-slate-800">
          {tUI(uiLang, "journey.concurrent.title")}
        </div>
        {concurrentDisplay && concurrentDisplay.length ? (
          <div className="mt-2 flex-1 overflow-y-auto pr-1 space-y-2" style={{ scrollbarWidth: "thin" }}>
            {concurrentDisplay.map((c) => {
              return (
                <ConcurrentJourneyCard
                  key={`${c.geId}:${c.evId}`}
                  item={c}
                  href={geUrl(c.geId, c.evId)}
                  onClick={() => router.push(geUrl(c.geId, c.evId))}
                />
              );
            })}
          </div>
        ) : (
 <div className="mt-2 flex flex-1 items-start justify-start rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
  {tUI(uiLang, "journey.concurrent.none")}
 </div>
        )}
      </div>

      <div className={`${BOX_3D} p-3 h-[145px] flex flex-col`}>
      <div className="text-[12px] font-semibold text-gray-800">
        {tUI(uiLang, "journey.related.title")}
      </div>
        {related?.length ? (
          <ul className="mt-2 grid flex-1 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3" style={{ scrollbarWidth: "thin" }}>
            {related.map((r) => (
              <Scorecard
                key={r.id}
                href={geUrl(r.id)}
                title={r.title ?? r.slug ?? "Journey"}
                coverUrl={r.coverUrl}
                ctaLabel=""
                compact
                className="shadow-none"
              />
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-slate-500">
            {tUI(uiLang, "journey.related.none")}
          </p>
        )}
      </div>
    </div>

    {/* Destra: Timeline + Descrizione + Mappa */}
    <section className={`${BOX_3D} p-3 flex flex-col gap-1 h-[730px]`}>
      <div className="pt-0 pb-1 shrink-0">
        <Timeline3D />
      </div>
 
        <div className="p-2 pt-0 flex flex-col flex-[0.7] min-h-[160px] overflow-hidden">
                <div className="flex-1 overflow-y-auto pr-2 text-[12.5px] leading-5 text-gray-800 whitespace-pre-wrap text-justify" style={{ scrollbarWidth: "thin" }}>
          {panelDescription}
        </div>
      </div>

      <section
        className={
          mapMode === "fullscreen"
            ? "fixed inset-0 z-[5000] bg-white"
            : `${BOX_3D} relative flex-[1.9] min-h-[420px] overflow-hidden`
        }
      >
        <div
          ref={desktopMapHostRef}
          data-map="gehj"
          key={`map-desktop-${gid ?? "unknown"}`}
          className={
            mapMode === "fullscreen"
              ? "absolute inset-0 rounded-none overflow-hidden"
              : "h-full w-full bg-[linear-gradient(180deg,#eef2ff,transparent)]"
          }
          aria-label="Map canvas"
        />
        {!mapLoaded && (
          <div className="absolute left-3 top-3 z-10 rounded-full border border-indigo-200 bg-indigo-50/90 px-3 py-1 text-xs text-indigo-900 shadow">
            Inizializzazione mappa.
          </div>
        )}
        {renderMapPlayerBox()}
      </section>
    </section>
  </div>
 </div>
 </div>

  {!isLg && mobilePlayerOpen ? (
    <div className="fixed inset-0 z-[5400] overflow-hidden bg-[#090b12]" role="dialog" aria-modal="true">
      <div className="absolute inset-0">
        {mobilePlayerArtwork ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mobilePlayerArtwork}
            alt=""
            aria-hidden="true"
            className="h-full w-full object-cover opacity-40 blur-[2px] scale-105"
          />
        ) : null}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(72,116,255,0.22),transparent_32%),linear-gradient(180deg,rgba(3,5,10,0.22)_0%,rgba(7,10,18,0.74)_32%,rgba(8,10,17,0.96)_100%)]" />
      </div>

      <div className="relative z-10 flex h-full flex-col px-5 pb-8 pt-[max(0.35rem,env(safe-area-inset-top))] text-white">
        <div className="mt-1 flex-1 flex flex-col justify-start">
          <div className="overflow-hidden rounded-[28px] border border-white/10 bg-white/6 shadow-[0_28px_60px_-30px_rgba(0,0,0,0.8)] backdrop-blur-md">
            <div className="grid grid-cols-[96px_minmax(0,1fr)_auto] gap-4 p-4">
              <div className="relative h-28 w-24 shrink-0 overflow-hidden rounded-[22px] border border-white/10 bg-white/8">
                {mobilePlayerArtwork ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={mobilePlayerArtwork}
                    alt={selectedEvent?.title || (journeyTitle ?? geTr?.title ?? ge?.title ?? "Journey")}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full bg-[radial-gradient(circle_at_50%_0%,rgba(95,143,255,0.4),transparent_38%),linear-gradient(180deg,#111827_0%,#050816_100%)]" />
                )}
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,10,18,0.08)_0%,rgba(7,10,18,0.38)_100%)]" />
              </div>
              <div className="min-w-0 flex-1 overflow-hidden">
                {selectedTimelineRangeLabel ? (
                  <div className="mb-2 inline-flex rounded-full bg-white/12 px-3 py-1 text-[11px] font-semibold text-white/82 backdrop-blur">
                    {selectedTimelineRangeLabel}
                  </div>
                ) : null}
                <div className="line-clamp-3 min-h-[4.5rem] text-[1.28rem] font-semibold leading-[1.12] tracking-[-0.02em] text-white">
                  {selectedEvent?.title || (journeyTitle ?? geTr?.title ?? ge?.title ?? "Journey")}
                </div>
                {selectedEvent?.location ? (
                  <div className="mt-2 line-clamp-2 text-sm text-white/72">
                    {selectedEvent.location}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setMobilePlayerOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center self-start rounded-full bg-white/10 text-white backdrop-blur ring-1 ring-white/15"
                aria-label={tUI(uiLang, "journey.player.close")}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                  <path d="m7 7 10 10M17 7 7 17" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            <div className="px-4 pb-3">
              <div className="overflow-hidden rounded-[22px] border border-white/10 bg-[#0b1020]/40 shadow-[0_18px_36px_-24px_rgba(0,0,0,0.75)]">
                <div
                  ref={mobilePlayerMapHostRef}
                  className="h-[230px] w-full"
                  aria-label="Player event map"
                />
              </div>
            </div>
            <div className="border-t border-white/10 px-4 pb-3 pt-2.5">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/48">
                Testo audio
              </div>
              <div className="max-h-[17vh] overflow-y-auto pr-1 text-[13px] leading-5.5 text-white/84" style={{ scrollbarWidth: "thin" }}>
                {mobilePlayerNarrationText || "Nessun testo disponibile per questo segmento audio."}
              </div>
            </div>
          </div>

          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between text-[12px] font-medium text-white/72">
              <span>{formatClockTime(audioCurrentTime)}</span>
              <span>{audioDuration ? formatClockTime(audioDuration) : "--:--"}</span>
            </div>
            <input
              type="range"
              min={0}
              max={audioDuration || 1}
              step="0.1"
              value={Math.min(audioCurrentTime, audioDuration || 1)}
              onChange={(e) => handleMobilePlayerSeek(Number(e.target.value))}
              disabled={mobilePlayerSeekDisabled}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-[#f6c86a] disabled:cursor-default disabled:opacity-60"
              aria-label="Audio progress"
            />
          </div>

          <div className="mt-6 flex items-center gap-2">
            {audioSourceOptions.length ? (
              <select
                value={audioSource}
                onChange={(e) => setAudioSource(e.target.value)}
                className="h-11 w-[92px] min-w-[92px] shrink-0 rounded-full border border-white/15 bg-white/10 px-3 text-[11px] font-semibold text-white backdrop-blur outline-none"
                title="Audio"
              >
                {audioSourceOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : (
              <div className="h-11 w-[92px] min-w-[92px] shrink-0 rounded-full border border-white/10 bg-white/6 px-3 py-3 text-[11px] text-white/60">
                Nessuna traccia audio disponibile
              </div>
            )}
            <button
              type="button"
              onClick={handlePrevEvent}
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/15 backdrop-blur transition hover:bg-white/15"
              aria-label="Evento precedente"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2.1" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              onClick={togglePlay}
              className="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white/18 text-white shadow-[0_18px_40px_-20px_rgba(0,0,0,0.85)] ring-1 ring-white/20 backdrop-blur transition hover:bg-white/24"
              aria-label={isPlaying ? "Ferma autoplay" : "Avvia autoplay"}
            >
              {isPlaying ? (
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                  <rect x="6" y="5" width="4" height="14" fill="currentColor" rx="1" />
                  <rect x="14" y="5" width="4" height="14" fill="currentColor" rx="1" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                  <path d="M8 5l10 7-10 7V5Z" fill="currentColor" />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={handleNextEvent}
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/15 backdrop-blur transition hover:bg-white/15"
              aria-label="Evento successivo"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.1" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => {
                if (!selectedEvent || selectedEvent.latitude == null || selectedEvent.longitude == null) return;
                setMobilePlayerOpen(false);
                setMapViewportMode("focus-selected");
                moveMapToVisibleCenter(selectedEvent.longitude, selectedEvent.latitude);
              }}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/15 backdrop-blur"
              aria-label="Centra evento selezionato"
              title="Centra evento selezionato"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
                <path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  ) : null}

  <audio ref={audioRef} preload="none" className="hidden" />
  <audio ref={jingleAudioRef} preload="auto" className="hidden" />

  {/* Overlay/Full-screen player */}
  <QuizOverlay open={quizOpen} onClose={closeQuiz} src={quizUrl} />
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

function ConcurrentJourneyCard({
  item,
  href,
  onClick,
}: {
  item: ConcurrentJourney;
  href: string;
  onClick?: () => void;
}) {
  const eventLine = item.evRangeLabel ? `${item.evRangeLabel} - ${item.evTitle}` : item.evTitle;
  return (
    <a
      href={href}
      onClick={(e) => {
        if (!onClick) return;
        e.preventDefault();
        onClick();
      }}
      className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
      title={`${item.geTitle ?? "Journey"} - ${eventLine}`}
    >
      <div
        className="h-10 shrink-0 overflow-hidden rounded-lg bg-slate-100"
        style={{ aspectRatio: "5 / 3" }}
      >
        {item.coverUrl ? (
          <img
            src={item.coverUrl}
            alt={item.geTitle ?? "Journey cover"}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#dbeafe,#e2e8f0)] text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            Journey
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] font-semibold leading-5 text-slate-900">
          {item.geTitle ?? "Journey"}
        </div>
        <div className="truncate text-[12px] leading-5 text-slate-600">
          {eventLine}
        </div>
      </div>
    </a>
  );
}
function buildJingleDataUri() {
  const sampleRate = 22050;
  const durationSec = 0.25;
  const freq = 880;
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i += 1) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // PCM
  view.setUint16(20, 1, true); // format
  view.setUint16(22, 1, true); // channels
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  const amp = 0.4;
  for (let i = 0; i < numSamples; i += 1) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * freq * t) * amp;
    view.setInt16(44 + i * 2, sample * 32767, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return `data:audio/wav;base64,${btoa(binary)}`;
}
