// frontend/app/module/group_event/page_inner.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback, CSSProperties } from "react";
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
 const to = typeof e.year_to === "number" ? e.year_to : null;
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
  const bucketMatch = withForwardSlashes.match(/^((journey-covers|media)\/.+)$/i);
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
  return {
    ...m,
    type: looksVideo ? "video" : m.type,
    url: normalizedUrl || m.url,
    preview: fallbackPreview || null,
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
  const type =
    raw.type ||
    raw.media_type ||
    (looksLikeVideo ? "video" : "image");
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
    <div className="fixed inset-0 z-[5200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="relative h-[82vh] w-full max-w-6xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/10">
        <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
          {!loaded ? (
            <div className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900 shadow-sm ring-1 ring-amber-200">
              Caricamento...
            </div>
          ) : null}
          <button
            onClick={onClose}
            className="inline-flex h-9 items-center gap-2 rounded-full bg-white/95 px-3 text-sm font-semibold text-slate-700 shadow-lg ring-1 ring-black/10 transition hover:bg-white hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-indigo-300"
            aria-label="Chiudi quiz"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path d="m7 7 10 10M17 7 7 17" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Chiudi
          </button>
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
}: {
 items: MediaItem[];
 firstPreview?: string | null;
 onOpenOverlay: (item: MediaItem, opts?: { autoplay?: boolean }) => void;
 compact?: boolean;
 hideHeader?: boolean;
 height?: "xs" | "sm" | "md" | "lg";
 hoverPreviewList?: boolean;
 hoverPreviewDirection?: "vertical" | "horizontal";
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
 return (
 <div className={`rounded-2xl border border-slate-200 bg-white/90 shadow-sm ${compact ? "p-2" : "p-3"} relative`}>
 {hideHeader ? null : (
 <div className="absolute left-2 top-2 z-[3] rounded-full bg-black/70 px-2 py-[2px] text-[11px] text-white">
 0/0
 </div>
 )}
 <div className={`relative ${heightClass} w-full rounded-xl overflow-hidden ring-1 ring-black/10 bg-slate-100`}>
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
  height === "lg" ? "h-56" :
  "h-40";
 const listVisible = hoverPreviewList && hovering && items.length > 1;
 const baseHeightPx = height === "xs" ? 108 : height === "sm" ? 150 : height === "lg" ? 260 : 200;

 return (
 <div
   className={`rounded-2xl border border-slate-200 bg-white/90 shadow-sm ${compact ? "p-2" : "p-3"} relative`}
   onMouseEnter={() => setHovering(true)}
   onMouseLeave={() => setHovering(false)}
 >
 {hideHeader ? (
 <div className="absolute left-2 top-2 z-[3] rounded-full bg-black/70 px-2 py-[2px] text-[11px] text-white">
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
          ? { maxHeight: "70vh", overflowY: "auto", padding: "8px", scrollbarWidth: "thin" }
          : { maxWidth: "90vw", overflowX: "auto", padding: "8px", scrollbarWidth: "thin" }
      }
    >
      <div className={hoverPreviewDirection === "vertical" ? "space-y-3" : "flex items-stretch gap-3"}>
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
            <div className={`w-full ${hoverPreviewDirection === "vertical" ? "h-40" : "h-32"} rounded-md bg-slate-100 overflow-hidden ring-1 ring-black/5`}>
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

/* ===================== Collapsible (mobile) ===================== */
function Collapsible({
  title,
  children,
  defaultOpen = false,
  badge,
  icon,
  actions,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-2xl border border-black/10 bg-white/95 shadow-sm">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex flex-1 items-center justify-between rounded-xl px-2 py-1 text-left transition hover:bg-black/5 focus:outline-none focus:ring-2 focus:ring-indigo-300/70"
        >
          <span className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-black/80 text-white">
              {icon ?? (
                <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                  <path d="M12 5a7 7 0 1 0 0 14a7 7 0 1 0 0-14Z" stroke="currentColor" strokeWidth="1.5" fill="none" />
                  <path d="M12 8v4l2.5 2.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                </svg>
              )}
            </span>
            <span className="text-[13px] font-semibold text-gray-900">{title}</span>
            {badge ? (
              <span className="ml-1 inline-flex items-center rounded-full bg-black/80 px-2 py-[2px] text-[11px] font-medium text-white">
                {badge}
              </span>
            ) : null}
          </span>
          <span className={`ml-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/85 text-white transition-transform ${open ? "rotate-180" : ""}`}>
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </button>
        {actions ? <div className="flex items-center gap-1">{actions}</div> : null}
      </div>
      {open ? <div className="border-t border-black/5 px-3 pb-3 pt-2">{children}</div> : null}
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

const desiredLang = (() => {
  const qp = sp.get("lang");
  if (qp && qp.trim()) return qp.trim().slice(0, 2).toLowerCase();
  if (typeof navigator !== "undefined") {
    const cand = (navigator.languages && navigator.languages.find((l) => !!l)) || navigator.language;
    if (cand) return cand.slice(0, 2).toLowerCase();
  }
  try {
    const intl = Intl.DateTimeFormat().resolvedOptions().locale;
    if (intl) return intl.slice(0, 2).toLowerCase();
  } catch {}
  return "it";
})();

const [ge, setGe] = useState<AnyObj | null>(null);
const [geTr, setGeTr] = useState<{ title?: string; pitch?: string; description?: string; video_url?: string; lang?: string } | null>(null);

const resolvedLang = useMemo(
  () => geTr?.lang?.toLowerCase?.() || desiredLang,
  [geTr, desiredLang]
);

const [rows, setRows] = useState<EventVM[]>([]);
const [journeyTitle, setJourneyTitle] = useState<string | null>(null);
const [journeyMedia, setJourneyMedia] = useState<MediaItem[]>([]);
const [journeyMediaFirst, setJourneyMediaFirst] = useState<string | null>(null);
const [selectedIndex, setSelectedIndex] = useState(0);
const [loading, setLoading] = useState(true);
const [isPlaying, setIsPlaying] = useState(false);
const [speechSupported, setSpeechSupported] = useState(false);
const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);
const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
const speechAutoAdvanceRef = useRef(false);
const normalizeLang = (v?: string | null) => (v ? v.slice(0, 2).toLowerCase() : "");
const [mapMode, setMapMode] = useState<"normal" | "fullscreen">("normal");
const BRAND_BLUE = "#0f3c8c";

const toggleMapModeView = useCallback(() => {
  setMapMode((m) => (m === "normal" ? "fullscreen" : "normal"));
}, []);

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

// ===== Sintesi vocale =====
useEffect(() => {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  setSpeechSupported(true);
  const synth = window.speechSynthesis;
  const loadVoices = () => {
    const list = synth.getVoices() || [];
    setVoices([...list]);
  };
  loadVoices();
  synth.onvoiceschanged = loadVoices;
  return () => { synth.onvoiceschanged = null; };
}, []);

const stopSpeech = useCallback(() => {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  speechUtteranceRef.current = null;
  speechAutoAdvanceRef.current = false;
}, []);

const speakEventDescription = useCallback(
  (ev: EventVM | null | undefined, opts?: { autoAdvance?: boolean }) => {
    if (!ev || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const parts = [ev.title, ev.description].filter(Boolean);
    const text = parts.join(". ").trim();
    if (!text) return;
    stopSpeech();
    const langHint = (ev as any)?.lang || resolvedLang || desiredLang;
    const chosen =
      (selectedVoiceId && voices.find((v) => v.voiceURI === selectedVoiceId)) ||
      voices.find((v) => normalizeLang(v.lang) === normalizeLang(langHint)) ||
      voices[0] ||
      null;
    const utter = new SpeechSynthesisUtterance(text);
    if (chosen) {
      utter.voice = chosen;
      utter.lang = chosen.lang || utter.lang;
    } else if (langHint) {
      utter.lang = langHint;
    }
    speechAutoAdvanceRef.current = !!opts?.autoAdvance;
    utter.onend = () => {
      speechUtteranceRef.current = null;
      if (speechAutoAdvanceRef.current) {
        setSelectedIndex((i) => (rows.length ? (i + 1) % rows.length : 0));
      }
    };
    utter.onerror = () => {
      speechUtteranceRef.current = null;
    };
    speechUtteranceRef.current = utter;
    window.speechSynthesis.speak(utter);
  },
  [desiredLang, resolvedLang, selectedVoiceId, voices, rows.length, stopSpeech]
);

useEffect(() => {
  if (!speechSupported || !isPlaying) return;
  const ev = rows[selectedIndex];
  speakEventDescription(ev, { autoAdvance: true });
}, [isPlaying, rows, selectedIndex, speakEventDescription, speechSupported]);

// Se cambio voce mentre riproduce, riavvia con la nuova voce
useEffect(() => {
 if (!speechSupported || !isPlaying) return;
 const ev = rows[selectedIndex];
 stopSpeech();
 speakEventDescription(ev, { autoAdvance: true });
}, [selectedVoiceId, speechSupported, isPlaying, rows, selectedIndex, speakEventDescription, stopSpeech]);

// Pausa immediata quando isPlaying diventa false
useEffect(() => {
  if (!speechSupported) return;
  if (!isPlaying) {
    stopSpeech();
  }
}, [isPlaying, speechSupported, stopSpeech]);

useEffect(() => {
  if (!speechSupported) return;
  if (selectedVoiceId) return;
  const wantIt = normalizeLang(resolvedLang || desiredLang) === "it";
  const best =
    (wantIt && voices.find((v) => normalizeLang(v.lang) === "it" && /elsa/i.test(v.name))) ||
    voices.find((v) => normalizeLang(v.lang) === "it") ||
    voices.find((v) => normalizeLang(v.lang) === "en") ||
    voices[0];
  if (best) setSelectedVoiceId(best.voiceURI);
}, [voices, speechSupported, selectedVoiceId, resolvedLang, desiredLang]);

// Stop speech on unmount
useEffect(() => stopSpeech, [stopSpeech]);

const voiceOptions = useMemo(() => {
  if (!voices.length) return [] as { id: string; label: string; lang: string }[];
  return voices.map((v) => ({
    id: v.voiceURI,
    lang: normalizeLang(v.lang),
    label: `${v.name}${v.localService ? " (local)" : ""} - ${v.lang || ""}`,
  }));
}, [voices]);

const [overlayOpen, setOverlayOpen] = useState(false);
const [overlayMode, setOverlayMode] = useState<"overlay" | "full">("overlay");
const [overlayMedia, setOverlayMedia] = useState<MediaItem | null>(null);
const [overlayAutoplay, setOverlayAutoplay] = useState<boolean>(false);
const [quizOpen, setQuizOpen] = useState(false);
const [quizUrl, setQuizUrl] = useState<string>("/module/quiz");
const [concurrentOther, setConcurrentOther] = useState<Array<{ evId: string; geId: string; geTitle?: string | null; evTitle: string; startYear?: number }>>([]);
const [relatedFrom, setRelatedFrom] = useState<CorrelatedJourney | null>(null);

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
const popupRef = useRef<maplibregl.Popup | null>(null);
const [mapReady, setMapReady] = useState(false);
const [mapLoaded, setMapLoaded] = useState(false);
 const [mapVersion, setMapVersion] = useState(0);

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
    (map as any).fitBounds(bounds as any, { padding: 100, duration: 800 });
  } catch {}
}, [rows, mapReady]);

const showPopup = useCallback((ev?: EventVM | null) => {
  const map = mapRef.current as any;
  if (popupRef.current) {
    try { popupRef.current.remove(); } catch {}
    popupRef.current = null;
  }
  if (!map || !mapReady || mapMode !== "fullscreen") return;
  if (!ev || ev.latitude == null || ev.longitude == null) return;
  const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: false, offset: 14 });
  const rangeLabel = formatEventRange(ev);
  popup
    .setLngLat([ev.longitude, ev.latitude])
    .setHTML(
      `<div style="font-size:12px;font-weight:700;color:#0f172a;">${ev.title || "Evento"}</div>` +
      `<div style="font-size:11px;color:#475569;margin-top:2px;">${rangeLabel}</div>`
    )
    .addTo(map);
  popupRef.current = popup;
}, [mapMode, mapReady]);

// Lock scroll quando la mappa è full-screen
useEffect(() => {
  if (mapMode !== "fullscreen") return;
  const prev = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  return () => { document.body.style.overflow = prev; };
}, [mapMode]);

// Forza resize + fit dopo toggle view
useEffect(() => {
  if (!mapRef.current || !mapReady) return;
  try { mapRef.current.resize(); } catch {}
  setTimeout(() => { try { mapRef.current?.resize(); } catch {} }, 120);
  if (mapMode === "fullscreen") {
    fitMapToRows();
  }
}, [mapMode, mapReady, fitMapToRows]);

// Fit mappa quando cambiano dati e la mappa è pronta/caricata
useEffect(() => {
  if (!mapReady || !mapLoaded) return;
  fitMapToRows();
}, [fitMapToRows, mapReady, mapLoaded]);

// Popup evento quando la mappa Š full-screen
useEffect(() => {
  if (mapMode !== "fullscreen") {
    if (popupRef.current) { try { popupRef.current.remove(); } catch {} popupRef.current = null; }
    return;
  }
  const ev = rows[selectedIndex];
  if (!ev || !mapReady) return;
  showPopup(ev);
}, [mapMode, selectedIndex, rows, mapReady, showPopup]);

// Reset cache/markers quando cambio journey
useEffect(() => {
  setCorrByEvent({});
  markersRef.current = [];
  setMapVersion((v) => v + 1);
}, [gid]);

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
 if (typeof window === "undefined") return;

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
}, [mapVersion]);

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
 `event_id, group_event_id, description, lang, title, wikipedia_url,
 continent, country, era, exact_date, id, latitude, longitude, year_from, year_to,
 journey_title, journey_media, journey_media_first, event_media, event_media_first, event_type_icon`
 )
 .eq("group_event_id", gid);
 if (vjErr) throw vjErr;

 const vms: EventVM[] = (vjRows ?? []).map((r: any) => {
 const eventId = r.event_id ?? r.id;
 const location = r.city ?? r.region ?? r.country ?? r.continent ?? null;
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
 setJourneyMedia(jmNormalized);
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
 const ev = rows[selectedIndex];
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

 const items: CorrelatedJourney[] = rowsCorr
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
    };
  });
  console.debug("[GE] correlated journeys resolved", { evId: ev.id, count: items.length, items });
 setCorrByEvent((prev) => ({ ...prev, [ev.id]: items }));
  } catch (e) {
  // silenzioso: nessuna correlazione
  console.warn("[GE] correlated journeys fetch error", e);
  }
  })();
 }, [rows, selectedIndex, resolvedLang, supabase, corrByEvent]);

 /* ===== Preferiti ===== */
 const { userId: _uid } = useCurrentUser();
 const [isFav, setIsFav] = useState<boolean>(false);
 const [savingFav, setSavingFav] = useState<boolean>(false);

 // Journey sorgente (from param) usato per mostrare un link di ritorno
 useEffect(() => {
   const raw = sp.get("from") as any;
   const val = typeof raw === "function" ? sp.get("from")?.trim() : sp.get("from");
   const from = val?.trim();
   if (!from || !UUID_RE.test(from) || from === gid) {
     setRelatedFrom(null);
     return;
   }
   let cancelled = false;
   (async () => {
     try {
       const { data } = await supabase
         .from("group_events")
         .select("id, slug, group_event_translations!left(title, lang)")
         .eq("id", from)
         .limit(1)
         .maybeSingle();
       if (cancelled) return;
       const title = (data as any)?.group_event_translations?.[0]?.title ?? data?.slug ?? null;
       setRelatedFrom({ id: from, slug: data?.slug ?? null, title });
     } catch {
       if (!cancelled) setRelatedFrom({ id: from, slug: null, title: "Journey correlato" });
     }
   })();
   return () => {
     cancelled = true;
   };
 }, [sp, gid, supabase]);

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

 try { (marker as any).setZIndex?.(idx === selectedIndex ? 1000 : 0); } catch {}

 el.addEventListener("click", () => {
   setSelectedIndex(idx);
   if (mapMode === "fullscreen") showPopup(ev);
 });

 markersRef.current.push(marker as any);
 pts.push([ev.longitude!, ev.latitude!]);
 });

 try {
  if (pts.length) {
    fitMapToRows();
  } else {
    (map as any).flyTo({ center: [9.19, 45.46], zoom: 3.5, duration: 600 });
  }
 } catch {}
 }, [rows, mapReady, selectedIndex, mapMode, showPopup]);

 useEffect(() => {
 const map = mapRef.current as any;
 const ev = rows[selectedIndex];
 if (map && ev && ev.latitude !== null && ev.longitude !== null) {
 try {
 map.flyTo({ center: [ev.longitude, ev.latitude], zoom: Math.max(map.getZoom(), 6), speed: 0.8 });
 } catch {}
 }
 }, [selectedIndex, rows, gid, mapReady]);

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

 const tickTarget = isLg ? 12 : 6;
 const ticks = buildTimelineTicks(data.min, data.max, tickTarget);
 const tickYears = [data.min, ...ticks, data.max];
 const diamondSize = 12;
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
 <div className="relative flex flex-col items-center justify-center h-full">
 {/* Barra timeline */}
  <div
    className="relative w-full h-[8px] rounded-full shadow-inner"
    style={{ background: "linear-gradient(90deg, #0f3c8c 0%, #1a64d6 60%, #0f3c8c 100%)" }}
  >
  <div
  className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-white shadow"
  style={{ left: `${pct}%`, width: `${diamondSize}px`, height: `${diamondSize}px`, backgroundColor: "#1a64d6", boxShadow: "0 0 8px rgba(15,60,140,0.55)" }}
  />
 {minorTicks.map((t, i) => {
 const pos = ((t - data.min) / data.range) * 100;
  return (
 <div
 key={`mtick-${i}`}
  className="absolute top-1/2 -translate-y-1/2 h-[10px] w-[1px] -translate-x-1/2"
  style={{ left: `${pos}%`, backgroundColor: "rgba(15,60,140,0.35)" }}
  />
 );
 })}
 {tickYears.map((t, i) => {
 const pos = ((t - data.min) / data.range) * 100;
 return (
 <div
 key={`tick-${i}`}
  className="absolute top-1/2 -translate-y-1/2 h-[14px] w-[2px] -translate-x-1/2"
  style={{ left: `${pos}%`, backgroundColor: "rgba(15,60,140,0.7)" }}
  />
 );
 })}
 </div>

 {/* Etichette sotto la barra (alternate su due righe) */}
 <div className="relative mt-1 h-10 w-full">
 <span className="absolute left-0 top-0 -translate-x-0 text-[10px] text-slate-700 whitespace-nowrap bg-white/90 px-1.5 py-[2px] rounded-md shadow-sm">
 {formatTimelineYearLabel(data.min)}
 </span>
 {(() => {
 const inner = tickYears.slice(1, -1).map((y, i) => ({
 year: y,
 pos: ((y - data.min) / Math.max(1, data.range)) * 100,
 key: `ilbl-${i}`,
 }));
 const kept: { year: number; pos: number; key: string }[] = [];
 const minGap = Math.max(isLg ? 8 : 16, 100 / Math.max(2, inner.length + 1));
 let last = -Infinity;
 inner.forEach((c) => {
 if (c.pos - last >= minGap) { kept.push(c); last = c.pos; }
 });
 return (
 <>
 {kept.map((c, idx) => (
 <span
 key={c.key}
 className="absolute text-[10px] text-slate-700 -translate-x-1/2 whitespace-nowrap bg-white/90 px-1.5 py-[2px] rounded-md shadow-sm"
 style={{ left: `${c.pos}%`, top: idx % 2 === 0 ? '0px' : '16px' }}
 >
 {formatTimelineYearLabel(c.year)}
 </span>
 ))}
 </>
 );
 })()}
 <span
 className="absolute right-0 text-[10px] text-slate-700 whitespace-nowrap bg-white/90 px-1.5 py-[2px] rounded-md shadow-sm"
 style={{ top: '16px' }}
 >
 {formatTimelineYearLabel(data.max)}
 </span>
 </div>
 </div>
 );
 }

 // Eventi contemporanei (overlap temporale con l'evento attivo)
 const concurrent = useMemo(() => {
 const a = rows[selectedIndex];
 if (!a) return [] as { idx: number; ev: EventVM }[];
 const sa = buildTimelineSpan(a);
 if (!sa) return [] as { idx: number; ev: EventVM }[];
 const centerA = (sa.min + sa.max) / 2;
 const tol = 0; // tolleranza anni
 const list = rows
 .map((ev, i) => ({ ev, i, s: buildTimelineSpan(ev) }))
 .filter((x) => x.i !== selectedIndex && !!x.s && spansOverlap(sa, x.s as any, tol));
 list.sort((x, y) => {
 const cx = ((x.s!.min + x.s!.max) / 2) - centerA;
 const cy = ((y.s!.min + y.s!.max) / 2) - centerA;
 const dx = Math.abs(cx);
 const dy = Math.abs(cy);
 if (dx !== dy) return dx - dy;
 return x.ev.order_key - y.ev.order_key;
 });
 return list.map((x) => ({ idx: x.i, ev: x.ev }));
 }, [rows, selectedIndex]);

 // Eventi contemporanei di altri journey (fetch + filtro DB, era-normalized)
 useEffect(() => {
 (async () => {
 try {
 const ev = rows[selectedIndex];
 if (!ev || !gid) { setConcurrentOther([]); return; }
 const s = buildTimelineSpan(ev);
 if (!s) { setConcurrentOther([]); return; }
 // Normalizza: DB ha anni positivi + campo era (BC/AD)
 const era = normEra(ev.era);
 const minSigned = Math.floor(s.min);
 const maxSigned = Math.ceil(s.max);
 const minAbs = Math.min(Math.abs(minSigned), Math.abs(maxSigned));
 const maxAbs = Math.max(Math.abs(minSigned), Math.abs(maxSigned));

 const { data, error } = await supabase
 .from("event_group_event")
 .select(`
   event_id,
   group_event_id,
   group_events!inner(id, visibility, workflow_state),
   events_list!inner(
     id,
     year_from,
     year_to,
     era,
     exact_date,
     latitude,
     longitude,
     image_url,
     event_translations!left(title,lang)
   )
 `)
 .neq("group_event_id", gid)
.eq("events_list.era", era)
.eq("group_events.visibility", "public")
.eq("group_events.workflow_state", "published")
.limit(400);
if (error) { setConcurrentOther([]); return; }

 const pickTitle = (translations: any[], lang: string) => {
   const norm = (v: string | null | undefined) => (v || "").toLowerCase();
   const order = [lang, "it", "en"].filter((v, idx, arr) => v && arr.indexOf(v) === idx);
   for (const target of order) {
     const found = translations.find((t: any) => norm(t?.lang) === target);
     if (found?.title) return found.title;
   }
   const first = translations.find((t: any) => t?.title);
   return first?.title ?? null;
 };

const items = (data || []).map((r: any) => {
const evRow = (r as any).events_list || (r as any);
const translations = Array.isArray(evRow.event_translations) ? evRow.event_translations : [];
 const title =
  pickTitle(translations, (resolvedLang || "").toLowerCase()) ||
  evRow.title ||
  (evRow.location ?? evRow.country ?? evRow.continent ?? "Event");
 const yy: EventVM = {
 id: String(evRow.id),
 title: String(title ?? "Event"),
 description: "",
 wiki_url: null,
 video_url: null,
 order_key: 0,
 latitude: evRow.latitude ?? null,
 longitude: evRow.longitude ?? null,
 era: evRow.era ?? null,
 year_from: evRow.year_from ?? null,
 year_to: evRow.year_to ?? null,
 exact_date: evRow.exact_date ?? null,
 location: evRow.location ?? evRow.country ?? evRow.continent ?? null,
 image_url: evRow.image_url ?? null,
 } as any;
 const spn = buildTimelineSpan(yy);
 return {
   evId: String(evRow.id),
   geId: String((r as any).group_event_id ?? ""),
   geTitle: null,
   evTitle: String(yy.title || "Event"),
   span: spn,
   startYear: spn?.start,
   ev: yy,
 } as any;
}).filter((x) => x.geId && x.evId);
 // filtro su span reale; se manca span includo comunque
 const center = (s.min + s.max) / 2;
 const overlapping = items.filter((it) => {
 if (it.span) return spansOverlap(s, it.span as any, 0);
 return true;
 });
 overlapping.sort((a, b) => {
 const da = a.startYear != null ? Math.abs((a.startYear as any) - center) : Number.POSITIVE_INFINITY;
 const db = b.startYear != null ? Math.abs((b.startYear as any) - center) : Number.POSITIVE_INFINITY;
 return da - db;
 });
 setConcurrentOther(overlapping.slice(0, 20));
 } catch { setConcurrentOther([]); }
 })();
}, [rows, selectedIndex, gid, supabase, resolvedLang]);

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
 <span aria-hidden>?</span> Back
 </button>
 </div>
 </div>
 </div>
 );
 }

const selectedEvent = rows[selectedIndex];
const related = (() => {
 const sel = rows[selectedIndex];
 const base = sel ? corrByEvent[sel.id] ?? [] : [];
 if (relatedFrom && !base.some((r) => r.id === relatedFrom.id)) {
   const withFrom: CorrelatedJourney = {
     id: relatedFrom.id,
     slug: relatedFrom.slug,
     title: relatedFrom.title || "Journey di provenienza",
   };
   return [withFrom, ...base];
 }
 return base;
})();

const mapTextureStyle: CSSProperties = {
 backgroundImage: "url(/bg/login-map.jpg)",
 backgroundSize: "cover",
 backgroundPosition: "center",
 backgroundAttachment: "fixed",
 };

 /* ===================== RENDER ===================== */
 return (
 <div
 className="flex min-h-screen flex-col"
 style={mapTextureStyle}
 >
 {/* ===== HEADER (container allargato) ===== */}
 <section className="border-b border-slate-200 bg-white/95 shadow-sm" style={mapTextureStyle}>
 <div className="mx-auto w-full max-w-[120rem] px-3 py-3 lg:px-8 lg:py-4">
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr_2.6fr] gap-3 items-stretch">
 {/* [1] Titolo + Favourite */}
 <div className="h-auto lg:h-32 rounded-xl border border-slate-200 bg-white p-3 shadow-[inset_0_2px_6px_rgba(0,0,0,0.05)] flex flex-col justify-between">
 <h1 className="text-base lg:text-xl font-semibold text-slate-900 leading-snug break-words whitespace-pre-line line-clamp-2">
 {(journeyTitle ?? geTr?.title ?? ge?.title ?? "Journey").toString()}
 </h1>
 <div className="mt-2 flex items-center gap-2">
          <button
            onClick={toggleFavourite}
            disabled={!group_event_id || savingFav}
            aria-pressed={isFav}
            className={`inline-flex items-center justify-center rounded-full p-1.5 text-2xl transition focus:outline-none focus:ring-2 focus:ring-rose-300/60 ${
              isFav ? "text-rose-600 hover:text-rose-700" : "text-slate-400 hover:text-slate-600"
            }`}
            aria-label={isFav ? "Rimuovi dai preferiti" : "Aggiungi ai preferiti"}
          >
            <span className="sr-only">{isFav ? "Rimuovi dai preferiti" : "Aggiungi ai preferiti"}</span>
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
 {group_event_id ? <RatingStars group_event_id={group_event_id} journeyId={group_event_id} size={18} /> : null}
          <button
            onClick={openQuiz}
            className="ml-auto inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold text-white shadow-[0_8px_20px_rgba(15,60,140,0.35)] ring-1 ring-white/15 transition hover:-translate-y-[1px] hover:shadow-[0_10px_22px_rgba(15,60,140,0.42)] focus:outline-none focus:ring-2 focus:ring-indigo-300"
            style={{ background: "linear-gradient(120deg, #0f3c8c 0%, #1a64d6 100%)" }}
            title="Apri il quiz"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className="drop-shadow-sm">
              <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" stroke="currentColor" strokeWidth="1.8" fill="none" />
              <path d="M12 16.5v.2" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
              <path d="M9.75 9.4c0-1.3 1.1-2.35 2.45-2.35 1.2 0 2.3.85 2.3 2.05 0 1.6-1.85 1.95-2.3 3.1-.14.36-.2.78-.2 1.2" stroke="currentColor" strokeWidth="1.9" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Quiz</span>
          </button>
 {/* Link "Apri pagina" rimosso */}

 </div>
 {/* Nuovo layout: Nav + Griglia 2 colonne (descrizione / media+sezioni) */}
  <div className="hidden flex items-center justify-end gap-2 mb-3">
    <button
      onClick={() => setSelectedIndex((i) => rows.length ? (i - 1 + rows.length) % rows.length : 0)}
      className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/90 backdrop-blur ring-1 ring-black/15 text-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition hover:bg-white hover:shadow-md active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
      title="Previous"
    >
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
    <button
      onClick={() => setIsPlaying((p) => !p)}
      className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/90 backdrop-blur ring-1 ring-black/15 text-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition hover:bg-white hover:shadow-md active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
      title={isPlaying ? "Pause" : "Play"}
    >
      {isPlaying ? (
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><rect x="6" y="5" width="4" height="14" fill="currentColor"/><rect x="14" y="5" width="4" height="14" fill="currentColor"/></svg>
      ) : (
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M8 5l10 7-10 7" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      )}
    </button>
    <button
      onClick={() => setSelectedIndex((i) => rows.length ? (i + 1) % rows.length : 0)}
      className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/90 backdrop-blur ring-1 ring-black/15 text-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition hover:bg-white hover:shadow-md active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
      title="Next"
    >
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
  </div>

 <div className="hidden grid grid-cols-2 gap-3 items-start">
 {/* Colonna sinistra: Location + Descrizione + Link */}
 <div className="min-w-0 rounded-2xl border border-black/10 bg-white/95 shadow-sm p-3">
 {/* location removed above description as requested */}
 <div className="max-h-[40svh] overflow-y-auto pr-2 whitespace-pre-wrap text-[13.5px] leading-6 text-gray-800 text-justify" style={{ scrollbarWidth: 'thin' }}>
 {selectedEvent?.description || "No description available."}
 </div>
 {/* Eventi contemporanei (MOBILE) - altri journey */}
 <div className="mb-2">
 <div className="text-[12px] font-semibold text-gray-800 mb-1">Eventi contemporanei</div>
 {concurrentOther && concurrentOther.length ? (
 <div className="h-[150px] overflow-y-auto pr-1 space-y-1.5">
 {concurrentOther.map((c) => {
 const label = Number.isFinite(c.startYear as any) ? formatTimelineYearLabel(c.startYear as any) : "";
 return (
 <button
 key={`${c.geId}:${c.evId}`}
 onClick={() => router.push(geUrl(c.geId, c.evId))}
 className="w-full truncate text-left inline-flex items-center justify-start rounded-xl border border-slate-300 bg-white/90 px-3 py-2 text-[12px] text-slate-900 hover:bg-white shadow-sm"
 title={(label ? `${label} - ${c.evTitle}` : c.evTitle)}
 >
 {label ? `${label} · ` : ""}{c.evTitle}
 </button>
 );
 })}
 </div>
 ) : (
 <div className="text-[12px] text-gray-500">Nessun evento concomitante.</div>
 )}
 </div>
 <div className="pt-2 flex items-center gap-3">
 {selectedEvent?.wiki_url ? (
 <a
 href={selectedEvent.wiki_url}
 target="_blank"
 rel="noreferrer"
 className="inline-flex items-center gap-1.5 text-sm text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-800"
 >
 Wikipedia ??'
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
 ?-? Guarda il video
 </a>
 ) : null}
 </div>
 </div>

 {/* Colonna destra: Media evento + Eventi contemporanei + Related */}
 <div className="space-y-3">
                <div className="hidden w-full max-w-[260px] mx-auto">
                  <MediaBox
                    items={selectedEvent?.event_media ?? []}
                    firstPreview={selectedEvent?.event_media_first || undefined}
                    onOpenOverlay={openOverlay}
                    hideHeader
                    compact
                    height={isLg ? "xs" : "sm"}
                    hoverPreviewList
                    hoverPreviewDirection="horizontal"
                  />
                </div>

 {/* Rimosso elenco contemporanei dello stesso journey */}

          {/* Eventi contemporanei (altri journey) */}
          <div className="hidden rounded-2xl border border-slate-200 bg-white/95 shadow-sm p-3 h-[220px]">
            <div className="text-[12.5px] font-semibold text-gray-800 mb-1">Eventi contemporanei</div>
            {concurrentOther && concurrentOther.length ? (
              <div className="h-[176px] overflow-y-auto pr-1 space-y-1.5">
                {concurrentOther.map((c) => {
 const label = Number.isFinite(c.startYear as any) ? formatTimelineYearLabel(c.startYear as any) : "";
 return (
 <button
 key={`${c.geId}:${c.evId}`}
 onClick={() => router.push(geUrl(c.geId, c.evId))}
 className="w-full truncate text-left inline-flex items-center justify-start rounded-xl border border-slate-300 bg-white/90 px-3 py-2 text-[12.5px] text-slate-900 hover:bg-white shadow-sm"
 title={(label ? `${label} - ${c.evTitle}` : c.evTitle)}
 >
 {label ? `${label} · ` : ""}{c.evTitle}
 </button>
 );
 })}
 </div>
 ) : (
 <div className="text-[12.5px] text-gray-500">Nessun evento concomitante.</div>
 )}
 </div>

 {related?.length ? (
 <div className="rounded-2xl border border-black/10 bg-white/95 shadow-sm p-3">
 <div className="text-[12.5px] font-semibold text-gray-800 mb-1">Related Journeys</div>
 <div className="flex flex-wrap gap-1.5 h-[150px] overflow-y-auto pr-1 space-y-1.5" style={{ scrollbarWidth: 'thin' }}>
 {related.map((r) => (
 <button
 key={r.id}
 onClick={() => router.push(geUrl(r.id))}
 className="w-full truncate text-left inline-flex items-center justify-start rounded-xl border border-indigo-200 bg-indigo-50/80 px-3 py-2 text-[12.5px] text-indigo-900 hover:bg-indigo-50 shadow-sm"
 title={r.title ?? r.slug ?? "Open journey"}
 >
 ?Y"- {r.title ?? r.slug ?? "Journey"}
 </button>
 ))}
 </div>
 </div>
 ) : (
 <div className="rounded-2xl border border-black/10 bg-white/95 shadow-sm p-3">
 <div className="text-[12.5px] font-semibold text-gray-800 mb-1">Related Journeys</div>
 <div className="text-[12.5px] text-gray-500">Nessun collegamento.</div>
 </div>
 )}
 </div>
 </div>
 </div>

 {/* [2] Media del Journey (ristretto) */}
  {isLg ? (
    <div className="flex">
      <div className="flex-1 flex items-center justify-center">
        {journeyMedia?.length ? (
          <div className="w-full max-w-[260px]">
            <MediaBox
              items={journeyMedia}
              firstPreview={journeyMediaFirst || undefined}
              onOpenOverlay={openOverlay}
              hideHeader
              height={isLg ? "xs" : "sm"}
              compact
              hoverPreviewList
            />
          </div>
        ) : (
          <div className="w-full max-w-[260px] h-full rounded-xl bg-slate-100 flex items-center justify-center text-xs text-slate-500">
            Nessun media del journey
          </div>
        )}
      </div>
    </div>
  ) : null}

      {/* [3] Timeline */}
      <div className="h-auto lg:h-32 rounded-xl border border-slate-200 bg-white p-2 shadow-[inset_0_2px_6px_rgba(0,0,0,0.05)] flex">
        <div className="flex-1">
          <Timeline3D />
        </div>
      </div>
 </div>
 </div>
 </section>

 {/* ===== BANDA EVENTI (container allargato) ===== */}
 <section className="border-b border-black/10 bg-white">
 <div className="mx-auto w-full max-w-[120rem] px-4 py-2" ref={bandRef}>
 <div className="flex items-center justify-between mb-1.5">
 <div className="text-[13px] font-medium text-gray-900">Eventi</div>
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
 const fromY = signedYear(ev.year_from, ev.era);
 const toY = signedYear(ev.year_to, ev.era);
 const fromLabel = fromY != null ? formatTimelineYearLabel(fromY) : "";
 const toLabel = toY != null ? formatTimelineYearLabel(toY) : "";
 const info = [fromLabel, toLabel, ev.location || ""].filter(Boolean).join(" - ");
  return (
  <button
  key={ev.id}
  ref={(el) => { if (el) itemRefs.current.set(ev.id, el); }}
  onClick={() => setSelectedIndex(idx)}
  className={`shrink-0 w-[60vw] md:w-[280px] max-w-[320px] rounded-xl border px-2 py-1.5 text-left transition h-[64px] ${
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
 </div>
 </section>

 {/* ===== MOBILE: Descrizione + Media evento + Mappa ===== */}
 <div className="mx-auto w-full max-w-[120rem] lg:hidden overflow-hidden">
 <section className="bg-white/70 backdrop-blur" style={mapTextureStyle}>
 <div className="px-4 py-2">
 <div className="mx-auto w-full max-w-[820px]">
<div className="rounded-2xl border border-black/10 bg-white/95 shadow-sm flex flex-col gap-2">
  <Collapsible
    title="Media evento"
    defaultOpen={false}
    icon={(
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
        <path d="M4 7a2 2 0 0 1 2-2h3l2-2h2l2 2h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" stroke="currentColor" strokeWidth="1.4" fill="none" />
        <path d="m10 14 2-2 2 2 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )}
    actions={(
      <div className="flex items-center gap-1">
        <button
          onClick={() => setSelectedIndex((i) => rows.length ? (i - 1 + rows.length) % rows.length : 0)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/90 backdrop-blur ring-1 ring-black/15 text-xs text-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition hover:bg-white hover:shadow-md active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
          title="Previous"
          aria-label="Evento precedente"
        >
          <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <button
          onClick={() => setIsPlaying((p) => !p)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/90 backdrop-blur ring-1 ring-black/15 text-xs text-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition hover:bg-white hover:shadow-md active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
          title={isPlaying ? "Pause" : "Play"}
          aria-label={isPlaying ? "Ferma autoplay" : "Avvia autoplay"}
        >
          {isPlaying ? (
            <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><rect x="6" y="5" width="4" height="14" fill="currentColor"/><rect x="14" y="5" width="4" height="14" fill="currentColor"/></svg>
          ) : (
            <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M8 5l10 7-10 7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
          )}
        </button>
        <button
          onClick={() => setSelectedIndex((i) => rows.length ? (i + 1) % rows.length : 0)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/90 backdrop-blur ring-1 ring-black/15 text-xs text-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition hover:bg-white hover:shadow-md active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
          title="Next"
          aria-label="Evento successivo"
        >
          <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        {voiceOptions.length > 1 && (
          <select
            value={selectedVoiceId ?? ""}
            onChange={(e) => { setSelectedVoiceId(e.target.value || null); }}
            className="ml-1 min-w-[70px] max-w-[120px] truncate rounded-md border border-slate-200 bg-white px-1 py-0.5 text-[9.5px] text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            aria-label="Voce sintesi"
          >
            {voiceOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        )}
      </div>
    )}
  >
    <MediaBox
      items={selectedEvent?.event_media ?? []}
      firstPreview={selectedEvent?.event_media_first || undefined}
      onOpenOverlay={openOverlay}
      compact
      height="sm"
      hoverPreviewList
      hoverPreviewDirection="horizontal"
    />
  </Collapsible>

  <Collapsible
    title="Approfondimenti"
    badge={related?.length ? related.length : undefined}
    icon={(
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
        <path d="M6.5 7h11a1.5 1.5 0 0 1 1.4 2.1l-3.2 8a1.5 1.5 0 0 1-1.4.9h-11a1.5 1.5 0 0 1-1.4-2.1l3.2-8a1.5 1.5 0 0 1 1.4-.9Z" stroke="currentColor" strokeWidth="1.4" fill="none" />
        <path d="M9 10h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    )}
  >
    {related?.length ? (
      <div className="space-y-1.5 max-h-[32svh] overflow-y-auto pr-1" style={{ scrollbarWidth: "thin" }}>
        {related.map((r) => (
          <button
            key={r.id}
            onClick={() => router.push(geUrl(r.id))}
            className="w-full truncate text-left inline-flex items-center justify-start rounded-xl border border-indigo-200 bg-indigo-50/80 px-3 py-2 text-[12.5px] text-indigo-900 hover:bg-indigo-50 shadow-sm"
            title={r.title ?? r.slug ?? "Open journey"}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" className="mr-2">
              <path d="M4 12h5l2-3 2 6 2-3h5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {r.title ?? r.slug ?? "Journey"}
          </button>
        ))}
      </div>
    ) : (
      <div className="text-[12.5px] text-gray-600">Nessun collegamento disponibile.</div>
    )}
  </Collapsible>

  <Collapsible
    title="contemporary events"
    badge={concurrentOther?.length ? concurrentOther.length : undefined}
    icon={(
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
        <path d="M5 12h4l2-3 2 6 2-3h4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="6" r="1.8" fill="currentColor" />
      </svg>
    )}
  >
    {concurrentOther && concurrentOther.length ? (
      <div className="space-y-1.5 max-h-[28svh] overflow-y-auto pr-1" style={{ scrollbarWidth: "thin" }}>
        {concurrentOther.map((c) => {
          const label = Number.isFinite(c.startYear as any) ? formatTimelineYearLabel(c.startYear as any) : "";
          return (
            <button
              key={`${c.geId}:${c.evId}`}
              onClick={() => router.push(geUrl(c.geId, c.evId))}
              className="w-full truncate text-left inline-flex items-center justify-start rounded-xl border border-slate-300 bg-white/90 px-3 py-2 text-[12px] text-slate-900 hover:bg-white shadow-sm"
              title={(label ? `${label} - ${c.evTitle}` : c.evTitle)}
            >
              {label ? `${label} · ` : ""}{c.evTitle}
            </button>
          );
        })}
      </div>
    ) : (
      <div className="text-[12.5px] text-gray-600">Nessun evento concomitante.</div>
    )}
  </Collapsible>

  <Collapsible
    title="Descrizione"
    defaultOpen={false}
    icon={(
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
        <path d="M6 5.5h12M6 10h8M6 14.5h5M6 19h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    )}
  >
    <div
      className="max-h-[36svh] overflow-y-auto pr-2 text-[13px] leading-6 text-gray-800 whitespace-pre-wrap text-justify"
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
          Wikipedia ?
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
          ? Guarda il video
        </a>
      ) : null}
    </div>
  </Collapsible>
 </div>
 </div>
 </div>
 </section>

 <section className="relative h-[40svh] min-h-[300px] border-t border-black/10">
 <div data-map="gehj" key={`map-mobile-${gid ?? "unknown"}`} className="h-full w-full rounded-2xl overflow-hidden bg-[linear-gradient(180deg,#eef2ff,transparent)]" aria-label="Map canvas" />
 {!mapLoaded && (
 <div className="absolute left-3 top-3 z-10 rounded-full border border-indigo-200 bg-indigo-50/90 px-3 py-1 text-xs text-indigo-900 shadow">
 Inizializzazione mappa…
 </div>
 )}
 </section>
 </div>

   {/* ===== DESKTOP (container allargato) ===== */
<div className="mx-auto hidden w-full max-w-[120rem] lg:block" style={mapTextureStyle}>
  <div className="grid grid-cols-[320px_minmax(0,0.75fr)_minmax(0,1.25fr)] gap-3 px-4 py-6">
    {/* Colonna 1: Player + controlli + link */}
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-center">
        {selectedEvent?.event_media?.length ? (
          <div className="w-full max-w-[320px]">
            <MediaBox
              items={selectedEvent.event_media}
              firstPreview={selectedEvent.event_media_first || undefined}
              onOpenOverlay={openOverlay}
              hideHeader
              compact
              height={isLg ? "sm" : "sm"}
              hoverPreviewList
              hoverPreviewDirection="horizontal"
            />
          </div>
        ) : (
          <div className="w-full max-w-[260px] h-full rounded-xl bg-slate-100 flex items-center justify-center text-xs text-slate-500">
            Nessun media dell'evento
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-sm h-[150px] flex flex-col">
        <div className="text-[12px] font-semibold text-slate-800">
          {resolvedLang?.toLowerCase?.().startsWith("en") ? "Contemporary events" : "Eventi contemporanei"}
        </div>
        {concurrentOther && concurrentOther.length ? (
          <div className="mt-2 flex-1 overflow-y-auto pr-1 space-y-1.5" style={{ scrollbarWidth: "thin" }}>
            {concurrentOther.map((c) => {
              const label = Number.isFinite(c.startYear as any) ? formatTimelineYearLabel(c.startYear as any) : "";
              return (
                <button
                  key={`${c.geId}:${c.evId}`}
                  onClick={() => router.push(geUrl(c.geId, c.evId))}
                  className="w-full truncate text-left inline-flex items-center justify-start rounded-xl border border-slate-300 bg-white px-3 py-2 text-[12.5px] text-slate-900 hover:bg-slate-50 shadow-sm"
                  title={(label ? `${label} - ${c.evTitle}` : c.evTitle)}
                >
                  {label ? `${label} · ` : ""}
                  {c.evTitle}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mt-2 flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
            Nessun evento contemporaneo.
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-black/10 bg-white/95 p-3 shadow-sm h-[100px] flex flex-col">
        <div className="text-[12px] font-semibold text-gray-800">connected Journey</div>
          {related?.length ? (
            <div className="mt-2 flex-1 overflow-y-auto pr-1 space-y-1.5" style={{ scrollbarWidth: "thin" }}>
              {related.map((r) => (
                <button
                  key={r.id}
                  onClick={() => router.push(geUrl(r.id))}
                  className="w-full truncate text-left inline-flex items-center justify-start rounded-xl border border-indigo-200 bg-indigo-50/80 px-3 py-2 text-[12.5px] text-indigo-900 hover:bg-indigo-50 shadow-sm"
                  title={r.title ?? r.slug ?? "Open journey"}
                >
                  {r.title ?? r.slug ?? "Journey"}
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-gray-500">Nessun collegamento.</p>
        )}
      </div>
    </div>

    {/* Colonna 2: Descrizione */}
    <section className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm h-[52svh] min-h-[440px] max-h-[560px] overflow-hidden">
      <div className="flex h-full flex-col">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedIndex((i) => (rows.length ? (i - 1 + rows.length) % rows.length : 0))}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-white shadow-md transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[rgba(15,60,140,0.45)]"
            style={{ background: "linear-gradient(120deg, #0f3c8c 0%, #1a64d6 100%)" }}
            aria-label="Evento precedente"
          >
              <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
                <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              onClick={() => setIsPlaying((p) => !p)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-white shadow-[0_3px_12px_rgba(15,60,140,0.35)] transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[rgba(15,60,140,0.45)]"
            style={{ background: "linear-gradient(120deg, #0f3c8c 0%, #1a64d6 100%)" }}
            aria-label={isPlaying ? "Ferma autoplay" : "Avvia autoplay"}
          >
            {isPlaying ? (
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <rect x="6" y="5" width="4" height="14" fill="currentColor" rx="1" />
                <rect x="14" y="5" width="4" height="14" fill="currentColor" rx="1" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path d="M8 5l10 7-10 7V5Z" fill="currentColor" />
              </svg>
            )}
          </button>
            <button
              onClick={() => setSelectedIndex((i) => (rows.length ? (i + 1) % rows.length : 0))}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-white shadow-md transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[rgba(15,60,140,0.45)]"
            style={{ background: "linear-gradient(120deg, #0f3c8c 0%, #1a64d6 100%)" }}
            aria-label="Evento successivo"
          >
              <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
                <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {voiceOptions.length > 1 && (
              <select
                value={selectedVoiceId ?? ""}
                onChange={(e) => { setSelectedVoiceId(e.target.value || null); }}
                className="min-w-[90px] max-w-[140px] truncate rounded-md border border-slate-200 bg-white px-1 py-0.5 text-[10px] text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                aria-label="Voce sintesi"
              >
                {voiceOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            )}
            {selectedEvent?.wiki_url ? (
              <a
                href={selectedEvent.wiki_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-xl border border-blue-100 bg-blue-50/70 px-2.5 py-1 text-[11px] font-medium text-blue-800 hover:bg-blue-50"
              >
                <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
                  <path d="M7 17 17 7m0 0h-7m7 0v7" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Wiki
              </a>
            ) : null}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto pr-2 text-[13.5px] leading-6 text-gray-800 whitespace-pre-wrap text-justify scroll-pr-2" style={{ scrollbarWidth: "thin" }}>
          {selectedEvent?.description || "No description available."}
        </div>
      </div>
    </section>

    {/* Colonna 3: Mappa */}
    <section
      className={
        mapMode === "fullscreen"
          ? "fixed inset-0 z-[5000] bg-white"
          : "relative h-[52svh] min-h-[400px] max-h-[560px]"
      }
    >
      <div
        data-map="gehj"
        key={`map-desktop-${gid ?? "unknown"}`}
        className={
          mapMode === "fullscreen"
            ? "absolute inset-0 rounded-none overflow-hidden"
            : "h-full w-full rounded-2xl overflow-hidden bg-[linear-gradient(180deg,#eef2ff,transparent)]"
        }
        aria-label="Map canvas"
      />
      {!mapLoaded && (
        <div className="absolute left-3 top-3 z-10 rounded-full border border-indigo-200 bg-indigo-50/90 px-3 py-1 text-xs text-indigo-900 shadow">
          Inizializzazione mappa.
        </div>
      )}
      <div className="absolute left-3 top-3 z-20 flex items-center gap-2">
        <button
          onClick={toggleMapModeView}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-slate-800 shadow hover:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
          title={
            mapMode === "normal"
              ? "Schermo intero"
              : "Riduci mappa"
          }
          aria-label={
            mapMode === "normal"
              ? "Schermo intero"
              : "Riduci mappa"
          }
        >
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            {mapMode === "fullscreen" ? (
              <path d="M15 9h4V5m-4 10h4v4M5 15v4h4M5 5h4V1" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <path d="M9 5H5v4m10-4h4v4m0 6v4h-4M5 15v4h4" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            )}
          </svg>
        </button>
      </div>
      {mapMode === "fullscreen" && (
        <div className="absolute left-3 top-14 z-20 flex items-center gap-2 rounded-full bg-white/85 px-2 py-1 shadow">
          <button
            onClick={() => setSelectedIndex((i) => (rows.length ? (i - 1 + rows.length) % rows.length : 0))}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-white shadow-sm transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[rgba(15,60,140,0.45)]"
            style={{ background: "linear-gradient(120deg, #0f3c8c 0%, #1a64d6 100%)" }}
            aria-label="Evento precedente"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2.1" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            onClick={() => setIsPlaying((p) => !p)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white shadow-sm transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[rgba(15,60,140,0.45)]"
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
            onClick={() => setSelectedIndex((i) => (rows.length ? (i + 1) % rows.length : 0))}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-white shadow-sm transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[rgba(15,60,140,0.45)]"
            style={{ background: "linear-gradient(120deg, #0f3c8c 0%, #1a64d6 100%)" }}
            aria-label="Evento successivo"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.1" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      )}
    </section>
  </div>
</div>

/* Overlay/Full-screen player */}
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
