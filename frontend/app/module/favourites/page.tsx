"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import RatingSummary from "../../components/RatingSummary";

type UUID = string;

type JourneyRow = {
  journey_id: UUID;
  journey_slug: string | null;
  journey_cover_url: string | null;
  translation_title: string | null;
  translation_description: string | null;
  favourites_count: number | null;
  is_favourite: boolean | null;
};

const TIMELINE_PATH = "/module/timeline";

export default function FavouritesPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [userId, setUserId] = useState<string | null>(null);
  const [journeys, setJourneys] = useState<JourneyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // === 1) Carica utente ===
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) setUserId(null);
      else setUserId(data.user.id);
    })();
  }, [supabase]);

  // === 2) Carica preferiti dalla VIEW v_journeys ===
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("v_journeys")
        .select(
          "journey_id, journey_slug, journey_cover_url, translation_title, translation_description, favourites_count, is_favourite"
        )
        .eq("is_favourite", true)
        .order("translation_title", { ascending: true });

      if (error) throw error;
      setJourneys((data ?? []) as JourneyRow[]);
    } catch (e: any) {
      setError(e.message || "Unable to load favourites.");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (userId) loadData();
  }, [userId, loadData]);

  // === 3) Toggle cuore: usa la funzione RPC toggle_favourite(uuid) ===
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

        const idx = journeys.findIndex((j) => j.journey_id === journeyId);
        if (idx < 0) return;

        const current = journeys[idx];
        const isFav = !!current.is_favourite;
        const curCount = current.favourites_count ?? 0;

        // Aggiornamento ottimistico
        const optimistic = [...journeys];
        optimistic[idx] = {
          ...current,
          is_favourite: !isFav,
          favourites_count: Math.max(0, curCount + (isFav ? -1 : 1)),
        };
        setJourneys(optimistic);

        // 🔁 Chiamata alla funzione SQL
        const { error } = await supabase.rpc("toggle_favourite", { journey_id: journeyId });
        if (error) throw error;

        // (opzionale) Ricarica il dato singolo da v_journeys per coerenza
        // ma di solito non serve perché la VIEW riflette subito lo stato.
      } catch (e: any) {
        setError(e.message || "Failed to toggle favourite.");
        loadData(); // rollback soft
      } finally {
        setBusyId(null);
      }
    },
    [supabase, journeys, loadData]
  );

  // === 4) Apertura dettaglio ===
  const openJourney = useCallback(
    (id: string) => router.push(`/module/group_event?gid=${id}`),
    [router]
  );

  // === 5) Render ===
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
      ) : journeys.length === 0 ? (
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
          {journeys.map((j) => {
            const isFav = !!j.is_favourite;
            const count = j.favourites_count ?? 0;
            return (
              <article
                key={j.journey_id}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
              >
                <button
                  onClick={() => openJourney(j.journey_id)}
                  className="relative block h-40 w-full overflow-hidden"
                >
                  {j.journey_cover_url ? (
                    <Image
                      src={j.journey_cover_url}
                      alt={j.translation_title || "Cover"}
                      fill
                      className="object-cover transition duration-300 hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-slate-100 text-slate-400">
                      No cover
                    </div>
                  )}
                </button>

                <div className="p-4">
                  <h3 className="text-base font-semibold text-slate-900">
                    {j.translation_title || "Untitled Journey"}
                  </h3>
                  <p className="line-clamp-3 text-sm text-slate-600">
                    {j.translation_description || ""}
                  </p>

                  <div className="pt-2">
                    <RatingSummary groupEventId={j.journey_id} compact />
                  </div>
                </div>

                <div className="flex items-center justify-between border-t p-3">
                  <span className="text-xs text-slate-500">{count} favourites</span>
                  <button
                    onClick={() => toggleFavourite(j.journey_id)}
                    disabled={busyId === j.journey_id}
                    className={`rounded-full p-2 ${
                      isFav
                        ? "text-rose-600 bg-rose-50 hover:bg-rose-100"
                        : "text-slate-600 bg-slate-50 hover:bg-slate-100"
                    }`}
                    title={isFav ? "Remove from favourites" : "Add to favourites"}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill={isFav ? "currentColor" : "none"}
                      stroke="currentColor"
                      strokeWidth="1.5"
                      className="h-5 w-5"
                    >
                      <path d="M12.62 20.68c-.35.2-.89.2-1.24 0C7.82 18.8 2 14.86 2 8.86 2 6.1 4.24 4 6.98 4c1.73 0 3.39.81 4.52 2.09C12.63 4.81 14.29 4 16.02 4 18.76 4 21 6.1 21 8.86c0 6-5.82 9.94-8.38 11.82z" />
                    </svg>
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
