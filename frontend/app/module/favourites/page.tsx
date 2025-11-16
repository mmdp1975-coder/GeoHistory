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
import { createClient } from "@/lib/supabase/client";
import { Scorecard } from "@/app/components/Scorecard";

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

export default function FavouritesPage() {
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

  // 4) Render
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
        <section>
          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((j) => {
              const title = j.translation_title ?? "Untitled journey";
              return (
                <Scorecard
                  key={j.journey_id}
                  href={`/module/group_event?gid=${encodeURIComponent(j.journey_id)}`}
                  title={title}
                  coverUrl={j.journey_cover_url}
                  isFavourite={j.is_favourite}
                  publishedAt={j.approved_at}
                  averageRating={j.avg_rating}
                  ratingsCount={j.ratings_count}
                  eventsCount={j.events_count}
                  yearFrom={j.year_from_min}
                  yearTo={j.year_to_max}
                  prefetch={false}
                  onToggleFavourite={() => toggleFavourite(j.journey_id)}
                  favouriteToggleDisabled={busyId === j.journey_id}
                  favouriteToggleTitle={j.is_favourite ? "Remove from favourites" : "Add to favourites"}
                  favouriteToggleAriaLabel="Toggle favourite"
                  liProps={{
                    "data-jid": j.journey_id,
                    ...(j.journey_slug ? { "data-slug": j.journey_slug } : {}),
                  }}
                />
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
