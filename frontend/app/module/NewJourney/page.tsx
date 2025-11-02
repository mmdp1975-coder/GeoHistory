// frontend/app/module/NewJourney/page.tsx
// Server Component: lista "New Journeys" dalla vista v_journeys,
// ordinati per data di pubblicazione (approved_at DESC)

import Image from 'next/image';
import Link from 'next/link';
import { createClient } from '@/lib/supabaseServerClient';

type VJourney = {
  journey_id: string;                 // uuid
  journey_slug: string;               // text
  journey_cover_url: string | null;   // text
  translation_id: string | null;      // uuid
  translation_title: string | null;   // text
  translation_description: string | null; // text
  translation_lang2: string | null;   // text (es. 'en', 'it')
  events_count: number | null;        // int
  year_from_min: number | null;       // int
  year_to_max: number | null;         // int
  favourites_count: number | null;    // int
  is_favourite: boolean | null;       // boolean
  approved_at: string | null;         // timestamp (pubblicazione)
};

async function fetchNewJourneys(): Promise<VJourney[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('v_journeys')
    .select(`
      journey_id,
      journey_slug,
      journey_cover_url,
      translation_id,
      translation_title,
      translation_description,
      translation_lang2,
      events_count,
      year_from_min,
      year_to_max,
      favourites_count,
      is_favourite,
      approved_at
    `)
    .order('approved_at', { ascending: false, nullsFirst: false });

  if (error) {
    console.error('v_journeys fetch error:', error);
    return [];
  }

  return (data ?? []) as VJourney[];
}

export default async function Page() {
  const list = await fetchNewJourneys();

  return (
    <div className="px-4 py-6 md:px-8">
      {/* HEADER */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">New Journeys</h1>
        <Link
          href="/module/landing"
          className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-800 shadow hover:bg-neutral-100"
        >
          ← Back
        </Link>
      </div>

      {/* EMPTY STATE */}
      {list.length === 0 ? (
        <div className="text-sm text-neutral-600">Nessun Journey pubblicato al momento.</div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {list.map((j) => {
            const published = j.approved_at
              ? new Date(j.approved_at).toLocaleDateString('it-IT', {
                  year: 'numeric', month: 'short', day: '2-digit',
                })
              : null;

            return (
              <article
                key={j.journey_id}
                className="group relative overflow-hidden rounded-2xl border border-neutral-200 bg-white/90 shadow transition-shadow hover:shadow-lg"
              >
                {/* COVER */}
                <div className="relative h-40 w-full bg-neutral-100">
                  {j.journey_cover_url ? (
                    <Image
                      src={j.journey_cover_url}
                      alt={j.translation_title ?? 'Journey cover'}
                      fill
                      sizes="(min-width:1280px) 25vw, (min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw"
                      className="object-cover"
                      priority={false}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-3xl">🧭</div>
                  )}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/15 to-transparent" />
                </div>

                {/* BODY */}
                <div className="p-4">
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <h2 className="line-clamp-1 text-base font-semibold text-neutral-900">
                      {j.translation_title ?? 'Untitled journey'}
                    </h2>
                    {published && (
                      <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-700">
                        {published}
                      </span>
                    )}
                  </div>

                  {/* Pitch/descrizione (3 righe) */}
                  {j.translation_description ? (
                    <p className="mt-1 line-clamp-3 text-sm text-neutral-700">{j.translation_description}</p>
                  ) : (
                    <p className="mt-1 text-sm text-neutral-500 italic">No description</p>
                  )}

                  {/* Meta */}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-600">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1">
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                          <path d="M3 6h18v2H3V6zm2 4h14v8H5v-8zm2 2v4h10v-4H7z" />
                        </svg>
                        {j.events_count ?? 0} events
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                          <path d="M12 5v14m-7-7h14" />
                        </svg>
                        {j.year_from_min ?? '—'} → {j.year_to_max ?? '—'}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <svg viewBox="0 0 24 24" className="h-4 w-4 text-rose-500" fill="currentColor" aria-hidden>
                          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 6 4 4 6.5 4 8.04 4 9.54 4.81 10.35 6.09 11.16 4.81 12.66 4 14.2 4 16.7 4 18.7 6 18.7 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                        </svg>
                        {j.favourites_count ?? 0}
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
