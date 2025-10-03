"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseBrowserClient";

/**
 * Timeline Explorer (module/timeline)
 * Pulizia: rimossa la barra superiore interna (Back/Logo/Settings/Logout),
 * ora si usa solo la TopBar globale dal layout di /module.
 */

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
type GeWithCount = GroupEvent & { matched_events: number };

// DEFAULT
const DEFAULT_FROM = -3000; // 3000 BC
const DEFAULT_TO = 2025;    // 2025 AD

// chunk per PostgREST .in(...)
const EGE_CHUNK = 80;
const GE_CHUNK  = 200;

// Colori brand
const BRAND_BLUE = "#0b3b60"; // blu scuro
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

// Colore sicuro
function safeColor(hex?: string | null, fallback = "#111827") {
  const h = (hex || "").trim();
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(h) ? h : fallback;
}

export default function TimelinePage() {
  const search = useSearchParams();

  // dataset normalizzato
  const [eventsNorm, setEventsNorm] = useState<EventsListRowNorm[]>([]);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // dominio e range
  const [minDomain, setMinDomain] = useState<number | null>(null);
  const [maxDomain, setMaxDomain] = useState<number | null>(null);
  const [fromYear, setFromYear] = useState<number | undefined>(undefined);
  const [toYear, setToYear] = useState<number | undefined>(undefined);
  const rangeInitialized = useRef(false);

  // risultati
  const [loading, setLoading] = useState(false);
  const [groupEvents, setGroupEvents] = useState<GeWithCount[]>([]);
  const [totalMatches, setTotalMatches] = useState(0);

  // ===== Carica eventi e calcola dominio =====
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

        // dominio dai dati; fallback se tabella vuota
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
        setMinDomain(domainMin);
        setMaxDomain(domainMax);
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
    if (minDomain == null || maxDomain == null) return;

    const qsFromRaw = search.get("from");
    const qsToRaw = search.get("to");

    const hasQsFrom = qsFromRaw !== null && qsFromRaw !== "";
    const hasQsTo = qsToRaw !== null && qsToRaw !== "";

    const qsFrom = Number(qsFromRaw);
    const qsTo = Number(qsToRaw);

    const desiredStart = hasQsFrom && Number.isFinite(qsFrom) ? qsFrom : DEFAULT_FROM;
    const desiredEnd = hasQsTo && Number.isFinite(qsTo) ? qsTo : DEFAULT_TO;

    const startClamped = Math.max(Math.min(desiredStart, maxDomain), minDomain);
    const endClamped = Math.max(Math.min(desiredEnd, maxDomain), startClamped);

    setFromYear(startClamped);
    setToYear(endClamped);
    rangeInitialized.current = true;
  }, [minDomain, maxDomain, search]);

  const domainReady =
    !initializing && minDomain != null && maxDomain != null && typeof fromYear === "number" && typeof toYear === "number";
  const canSearch = domainReady && (fromYear as number) <= (toYear as number);

  // ===== Query chunked: eventi → mapping → group_events =====
  useEffect(() => {
    if (!canSearch) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const from = fromYear as number;
        const to = toYear as number;

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

        const counts = new Map<UUID, number>();
        for (const row of allEGE) {
          counts.set(row.group_event_id, (counts.get(row.group_event_id) || 0) + 1);
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
          .map((g) => ({ ...g, matched_events: counts.get(g.id) || 0 }))
          .filter((g) => g.matched_events > 0)
          .sort((a, b) => b.matched_events - a.matched_events);

        if (!cancelled) {
          setGroupEvents(merged);
          setTotalMatches(merged.reduce((acc, x) => acc + x.matched_events, 0));
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [fromYear, toYear, canSearch, eventsNorm]);

  const headerSubtitle = useMemo(() => {
    if (!domainReady) return "Initializing…";
    return `Showing group events with at least one event between ${formatYear(fromYear as number)} and ${formatYear(toYear as number)}`;
  }, [domainReady, fromYear, toYear]);

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-neutral-50 to-white text-neutral-900">
      {/* BANDA BLU: titolo + sottotitolo + timeline (resta) */}
      <header className="z-20 border-b border-neutral-200" style={{ backgroundColor: BRAND_BLUE }}>
        <div className="mx-auto max-w-7xl px-4 py-5 text-white">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-tight">Timeline Explorer</h1>
            <p className="text-sm/6 opacity-90">{headerSubtitle}</p>
          </div>

          {/* Timeline Card (in blu) */}
          <div className="mt-4 rounded-2xl border border-white/15 bg-white/5 shadow-sm">
            <div className="p-4">
              {domainReady ? (
                <>
                  <div className="relative py-8">
                    {/* Track 3D */}
                    <div
                      className="absolute left-3 right-3 top-1/2 -translate-y-1/2 h-3 rounded-full"
                      style={{
                        background: "linear-gradient(180deg, #f4f6f9 0%, #e8ecf2 50%, #dfe5ee 100%)",
                        boxShadow:
                          "inset 0 1px 3px rgba(0,0,0,0.20), inset 0 -1px 2px rgba(255,255,255,0.55), 0 1px 2px rgba(0,0,0,0.12)"
                      }}
                    />
                    {/* Selected segment 3D (blu) */}
                    <div
                      className="absolute top-1/2 -translate-y-1/2 h-3 rounded-full"
                      style={{
                        left: `${(((fromYear as number) - (minDomain as number)) / ((maxDomain as number) - (minDomain as number))) * 100}%`,
                        right: `${(1 - ((toYear as number) - (minDomain as number)) / ((maxDomain as number) - (minDomain as number))) * 100}%`,
                        background: `linear-gradient(180deg, ${BRAND_BLUE_SOFT} 0%, ${BRAND_BLUE} 60%, #072b46 100%)`,
                        boxShadow:
                          "inset 0 1px 2px rgba(255,255,255,0.25), inset 0 -1px 2px rgba(0,0,0,0.35), 0 2px 6px rgba(0,0,0,0.25)"
                      }}
                    />
                    {/* Lower thumb */}
                    <input
                      type="range"
                      min={minDomain as number}
                      max={maxDomain as number}
                      value={fromYear as number}
                      onChange={(e) => setFromYear(Math.min(Number(e.target.value), (toYear as number)))}
                      className="range-thumb pointer-events-auto absolute left-0 right-0 w-full appearance-none bg-transparent"
                      aria-label="From year"
                    />
                    {/* Upper thumb */}
                    <input
                      type="range"
                      min={minDomain as number}
                      max={maxDomain as number}
                      value={toYear as number}
                      onChange={(e) => setToYear(Math.max(Number(e.target.value), (fromYear as number)))}
                      className="range-thumb pointer-events-auto absolute left-0 right-0 w-full appearance-none bg-transparent"
                      aria-label="To year"
                    />
                    {/* Labels estremi */}
                    <div className="mt-11 flex justify-between text-xs text-white/80">
                      <span>{formatYear(minDomain as number)}</span>
                      <span>{formatYear(maxDomain as number)}</span>
                    </div>
                  </div>

                  {/* Inputs + quick actions */}
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-white/90">From</label>
                      <input
                        type="number"
                        className="w-28 rounded-lg border border-white/25 bg-white/10 px-2 py-1 text-sm text-white placeholder-white/60 focus:border-white/40 focus:outline-none"
                        value={fromYear as number}
                        onChange={(e) =>
                          setFromYear(
                            Math.min(
                              Number(e.target.value || (minDomain as number)),
                              (toYear as number)
                            )
                          )
                        }
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-white/90">To</label>
                      <input
                        type="number"
                        className="w-28 rounded-lg border border-white/25 bg-white/10 px-2 py-1 text-sm text-white placeholder-white/60 focus:border-white/40 focus:outline-none"
                        value={toYear as number}
                        onChange={(e) =>
                          setToYear(
                            Math.max(
                              Number(e.target.value || (maxDomain as number)),
                              (fromYear as number)
                            )
                          )
                        }
                      />
                    </div>

                    <div className="ml-auto flex items-center gap-2">
                      <button
                        onClick={() => { setFromYear(minDomain as number); setToYear(maxDomain as number); }}
                        className="rounded-lg border border-white/25 bg-white/10 px-3 py-1 text-sm text-white hover:bg-white/15"
                      >
                        Show all
                      </button>
                      <button
                        onClick={() => {
                          setFromYear(Math.max(minDomain as number, 1200));
                          setToYear(Math.min(maxDomain as number, 1900));
                        }}
                        className="rounded-lg border border-white/25 bg-white/10 px-3 py-1 text-sm text-white hover:bg-white/15"
                      >
                        Quick: 1200–1900
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="py-10 text-sm text-white/80">Loading timeline…</div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* BODY */}
      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-4 text-sm text-neutral-600">
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
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}

        {!loading && groupEvents.length === 0 && !initializing && !error && (
          <div className="rounded-xl border border-neutral-200 bg-white p-10 text-center text-neutral-600">
            Nessun group event trovato nel range selezionato. Prova ad allargare la finestra temporale.
          </div>
        )}

        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {groupEvents.map((g) => {
            const accent = safeColor(g.color_hex, "#111827");
            const gradient =
              `linear-gradient(180deg, ${accent}1A 0%, ${accent}0D 60%, #FFFFFF 100%)`; // 1A=10%, 0D≈5%
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
                    <span
                      className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-1 text-xs font-medium ring-1 ring-white"
                      style={{ color: accent }}
                      title={g.icon_name || undefined}
                    >
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: accent }} />
                      {g.icon_name || "Journey"}
                    </span>
                  </div>
                  <div className="p-4">
                    <div className="mb-1 line-clamp-1 text-[15px] font-semibold tracking-tight">
                      {g.title || g.slug || "Untitled"}
                    </div>
                    <div className="text-sm text-neutral-600">
                      {g.matched_events} event{g.matched_events === 1 ? "" : "s"} in range
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </main>

      {/* Slider styling 3D */}
      <style jsx global>{`
        input[type="range"].range-thumb {
          -webkit-appearance: none;
          height: 36px;
          outline: none;
          background: transparent;
        }
        input[type="range"].range-thumb::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 22px;
          height: 22px;
          border-radius: 9999px;
          background: linear-gradient(180deg, #ffffff 0%, #f2f5f9 40%, #e6ebf3 100%);
          border: 1px solid rgba(0,0,0,0.15);
          box-shadow:
            inset 0 1px 1px rgba(255,255,255,0.9),
            inset 0 -1px 1px rgba(0,0,0,0.08),
            0 2px 6px rgba(0,0,0,0.25);
          cursor: pointer;
          margin-top: -9px;
          position: relative;
          z-index: 10;
        }
        input[type="range"].range-thumb::-moz-range-thumb {
          width: 22px;
          height: 22px;
          border-radius: 9999px;
          background: linear-gradient(180deg, #ffffff 0%, #f2f5f9 40%, #e6ebf3 100%);
          border: 1px solid rgba(0,0,0,0.15);
          box-shadow:
            inset 0 1px 1px rgba(255,255,255,0.9),
            inset 0 -1px 1px rgba(0,0,0,0.08),
            0 2px 6px rgba(0,0,0,0.25);
          cursor: pointer;
          position: relative;
          z-index: 10;
        }
      `}</style>
    </div>
  );
}
