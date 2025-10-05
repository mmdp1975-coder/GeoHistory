"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseBrowserClient";

type UUID = string;

type EventsListRowRaw = {
  source_event_id: UUID | null;
  year_from: number | null;
  year_to: number | null;
  era: string | null;
};
type EventsListRowNorm = {
  source_event_id: UUID;
  yFrom: number;
  yTo: number;
};

type EGE = { event_id: UUID; group_event_id: UUID };
type GroupEvent = {
  id: UUID;
  title: string | null;
  slug: string | null;
  color_hex: string | null;
  icon_name: string | null;
  cover_url: string | null;
};
type GeWithCount = GroupEvent & {
  matched_events: number;
  earliest_year: number | null;
};

const DEFAULT_FROM = -3000;
const DEFAULT_TO = 2025;

const EGE_CHUNK = 100;
const GE_CHUNK = 250;
const TR_CHUNK = 400;
const EV_TXT_CHUNK = 600;

const BRAND_BLUE = "#0b3b60";
const BRAND_BLUE_SOFT = "#0d4a7a";
const THUMB_ACTIVE_BG = "#6bb2ff";

// ===== Helpers =====
function isBC(v?: string | null) {
  if (!v) return false;
  const s = v.trim().toUpperCase();
  return s === "BC" || s === "BCE";
}
function normYear(year: number | null, era: string | null): number | null {
  if (year == null || !Number.isFinite(year)) return null;
  return isBC(era) ? -Math.abs(year) : Math.abs(year);
}
function formatYear(y: number) {
  if (y < 0) return `${Math.abs(y)} BCE`;
  if (y === 0) return "0";
  return `${y} CE`;
}
function safeColor(hex?: string | null, fallback = "#111827") {
  const h = (hex || "").trim();
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(h) ? h : fallback;
}
function niceStep(span: number, targetTicks = 7) {
  const raw = Math.max(1, span) / targetTicks;
  const pow10 = Math.pow(10, Math.floor(Math.log10(Math.max(1, Math.abs(raw)))));
  const base = raw / pow10;
  let nice = 1;
  if (base <= 1) nice = 1;
  else if (base <= 2) nice = 2;
  else if (base <= 2.5) nice = 2.5;
  else if (base <= 5) nice = 5;
  else nice = 10;
  return nice * pow10;
}

export default function TimelinePage() {
  const search = useSearchParams();

  // ===== Dati / dominio =====
  const [eventsNorm, setEventsNorm] = useState<EventsListRowNorm[]>([]);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dataMin, setDataMin] = useState<number | null>(null);
  const [dataMax, setDataMax] = useState<number | null>(null);

  // Stato timeframe: from/to
  const [fromYear, setFromYear] = useState<number>(DEFAULT_FROM);
  const [toYear, setToYear] = useState<number>(DEFAULT_TO);

  // Riferimenti reattivi (per avere valori freschi durante il drag)
  const fromRef = useRef(fromYear);
  const toRef = useRef(toYear);
  useEffect(() => { fromRef.current = fromYear; }, [fromYear]);
  useEffect(() => { toRef.current = toYear; }, [toYear]);

  // Debounce + risultati
  const [loading, setLoading] = useState(false);
  const [groupEvents, setGroupEvents] = useState<GeWithCount[]>([]);
  const [totalMatches, setTotalMatches] = useState(0);

  // Preferiti
  const [favs, setFavs] = useState<Set<UUID>>(new Set());
  const [favMsg, setFavMsg] = useState<string | null>(null);

  // Cache mapping
  const egeCache = useRef<Map<UUID, UUID[]>>(new Map());

  // Free text search
  const [q, setQ] = useState<string>("");
  const [qDebounced, setQDebounced] = useState<string>("");

  useEffect(() => {
    const id = setTimeout(() => setQDebounced(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);

  // ===== Init dati =====
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setInitializing(true);
        setError(null);

        const { data, error: evErr } = await supabase
          .from("events_list")
          .select("source_event_id, year_from, year_to, era")
          .limit(20000);
        if (evErr) throw evErr;

        const raw = (data as EventsListRowRaw[]) || [];
        const norm: EventsListRowNorm[] = [];
        for (const r of raw) {
          if (!r.source_event_id) continue;
          const y1 = normYear(r.year_from, r.era);
          const y2 = normYear(r.year_to ?? r.year_from, r.era);
          if (y1 == null && y2 == null) continue;
          let a = (y1 ?? y2)!;
          let b = (y2 ?? y1)!;
          if (a > b) [a, b] = [b, a];
          norm.push({ source_event_id: r.source_event_id, yFrom: Math.trunc(a), yTo: Math.trunc(b) });
        }

        let domainMin = DEFAULT_FROM;
        let domainMax = DEFAULT_TO;
        if (norm.length > 0) {
          const ys: number[] = [];
          for (const e of norm) ys.push(e.yFrom, e.yTo);
          domainMin = Math.min(...ys);
          domainMax = Math.max(...ys);
          if (domainMin > domainMax) [domainMin, domainMax] = [domainMax, domainMin];
        }

        if (cancelled) return;

        setEventsNorm(norm);
        setDataMin(domainMin);
        setDataMax(domainMax);

      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Initialization error");
      } finally {
        if (!cancelled) setInitializing(false);
      }
    })();
    return () => { cancelled = true; };
  }, [search]);

  const minDomain = useMemo(() => (dataMin == null ? DEFAULT_FROM : Math.trunc(dataMin)), [dataMin]);
  const maxDomain = useMemo(() => (dataMax == null ? DEFAULT_TO : Math.trunc(dataMax)), [dataMax]);

  const span = useMemo(() => Math.max(1, toYear - fromYear), [fromYear, toYear]);

  const domainReady =
    !initializing &&
    typeof minDomain === "number" &&
    typeof maxDomain === "number" &&
    Number.isFinite(fromYear) &&
    Number.isFinite(toYear);

  // ===== Debounce timeframe per query =====
  const debouncedSel = (() => {
    const [val, setVal] = useState<{ from: number; to: number } | null>(null);
    useEffect(() => {
      if (!domainReady) return;
      const id = setTimeout(() => setVal({ from: fromYear, to: toYear }), 250);
      return () => clearTimeout(id);
    }, [fromYear, toYear, domainReady]);
    return val;
  })();

  // ===== Query (tempo + testo) =====
  useEffect(() => {
    if (!domainReady || !debouncedSel) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const from = debouncedSel.from;
        const to = debouncedSel.to;

        // 1) Eventi nel range
        const eventYearMap = new Map<UUID, number>();
        for (const e of eventsNorm) eventYearMap.set(e.source_event_id, e.yFrom);

        const matched = eventsNorm.filter((e) => e.yFrom <= to && e.yTo >= from);
        const eventIds = Array.from(new Set(matched.map((m) => m.source_event_id)));

        if (eventIds.length === 0) {
          if (!cancelled) { setGroupEvents([]); setTotalMatches(0); }
          setLoading(false);
          return;
        }

        // 2) Mapping event->group_event con cache
        const cachedPairs: EGE[] = [];
        const toFetchEGE: UUID[] = [];
        for (const id of eventIds) {
          const cached = egeCache.current.get(id);
          if (cached) cached.forEach(geid => cachedPairs.push({ event_id: id, group_event_id: geid }));
          else toFetchEGE.push(id);
        }

        const fetchedPairs: EGE[] = [];
        for (let i = 0; i < toFetchEGE.length; i += EGE_CHUNK) {
          const chunk = toFetchEGE.slice(i, i + EGE_CHUNK);
          const { data: ege, error: geErr } = await supabase
            .from("event_group_event")
            .select("event_id, group_event_id")
            .in("event_id", chunk);
          if (geErr) throw geErr;
          const rows = ((ege as EGE[]) || []);
          fetchedPairs.push(...rows);
          const byEvent = new Map<UUID, UUID[]>();
          for (const r of rows) {
            if (!byEvent.has(r.event_id)) byEvent.set(r.event_id, []);
            byEvent.get(r.event_id)!.push(r.group_event_id);
          }
          for (const id of chunk) egeCache.current.set(id, byEvent.get(id) || []);
        }

        const allEGE: EGE[] = [...cachedPairs, ...fetchedPairs];
        if (allEGE.length === 0) {
          if (!cancelled) { setGroupEvents([]); setTotalMatches(0); }
          setLoading(false);
          return;
        }

        // 3) Conteggi + earliest
        const counts = new Map<UUID, number>();
        const earliest = new Map<UUID, number>();
        const geIdsFromTime = new Set<UUID>();
        for (const row of allEGE) {
          geIdsFromTime.add(row.group_event_id);
          counts.set(row.group_event_id, (counts.get(row.group_event_id) || 0) + 1);
          const y = eventYearMap.get(row.event_id);
          if (typeof y === "number") {
            const cur = earliest.get(row.group_event_id);
            if (cur == null || y < cur) earliest.set(row.group_event_id, y);
          }
        }
        const geIdsTimeArr = Array.from(geIdsFromTime);

        // 4) Metadata GE
        const allGE: GroupEvent[] = [];
        for (let i = 0; i < geIdsTimeArr.length; i += GE_CHUNK) {
          const chunk = geIdsTimeArr.slice(i, i + GE_CHUNK);
          const { data: ges, error: geErr } = await supabase
            .from("group_events")
            .select("id, title, slug, color_hex, icon_name, cover_url")
            .in("id", chunk);
          if (geErr) throw geErr;
          allGE.push(...((ges as GroupEvent[]) || []));
        }

        // 5) Filtro testo
        let allowedGE = new Set<UUID>(geIdsTimeArr);
        const needle = qDebounced.toLowerCase();

        if (needle.length > 0) {
          const geByTitle = new Set<UUID>();
          for (const g of allGE) {
            const t = (g.title || "").toLowerCase();
            const s = (g.slug || "").toLowerCase();
            if (t.includes(needle) || s.includes(needle)) geByTitle.add(g.id);
          }

          const geByTranslations = new Set<UUID>();
          try {
            for (let i = 0; i < geIdsTimeArr.length; i += TR_CHUNK) {
              const chunk = geIdsTimeArr.slice(i, i + TR_CHUNK);
              const { data: tr } = await supabase
                .from("group_event_translations")
                .select("group_event_id, title, summary, description")
                .in("group_event_id", chunk);
              (tr || []).forEach((r: any) => {
                const str = [(r.title||""),(r.summary||""),(r.description||"")].join(" ").toLowerCase();
                if (str.includes(needle)) geByTranslations.add(r.group_event_id as UUID);
              });
            }
          } catch {}

          const geByEventsText = new Set<UUID>();
          try {
            for (let i = 0; i < eventIds.length; i += EV_TXT_CHUNK) {
              const chunk = eventIds.slice(i, i + EV_TXT_CHUNK);
              const { data: evtx } = await supabase
                .from("events_list")
                .select("source_event_id, title, description")
                .in("source_event_id", chunk);
              const matchingEventIds = new Set<UUID>();
              (evtx || []).forEach((r: any) => {
                const text = [(r.title||""),(r.description||"")].join(" ").toLowerCase();
                if (text.includes(needle)) matchingEventIds.add(r.source_event_id as UUID);
              });
              if (matchingEventIds.size > 0) {
                for (const pair of allEGE) {
                  if (matchingEventIds.has(pair.event_id)) geByEventsText.add(pair.group_event_id);
                }
              }
            }
          } catch {}

          const textUnion = new Set<UUID>([...geByTitle, ...geByTranslations, ...geByEventsText]);
          allowedGE = new Set<UUID>([...geIdsFromTime].filter((id) => textUnion.has(id)));
        }

        // 6) Merge finale
        const merged: GeWithCount[] = allGE
          .filter((g) => allowedGE.has(g.id))
          .map((g) => ({
            ...g,
            matched_events: counts.get(g.id) || 0,
            earliest_year: earliest.has(g.id) ? (earliest.get(g.id) as number) : null
          }))
          .sort((a, b) => {
            if (a.earliest_year == null && b.earliest_year == null) {
              return b.matched_events - a.matched_events;
            }
            if (a.earliest_year == null) return 1;
            if (b.earliest_year == null) return -1;
            if (a.earliest_year !== b.earliest_year) return a.earliest_year - b.earliest_year;
            return b.matched_events - a.matched_events;
          });

        setGroupEvents(merged);
        setTotalMatches(merged.reduce((acc, x) => acc + x.matched_events, 0));
      } catch (e: any) {
        setError(e?.message ?? "Unknown error");
      } finally {
        setLoading(false);
      }
    })();
  }, [domainReady, debouncedSel, eventsNorm, qDebounced]);

  // ===== Preferiti =====
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setFavs(new Set()); return; }
        if (groupEvents.length === 0) { setFavs(new Set()); return; }

        const ids = groupEvents.map(g => g.id);
        const { data, error: favErr } = await supabase
          .from("group_event_favourites")              // ⬅️ table name updated
          .select("group_event_id")
          .in("group_event_id", ids)
          .eq("profile_id", user.id);                  // ⬅️ column name updated
        if (favErr) return;
        const s = new Set<UUID>((data || []).map((r: any) => r.group_event_id as UUID));
        if (!cancelled) setFavs(s);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [groupEvents]);

  const toggleFavourite = async (ev: React.MouseEvent, groupEventId: UUID) => {
    ev.preventDefault();
    ev.stopPropagation();
    setFavMsg(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setFavMsg("Please sign in to use favourites."); return; }
      const isFav = favs.has(groupEventId);
      const next = new Set(favs);
      if (isFav) next.delete(groupEventId); else next.add(groupEventId);
      setFavs(next);
      if (isFav) {
        const { error } = await supabase.from("group_event_favourites") // ⬅️ table name updated
          .delete()
          .eq("profile_id", user.id)                                   // ⬅️ column name updated
          .eq("group_event_id", groupEventId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("group_event_favourites") // ⬅️ table name updated
          .insert({ profile_id: user.id, group_event_id: groupEventId }); // ⬅️ column name updated
        if (error) throw error;
      }
    } catch (e: any) {
      setFavMsg(e?.message || "Unable to toggle favourite.");
    }
  };

  // ====== Thumbs + Bar: Pointer Events ======
  const selectedBarRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef<null | { mode: "pan" | "zoom"; lastX: number }>(null);

  // quale thumb è attivo (serve per la logica per-thumb)
  const [activeThumb, setActiveThumb] = useState<null | "left" | "right">(null);

  const MIN_SPAN = 1;
  const ZOOM_GAIN = 2; // sensibilità 2x

  function pxToYears(dxPx: number, barWidthPx: number, baseSpan: number, gain = 1) {
    if (barWidthPx <= 0) return 0;
    return (dxPx / barWidthPx) * baseSpan * gain;
  }

  function startPan(e: React.PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    draggingRef.current = { mode: "pan", lastX: e.clientX };
  }

  function startZoom(e: React.PointerEvent, which: "left" | "right") {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    draggingRef.current = { mode: "zoom", lastX: e.clientX };
    setActiveThumb(which);
  }

  function onMove(e: React.PointerEvent) {
    if (!draggingRef.current) return;

    const bar = trackRef.current ?? selectedBarRef.current;
    if (!bar) return;

    const rect = bar.getBoundingClientRect();
    const barWidth = rect.width;

    const { mode, lastX } = draggingRef.current;
    const dx = e.clientX - (lastX ?? e.clientX);
    draggingRef.current.lastX = e.clientX;

    const curFrom = fromRef.current;
    const curTo = toRef.current;

    if (mode === "pan") {
      const currentSpan = Math.max(1, curTo - curFrom);
      const dYears = pxToYears(dx, barWidth, currentSpan, 1); // pan non amplificato
      let nextFrom = curFrom + dYears;
      let nextTo = curTo + dYears;

      if (nextFrom < minDomain) { nextTo += (minDomain - nextFrom); nextFrom = minDomain; }
      if (nextTo > maxDomain) { nextFrom -= (nextTo - maxDomain); nextTo = maxDomain; }

      nextFrom = Math.round(nextFrom);
      nextTo = Math.round(nextTo);

      fromRef.current = nextFrom;
      toRef.current = nextTo;
      setFromYear(nextFrom);
      setToYear(nextTo);
      return;
    }

    // === ZOOM PER-THUMB (2x) ===
    const currentSpan = Math.max(1, curTo - curFrom);
    const dYears = pxToYears(dx, barWidth, currentSpan, ZOOM_GAIN);

    if (activeThumb === "left") {
      // muove SOLO from
      let nextFrom = curFrom + dYears; // dx>0 → from aumenta (zoom in), dx<0 → from diminuisce (zoom out)

      // clamp entro [minDomain, curTo - MIN_SPAN]
      const maxFrom = curTo - MIN_SPAN;
      if (nextFrom > maxFrom) nextFrom = maxFrom;
      if (nextFrom < minDomain) nextFrom = minDomain;

      const nextFromInt = Math.round(nextFrom);
      fromRef.current = nextFromInt;
      setFromYear(nextFromInt);
      return;
    }

    if (activeThumb === "right") {
      // muove SOLO to
      let nextTo = curTo + dYears; // dx>0 → to aumenta (zoom out), dx<0 → to diminuisce (zoom in)

      // clamp entro [curFrom + MIN_SPAN, maxDomain]
      const minTo = curFrom + MIN_SPAN;
      if (nextTo < minTo) nextTo = minTo;
      if (nextTo > maxDomain) nextTo = maxDomain;

      const nextToInt = Math.round(nextTo);
      toRef.current = nextToInt;
      setToYear(nextToInt);
      return;
    }
  }

  function endDrag(e: React.PointerEvent) {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    draggingRef.current = null;
    setActiveThumb(null);
  }

  // ===== Ticks =====
  const ticks = useMemo(() => {
    if (!domainReady) return [];
    const dMin = Math.round(fromYear);
    const dMax = Math.round(toYear);
    const s = Math.max(1, dMax - dMin);
    const step = niceStep(s, 7);
    const first = Math.ceil(dMin / step) * step;
    const out: number[] = [];
    for (let t = first; t <= dMax; t += step) out.push(Math.round(t));
    return out;
  }, [domainReady, fromYear, toYear]);

  // ===== UI =====
  const LEFT_EDGE_PCT = 0.1;   // 10%
  const SELECTED_PCT = 0.8;    // 80%

  const thumbClassIdle = "block h-4 w-4 rounded-full border border-black/20 bg-white shadow transition-all duration-100";
  const thumbClassActive = "block h-[22px] w-[22px] rounded-full border border-white shadow-lg ring-2 ring-white ring-offset-2 transition-all duration-100";

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-neutral-50 to-white text-neutral-900">
      {/* HEADER */}
      <header className="z-20 border-b border-neutral-200" style={{ backgroundColor: BRAND_BLUE }}>
        <div className="mx-auto max-w-7xl px-4 py-3 text-white">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h1 className="text-lg font-semibold tracking-tight">Timeline Explorer</h1>

            {/* RIGHT: From/To vicini a Show All */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <label className="text-xs text-white/90">From</label>
                <input
                  type="number"
                  className="w-24 rounded-md border border-white/25 bg-white/10 px-2 py-1 text-xs text-white placeholder-white/60 focus:border-white/40 focus:outline-none"
                  value={fromYear}
                  onChange={(e) => {
                    let f = Number(e.target.value);
                    if (!Number.isFinite(f)) return;
                    if (f < minDomain) f = minDomain;
                    if (f > toYear - 1) f = toYear - 1;
                    setFromYear(Math.round(f));
                  }}
                />
              </div>
              <div className="flex items-center gap-1">
                <label className="text-xs text-white/90">To</label>
                <input
                  type="number"
                  className="w-24 rounded-md border border-white/25 bg-white/10 px-2 py-1 text-xs text-white placeholder-white/60 focus:border-white/40 focus:outline-none"
                  value={toYear}
                  onChange={(e) => {
                    let t = Number(e.target.value);
                    if (!Number.isFinite(t)) return;
                    if (t > maxDomain) t = maxDomain;
                    if (t < fromYear + 1) t = fromYear + 1;
                    setToYear(Math.round(t));
                  }}
                />
              </div>
              <button
                onClick={() => {
                  setFromYear(DEFAULT_FROM);
                  setToYear(DEFAULT_TO);
                  setQ("");
                }}
                className="rounded-md border border-white/25 bg-white/10 px-3 py-1 text-xs text-white hover:bg-white/15"
                title="Reset range e ricerca"
              >
                Show All
              </button>
            </div>
          </div>

          {/* TIMELINE */}
          <div className="mt-2 rounded-xl border border-white/15 bg-white/5 shadow-sm">
            <div className="p-2">
              {!domainReady ? (
                <div className="py-4 text-sm text-white/80">Loading timeline…</div>
              ) : (
                <div className="relative h-24 select-none">
                  {/* Main track */}
                  <div className="absolute left-3 right-3 top-1/2 -translate-y-1/2" ref={trackRef}>
                    <div
                      className="h-[8px] w-full rounded-full"
                      style={{
                        background: "linear-gradient(180deg, #f4f6f9 0%, #e8ecf2 50%, #dfe5ee 100%)",
                        boxShadow:
                          "inset 0 1px 2px rgba(0,0,0,0.18), inset 0 -1px 1px rgba(255,255,255,0.5), 0 1px 1px rgba(0,0,0,0.08)"
                      }}
                    />
                  </div>

                  {/* Selected range bar (centrata) */}
                  <div
                    ref={selectedBarRef}
                    className="absolute top-1/2 -translate-y-1/2"
                    style={{
                      left: `${LEFT_EDGE_PCT * 100}%`,
                      width: `${SELECTED_PCT * 100}%`,
                      height: 8,
                      borderRadius: 9999,
                      background: `linear-gradient(180deg, ${BRAND_BLUE_SOFT} 0%, ${BRAND_BLUE} 60%, #072b46 100%)`,
                      boxShadow:
                        "inset 0 1px 1px rgba(255,255,255,0.25), inset 0 -1px 1px rgba(0,0,0,0.30), 0 1px 3px rgba(0,0,0,0.18)",
                      cursor: draggingRef.current?.mode === "pan" ? "grabbing" : "grab"
                    }}
                    onPointerDown={startPan}
                    onPointerMove={onMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    title="Pan: trascina per spostare il timeframe"
                  >
                    {/* LEFT THUMB (ZOOM SOLO FROM) */}
                    <button
                      type="button"
                      onPointerDown={(e) => startZoom(e, "left")}
                      onPointerMove={onMove}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                      className="absolute left-0 top-1/2 -translate-y-1/2 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
                      style={{ transform: "translate(-50%, -50%)", touchAction: "none" as any, cursor: "ew-resize" }}
                      aria-label="Zoom (left thumb)"
                      title="Zoom: trascina a sinistra/destra"
                    >
                      <span
                        className={activeThumb === "left" ? thumbClassActive : thumbClassIdle}
                        style={activeThumb === "left" ? { backgroundColor: THUMB_ACTIVE_BG } : undefined}
                      />
                    </button>

                    {/* RIGHT THUMB (ZOOM SOLO TO) */}
                    <button
                      type="button"
                      onPointerDown={(e) => startZoom(e, "right")}
                      onPointerMove={onMove}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                      className="absolute right-0 top-1/2 -translate-y-1/2 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
                      style={{ transform: "translate(50%, -50%)", touchAction: "none" as any, cursor: "ew-resize" }}
                      aria-label="Zoom (right thumb)"
                      title="Zoom: trascina a sinistra/destra"
                    >
                      <span
                        className={activeThumb === "right" ? thumbClassActive : thumbClassIdle}
                        style={activeThumb === "right" ? { backgroundColor: THUMB_ACTIVE_BG } : undefined}
                      />
                    </button>
                  </div>

                  {/* Ticks (sul timeframe corrente) */}
                  <div className="absolute inset-x-3 bottom-1">
                    <div className="relative h-5">
                      {(() => {
                        const dMin = Math.round(fromYear);
                        const dMax = Math.round(toYear);
                        const s = Math.max(1, dMax - dMin);
                        const step = niceStep(s, 7);
                        const first = Math.ceil(dMin / step) * step;
                        const tickVals: number[] = [];
                        for (let t = first; t <= dMax; t += step) tickVals.push(Math.round(t));

                        return tickVals.map((t) => (
                          <div
                            key={t}
                            className="absolute top-0 -translate-x-1/2"
                            style={{
                              left: `calc(${LEFT_EDGE_PCT * 100}% + ${((t - dMin) / Math.max(1, dMax - dMin)) * SELECTED_PCT * 100}%)`
                            }}
                          >
                            <div className="h-[10px] w-px bg-white/85" />
                            <div className="mt-0.5 text-[10px] leading-none text-white/95 whitespace-nowrap translate-x-1/2">
                              {formatYear(t)}
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* BODY: info + free text search */}
      <main className="mx-auto max-w-7xl px-4 py-5">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-neutral-600">
            {initializing ? (
              <span>Initializing…</span>
            ) : loading ? (
              <span className="animate-pulse">Loading results…</span>
            ) : (
              <span>
                In range: <span className="font-medium">{groupEvents.length}</span> group
                event{groupEvents.length === 1 ? "" : "s"} • total matched events:{" "}
                <span className="font-medium">{totalMatches}</span>
              </span>
            )}
          </div>

          {/* Free text search */}
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <label className="whitespace-nowrap text-sm text-neutral-700">Free text search</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Type to filter…"
                className="w-72 rounded-md border border-neutral-300 bg-white px-3 py-1 text-sm text-neutral-900 placeholder-neutral-400 focus:border-neutral-400 focus:outline-none"
              />
              <button
                onClick={() => setQ("")}
                className="rounded-md border border-neutral-300 bg-white px-3 py-1 text-sm text-neutral-700 hover:bg-neutral-50"
                title="Clear text and keep only time range"
              >
                Clear
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}

        {favMsg && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800">
            {favMsg}
          </div>
        )}

        {!loading && groupEvents.length === 0 && !initializing && !error && (
          <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center text-neutral-600">
            Nessun group event trovato. Prova a modificare il timeframe o svuota la ricerca.
          </div>
        )}

        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {groupEvents.map((g) => {
            const accent = safeColor(g.color_hex, "#111827");
            const gradient = `linear-gradient(180deg, ${accent}1A 0%, ${accent}0D 60%, #FFFFFF 100%)`;
            const isFav = favs.has(g.id);
            return (
              <li key={g.id}>
                <Link
                  href={`/module/group_event?gid=${g.id}`}
                  className="group block h-full overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="relative h-36 w-full overflow-hidden" style={{ background: gradient }}>
                    {g.cover_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={g.cover_url}
                        alt={g.title || g.slug || "Cover"}
                        className="h-full w-full object-cover opacity-95 transition-transform group-hover:scale-[1.02]"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-neutral-400">
                        <span className="text-sm">No cover</span>
                      </div>
                    )}

                    {/* Favourite pill */}
                    <button
                      type="button"
                      role="button"
                      aria-pressed={isFav}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleFavourite(e, g.id);
                      }}
                      className="absolute left-3 top-3 z-20 pointer-events-auto inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-1 text-xs font-medium ring-1 ring-white hover:bg-white"
                      style={{ color: accent }}
                      title={isFav ? "Remove from favourites" : "Add to favourites"}
                    >
                      <span aria-hidden="true">{isFav ? "★" : "☆"}</span>
                      <span>Favourite</span>
                    </button>
                  </div>

                  <div className="p-4">
                    <div className="mb-1 line-clamp-1 text-[15px] font-semibold tracking-tight">
                      {g.title || g.slug || "Untitled"}
                    </div>
                    <div className="text-sm text-neutral-600">
                      {g.matched_events} event{g.matched_events === 1 ? "" : "s"} in range
                      {typeof g.earliest_year === "number" && (
                        <span className="text-neutral-400"> • from {formatYear(g.earliest_year)}</span>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}

