// frontend/app/module/NewJourney/page.tsx
"use client";

/**
 * GeoHistory — New Journeys (scorecard con layout a griglia)
 *
 * Obiettivo: data SEMPRE su una riga e stella SOTTO la data,
 * allineata alla seconda riga titolo, indipendentemente dal wrapping del titolo.
 *
 * Implementazione:
 * - Contenitore titolo/data/stella in CSS Grid: 2 colonne [1fr auto] x 2 righe [auto auto]
 *   • Titolo: col=1, row=1..2 (span di 2 righe)
 *   • Data:   col=2, row=1 (whitespace-nowrap)
 *   • Stella: col=2, row=2
 * - Resto invariato (cuore su immagine, eventi, anni con BC, niente descrizione).
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

type VJourney = {
  journey_id: string;
  journey_slug: string;
  journey_cover_url: string | null;
  translation_title: string | null;
  events_count: number | null;
  year_from_min: number | null;
  year_to_max: number | null;
  is_favourite: boolean | null;
  approved_at: string | null;
};

type RatingStats = {
  group_event_id: string;
  avg_rating: number | null;
  ratings_count: number | null;
};

type CardRow = VJourney & {
  avg_rating: number | null;
  ratings_count: number | null;
};

function isVJourney(v: unknown): v is VJourney {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.journey_id === "string" &&
    typeof o.journey_slug === "string" &&
    "journey_cover_url" in o &&
    "translation_title" in o &&
    "events_count" in o &&
    "year_from_min" in o &&
    "year_to_max" in o &&
    "is_favourite" in o &&
    "approved_at" in o
  );
}

function isRatingStats(v: unknown): v is RatingStats {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.group_event_id === "string" &&
    "avg_rating" in o &&
    "ratings_count" in o
  );
}

function formatDateShort(iso: string | null) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    const day = String(d.getDate()).padStart(2, "0");
    const month = d.toLocaleString("it-IT", { month: "short" }); // es: nov
    const year = String(d.getFullYear()).slice(-2);              // es: 25
    return `${day} ${month} ${year}`; // es: 03 nov 25
  } catch {
    return null;
  }
}

function formatYear(y: number | null | undefined) {
  if (y === null || y === undefined) return "—";
  if (y < 0) return `${Math.abs(y)} BC`;
  return String(y);
}

export default function NewJourneyPage() {
  const supabase = useMemo(() => createClientComponentClient(), []);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<CardRow[]>([]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        // 1) Journeys
        const { data: jRows, error: jErr } = await supabase
          .from("v_journeys")
          .select(
            [
              "journey_id",
              "journey_slug",
              "journey_cover_url",
              "translation_title",
              "events_count",
              "year_from_min",
              "year_to_max",
              "is_favourite",
              "approved_at",
            ].join(",")
          )
          .order("approved_at", { ascending: false, nullsFirst: false });

        if (jErr) throw jErr;

        // Normalizza a unknown[] e filtra con type guard
        const jArr = ((jRows ?? []) as unknown[]);
        const journeys = jArr.filter(isVJourney) as VJourney[];

        // 2) Rating (come modulo /module/rating)
        const ids = journeys.map((j) => j.journey_id);
        const { data: statsRaw, error: sErr } = await supabase
          .from("v_group_event_rating_stats")
          .select("group_event_id, avg_rating, ratings_count")
          .in("group_event_id", ids);

        if (sErr) throw sErr;

        const statsMap = new Map<string, RatingStats>();
        const sArr = ((statsRaw ?? []) as unknown[]);
        const stats = sArr.filter(isRatingStats) as RatingStats[];
        stats.forEach((r) => statsMap.set(r.group_event_id, r));

        // 3) Merge
        const merged: CardRow[] = journeys.map((j) => {
          const s = statsMap.get(j.journey_id);
          return {
            ...j,
            avg_rating: s?.avg_rating ?? null,
            ratings_count: s?.ratings_count ?? null,
          };
        });

        if (!alive) return;
        setRows(merged);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message ?? "Errore nel caricamento dei New Journeys.");
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
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">New Journeys</h1>
        <Link
          href="/module/landing"
          className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-800 shadow hover:bg-neutral-100"
        >
          ← Back
        </Link>
      </div>

      {/* Stato */}
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

      {/* Empty */}
      {!loading && !err && rows.length === 0 && (
        <div className="rounded-2xl p-6 text-center shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
          <p className="text-base">Nessun Journey pubblicato al momento.</p>
        </div>
      )}

      {/* Grid */}
      {rows.length > 0 && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((j) => {
            const title = j.translation_title ?? "Untitled journey";
            const published = formatDateShort(j.approved_at);
            const hasRating = (j.ratings_count ?? 0) > 0 && j.avg_rating !== null;

            return (
              <article
                key={j.journey_id}
                className="group relative overflow-hidden rounded-2xl border border-neutral-200 bg-white/90 shadow transition-shadow hover:shadow-lg"
              >
                {/* IMMAGINE */}
                <div className="relative h-40 w-full bg-neutral-100">
                  {j.journey_cover_url ? (
                    <Image
                      src={j.journey_cover_url}
                      alt={title}
                      fill
                      sizes="(min-width:1280px) 25vw, (min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw"
                      className="object-cover"
                      priority={false}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-3xl">🧭</div>
                  )}

                  {/* Cuore in alto a destra */}
                  <span
                    className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/85 shadow backdrop-blur"
                    title={j.is_favourite ? "Your favourite" : "Not in your favourites"}
                    aria-label="Favourite state"
                  >
                    {j.is_favourite ? (
                      <svg viewBox="0 0 24 24" className="h-5 w-5 text-rose-500" fill="currentColor">
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 6 4 4 6.5 4 8.04 4 9.54 4.81 10.35 6.09 11.16 4.81 12.66 4 14.2 4 16.7 4 18.7 6 18.7 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                      </svg>
                    ) : (
                      <svg
                        viewBox="0 0 24 24"
                        className="h-5 w-5 text-rose-500"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      >
                        <path d="M12.1 20.3C7.14 16.24 4 13.39 4 9.86 4 7.3 6.05 5.25 8.6 5.25c1.54 0 3.04.81 3.85 2.09.81-1.28 2.31-2.09 3.85-2.09 2.55 0 4.6 2.05 4.6 4.61 0 3.53-3.14 6.38-8.1 10.44l-.7.6-.7-.6z" />
                      </svg>
                    )}
                  </span>

                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/15 to-transparent" />
                </div>

                {/* BODY */}
                <div className="p-4">
                  {/* BLOCCO GRID: titolo (2 righe) + data (row1) + stella (row2) */}
                  <div
                    className="
                      mb-1 grid gap-x-2
                      [grid-template-columns:1fr_auto]
                      [grid-template-rows:auto_auto]
                      items-start
                    "
                  >
                    {/* Titolo: col 1, row 1..2 (span) */}
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

                    {/* Data: col 2, row 1 — NO WRAP */}
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

                    {/* Stella: col 2, row 2 — sotto la data, allineata alla 2ª riga del titolo */}
                    <div className="col-[2] row-[2] mt-[2px] flex justify-end">
                      {hasRating ? (
                        <span className="inline-flex items-center gap-1 text-sm text-neutral-800">
                          <svg viewBox="0 0 24 24" className="h-4 w-4 text-amber-500" fill="currentColor">
                            <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                          </svg>
                          {Number(j.avg_rating).toFixed(1)} ({j.ratings_count})
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-sm text-neutral-500">
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                          </svg>
                          (0)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Meta info */}
                  <div className="mt-3 flex items-center justify-between gap-2 text-xs text-neutral-600">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="inline-flex items-center gap-1" title="Events count">
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                          <path d="M3 6h18v2H3V6zm2 4h14v8H5v-8zm2 2v4h10v-4H7z" />
                        </svg>
                        {j.events_count ?? 0} events
                      </span>

                      <span className="inline-flex items-center gap-1" title="Time span">
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                          <path d="M12 5v14m-7-7h14" />
                        </svg>
                        {formatYear(j.year_from_min)} → {formatYear(j.year_to_max)}
                      </span>
                    </div>

                    <Link
                      href={`/module/group_event?slug=${encodeURIComponent(j.journey_slug)}`}
                      className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800"
                    >
                      Open
                    </Link>
                  </div>
                </div>

                {/* Hover ring */}
                <span className="pointer-events-none absolute inset-0 rounded-2xl ring-0 ring-sky-300/0 transition group-hover:ring-4 group-hover:ring-sky-300/30" />
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
