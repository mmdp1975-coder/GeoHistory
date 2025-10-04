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
  era: string | null; // "BC"/"AD" o "BCE"/"CE"
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

// DEFAULT richiesta
const DEFAULT_FROM = -3000; // 3000 BC
const DEFAULT_TO = 2025;    // 2025 AD

// chunk per PostgREST .in(...)
const EGE_CHUNK = 80;
const GE_CHUNK  = 200;

// Colori brand
const BRAND_BLUE = "#0b3b60";
const BRAND_BLUE_SOFT = "#0d4a7a";

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

// calcola uno step "pulito" per i ticks (50/100/250/500/1000/...)
function niceStep(span: number, targetTicks = 7) {
  const raw = span / targetTicks;
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

  // dataset normalizzato
  const [eventsNorm, setEventsNorm] = useState<EventsListRowNorm[]>([]);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // range selezionato (i cursori sono indipendenti)
  const [fromYear, setFromYear] = useState<number | undefined>(undefined);
  const [toYear, setToYear] = useState<number | undefined>(undefined);
  const rangeInitialized = useRef(false);

  // min/max reale del dataset (solo per clamp iniziale)
  const [dataMin, setDataMin] = useState<number | null>(null);
  const [dataMax, setDataMax] = useState<number | null>(null);

  // selezione effettiva (ordinata) usata per UI e query
  const selFrom = useMemo(() => {
    if (typeof fromYear !== "number" || typeof toYear !== "number") return null;
    return Math.min(fromYear, toYear);
  }, [fromYear, toYear]);
  const selTo = useMemo(() => {
    if (typeof fromYear !== "number" || typeof toYear !== "number") return null;
    return Math.max(fromYear, toYear);
  }, [fromYear, toYear]);

  // dominio visivo: sempre 1000 prima e 1000 dopo la selezione ordinata
  const minDomain = useMemo(() => {
    if (selFrom == null) return null;
    return Math.trunc(selFrom - 1000);
  }, [selFrom]);
  const maxDomain = useMemo(() => {
    if (selTo == null) return null;
    return Math.trunc(selTo + 1000);
  }, [selTo]);

  // risultati
  const [loading, setLoading] = useState(false);
  const [groupEvents, setGroupEvents] = useState<GeWithCount[]>([]);
  const [totalMatches, setTotalMatches] = useState(0);

  // preferiti
  const [favs, setFavs] = useState<Set<UUID>>(new Set());
  const [favMsg, setFavMsg] = useState<string | null>(null);

  // ===== Carica eventi e calcola min/max dati =====
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

        // min/max dai dati (usati solo per clamp iniziale)
        let domainMin = -2000;
        let domainMax = 2100;
        if (norm.length > 0) {
          const ys: number[] = [];
          for (const e of norm) { ys.push(e.yFrom, e.yTo); }
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
  }, []);

  // ===== Inizializza range una sola volta =====
  useEffect(() => {
    if (rangeInitialized.current) return;
    if (dataMin == null || dataMax == null) return;

    const qsFromRaw = search.get("from");
    const qsToRaw = search.get("to");

    const hasQsFrom = qsFromRaw !== null && qsFromRaw !== "";
    const hasQsTo = qsToRaw !== null && qsToRaw !== "";

    const qsFrom = Number(qsFromRaw);
    const qsTo = Number(qsToRaw);

    const desiredStart = hasQsFrom && Number.isFinite(qsFrom) ? qsFrom : DEFAULT_FROM;
    const desiredEnd = hasQsTo && Number.isFinite(qsTo) ? qsTo : DEFAULT_TO;

    // clamp iniziale sui dati reali (solo per partire dentro al dataset)
    const startClamped = Math.max(Math.min(desiredStart, dataMax), dataMin);
    const endClamped = Math.max(Math.min(desiredEnd, dataMax), Math.min(dataMax, dataMax)); // garantisco numero

    setFromYear(startClamped);
    setToYear(endClamped);
    rangeInitialized.current = true;
  }, [dataMin, dataMax, search]);

  const domainReady =
    !initializing &&
    selFrom != null &&
    selTo != null &&
    minDomain != null &&
    maxDomain != null;

  // ===== Query chunked: eventi → mapping → group_events (con earliest_year) =====
  useEffect(() => {
    if (!domainReady) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const from = selFrom as number;
        const to = selTo as number;

        // mappa rapida per recuperare yFrom degli event ids
        const eventYearMap = new Map<UUID, number>();
        for (const e of eventsNorm) eventYearMap.set(e.source_event_id, e.yFrom);

        const matched = eventsNorm.filter((e) => e.yFrom <= to && e.yTo >= from);
        const eventIds = Array.from(new Set(matched.map((m) => m.source_event_id)));

        if (eventIds.length === 0) {
          if (!cancelled) { setGroupEvents([]); setTotalMatches(0); }
          setLoading(false);
          return;
        }

        const allEGE: EGE[] = [];
        for (let i = 0; i < eventIds.length; i += EGE_CHUNK) {
          const chunk = eventIds.slice(i, i + EGE_CHUNK);
          const { data: ege, error: egeErr } = await supabase
            .from("event_group_event")
            .select("event_id, group_event_id")
            .in("event_id", chunk);
          if (egeErr) throw egeErr;
          allEGE.push(...((ege as EGE[]) || []));
        }

        if (allEGE.length === 0) {
          if (!cancelled) { setGroupEvents([]); setTotalMatches(0); }
          setLoading(false);
          return;
        }

        // conteggio + earliest per group_event
        const counts = new Map<UUID, number>();
        const earliest = new Map<UUID, number>();
        for (const row of allEGE) {
          counts.set(row.group_event_id, (counts.get(row.group_event_id) || 0) + 1);
          const y = eventYearMap.get(row.event_id);
          if (typeof y === "number") {
            const cur = earliest.get(row.group_event_id);
            if (cur == null || y < cur) earliest.set(row.group_event_id, y);
          }
        }
        const geIds = Array.from(counts.keys());

        const allGE: GroupEvent[] = [];
        for (let i = 0; i < geIds.length; i += GE_CHUNK) {
          const chunk = geIds.slice(i, i + GE_CHUNK);
          const { data: ges, error: geErr } = await supabase
            .from("group_events")
            .select("id, title, slug, color_hex, icon_name, cover_url")
            .in("id", chunk);
          if (geErr) throw geErr;
          allGE.push(...((ges as GroupEvent[]) || []));
        }

        const merged: GeWithCount[] = allGE
          .map((g) => ({
            ...g,
            matched_events: counts.get(g.id) || 0,
            earliest_year: earliest.has(g.id) ? (earliest.get(g.id) as number) : null
          }))
          .filter((g) => g.matched_events > 0)
          .sort((a, b) => {
            // ordine cronologico per earliest_year crescente; a parità, più match prima
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
        if (!cancelled) setLoading(false);
      }
    })();

  }, [selFrom, selTo, domainReady, eventsNorm]);

  // ===== Preferiti: carica set preferiti per i group_events correnti =====
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setFavs(new Set()); return; }
        if (groupEvents.length === 0) { setFavs(new Set()); return; }

        const ids = groupEvents.map(g => g.id);
        const { data, error: favErr } = await supabase
          .from("favourites")
          .select("group_event_id")
          .in("group_event_id", ids)
          .eq("user_id", user.id);

        if (favErr) { /* silenzioso */ return; }
        const s = new Set<UUID>((data || []).map((r: any) => r.group_event_id as UUID));
        if (!cancelled) setFavs(s);
      } catch {
        // ignora errori di schema/permessi
      }
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
      // UI ottimistica
      const next = new Set(favs);
      if (isFav) next.delete(groupEventId); else next.add(groupEventId);
      setFavs(next);

      if (isFav) {
        const { error } = await supabase
          .from("favourites")
          .delete()
          .eq("user_id", user.id)
          .eq("group_event_id", groupEventId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("favourites")
          .insert({ user_id: user.id, group_event_id: groupEventId });
        if (error) throw error;
      }
    } catch (e: any) {
      setFavMsg(e?.message || "Unable to toggle favourite.");
    }
  };

  // ===== UI =====
  const domainLabelsReady =
    typeof minDomain === "number" && typeof maxDomain === "number" && selFrom != null && selTo != null;

  // centro corrente per pan (mantiene ampiezza)
  const span = (selFrom != null && selTo != null) ? (selTo - selFrom) : 0;
  const center = (selFrom != null && selTo != null) ? (selFrom + selTo) / 2 : 0;
  const panMin = (typeof minDomain === "number") ? (minDomain + span / 2) : 0;
  const panMax = (typeof maxDomain === "number") ? (maxDomain - span / 2) : 0;

  // ticks temporali (da mostrare subito sotto la barra)
  const ticks = useMemo(() => {
    if (!domainLabelsReady) return [];
    const dMin = minDomain as number;
    const dMax = maxDomain as number;
    const fullSpan = dMax - dMin;
    const step = niceStep(fullSpan, 7);
    const first = Math.ceil(dMin / step) * step;
    const out: number[] = [];
    for (let t = first; t <= dMax; t += step) out.push(Math.round(t));
    return out;
  }, [domainLabelsReady, minDomain, maxDomain]);

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-neutral-50 to-white text-neutral-900">
      {/* HEADER blu */}
      <header className="z-20 border-b border-neutral-200" style={{ backgroundColor: BRAND_BLUE }}>
        <div className="mx-auto max-w-7xl px-4 py-3 text-white">{/* py più compatto */}
          {/* Riga titolo + controlli (From/To/Show All) */}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h1 className="text-lg font-semibold tracking-tight">Timeline Explorer</h1>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <label className="text-xs text-white/90">From</label>
                <input
                  type="number"
                  className="w-24 rounded-md border border-white/25 bg-white/10 px-2 py-1 text-xs text-white placeholder-white/60 focus:border-white/40 focus:outline-none"
                  value={typeof fromYear === "number" ? fromYear : ""}
                  onChange={(e) => setFromYear(Number(e.target.value))}
                />
              </div>
              <div className="flex items-center gap-1">
                <label className="text-xs text-white/90">To</label>
                <input
                  type="number"
                  className="w-24 rounded-md border border-white/25 bg-white/10 px-2 py-1 text-xs text-white placeholder-white/60 focus:border-white/40 focus:outline-none"
                  value={typeof toYear === "number" ? toYear : ""}
                  onChange={(e) => setToYear(Number(e.target.value))}
                />
              </div>
              <button
                onClick={() => { setFromYear(DEFAULT_FROM); setToYear(DEFAULT_TO); }}
                className="rounded-md border border-white/25 bg-white/10 px-3 py-1 text-xs text-white hover:bg-white/15"
              >
                Show All
              </button>
            </div>
          </div>

          {/* Timeline Card (ultra compatta) */}
          <div className="mt-2 rounded-xl border border-white/15 bg-white/5 shadow-sm">
            <div className="p-2">
              {domainReady ? (
                <>
                  <div className="relative py-2">{/* wrapper più basso */}
                    {/* Track 3D, sottile */}
                    <div
                      className="absolute left-3 right-3 top-1/2 -translate-y-1/2 h-[6px] rounded-full"
                      style={{
                        background: "linear-gradient(180deg, #f4f6f9 0%, #e8ecf2 50%, #dfe5ee 100%)",
                        boxShadow:
                          "inset 0 1px 2px rgba(0,0,0,0.18), inset 0 -1px 1px rgba(255,255,255,0.5), 0 1px 1px rgba(0,0,0,0.08)"
                      }}
                    />
                    {/* Selected segment 3D (blu) */}
                    <div
                      className="absolute top-1/2 -translate-y-1/2 h-[6px] rounded-full"
                      style={{
                        left: `${(((selFrom as number) - (minDomain as number)) / ((maxDomain as number) - (minDomain as number))) * 100}%`,
                        right: `${(1 - ((selTo as number) - (minDomain as number)) / ((maxDomain as number) - (minDomain as number))) * 100}%`,
                        background: `linear-gradient(180deg, ${BRAND_BLUE_SOFT} 0%, ${BRAND_BLUE} 60%, #072b46 100%)`,
                        boxShadow:
                          "inset 0 1px 1px rgba(255,255,255,0.25), inset 0 -1px 1px rgba(0,0,0,0.30), 0 1px 3px rgba(0,0,0,0.18)"
                      }}
                    />

                    {/* Slider: FROM (indipendente, alla stessa altezza della barra) */}
                    <input
                      type="range"
                      min={minDomain as number}
                      max={maxDomain as number}
                      value={fromYear as number}
                      onChange={(e) => setFromYear(Number(e.target.value))}
                      className="range-thumb pointer-events-auto absolute left-0 right-0 top-1/2 -translate-y-1/2 w-full appearance-none bg-transparent"
                      aria-label="From year"
                    />
                    {/* Slider: TO (indipendente, alla stessa altezza della barra) */}
                    <input
                      type="range"
                      min={minDomain as number}
                      max={maxDomain as number}
                      value={toYear as number}
                      onChange={(e) => setToYear(Number(e.target.value))}
                      className="range-thumb pointer-events-auto absolute left-0 right-0 top-1/2 -translate-y-1/2 w-full appearance-none bg-transparent"
                      aria-label="To year"
                    />
                    {/* Slider: PAN (centro), stessa altezza */}
                    <input
                      type="range"
                      min={panMin}
                      max={panMax}
                      value={center}
                      onChange={(e) => {
                        const c = Number(e.target.value);
                        const half = span / 2;
                        const newFrom = Math.round(c - half);
                        const newTo = Math.round(c + half);
                        if ((fromYear as number) <= (toYear as number)) {
                          setFromYear(newFrom);
                          setToYear(newTo);
                        } else {
                          setFromYear(newTo);
                          setToYear(newFrom);
                        }
                      }}
                      className="range-pan absolute left-0 right-0 top-1/2 -translate-y-1/2 w-full appearance-none bg-transparent"
                      aria-label="Pan window"
                    />

                    {/* Ticks subito sotto la barra (spazio minimo) */}
                    {domainLabelsReady && (
                      <div className="mt-2 select-none">
                        <div className="relative mx-3 h-4">
                          {ticks.map((t) => {
                            const pct =
                              ((t - (minDomain as number)) / ((maxDomain as number) - (minDomain as number))) * 100;
                            return (
                              <div key={t} className="absolute top-0 -translate-x-1/2" style={{ left: `${pct}%` }}>
                                <div className="h-[10px] w-px bg-white/80" />
                                <div className="mt-0.5 text-[10px] leading-none text-white/90 whitespace-nowrap -translate-x-1/2 translate-x-1/2">
                                  {formatYear(t)}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {/* (RIMOSSI min/max) */}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="py-4 text-sm text-white/80">Loading timeline…</div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* BODY */}
      <main className="mx-auto max-w-7xl px-4 py-5">
        <div className="mb-3 text-sm text-neutral-600">
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
            Nessun group event trovato nel range selezionato. Prova ad allargare la finestra temporale.
          </div>
        )}

        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {groupEvents.map((g) => {
            const accent = safeColor(g.color_hex, "#111827");
            const gradient =
              `linear-gradient(180deg, ${accent}1A 0%, ${accent}0D 60%, #FFFFFF 100%)`;
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
                      onClick={(e) => toggleFavourite(e, g.id)}
                      className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-1 text-xs font-medium ring-1 ring-white hover:bg-white"
                      style={{ color: accent }}
                      title={isFav ? "Remove from favourites" : "Add to favourites"}
                    >
                      <span className="inline-block" aria-hidden="true">
                        {isFav ? "★" : "☆"}
                      </span>
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

      {/* Slider styling (ancora più compatti) */}
      <style jsx global>{`
        input[type="range"].range-thumb {
          -webkit-appearance: none;
          height: 22px; /* più basso */
          outline: none;
          background: transparent;
          position: relative;
          z-index: 10;
        }
        input[type="range"].range-thumb::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px; /* più piccolo */
          height: 14px;
          border-radius: 9999px;
          background: linear-gradient(180deg, #ffffff 0%, #f2f5f9 40%, #e6ebf3 100%);
          border: 1px solid rgba(0,0,0,0.15);
          box-shadow:
            inset 0 1px 1px rgba(255,255,255,0.9),
            inset 0 -1px 1px rgba(0,0,0,0.08),
            0 2px 3px rgba(0,0,0,0.18);
          cursor: pointer;
          margin-top: -7px;
        }
        input[type="range"].range-thumb::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 9999px;
          background: linear-gradient(180deg, #ffffff 0%, #f2f5f9 40%, #e6ebf3 100%);
          border: 1px solid rgba(0,0,0,0.15);
          box-shadow:
            inset 0 1px 1px rgba(255,255,255,0.9),
            inset 0 -1px 1px rgba(0,0,0,0.08),
            0 2px 3px rgba(0,0,0,0.18);
          cursor: pointer;
        }

        /* Slider PAN (solo per spostare il centro, mantiene l'ampiezza) */
        input[type="range"].range-pan {
          -webkit-appearance: none;
          height: 22px;
          outline: none;
          background: transparent;
          position: relative;
          z-index: 5;
        }
        input[type="range"].range-pan::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 0px; /* invisibile ma draggable sull'intera area */
          height: 14px;
          background: transparent;
          cursor: grab;
        }
        input[type="range"].range-pan::-moz-range-thumb {
          width: 0px;
          height: 14px;
          background: transparent;
          cursor: grab;
        }
      `}</style>
    </div>
  );
}
