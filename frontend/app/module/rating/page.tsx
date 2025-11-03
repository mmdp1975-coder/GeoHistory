// frontend/app/module/rating/page.tsx
"use client";

/**
 * GeoHistory — Top Rated Journeys (Scorecard unificata)
 *
 * Dati:
 * - Classifica da v_group_event_rating_stats (avg_rating, ratings_count)
 * - Dettagli journey da v_journeys (cover, titolo, approved_at, events_count, year_from_min, year_to_max, is_favourite)
 *
 * UI (replica scorecard NewJourney):
 * - Immagine header con cuore in alto a destra (pieno se is_favourite, vuoto altrimenti)
 * - Titolo su DUE righe fisse
 * - Data pubblicazione (formato "gg mmm aa") a destra del titolo, SEMPRE su UNA riga
 * - Stella SOTTO la data (allineata alla seconda riga del titolo) con avg e (count)
 * - Meta in basso: numero eventi + range anni (con "BC" per negativi)
 * - Link al Journey: /module/group_event?gid=<journey_id> (coerente con modulo rating originale)
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useCurrentUser } from "@/lib/useCurrentUser";

type StatsRow = {
  group_event_id: string;   // = journey_id
  avg_rating: number | null;
  ratings_count: number | null;
};

type JourneyRow = {
  journey_id: string;
  translation_title: string | null;
  journey_cover_url: string | null;
  approved_at: string | null;
  events_count: number | null;
  year_from_min: number | null;
  year_to_max: number | null;
  is_favourite: boolean | null;
};

type Joined = {
  j: JourneyRow;
  avg: number;
  cnt: number;
};

/** Type guard per StatsRow */
function isStatsRow(v: unknown): v is StatsRow {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.group_event_id === "string" &&
    "avg_rating" in o &&
    "ratings_count" in o
  );
}

/** Type guard per JourneyRow */
function isJourneyRow(v: unknown): v is JourneyRow {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.journey_id === "string" &&
    "translation_title" in o &&
    "journey_cover_url" in o &&
    "approved_at" in o &&
    "events_count" in o &&
    "year_from_min" in o &&
    "year_to_max" in o &&
    "is_favourite" in o
  );
}

function sortByRating(rows: Joined[]) {
  return [...rows].sort((a, b) => {
    if (b.avg !== a.avg) return b.avg - a.avg;
    return b.cnt - a.cnt;
  });
}

function formatDateShort(iso: string | null) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    const day = String(d.getDate()).padStart(2, "0");
    const month = d.toLocaleString("it-IT", { month: "short" }); // "nov"
    const year = String(d.getFullYear()).slice(-2);              // "25"
    return `${day} ${month} ${year}`; // es: "03 nov 25"
  } catch {
    return null;
  }
}

function formatYear(y: number | null | undefined) {
  if (y === null || y === undefined) return "—";
  if (y < 0) return `${Math.abs(y)} BC`;
  return String(y);
}

export default function RatingPage() {
  const supabase = useMemo(() => createClientComponentClient(), []);
  const { checking, error: authError, personaCode } = useCurrentUser();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<Joined[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        // 1) Statistiche rating
        const { data: statsRaw, error: statsErr } = await supabase
          .from("v_group_event_rating_stats")
          .select("group_event_id, avg_rating, ratings_count");

        if (statsErr) throw statsErr;

        // Normalizza e filtra con type guard
        const statsArr = ((statsRaw ?? []) as unknown[]).filter(isStatsRow) as StatsRow[];

        // Solo chi ha almeno 1 voto e media definita
        const filtered = statsArr.filter(
          (s) => s.avg_rating !== null && (s.ratings_count ?? 0) > 0
        );

        if (filtered.length === 0) {
          if (!alive) return;
          setRows([]);
          return;
        }

        // 2) Dettagli journey necessari per la scorecard unificata
        const geIds = Array.from(new Set(filtered.map((s) => s.group_event_id)));
        const { data: jRowsRaw, error: jErr } = await supabase
          .from("v_journeys")
          .select(
            [
              "journey_id",
              "translation_title",
              "journey_cover_url",
              "approved_at",
              "events_count",
              "year_from_min",
              "year_to_max",
              "is_favourite",
            ].join(",")
          )
          .in("journey_id", geIds);

        if (jErr) throw jErr;

        const jArr = ((jRowsRaw ?? []) as unknown[]).filter(isJourneyRow) as JourneyRow[];
        const jMap = new Map<string, JourneyRow>(jArr.map((r) => [r.journey_id, r]));

        // 3) Join e ordinamento
        const joined = filtered
          .map((s) => {
            const j = jMap.get(s.group_event_id);
            if (!j || s.avg_rating === null) return null;
            return {
              j,
              avg: Number(s.avg_rating),
              cnt: Number(s.ratings_count ?? 0),
            } as Joined;
          })
          .filter(Boolean) as Joined[];

        if (!alive) return;
        setRows(sortByRating(joined));
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message ?? "Errore nel caricamento dei rating.");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [supabase]);

  return (
    <div className="px-4 py-6 md:px-8">
      <div className="mb-4 flex items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Top Rated Journeys</h1>

        {/* Badge utente/persona per coerenza con gli altri moduli */}
        <div className="text-right">
          {checking ? (
            <span className="text-xs text-slate-500">Checking…</span>
          ) : authError ? (
            <span className="rounded-md border bg-white px-2 py-1 text-xs text-slate-600">Guest</span>
          ) : (
            <span className="rounded-md border bg-white px-2 py-1 text-xs text-slate-700">
              {personaCode || "USER"}
            </span>
          )}
        </div>
      </div>

      {/* Messaggi stato */}
      {err && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-red-700">
          {err}
        </div>
      )}
      {loading && !err && (
        <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3 text-slate-600">
          Caricamento…
        </div>
      )}

      {/* Empty state */}
      {!loading && !err && rows.length === 0 && (
        <div className="rounded-2xl p-6 text-center shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
          <p className="text-base">Nessun Journey con rating disponibile.</p>
        </div>
      )}

      {/* Grid risultati */}
      {rows.length > 0 && (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map(({ j, avg, cnt }) => {
            const title = j.translation_title ?? "Untitled";
            const cover = j.journey_cover_url;
            const published = formatDateShort(j.approved_at);

            return (
              <li
                key={j.journey_id}
                className="group relative overflow-hidden rounded-2xl border border-neutral-200 bg-white/90 shadow transition-shadow hover:shadow-lg"
              >
                <Link
                  href={`/module/group_event?gid=${encodeURIComponent(j.journey_id)}`}
                  prefetch={false}
                  className="block"
                >
                  {/* HEADER: immagine + cuore in alto a destra */}
                  <div className="relative h-40 w-full bg-neutral-100">
                    {cover ? (
                      <Image
                        src={cover}
                        alt={title}
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
                        priority={false}
                      />
                    ) : (
                      <div className="absolute inset-0 grid place-items-center text-sm text-neutral-400">
                        No cover
                      </div>
                    )}

                    <span
                      className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/85 shadow backdrop-blur"
                      title={j.is_favourite ? "Your favourite" : "Not in your favourites"}
                      aria-label="Favourite state"
                    >
                      {j.is_favourite ? (
                        <svg viewBox="0 0 24 24" className="h-5 w-5 text-rose-500" fill="currentColor" aria-hidden>
                          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 6 4 4 6.5 4 8.04 4 9.54 4.81 10.35 6.09 11.16 4.81 12.66 4 14.2 4 16.7 4 18.7 6 18.7 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" className="h-5 w-5 text-rose-500" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                          <path d="M12.1 20.3C7.14 16.24 4 13.39 4 9.86 4 7.3 6.05 5.25 8.6 5.25c1.54 0 3.04.81 3.85 2.09.81-1.28 2.31-2.09 3.85-2.09 2.55 0 4.6 2.05 4.6 4.61 0 3.53-3.14 6.38-8.1 10.44l-.7.6-.7-.6z" />
                        </svg>
                      )}
                    </span>
                  </div>

                  {/* BODY */}
                  <div className="p-4">
                    {/* GRID: titolo (2 righe) + data (row1, no wrap) + stella (row2) */}
                    <div
                      className="
                        mb-1 grid gap-x-2
                        [grid-template-columns:1fr_auto]
                        [grid-template-rows:auto_auto]
                        items-start
                      "
                    >
                      {/* Titolo: col 1, span su 2 righe */}
                      <h2
                        className="
                          col-[1] row-[1_/_span_2]
                          line-clamp-2 min-h-[2.6rem]
                          text-base font-semibold leading-snug text-neutral-900
                        "
                        title={title}
                      >
                        {title}
                      </h2>

                      {/* Data: col 2, row 1 — SEMPRE su UNA riga */}
                      {published && (
                        <span
                          className="
                            col-[2] row-[1]
                            rounded bg-neutral-100 px-2 py-[2px]
                            text-xs font-medium text-neutral-700
                            whitespace-nowrap
                          "
                          title="Publication date"
                        >
                          {published}
                        </span>
                      )}

                      {/* Stella: col 2, row 2 — sotto la data (avg e count) */}
                      <div className="col-[2] row-[2] mt-[2px] flex justify-end">
                        <span className="inline-flex items-center gap-1 text-sm text-neutral-800">
                          <svg viewBox="0 0 24 24" className="h-4 w-4 text-amber-500" fill="currentColor" aria-hidden>
                            <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                          </svg>
                          {avg.toFixed(1)} ({cnt})
                        </span>
                      </div>
                    </div>

                    {/* Meta: eventi + anni */}
                    <div className="mt-3 flex items-center justify-between gap-2 text-xs text-neutral-600">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="inline-flex items-center gap-1" title="Events count">
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                            <path d="M3 6h18v2H3V6zm2 4h14v8H5v-8zm2 2v4h10v-4H7z" />
                          </svg>
                          {j.events_count ?? 0} events
                        </span>

                        <span className="inline-flex items-center gap-1" title="Time span">
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                            <path d="M12 5v14m-7-7h14" />
                          </svg>
                          {formatYear(j.year_from_min)} → {formatYear(j.year_to_max)}
                        </span>
                      </div>

                      <span className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white">
                        Open
                      </span>
                    </div>
                  </div>

                  {/* Hover ring */}
                  <span className="pointer-events-none absolute inset-0 rounded-2xl ring-0 ring-sky-300/0 transition group-hover:ring-4 group-hover:ring-sky-300/30" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
