"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseBrowserClient";
import RatingSummary from "../../components/RatingSummary";

/**
 * FAVOURITES PAGE — usa SOLO la vista `v_journeys`
 * - Nessuna query diretta alle tabelle.
 * - Unfavourite via RPC `journey_unfavourite(p_journey_id uuid)`.
 * - Selezioniamo SOLO campi garantiti e indipendenti: niente `approved_at` o `created_at`.
 * - Ordinamento semplice per `translation_title` ASC per evitare riferimenti a colonne controverse.
 */

const TIMELINE_PATH = "/module/timeline";

/* =========================
 *          Types
 * ========================= */
type JourneyRow = {
  journey_id: string;
  journey_slug: string | null;
  journey_cover_url: string | null;
  visibility: string | null;
  workflow_state: string | null;
  owner_profile_id: string | null;
  // approved_at?: string | null; // volutamente non usato
  // created_at?: string | null;  // volutamente non usato
  // updated_at?: string | null;  // volutamente non usato
  allow_stud_primary?: boolean | null;
  allow_stud_middle?: boolean | null;
  allow_stud_high?: boolean | null;
  allow_fan?: boolean | null;
  translation_id?: string | null;
  translation_title: string | null;
  translation_description: string | null;
  translation_lang2?: string | null;
  events_count?: number | null;
  year_from_min?: number | null;
  year_to_max?: number | null;
  favourites_count: number | null;
  is_favourite: boolean | null;
};

type CardModel = {
  id: string;
  title: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  isFavourite: boolean;
  favouritesCount: number;
};

/* =========================
 *       Utils & UI bits
 * ========================= */
function truncate(text: string | null | undefined, max = 140): string {
  if (!text) return "";
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
}

function EmptyState() {
  return (
    <div className="col-span-full my-12 flex flex-col items-center justify-center gap-4 text-center">
      <div className="relative h-28 w-28">
        <Image alt="No favourites" src="/img/empty-favourites.png" fill className="object-contain opacity-70" />
      </div>
      <div>
        <h3 className="text-lg font-semibold text-slate-700">No favourites yet</h3>
        <p className="text-sm text-slate-500">
          Browse the timeline and tap the heart to add Journeys to your favourites.
        </p>
      </div>
      <Link
        href={TIMELINE_PATH}
        className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow hover:bg-slate-800"
      >
        Go to Timeline
      </Link>
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="h-40 w-full animate-pulse bg-slate-100" />
      <div className="space-y-2 p-4">
        <div className="h-4 w-3/4 animate-pulse rounded bg-slate-100" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-slate-100" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-slate-100" />
      </div>
      <div className="border-t p-3">
        <div className="h-8 w-20 animate-pulse rounded bg-slate-100" />
      </div>
    </div>
  );
}

function HeartButton({
  active,
  onClick,
  loading,
}: {
  active: boolean;
  onClick: () => void;
  loading?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-medium transition ${
        active
          ? "bg-rose-50 text-rose-600 hover:bg-rose-100"
          : "bg-slate-50 text-slate-600 hover:bg-slate-100"
      } ${loading ? "opacity-60" : ""}`}
      title={active ? "Remove from favourites" : "Add to favourites"}
    >
      <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill={active ? "currentColor" : "none"}>
        <path
          stroke="currentColor"
          strokeWidth="1.5"
          d="M12.62 20.68c-.35.2-.89.2-1.24 0C7.82 18.8 2 14.86 2 8.86 2 6.1 4.24 4 6.98 4c1.73 0 3.39.81 4.52 2.09C12.63 4.81 14.29 4 16.02 4 18.76 4 21 6.1 21 8.86c0 6-5.82 9.94-8.38 11.82z"
          fill={active ? "currentColor" : "none"}
        />
      </svg>
      {active ? "Favourited" : "Favourite"}
    </button>
  );
}

/* =========================
 *           Page
 * ========================= */
export default function FavouritesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cards, setCards] = useState<CardModel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState<boolean>(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Verifica sessione
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr) {
      setLoading(false);
      setError("Authentication error. Please sign in again.");
      setSignedIn(false);
      return;
    }
    if (!authData?.user) {
      setLoading(false);
      setCards([]);
      setSignedIn(false);
      return;
    }
    setSignedIn(true);

    // Unica SELECT dalla vista v_journeys — SOLO campi sicuri
    const { data, error: vErr } = await supabase
      .from("v_journeys")
      .select(
        [
          "journey_id",
          "journey_slug",
          "journey_cover_url",
          "translation_title",
          "translation_description",
          "favourites_count",
          "is_favourite",
        ].join(",")
      )
      .eq("is_favourite", true);

    if (vErr) {
      setError(vErr.message ?? "Failed to load favourites.");
      setLoading(false);
      return;
    }

    // Ordinamento semplice per titolo
    const sorted = (data ?? []).sort((a: JourneyRow, b: JourneyRow) => {
      const ta = (a.translation_title ?? "").toLocaleLowerCase();
      const tb = (b.translation_title ?? "").toLocaleLowerCase();
      return ta.localeCompare(tb);
    });

    const mapped: CardModel[] = sorted.map((r: JourneyRow) => ({
      id: r.journey_id,
      title: r.translation_title ?? "Untitled Journey",
      subtitle: truncate(r.translation_description, 160),
      imageUrl: r.journey_cover_url ?? undefined,
      isFavourite: !!r.is_favourite,
      favouritesCount: r.favourites_count ?? 0,
    }));

    setCards(mapped);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onOpen = useCallback(
    (id: string) => {
      try {
        window?.localStorage?.setItem("active_journey_id", id);
      } catch {}
      // Rotta legacy ancora su /group_event
      router.push(`/module/group_event?gid=${encodeURIComponent(id)}`);
    },
    [router]
  );

  const onToggleHeart = useCallback(
    async (id: string) => {
      // In questa pagina vediamo solo preferiti: il toggle equivale a "unfavourite"
      setBusyId(id);
      try {
        const { error: rpcErr } = await supabase.rpc("journey_unfavourite", { p_journey_id: id });
        if (rpcErr) throw rpcErr;
        // Optimistic update: rimuovi la card dalla lista
        setCards((prev) => prev.filter((c) => c.id !== id));
      } catch (e: any) {
        const msg = typeof e?.message === "string" ? e.message : "Operation failed.";
        setError(msg);
      } finally {
        setBusyId(null);
      }
    },
    []
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">My Favourites</h1>
          <p className="text-sm text-slate-500">Journeys you&apos;ve saved for quick access.</p>
        </div>
        <Link
          href={TIMELINE_PATH}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow hover:bg-slate-800"
        >
          Explore Timeline
        </Link>
      </header>

      {/* Auth missing */}
      {!signedIn && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="mb-3 text-slate-700">You need to sign in to see your favourites.</p>
          <Link href="/login" className="text-sm font-medium text-slate-900 underline">
            Go to Login
          </Link>
        </div>
      )}

      {/* Error banner */}
      {error && signedIn && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Grid */}
      <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {loading &&
          Array.from({ length: 6 }).map((_, i) => <LoadingCard key={`skeleton-${i}`} />)}

        {!loading && cards.length === 0 && <EmptyState />}

        {!loading &&
          cards.map((c) => (
            <article
              key={c.id}
              className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
            >
              {/* Cover */}
              <button
                onClick={() => onOpen(c.id)}
                className="relative block h-40 w-full overflow-hidden"
                title={c.title}
              >
                {c.imageUrl ? (
                  <Image
                    src={c.imageUrl}
                    alt={c.title}
                    fill
                    className="object-cover transition duration-300 group-hover:scale-[1.02]"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-400">
                    No cover
                  </div>
                )}
              </button>

              {/* Body */}
              <div className="space-y-2 p-4">
                <h3 className="line-clamp-2 text-base font-semibold text-slate-900">{c.title}</h3>
                {c.subtitle && (
                  <p className="line-clamp-3 text-sm leading-5 text-slate-600">{c.subtitle}</p>
                )}

                {/* RatingSummary (passiamo journey_id come groupEventId per compatibilità corrente) */}
                <div className="pt-1">
                  <RatingSummary groupEventId={c.id} compact />
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between border-t p-3">
                <div className="text-xs text-slate-500">
                  <span className="font-medium text-slate-700">{c.favouritesCount}</span> favourites
                </div>

                <HeartButton
                  active={c.isFavourite}
                  loading={busyId === c.id}
                  onClick={() => onToggleHeart(c.id)}
                />
              </div>
            </article>
          ))}
      </section>
    </main>
  );
}
