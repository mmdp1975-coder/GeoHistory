// frontend/app/module/favourites/page.tsx
"use client";

/**
 * GeoHistory — My Favourites (scorecard unificata)
 *
 * Requisiti:
 * - Immagine header con CUORE in alto a destra (pieno se is_favourite, vuoto altrimenti) — cliccabile per toggle
 * - Titolo su DUE righe fisse (line-clamp-2)
 * - Data pubblicazione a destra del titolo, SEMPRE su UNA riga, formato "gg mmm aa" (es. 03 nov 25)
 * - STELLA sotto la data, allineata alla 2ª riga del titolo:
 *     • se rating presente: "★ avg (count)"
 *     • se assente: stella vuota e "(0)"
 * - Meta in basso: numero eventi + range anni (con "BC" per anni negativi)
 * - NESSUNA descrizione, NESSUN contatore preferiti visibile
 * - Card cliccabile verso il dettaglio journey (gid)
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type UUID = string;

type JourneyRow = {
  journey_id: UUID;
  journey_slug: string | null;
  journey_cover_url: string | null;
  translation_title: string | null;
  favourites_count: number | null; // tenuto solo per update ottimistico
  is_favourite: boolean | null;
  approved_at: string | null;
  events_count: number | null;
  year_from_min: number | null;
  year_to_max: number | null;
};

type StatsRow = {
  group_event_id: UUID; // = journey_id
  avg_rating: number | null;
  ratings_count: number | null;
};

type CardRow = JourneyRow & {
  avg_rating: number | null;
  ratings_count: number | null;
};

const TIMELINE_PATH = "/module/timeline";

/** Type guard: verifica che l'oggetto sia un JourneyRow */
function isJourneyRow(v: unknown): v is JourneyRow {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.journey_id === "string" &&
    "journey_slug" in o &&
    "journey_cover_url" in o &&
    "translation_title" in o &&
    "favourites_count" in o &&
    "is_favourite" in o &&
    "approved_at" in o &&
    "events_count" in o &&
    "year_from_min" in o &&
    "year_to_max" in o
  );
}

/** Type guard: verifica che l'oggetto sia uno StatsRow */
function isStatsRow(v: unknown): v is StatsRow {
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
    const month = d.toLocaleString("it-IT", { month: "short" }); // "nov"
    const year = String(d.getFullYear()).slice(-2); // "25"
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

export default function FavouritesPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [userId, setUserId] = useState<string | null>(null);
  const [rows, setRows] = useState<CardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // 1) Carica utente
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) setUserId(null);
      else setUserId(data.user.id);
    })();
  }, [supabase]);

  // 2) Carica preferiti + rating stats
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // a) Solo i journey preferiti dalla VIEW v_journeys
      const { data: favs, error: favErr } = await supabase
        .from("v_journeys")
        .select(
          [
            "journey_id",
            "journey_slug",
            "journey_cover_url",
            "translation_title",
            "favourites_count",
            "is_favourite",
            "approved_at",
            "events_count",
            "year_from_min",
            "year_to_max",
          ].join(",")
        )
        .eq("is_favourite", true)
        .order("translation_title", { ascending: true });

      if (favErr) throw favErr;

      // Normalizza a unknown[] e filtra con type guard
      const favsArr = ((favs ?? []) as unknown[]);
      const journeys = favsArr.filter(isJourneyRow) as JourneyRow[];

      if (journeys.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      // b) Rating stats per gli ID preferiti
      const ids = journeys.map((j) => j.journey_id);
      const { data: stats, error: statsErr } = await supabase
        .from("v_group_event_rating_stats")
        .select("group_event_id, avg_rating, ratings_count")
        .in("group_event_id", ids);

      if (statsErr) throw statsErr;

      const statsMap = new Map<UUID, StatsRow>();
      const statsArr = ((stats ?? []) as unknown[]).filter(isStatsRow) as StatsRow[];
      statsArr.forEach((s) => statsMap.set(s.group_event_id, s));

      // c) Merge client-side
      const merged: CardRow[] = journeys.map((j) => {
        const s = statsMap.get(j.journey_id);
        return {
          ...j,
          avg_rating: s?.avg_rating ?? null,
          ratings_count: s?.ratings_count ?? null,
        };
      });

      setRows(merged);
    } catch (e: any) {
      setError(e.message || "Unable to load favourites.");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (userId) loadData();
  }, [userId, loadData]);

  // 3) Toggle cuore (RPC toggle_favourite(uuid))
  const toggleFavourite = useCallback(
    async (journeyId: string) => {
      setBusyId(journeyId);
      setError(null);
      try {
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) {
          setError("Please sign in to manage favourites.");
          setBusyId(null);
          return;
        }

        const idx = rows.findIndex((r) => r.journey_id === journeyId);
        if (idx < 0) return;

        const current = rows[idx];
        const isFav = !!current.is_favourite;
        const curCount = current.favourites_count ?? 0;

        // Aggiornamento ottimistico
        const optimistic = [...rows];
        optimistic[idx] = {
          ...current,
          is_favourite: !isFav,
          favourites_count: Math.max(0, curCount + (isFav ? -1 : 1)),
        };
        setRows(optimistic);

        const { error } = await supabase.rpc("toggle_favourite", { journey_id: journeyId });
        if (error) throw error;

        // Ricarica per filtrare correttamente (rimuove card se non è più preferito)
        await loadData();
      } catch (e: any) {
        setError(e.message || "Failed to toggle favourite.");
        await loadData(); // rollback
      } finally {
        setBusyId(null);
      }
    },
    [supabase, rows, loadData]
  );

  // 4) Apertura dettaglio
  const openJourney = useCallback(
    (id: string) => router.push(`/module/group_event?gid=${id}`),
    [router]
  );

  // 5) Render
  if (!userId)
    return (
      <main className="mx-auto max-w-6xl px-4 py-6 text-center">
        <h1 className="mb-4 text-2xl font-bold text-slate-900">My Favourites</h1>
        <p className="mb-4 text-slate-600">You need to sign in to see your favourites.</p>
        <Link
          href="/login"
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow hover:bg-slate-800"
        >
          Go to Login
        </Link>
      </main>
    );

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">My Favourites</h1>
          <p className="text-sm text-slate-500">Journeys you've saved for quick access.</p>
        </div>
        <Link
          href={TIMELINE_PATH}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow hover:bg-slate-800"
        >
          Explore Timeline
        </Link>
      </header>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-slate-600">Loading favourites...</p>
      ) : rows.length === 0 ? (
        <div className="text-center text-slate-600">
          <Image
            alt="No favourites"
            src="/img/empty-favourites.png"
            width={100}
            height={100}
            className="mx-auto mb-4 opacity-70"
          />
          <p className="mb-2 font-medium">No favourites yet</p>
          <p className="text-sm">Browse the timeline and tap the heart to add Journeys.</p>
        </div>
      ) : (
        <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((j) => {
            const title = j.translation_title ?? "Untitled journey";
            const published = formatDateShort(j.approved_at);
            const hasRating = (j.ratings_count ?? 0) > 0 && j.avg_rating !== null;

            return (
              <article
                key={j.journey_id}
                className="group relative overflow-hidden rounded-2xl border border-neutral-200 bg-white/90 shadow transition-shadow hover:shadow-lg"
              >
                {/* HEADER IMMAGINE (clic su cover apre il journey) */}
                <button
                  onClick={() => openJourney(j.journey_id)}
                  className="relative block h-40 w-full overflow-hidden bg-neutral-100"
                >
                  {j.journey_cover_url ? (
                    <Image
                      src={j.journey_cover_url}
                      alt={title}
                      fill
                      className="object-cover transition duration-300 group-hover:scale-[1.02]"
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-3xl">🧭</div>
                  )}

                  {/* CUORE in alto a destra (toggle) */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavourite(j.journey_id);
                    }}
                    disabled={busyId === j.journey_id}
                    className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/85 shadow backdrop-blur hover:bg-white"
                    title={j.is_favourite ? "Remove from favourites" : "Add to favourites"}
                    aria-label="Toggle favourite"
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
                  </button>

                  <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/15 to-transparent" />
                </button>

                {/* BODY */}
                <div className="p-4">
                  {/* GRID: titolo (2 righe) + data (row1, no-wrap) + stella (row2) */}
                  <div
                    className="
                      mb-1 grid gap-x-2
                      [grid-template-columns:1fr_auto]
                      [grid-template-rows:auto_auto]
                      items-start
                    "
                  >
                    {/* Titolo: col 1, span 2 righe */}
                    <h3
                      className="
                        col-[1] row-[1_/_span_2]
                        line-clamp-2 min-h-[2.6rem]
                        text-base font-semibold leading-snug text-neutral-900
                      "
                      title={title}
                    >
                      {title}
                    </h3>

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

                    {/* Stella: col 2, row 2 — sotto la data */}
                    <div className="col-[2] row-[2] mt-[2px] flex justify-end">
                      {(j.ratings_count ?? 0) > 0 && j.avg_rating !== null ? (
                        <span className="inline-flex items-center gap-1 text-sm text-neutral-800">
                          <svg viewBox="0 0 24 24" className="h-4 w-4 text-amber-500" fill="currentColor" aria-hidden>
                            <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                          </svg>
                          {Number(j.avg_rating).toFixed(1)} ({j.ratings_count})
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-sm text-neutral-500" title="No ratings yet">
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                            <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                          </svg>
                          (0)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* META bottom */}
                  <div className="mt-3 flex items-center justify-between gap-2 text-xs text-neutral-600">
                    <div className="flex flex-wrap items-center gap-3">
                      {/* numero eventi */}
                      <span className="inline-flex items-center gap-1" title="Events count">
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                          <path d="M3 6h18v2H3V6zm2 4h14v8H5v-8zm2 2v4h10v-4H7z" />
                        </svg>
                        {j.events_count ?? 0} events
                      </span>

                      {/* range anni con BC */}
                      <span className="inline-flex items-center gap-1" title="Time span">
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                          <path d="M12 5v14m-7-7h14" />
                        </svg>
                        {formatYear(j.year_from_min)} → {formatYear(j.year_to_max)}
                      </span>
                    </div>

                    <button
                      onClick={() => openJourney(j.journey_id)}
                      className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800"
                    >
                      Open
                    </button>
                  </div>
                </div>

                {/* Hover ring */}
                <span className="pointer-events-none absolute inset-0 rounded-2xl ring-0 ring-sky-300/0 transition group-hover:ring-4 group-hover:ring-sky-300/30" />
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
