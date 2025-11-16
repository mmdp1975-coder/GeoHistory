﻿// frontend/app/module/timeline/page_inner.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Scorecard } from '@/app/components/Scorecard';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useCurrentUser } from '@/lib/useCurrentUser';

type UUID = string;

/** === View row (v_journeys) === */
type VJourneyRow = {
  journey_id: UUID;
  journey_slug: string | null;
  journey_cover_url: string | null;
  translation_title: string | null;
  translation_description?: string | null; // ignorata in UI
  translation_lang2?: string | null;      // ignorata in UI
  events_count: number | null;
  year_from_min: number | null;
  year_to_max: number | null;
  favourites_count?: number | null;       // non mostrato
  is_favourite?: boolean | null;
  visibility?: string | null;             // ignorata
  workflow_state?: string | null;         // ignorata
  approved_at: string | null;             // data pubblicazione
};

type DomainRow = {
  year_from_min: number | null;
  year_to_max: number | null;
};

type StatsRow = {
  group_event_id: UUID;   // = journey_id
  avg_rating: number | null;
  ratings_count: number | null;
};

type GeWithCard = {
  id: UUID;
  slug: string | null;
  cover_url: string | null;
  title: string | null;
  // scorecard fields
  approved_at: string | null;
  events_count: number;
  year_from_min: number | null;
  year_to_max: number | null;
  is_favourite: boolean;
  avg_rating: number | null;
  ratings_count: number | null;
};

const DEFAULT_FROM = -3000;
const DEFAULT_TO = 2025;

const BRAND_BLUE = '#0b3b60';
const BRAND_BLUE_SOFT = '#0d4a7a';
const THUMB_ACTIVE_BG = '#6bb2ff';
const ACCENT = '#111827';

/* ===== Type guards ===== */
function isDomainRow(v: unknown): v is DomainRow {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return 'year_from_min' in o && 'year_to_max' in o;
}

function isVJourneyRow(v: unknown): v is VJourneyRow {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  // journey_id è l'unico davvero indispensabile; gli altri campi li gestiamo con default
  return typeof o.journey_id === 'string';
}

function isStatsRow(v: unknown): v is StatsRow {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.group_event_id === 'string' && 'avg_rating' in o && 'ratings_count' in o;
}

/* ===== Helpers UI ===== */
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

/* ===== Parse & validate geo filter from query ===== */
function parseGeoParams(sp: URLSearchParams) {
  const lat = Number(sp.get('lat'));
  const lon = Number(sp.get('lon'));
  const radiusKm = Number(sp.get('radiusKm'));

  const valid =
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Number.isFinite(radiusKm) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180 &&
    radiusKm > 0;

  if (!valid) return null as null | { lat: number; lon: number; radiusKm: number };
  return { lat, lon, radiusKm };
}

export default function TimelinePage() {
  const search = useSearchParams();
  const router = useRouter();
  const supabase = useMemo(() => createClientComponentClient(), []);

  const { checking, error: authError, userId, personaCode } = useCurrentUser();

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
  const [cards, setCards] = useState<GeWithCard[]>([]);
  const [totalMatches, setTotalMatches] = useState(0);

  const [favs, setFavs] = useState<Set<UUID>>(new Set());
  const [favMsg, setFavMsg] = useState<string | null>(null);

  const [q, setQ] = useState<string>(search?.get('q') ?? '');
  const [qDebounced, setQDebounced] = useState<string>(q);
  useEffect(() => {
    const id = setTimeout(() => setQDebounced(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);

  const geoFilter = useMemo(() => parseGeoParams(search!), [search]);
  const [geoWarning, setGeoWarning] = useState<string | null>(null);

  /* ======= 1) INIT: dominio temporale da v_journeys ======= */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setInitializing(true);
        setError(null);

        const { data, error } = await supabase
          .from('v_journeys')
          .select('year_from_min, year_to_max')
          .limit(20000);
        if (error) throw error;

        const rows = ((data ?? []) as unknown[]).filter(isDomainRow) as DomainRow[];
        const mins: number[] = rows
          .map(r => r?.year_from_min)
          .filter((x: unknown) => Number.isFinite(x)) as number[];
        const maxs: number[] = rows
          .map(r => r?.year_to_max)
          .filter((x: unknown) => Number.isFinite(x)) as number[];

        const minY = mins.length ? Math.min(...mins) : DEFAULT_FROM;
        const maxY = maxs.length ? Math.max(...maxs) : DEFAULT_TO;

        if (!cancelled) {
          setDataMin(minY);
          setDataMax(maxY);
          setFromYear(minY);
          setToYear(maxY);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Initialization error');
      } finally {
        if (!cancelled) setInitializing(false);
      }
    })();
    return () => { cancelled = true; };
  }, [search, supabase]);

  const minDomain = useMemo(() => (dataMin == null ? DEFAULT_FROM : Math.trunc(dataMin)), [dataMin]);
  const maxDomain = useMemo(() => (dataMax == null ? DEFAULT_TO : Math.trunc(dataMax)), [dataMax]);
  const domainReady =
    !initializing &&
    typeof minDomain === 'number' &&
    typeof maxDomain === 'number' &&
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

  /* ======= 2) QUERY su v_journeys (overlap + testo + geo) + RATING ======= */
  useEffect(() => {
    if (!domainReady || !debouncedSel) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      setGeoWarning(null);
      try {
        const from = debouncedSel.from;
        const to = debouncedSel.to;

        // Base query su v_journeys con tutte le colonne necessarie alla scorecard
        let baseQuery = supabase
          .from('v_journeys')
          .select(
            [
              'journey_id',
              'journey_slug',
              'journey_cover_url',
              'translation_title',
              'translation_description',
              'translation_lang2',
              'events_count',
              'year_from_min',
              'year_to_max',
              'favourites_count',
              'is_favourite',
              'approved_at'
            ].join(',')
          )
          .lte('year_from_min', to)
          .gte('year_to_max', from);

        if (qDebounced) {
          const qv = `%${qDebounced}%`;
          baseQuery = baseQuery.or(
            `journey_slug.ilike.${qv},translation_title.ilike.${qv},translation_description.ilike.${qv}`
          );
        }

        let idsFilter: UUID[] | null = null;

        if (geoFilter) {
          try {
            const { data: ids, error: rpcErr } = await supabase.rpc('journeys_near_point', {
              lat: geoFilter.lat,
              lon: geoFilter.lon,
              radius_km: geoFilter.radiusKm
            });

            if (rpcErr) {
              setGeoWarning('Geo filter inactive: missing RPC journeys_near_point. Showing unfiltered results.');
            } else if (Array.isArray(ids) && ids.length > 0) {
              // normalizza a stringhe
              const raw = (ids as unknown[]);
              const onlyStrings = raw.filter((x): x is string => typeof x === 'string');
              idsFilter = onlyStrings as UUID[];
            } else {
              idsFilter = [];
            }
          } catch {
            setGeoWarning('Geo filter inactive: RPC call failed. Showing unfiltered results.');
          }
        }

        let finalRows: VJourneyRow[] = [];
        if (idsFilter === null) {
          const { data, error } = await baseQuery.limit(2000);
          if (error) throw error;
          finalRows = ((data ?? []) as unknown[]).filter(isVJourneyRow) as VJourneyRow[];
        } else if (idsFilter.length === 0) {
          finalRows = [];
        } else {
          const { data, error } = await baseQuery.in('journey_id', idsFilter).limit(2000);
          if (error) throw error;
          finalRows = ((data ?? []) as unknown[]).filter(isVJourneyRow) as VJourneyRow[];
        }

        // Rating stats per gli ID mostrati
        const ids = finalRows.map(r => r.journey_id);
        let statsMap = new Map<UUID, StatsRow>();
        if (ids.length) {
          const { data: stats, error: sErr } = await supabase
            .from('v_group_event_rating_stats')
            .select('group_event_id, avg_rating, ratings_count')
            .in('group_event_id', ids);
          if (sErr) throw sErr;

          const statsSafe = ((stats ?? []) as unknown[]).filter(isStatsRow) as StatsRow[];
          statsSafe.forEach(s => statsMap.set(s.group_event_id, s));
        }

        // Map → GeWithCard
        const mapped: GeWithCard[] = finalRows.map((r) => {
          const st = statsMap.get(r.journey_id);
          return {
            id: r.journey_id,
            slug: r.journey_slug ?? null,
            cover_url: r.journey_cover_url ?? null,
            title: r.translation_title ?? r.journey_slug ?? null,
            approved_at: r.approved_at ?? null,
            events_count: r.events_count ?? 0,
            year_from_min: r.year_from_min ?? null,
            year_to_max: r.year_to_max ?? null,
            is_favourite: !!r.is_favourite,
            avg_rating: st?.avg_rating ?? null,
            ratings_count: st?.ratings_count ?? null,
          };
        });

        // Ordinamento: earliest year asc, poi più eventi
        mapped.sort((a, b) => {
          const ae = a.year_from_min ?? Number.POSITIVE_INFINITY;
          const be = b.year_from_min ?? Number.POSITIVE_INFINITY;
          if (ae !== be) return ae - be;
          return (b.events_count ?? 0) - (a.events_count ?? 0);
        });

        if (!cancelled) {
          setCards(mapped);
          setTotalMatches(mapped.reduce((acc, x) => acc + (x.events_count || 0), 0));

          // preferiti per il set (fallback se serve)
          const favSet = new Set<UUID>();
          let needFallback = false;
          for (const r of finalRows) {
            if (typeof r.is_favourite === 'boolean') {
              if (r.is_favourite) favSet.add(r.journey_id);
            } else {
              needFallback = true;
            }
          }
          setFavs(favSet);

          if (needFallback && userId && mapped.length > 0) {
            try {
              const ids = mapped.map(g => g.id);
              const { data: favRows } = await supabase
                .from('group_event_favourites')
                .select('group_event_id')
                .in('group_event_id', ids)
                .eq('profile_id', userId);

              const safeFavs = ((favRows ?? []) as unknown[])
                .map(r => (r as Record<string, unknown>)?.group_event_id)
                .filter((x): x is string => typeof x === 'string');

              if (!cancelled) {
                const s = new Set<UUID>(safeFavs as UUID[]);
                setFavs(s);
              }
            } catch { /* no-op */ }
          }
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Unknown error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domainReady, debouncedSel, qDebounced, supabase, userId, geoFilter?.lat, geoFilter?.lon, geoFilter?.radiusKm]);

  /* ======= 3) Preferiti: toggle ======= */
  const toggleFavourite = async (ev: React.MouseEvent, groupEventId: UUID) => {
    ev.preventDefault();
    ev.stopPropagation();
    setFavMsg(null);
    try {
      if (!userId) { setFavMsg('Please sign in to use favourites.'); return; }

      const isFav = favs.has(groupEventId);
      const next = new Set(favs);
      if (isFav) next.delete(groupEventId); else next.add(groupEventId);
      setFavs(next);

      if (isFav) {
        const { error } = await supabase.from('group_event_favourites')
          .delete()
          .eq('profile_id', userId)
          .eq('group_event_id', groupEventId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('group_event_favourites')
          .insert({ profile_id: userId, group_event_id: groupEventId });
        if (error) throw error;
      }
    } catch (e: any) {
      setFavMsg(e?.message || 'Unable to toggle favourite.');
    }
  };

  // ===== Timeline interactions =====
  const selectedBarRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef<null | { mode: 'pan' | 'zoom'; lastX: number }>(null);
  const [activeThumb, setActiveThumb] = useState<null | 'left' | 'right'>(null);

  const MIN_SPAN = 1;
  const ZOOM_GAIN = 2;

  function pxToYears(dxPx: number, barWidthPx: number, baseSpan: number, gain = 1) {
    if (barWidthPx <= 0) return 0;
    return (dxPx / barWidthPx) * baseSpan * gain;
  }

  function startPan(e: React.PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    draggingRef.current = { mode: 'pan', lastX: e.clientX };
  }

  function startZoom(e: React.PointerEvent, which: 'left' | 'right') {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    draggingRef.current = { mode: 'zoom', lastX: e.clientX };
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

    if (mode === 'pan') {
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

    if (activeThumb === 'left') {
      let nextFrom = curFrom + dYears;
      const maxFrom = curTo - MIN_SPAN;
      if (nextFrom > maxFrom) nextFrom = maxFrom;
      if (nextFrom < minDomain) nextFrom = minDomain;
      const nextFromInt = Math.round(nextFrom);
      fromRef.current = nextFromInt;
      setFromYear(nextFromInt);
      return;
    }

    if (activeThumb === 'right') {
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

  /* ================== RENDER ================== */
  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-neutral-50 to-white text-neutral-900">
      {/* HEADER */}
      <header className="z-20 border-b border-neutral-200" style={{ backgroundColor: BRAND_BLUE }}>
        <div className="mx-auto max-w-7xl px-4 py-3 text-white">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h1 className="text-lg font-semibold tracking-tight">Timeline Explorer</h1>

            <div className="flex items-center gap-3">
              {checking ? (
                <span className="text-xs text-white/70">Checking…</span>
              ) : authError ? (
                <span className="text-xs text-white/70">Guest</span>
              ) : (
                <span className="rounded-md border border-white/25 bg-white/10 px-2 py-1 text-xs">
                  {personaCode || 'USER'}
                </span>
              )}

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
                    const params = new URLSearchParams(search?.toString() || '');
                    params.delete('lat'); params.delete('lon'); params.delete('radiusKm');
                    router.replace(`?${params.toString()}`);
                    setFromYear(minDomain);
                    setToYear(maxDomain);
                    setQ('');
                  }}
                  className="rounded-md border border-white/25 bg-white/10 px-3 py-1 text-xs text-white hover:bg-white/15"
                  title="Reset range, text and geo filter"
                >
                  Show All
                </button>
              </div>
            </div>
          </div>

          {/* Geo filter badge */}
          {geoFilter && (
            <div className="mt-2 flex items-center justify-between rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs">
              <div>
                Geo filter: lat <b>{geoFilter.lat.toFixed(4)}</b>, lon <b>{geoFilter.lon.toFixed(4)}</b>, radius <b>{geoFilter.radiusKm}</b> km
                {geoWarning && <span className="ml-2 text-amber-200">— {geoWarning}</span>}
              </div>
              <button
                onClick={() => {
                  const params = new URLSearchParams(search?.toString() || '');
                  params.delete('lat'); params.delete('lon'); params.delete('radiusKm');
                  router.replace(`?${params.toString()}`);
                }}
                className="rounded border border-white/25 bg-white/10 px-2 py-1 text-[11px] hover:bg-white/20"
                title="Remove geo filter"
              >
                Clear geo filter
              </button>
            </div>
          )}

          {/* TIMELINE */}
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
                        background: 'linear-gradient(180deg, #f4f6f9 0%, #e8ecf2 50%, #dfe5ee 100%)',
                        boxShadow:
                          'inset 0 1px 1px rgba(255,255,255,0.25), inset 0 -1px 1px rgba(0,0,0,0.30), 0 1px 3px rgba(0,0,0,0.18)'
                      }}
                    />
                  </div>

                  {/* banda selezione + maniglie */}
                  <div
                    ref={selectedBarRef}
                    className="absolute top-1/2 -translate-y-1/2 left-[10%] w-[80%]"
                    style={{
                      height: 8,
                      borderRadius: 9999,
                      background: `linear-gradient(180deg, ${BRAND_BLUE_SOFT} 0%, ${BRAND_BLUE} 60%, #072b46 100%)`,
                      boxShadow:
                        'inset 0 1px 1px rgba(255,255,255,0.25), inset 0 -1px 1px rgba(0,0,0,0.30), 0 1px 3px rgba(0,0,0,0.18)',
                      cursor: draggingRef.current?.mode === 'pan' ? 'grabbing' : 'grab'
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
                      onPointerDown={(e) => startZoom(e, 'left')}
                      onPointerMove={onMove}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                      className="absolute left-0 top-1/2 -translate-y-1/2 focus:outline-none"
                      style={{ transform: 'translate(-50%, -50%)', touchAction: 'none' as any, cursor: 'ew-resize' }}
                      aria-label="Zoom (left thumb)"
                      title="Zoom: trascina a sinistra/destra"
                    >
                      <span
                        className={activeThumb === 'left' ? 'block h-[22px] w-[22px] rounded-full border border-white shadow-lg ring-2 ring-white ring-offset-2 transition-all duration-100' : 'block h-4 w-4 rounded-full border border-black/20 bg-white shadow transition-all duration-100'}
                        style={activeThumb === 'left' ? { backgroundColor: THUMB_ACTIVE_BG } : undefined}
                      />
                    </button>

                    {/* maniglia destra */}
                    <button
                      type="button"
                      onPointerDown={(e) => startZoom(e, 'right')}
                      onPointerMove={onMove}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                      className="absolute right-0 top-1/2 -translate-y-1/2 focus:outline-none"
                      style={{ transform: 'translate(50%, -50%)', touchAction: 'none' as any, cursor: 'ew-resize' }}
                      aria-label="Zoom (right thumb)"
                      title="Zoom: trascina a sinistra/destra"
                    >
                      <span
                        className={activeThumb === 'right' ? 'block h-[22px] w-[22px] rounded-full border border-white shadow-lg ring-2 ring-white ring-offset-2 transition-all duration-100' : 'block h-4 w-4 rounded-full border border-black/20 bg-white shadow transition-all duration-100'}
                        style={activeThumb === 'right' ? { backgroundColor: THUMB_ACTIVE_BG } : undefined}
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
                            left: `calc(10% + ${((t - Math.round(fromYear)) / Math.max(1, Math.round(toYear) - Math.round(fromYear))) * 80}%)`
                          }}
                        >
                          <div className="h-[10px] w-px bg-white/85" />
                          <div className="mt-0.5 whitespace-nowrap text-[10px] leading-none text-white/95 translate-x-1/2">
                            {t < 0 ? `${Math.abs(t)} BC` : `${t}`}
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
                In range: <span className="font-medium">{cards.length}</span> group
                event{cards.length === 1 ? '' : 's'} • total matched events{' '}
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
                onClick={() => setQ('')}
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

        {!loading && cards.length === 0 && !initializing && !error && (
          <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center text-neutral-600">
            Nessun group event trovato. Prova a modificare il timeframe o svuota la ricerca.
          </div>
        )}

        {/* GRID: scorecard unificata */}
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {cards.map((g) => {
            const isFav = favs.has(g.id);
            return (
              <Scorecard
                key={g.id}
                href={`/module/group_event?gid=${encodeURIComponent(g.id)}`}
                title={g.title || g.slug || 'Untitled'}
                coverUrl={g.cover_url}
                isFavourite={isFav}
                onToggleFavourite={(event) => toggleFavourite(event, g.id)}
                publishedAt={g.approved_at}
                averageRating={g.avg_rating}
                ratingsCount={g.ratings_count}
                eventsCount={g.events_count}
                yearFrom={g.year_from_min}
                yearTo={g.year_to_max}
                prefetch={false}
                liProps={{ 'data-jid': g.id }}
              />
            );
          })}
        </ul>
      </main>
    </div>
  );
}
