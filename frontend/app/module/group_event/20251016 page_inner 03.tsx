"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import maplibregl, { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { supabase } from "@/lib/supabaseBrowserClient";
import RatingStars from "../../components/RatingStars";

type AnyObj = Record<string, any>;

type EventCore = {
  id: string;
  latitude: number | null;
  longitude: number | null;
  era?: string | null; // "BC" | "AD"
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

const MODERN_ICONS: Record<string, string> = {
  pin: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z"/><circle cx="12" cy="11" r="3"/></svg>`,
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

/** Hook semplice per sapere se siamo in desktop (breakpoint lg) */
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setIsDesktop(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isDesktop;
}

export default function GroupEventModulePage() {
  const router = useRouter();
  const sp = useSearchParams();

  const desiredLang =
    (sp.get("lang") ||
      (typeof navigator !== "undefined" ? navigator.language?.slice(0, 2) : "it") ||
      "it").toLowerCase();

  const [gid, setGid] = useState<string | null>(null);
  const group_event_id = gid;

  const [err, setErr] = useState<string | null>(null);
  const [landingHref, setLandingHref] = useState<string | null>(null);

  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const raw = sp.get("gid")?.trim() ?? null;
    if (raw) {
      const clean = raw.split("?")[0].split("&")[0].trim();
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
      if (/^\/landing\/[^/]+$/i.test(u.pathname)) {
        setLandingHref(u.pathname);
      }
    } catch {}
  }, []);

  const [ge, setGe] = useState<AnyObj | null>(null);
  const [geTr, setGeTr] = useState<{ title?: string; pitch?: string; description?: string; video_url?: string } | null>(null);
  const [rows, setRows] = useState<EventVM[]>([]);
  const [journeyTitle, setJourneyTitle] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);

  // MAPPA
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<MapLibreMarker[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);

  // refs banda eventi
  const bandRef = useRef<HTMLDivElement | null>(null);
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
        attempts++;
        if (attempts <= MAX_ATTEMPTS) return setTimeout(init, 50);
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
      } catch (e) { console.error("[GE] Map init error:", e); }
    };

    init();
    return () => { cancelled = true; };
  }, []);

  // FETCH
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
             journey_title`
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
          return {
            ...core,
            title: (r.title ?? location ?? "Untitled").toString(),
            description: (r.description ?? "").toString(),
            wiki_url: r.wikipedia_url ? String(r.wikipedia_url) : null,
            video_url: r.video_url ? String(r.video_url) : null,
            order_key: chronoOrderKey(core),
          };
        });
        vms.sort((a, b) => a.order_key - b.order_key);

        setGe(geData);
        setGeTr(geTrData);
        setRows(vms);
        setJourneyTitle(vjRows?.[0]?.journey_title ?? null);
        setSelectedIndex(0);
      } catch (e: any) {
        setErr(e?.message ?? "Unknown error");
        console.error("[GE] Fetch error:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [gid, desiredLang]);

  // Preferiti
  const [isFav, setIsFav] = useState<boolean>(false);
  const [savingFav, setSavingFav] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      if (!gid) return;
      try {
        const { data } = await supabase.auth.getUser();
        const uid = data?.user?.id ?? null;
        setUserId(uid);
        if (!uid) { setIsFav(false); return; }
        let { data: fav, error } = await supabase
          .from("group_event_favourites").select("id")
          .eq("group_event_id", gid).eq("profile_id", uid).maybeSingle();
        if (error) {
          const alt = await supabase
            .from("group_event_favourites").select("id")
            .eq("group_event_id", gid).eq("user_id", uid).maybeSingle();
          setIsFav(!!alt.data);
        } else {
          setIsFav(!!fav);
        }
      } catch { setIsFav(false); }
    })();
  }, [gid]);

  async function toggleFavourite() {
    if (!gid) return;
    const { data } = await supabase.auth.getUser();
    const uid = data?.user?.id ?? null;
    if (!uid) { alert("Per usare i preferiti devi accedere."); return; }
    if (savingFav) return;

    setSavingFav(true);
    try {
      if (isFav) {
        const del1 = await supabase
          .from("group_event_favourites").delete()
          .eq("group_event_id", gid).eq("profile_id", uid);
        if (del1.error) {
          await supabase.from("group_event_favourites").delete()
            .eq("group_event_id", gid).eq("user_id", uid);
        }
        setIsFav(false);
      } else {
        const ins = await supabase.from("group_event_favourites").insert({
          group_event_id: gid, profile_id: uid, created_at: new Date().toISOString(),
        } as any);
        if (ins.error) {
          await supabase.from("group_event_favourites").insert({
            group_event_id: gid, user_id: uid, created_at: new Date().toISOString(),
          } as any);
        }
        setIsFav(true);
      }
    } finally { setSavingFav(false); }
  }

  // MARKERS
  function computePixelOffsetsForSameCoords(ids: string[], radiusBase = 16) {
    const n = ids.length;
    if (n === 1) return [[0, 0]] as [number, number][];
    const arr: [number, number][] = [];
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
      const pxOff = (pixelOffsetById.get(ev.id) as [number, number]) ?? [0, 0];
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
          (b, c) => [[Math.min(b[0][0], c[0]), Math.min(b[0][1], c[1])],[Math.max(b[1][0], c[0]), Math.max(b[1][1], c[1])]],
          [[pts[0][0], pts[0][1]],[pts[0][0], pts[0][1]]]
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

  // Auto-scroll della banda eventi
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
      router.back();
      return;
    }
    router.push(landingHref || "/landing");
  }

  // TIMELINE DATA
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

  const geTitle = (geTr?.title || ge?.title || "Journey").toString();

  // ===== Timeline component: più anni sotto l'asse su DESKTOP =====
  function Timeline3D() {
    const isDesktop = useIsDesktop();
    const data = timelineData;
    if (!data) return null;

    // più tick su desktop
    const ticks = buildTimelineTicks(data.min, data.max, isDesktop ? 12 : 6);

    return (
      <div className="relative flex flex-col items-center justify-center rounded-2xl border border-slate-300 bg-gradient-to-b from-white to-slate-50 px-6 py-6 shadow-[inset_0_2px_10px_rgba(255,255,255,0.9),0_10px_18px_rgba(15,23,42,0.08)]">
        {/* Asse */}
        <div className="relative w-full h-[12px] rounded-full bg-gradient-to-r from-blue-900 via-blue-700 to-blue-900 shadow-inner">
          {/* Puntatore */}
          {(() => {
            const ev = rows[selectedIndex];
            let pct = 50;
            if (ev) {
              const span = buildTimelineSpan(ev);
              if (span) {
                pct = ((span.start - data.min) / Math.max(1, data.range)) * 100;
                pct = Math.max(0, Math.min(100, pct));
              }
            }
            return (
              <div
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rotate-45 border-2 border-white bg-blue-500 shadow"
                style={{ left: `${pct}%`, width: "18px", height: "18px", boxShadow: "0 0 8px rgba(30,64,175,0.55)" }}
              />
            );
          })()}

          {/* Ticks verticali sull'asse */}
          {ticks.map((t, i) => {
            const pct = ((t - data.min) / data.range) * 100;
            return (
              <div
                key={`tick-${i}`}
                className="absolute top-0 h-[8px] w-[2px] -translate-x-1/2 bg-blue-900/60"
                style={{ left: `${pct}%` }}
              />
            );
          })}
        </div>

        {/* Etichette: mobile compatto (min/medio/max), desktop ricco (tutti i tick) */}
        {!isDesktop ? (
          <div className="mt-1.5 relative w-full h-6">
            <div className="absolute inset-x-0 -bottom-0 flex justify-between text-[12px] font-medium text-blue-800/90">
              <span>{formatTimelineYearLabel(data.min)}</span>
              <span>{formatTimelineYearLabel((data.min + data.max) / 2)}</span>
              <span>{formatTimelineYearLabel(data.max)}</span>
            </div>
          </div>
        ) : (
          <div className="mt-2 relative w-full" style={{ minHeight: 24 }}>
            {/* min e max alle estremità */}
            <div className="absolute left-0 -bottom-0 translate-y-1 text-[12px] font-medium text-blue-800/90">
              {formatTimelineYearLabel(data.min)}
            </div>
            <div className="absolute right-0 -bottom-0 translate-y-1 text-[12px] font-medium text-blue-800/90">
              {formatTimelineYearLabel(data.max)}
            </div>
            {/* etichette per ogni tick */}
            {ticks.map((t, i) => {
              const pct = ((t - data.min) / data.range) * 100;
              return (
                <div
                  key={`label-${i}`}
                  className="absolute -bottom-0 translate-y-1 -translate-x-1/2 text-[11.5px] text-blue-900/90"
                  style={{ left: `${pct}%`, whiteSpace: "nowrap" }}
                >
                  {formatTimelineYearLabel(t)}
                </div>
              );
            })}
          </div>
        )}
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

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* HEADER: Titolo + Timeline */}
      {timelineData ? (
        <section className="border-b border-slate-200 bg-white/95 shadow-sm">
          <div className="mx-auto max-w-7xl px-4 py-3 lg:grid lg:grid-cols-[420px_minmax(0,1fr)] lg:items-center lg:gap-6 lg:px-8 lg:py-4">
            {/* Colonna sinistra: titolo + preferiti + rating + timeline mobile */}
            <div className="flex flex-col justify-start rounded-xl border border-slate-200 bg-white p-4 shadow-[inset_0_2px_6px_rgba(0,0,0,0.06)] lg:p-5">
              <h1 className="text-lg lg:text-xl font-semibold text-slate-900 text-left leading-snug break-words whitespace-pre-line">
                {journeyTitle ?? geTr?.title ?? ge?.title ?? "Journey"}
              </h1>
              <div className="mt-3 flex items-center gap-3">
                <button
                  onClick={toggleFavourite}
                  disabled={!group_event_id || savingFav}
                  className={`rounded-full border px-3 py-1 text-sm transition ${
                    isFav ? "border-rose-400 bg-rose-50 text-rose-700 hover:bg-rose-100" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {isFav ? "♥ Favourite" : "♡ Favourite"}
                </button>
                {group_event_id ? <RatingStars group_event_id={group_event_id} journeyId={group_event_id} size={18} /> : null}
              </div>
              {/* Timeline sotto al titolo su mobile */}
              <div className="mt-4 lg:hidden">
                <Timeline3D />
              </div>
            </div>

            {/* Colonna destra: timeline allineata su desktop */}
            <div className="hidden lg:flex items-center">
              <div className="w-full">
                <Timeline3D />
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* BANDA EVENTI (sotto header) */}
      <section className="border-b border-black/10 bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-3" ref={bandRef}>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium text-gray-900">Eventi (ordine cronologico)</div>
            {rows.length ? (
              <div className="text-[12px] text-gray-600">
                Evento <span className="font-medium">{selectedIndex + 1}</span> / <span className="font-medium">{rows.length}</span>
              </div>
            ) : null}
          </div>

          <div className="overflow-x-auto overflow-y-hidden" style={{ scrollbarWidth: "thin" }}>
            <div className="flex items-stretch gap-3 min-w-max">
              {rows.map((ev, idx) => {
                const active = idx === selectedIndex;
                const span = buildTimelineSpan(ev);
                const label = span ? formatTimelineYearLabel(span.start) : formatWhen(ev);
                return (
                  <button
                    key={ev.id}
                    ref={(el) => { if (el) itemRefs.current.set(ev.id, el); }}
                    onClick={() => setSelectedIndex(idx)}
                    className={`shrink-0 w-[78vw] md:w-[320px] max-w-[520px] rounded-xl border px-3 py-2 text-left transition ${
                      active ? "border-black bg-black text-white shadow-sm" : "border-black/10 bg-white/80 text-gray-800 hover:bg-white"
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

      {/* MOBILE: Descrizione -> Mappa */}
      <div className="mx-auto w-full max-w-7xl lg:hidden">
        {/* DESCRIZIONE (senza titolo, senza anni; controlli in alto a destra) */}
        <section className="bg-white/70 backdrop-blur">
          <div className="px-4 py-3">
            <div className="mx-auto w-full max-w-[820px]">
              <div className="rounded-2xl border border-black/10 bg-white/95 shadow-sm">
                {/* Barra controlli in alto a destra */}
                <div className="flex items-center justify-end gap-2 px-3 py-2 border-b border-black/10">
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

                {/* Immagine (se presente) */}
                {rows[selectedIndex]?.image_url ? (
                  <div className="px-4 pt-3">
                    <div className="relative overflow-hidden rounded-xl ring-1 ring-black/10">
                      <img
                        src={rows[selectedIndex]!.image_url!}
                        alt={rows[selectedIndex]!.title}
                        className="h-48 w-full object-cover"
                      />
                    </div>
                  </div>
                ) : null}

                {/* SOLO località (anni rimossi) */}
                {rows[selectedIndex]?.location ? (
                  <div className="px-4 pt-3 text-[12.5px] text-gray-600">
                    {rows[selectedIndex]!.location}
                  </div>
                ) : null}

                {/* Testo */}
                <div className="px-4 pt-2">
                  <div className="h-[28svh] overflow-y-auto pr-2 text-[13.5px] leading-6 text-gray-800 whitespace-pre-wrap" style={{ scrollbarWidth: "thin" }}>
                    {rows[selectedIndex]?.description || "No description available."}
                  </div>
                  <div className="pt-2 flex items-center gap-3">
                    {rows[selectedIndex]?.wiki_url ? (
                      <a
                        href={rows[selectedIndex]!.wiki_url!}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-800"
                      >
                        Wikipedia →
                      </a>
                    ) : null}
                    {rows[selectedIndex]?.video_url ? (
                      <a
                        href={rows[selectedIndex]!.video_url!}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white/80 px-3 py-1.5 text-sm text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-800"
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

        {/* MAPPA */}
        <section className="relative h-[50svh] min-h-[320px] border-t border-black/10">
          <div data-map="gehj" className="h-full w-full bg-[linear-gradient(180deg,#eef2ff,transparent)]" aria-label="Map canvas" />
          {!mapLoaded && (
            <div className="absolute left-3 top-3 z-10 rounded-full border border-indigo-200 bg-indigo-50/90 px-3 py-1 text-xs text-indigo-900 shadow">
              Inizializzazione mappa…
            </div>
          )}
        </section>
      </div>

      {/* DESKTOP: Descrizione (sx) -> Mappa (dx) */}
      <div className="mx-auto hidden w-full max-w-7xl lg:block">
        <div className="grid grid-cols-[500px_minmax(0,1fr)] gap-0 h-[calc(100svh-36svh)]">
          {/* DESCRIZIONE (senza titolo, senza anni; controlli in alto a destra) */}
          <section className="overflow-y-auto bg-white/70 backdrop-blur">
            <div className="px-4 py-4">
              {/* Barra controlli in alto a destra */}
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

              {/* SOLO località (anni rimossi) */}
              {rows[selectedIndex]?.location ? (
                <div className="text-[12.5px] text-gray-600 mb-2">
                  {rows[selectedIndex]!.location}
                </div>
              ) : null}

              {/* Immagine */}
              {rows[selectedIndex]?.image_url ? (
                <div className="mb-3">
                  <div className="relative overflow-hidden rounded-xl ring-1 ring-black/10">
                    <img
                      src={rows[selectedIndex]!.image_url!}
                      alt={rows[selectedIndex]!.title}
                      className="h-44 w-full object-cover"
                    />
                  </div>
                </div>
              ) : null}

              {/* Testo */}
              <div className="whitespace-pre-wrap text-[13.5px] leading-6 text-gray-800">
                {rows[selectedIndex]?.description || "No description available."}
              </div>

              {/* Link utili */}
              <div className="pt-2 flex items-center gap-3">
                {rows[selectedIndex]?.wiki_url ? (
                  <a
                    href={rows[selectedIndex]!.wiki_url!}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-800"
                  >
                    Wikipedia →
                  </a>
                ) : null}
                {rows[selectedIndex]?.video_url ? (
                  <a
                    href={rows[selectedIndex]!.video_url!}
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
    </div>
  );
}
