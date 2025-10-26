﻿"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseBrowserClient";
import RatingSummary from "../../components/RatingSummary";

type UUID = string;

/** === View row (v_journeys) === */
type VJourneyRow = {
  journey_id: UUID;
  journey_slug: string | null;
  journey_cover_url: string | null;
  translation_title: string | null;
  translation_description?: string | null;
  translation_lang2?: string | null;
  events_count: number | null;
  year_from_min: number | null;
  year_to_max: number | null;
  favourites_count?: number | null;
  is_favourite?: boolean | null;
  visibility?: string | null;
  workflow_state?: string | null;
};

/** === Card model (compatibile con il render precedente) === */
type GeWithCount = {
  id: UUID;
  slug: string | null;
  cover_url: string | null;
  title: string | null;
  matched_events: number;
  earliest_year: number | null;
};

const DEFAULT_FROM = -3000;
const DEFAULT_TO = 2025;

const BRAND_BLUE = "#0b3b60";
const BRAND_BLUE_SOFT = "#0d4a7a";
const THUMB_ACTIVE_BG = "#6bb2ff";
const ACCENT = "#111827";

/* ===== Helpers UI ===== */
function formatYear(y: number) {
  if (y < 0) return `${Math.abs(y)} BCE`;
  if (y === 0) return "0";
  return `${y} CE`;
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

  /* ======= STATE PRINCIPALI ======= */
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dataMin, setDataMin] = useState<number | null>(null);
  const [dataMax, setDataMax] = useState<number | null>(null);

  const [fromYear, setFromYear] = useState<number>(DEFAULT_FROM);
  const [toYear, setToYear] = useState<number>(DEFAULT_TO);

  const fromRef = useRef(fromYear);
  const toRef = useRef(toYear);
  useEffect(() => { fromRef.current = fromYear; }, [fromYear]);
  useEffect(() => { toRef.current = toYear; }, [toYear]);

  const [loading, setLoading] = useState(false);
  const [groupEvents, setGroupEvents] = useState<GeWithCount[]>([]);
  const [totalMatches, setTotalMatches] = useState(0);

  const [favs, setFavs] = useState<Set<UUID>>(new Set());
  const [favMsg, setFavMsg] = useState<string | null>(null);

  const [q, setQ] = useState<string>(search?.get("q") ?? "");
  const [qDebounced, setQDebounced] = useState<string>(q);
  useEffect(() => {
    const id = setTimeout(() => setQDebounced(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);

  /* ======= 1) INIT: dominio temporale da v_journeys ======= */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setInitializing(true);
        setError(null);

        const { data, error } = await supabase
          .from("v_journeys")
          .select("year_from_min, year_to_max")
          .eq("visibility", "public")
          .eq("workflow_state", "published")
          .limit(20000);
        if (error) throw error;

        const rows = (data as VJourneyRow[]) || [];
        const mins: number[] = rows.map(r => r?.year_from_min).filter((x: any) => Number.isFinite(x)) as number[];
        const maxs: number[] = rows.map(r => r?.year_to_max).filter((x: any) => Number.isFinite(x)) as number[];
        const minY = mins.length ? Math.min(...mins) : DEFAULT_FROM;
        const maxY = maxs.length ? Math.max(...maxs) : DEFAULT_TO;

        if (!cancelled) {
          setDataMin(minY);
          setDataMax(maxY);
          setFromYear(minY);
          setToYear(maxY);
        }
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

  const domainReady =
    !initializing &&
    typeof minDomain === "number" &&
    typeof maxDomain === "number" &&
    Number.isFinite(fromYear) &&
    Number.isFinite(toYear);

  /* ======= Debounce del timeframe ======= */
  const debouncedSel = (() => {
    const [val, setVal] = useState<{ from: number; to: number } | null>(null);
    useEffect(() => {
      if (!domainReady) return;
      const id = setTimeout(() => setVal({ from: fromYear, to: toYear }), 250);
      return () => clearTimeout(id);
    }, [fromYear, toYear, domainReady]);
    return val;
  })();

  /* ======= 2) QUERY UNICA SU v_journeys (overlap + testo) ======= */
  useEffect(() => {
    if (!domainReady || !debouncedSel) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const from = debouncedSel.from;
        const to = debouncedSel.to;

        let query = supabase
          .from("v_journeys")
          .select("journey_id, journey_slug, journey_cover_url, translation_title, translation_description, translation_lang2, events_count, year_from_min, year_to_max, favourites_count, is_favourite")
          .eq("visibility", "public")
          .eq("workflow_state", "published")
          // overlap: il journey entra in lista se il suo range interseca il selezionato
          .lte("year_from_min", to)
          .gte("year_to_max", from);

        if (qDebounced) {
          const qv = `%${qDebounced}%`;
          query = query.or(
            `journey_slug.ilike.${qv},translation_title.ilike.${qv},translation_description.ilike.${qv}`
          );
        }

        const { data, error } = await query.limit(2000);
        if (error) throw error;

        const rows = (data as VJourneyRow[]) || [];

        // Mappatura 1:1 per il render precedente
        const mapped: GeWithCount[] = rows.map((r) => ({
          id: r.journey_id,
          slug: r.journey_slug ?? null,
          cover_url: r.journey_cover_url ?? null,
          title: r.translation_title ?? r.journey_slug ?? null,
          matched_events: r.events_count ?? 0,
          earliest_year: r.year_from_min ?? null,
        }));

        // Ordinamento come prima: earliest asc, poi matched desc
        mapped.sort((a, b) => {
          const ae = a.earliest_year ?? Number.POSITIVE_INFINITY;
          const be = b.earliest_year ?? Number.POSITIVE_INFINITY;
          if (ae !== be) return ae - be;
          return (b.matched_events ?? 0) - (a.matched_events ?? 0);
        });

        if (!cancelled) {
          setGroupEvents(mapped);
          setTotalMatches(mapped.reduce((acc, x) => acc + (x.matched_events || 0), 0));

          // Preferiti: se la view espone is_favourite, usalo; fallback: query tabella
          const favSet = new Set<UUID>();
          let needFallback = false;
          for (const r of rows) {
            if (typeof r.is_favourite === "boolean") {
              if (r.is_favourite) favSet.add(r.journey_id);
            } else {
              needFallback = true;
            }
          }
          setFavs(favSet);

          if (needFallback) {
            // fallback: carica preferiti utente per le card correnti
            try {
              const { data: { user } } = await supabase.auth.getUser();
              if (user && mapped.length > 0) {
                const ids = mapped.map(g => g.id);
                const { data: favRows } = await supabase
                  .from("group_event_favourites")
                  .select("group_event_id")
                  .in("group_event_id", ids)
                  .eq("profile_id", user.id);
                if (favRows && !cancelled) {
                  const s = new Set<UUID>((favRows as any[]).map(r => r.group_event_id as UUID));
                  setFavs(s);
                }
              }
            } catch { /* no-op */ }
          }
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [domainReady, debouncedSel, qDebounced]);

  /* ======= 3) Preferiti: toggle (mutazione su tabella reale) ======= */
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
        const { error } = await supabase.from("group_event_favourites")
          .delete()
          .eq("profile_id", user.id)
          .eq("group_event_id", groupEventId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("group_event_favourites")
          .insert({ profile_id: user.id, group_event_id: groupEventId });
        if (error) throw error;
      }
    } catch (e: any) {
      setFavMsg(e?.message || "Unable to toggle favourite.");
    }
  };

  /* ======= 4) TIMELINE — identica alla tua “bella” ======= */

  // Pointer events state
  const selectedBarRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef<null | { mode: "pan" | "zoom"; lastX: number }>(null);

  const [activeThumb, setActiveThumb] = useState<null | "left" | "right">(null);

  const MIN_SPAN = 1;
  const ZOOM_GAIN = 2;

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
      const dYears = pxToYears(dx, barWidth, currentSpan, 1);
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

    const currentSpan = Math.max(1, curTo - curFrom);
    const dYears = pxToYears(dx, barWidth, currentSpan, ZOOM_GAIN);

    if (activeThumb === "left") {
      let nextFrom = curFrom + dYears;
      const maxFrom = curTo - MIN_SPAN;
      if (nextFrom > maxFrom) nextFrom = maxFrom;
      if (nextFrom < minDomain) nextFrom = minDomain;
      const nextFromInt = Math.round(nextFrom);
      fromRef.current = nextFromInt;
      setFromYear(nextFromInt);
      return;
    }

    if (activeThumb === "right") {
      let nextTo = curTo + dYears;
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

  // Tick calcolati sul range selezionato (come prima)
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

  // Geometrie/percentuali della “barra bella”
  const LEFT_EDGE_PCT = 0.1;
  const SELECTED_PCT = 0.8;

  const thumbClassIdle = "block h-4 w-4 rounded-full border border-black/20 bg-white shadow transition-all duration-100";
  const thumbClassActive = "block h-[22px] w-[22px] rounded-full border border-white shadow-lg ring-2 ring-white ring-offset-2 transition-all duration-100";

  /* ================== RENDER ================== */
  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-neutral-50 to-white text-neutral-900">
      {/* HEADER */}
      <header className="z-20 border-b border-neutral-200" style={{ backgroundColor: BRAND_BLUE }}>
        <div className="mx-auto max-w-7xl px-4 py-3 text-white">
          <div className="flex flex-wrap items	end justify-between gap-3">
            <h1 className="text-lg font-semibold tracking-tight">Timeline Explorer</h1>

            {/* RIGHT: From/To */}
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
                  setFromYear(minDomain);
                  setToYear(maxDomain);
                  setQ("");
                }}
                className="rounded-md border border-white/25 bg-white/10 px-3 py-1 text-xs text-white hover:bg-white/15"
                title="Reset range e ricerca"
              >
                Show All
              </button>
            </div>
          </div>

          {/* TIMELINE (quella “bella”, invariata) */}
          <div className="mt-2 rounded-xl border border-white/15 bg-white/5 shadow-sm">
            <div className="p-2">
              {!domainReady ? (
                <div className="py-4 text-sm text-white/80">Loading timeline…</div>
              ) : (
                <div className="relative h-24 select-none">
                  {/* pista */}
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

                  {/* banda selezione + maniglie */}
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
                    {/* maniglia sinistra */}
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

                    {/* maniglia destra */}
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

                  {/* tick dinamici */}
                  <div className="absolute inset-x-3 bottom-1">
                    <div className="relative h-5">
                      {ticks.map((t) => (
                        <div
                          key={t}
                          className="absolute top-0 -translate-x-1/2"
                          style={{
                            left: `calc(${LEFT_EDGE_PCT * 100}% + ${((t - Math.round(fromYear)) / Math.max(1, Math.round(toYear) - Math.round(fromYear))) * SELECTED_PCT * 100}%)`
                          }}
                        >
                          <div className="h-[10px] w-px bg-white/85" />
                          <div className="mt-0.5 text-[10px] leading-none text-white/95 whitespace-nowrap translate-x-1/2">
                            {formatYear(t)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* BODY */}
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
            const accent = ACCENT;
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

                    {/* Favourite heart */}
                    <button
                      type="button"
                      role="button"
                      aria-pressed={isFav}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleFavourite(e, g.id);
                      }}
                      className="absolute left-3 top-3 z-20 pointer-events-auto inline-flex items-center gap-1 rounded-full bg-white/90 p-2 text-xs font-medium ring-1 ring-white hover:bg-white"
                      style={{ color: accent }}
                      title={isFav ? "Remove from favourites" : "Add to favourites"}
                    >
                      {isFav ? (
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                          <path
                            className="text-red-500"
                            d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 6 4 4 6.5 4c1.74 0 3.41 1.01 4.22 2.53C12.09 5.01 13.76 4 15.5 4 18 4 20 6 20 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                          />
                        </svg>
                      ) : (
                        <svg
                          viewBox="0 0 24 24"
                          className="h-5 w-5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                        >
                          <path
                            className="text-slate-500"
                            d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"
                          />
                        </svg>
                      )}
                    </button>

                  </div>

                  <div className="p-4">
                    <div className="mb-1 line-clamp-1 text-[15px] font-semibold tracking-tight">
                      {g.title || g.slug || "Untitled"}
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm text-neutral-600">
                        {g.matched_events} event{g.matched_events === 1 ? "" : "s"} in range
                        {typeof g.earliest_year === "number" && (
                          <span className="text-neutral-400"> • from {formatYear(g.earliest_year)}</span>
                        )}
                      </div>
                      <div className="shrink-0">
                        <RatingSummary groupEventId={g.id} />
                      </div>
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
