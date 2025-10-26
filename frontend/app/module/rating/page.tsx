/* frontend/app/module/rating/page.tsx
 * GeoHistory — Top Rated Journeys (solo VIEW)
 * - Legge stats da: v_group_event_rating_stats
 * - Legge dettagli da: v_journeys
 * - Link corretto: /module/group_event?gid=<journey_id>
 */

import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import Image from "next/image";
import Link from "next/link";
import { Star } from "lucide-react";

export const revalidate = 0;

type StatsRow = {
  group_event_id: string;          // = journey_id
  avg_rating: number | null;
  ratings_count: number | null;
};

type JourneyRow = {
  journey_id: string;
  translation_title: string | null;
  journey_cover_url: string | null;
};

function sortByRating(rows: Array<{ j: JourneyRow; avg: number; cnt: number }>) {
  return [...rows].sort((a, b) => {
    if (b.avg !== a.avg) return b.avg - a.avg;
    return b.cnt - a.cnt;
  });
}

export default async function RatingPage() {
  const supabase = createServerComponentClient({ cookies });

  // 1) Legge le statistiche dai RATING (VIEW)
  const { data: statsRaw, error: statsErr } = await supabase
    .from("v_group_event_rating_stats")
    .select("group_event_id, avg_rating, ratings_count");

  if (statsErr) {
    return (
      <div className="px-4 py-6 md:px-8">
        <h1 className="text-2xl font-semibold tracking-tight">Top Rated Journeys</h1>
        <p className="mt-2 text-sm text-red-600">
          Errore nel recupero dei rating: {statsErr.message}
        </p>
      </div>
    );
  }

  const stats = (statsRaw ?? []) as StatsRow[];
  const filtered = stats.filter((s) => s.avg_rating !== null && (s.ratings_count ?? 0) > 0);

  if (filtered.length === 0) {
    return (
      <div className="px-4 py-6 md:px-8">
        <h1 className="text-2xl font-semibold tracking-tight">Top Rated Journeys</h1>
        <div className="rounded-2xl p-6 text-center shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
          <p className="text-base">Nessun Journey con rating disponibile.</p>
        </div>
      </div>
    );
  }

  // 2) Recupera solo i Journey coinvolti (VIEW)
  const geIds = Array.from(new Set(filtered.map((s) => s.group_event_id)));
  const { data: jRowsRaw, error: jErr } = await supabase
    .from("v_journeys")
    .select("journey_id, translation_title, journey_cover_url")
    .in("journey_id", geIds);

  if (jErr) {
    return (
      <div className="px-4 py-6 md:px-8">
        <h1 className="text-2xl font-semibold tracking-tight">Top Rated Journeys</h1>
        <p className="mt-2 text-sm text-red-600">
          Errore nel recupero dei Journey: {jErr.message}
        </p>
      </div>
    );
  }

  const jMap = new Map<string, JourneyRow>((jRowsRaw ?? []).map((r) => [r.journey_id, r as JourneyRow]));

  const joined = filtered
    .map((s) => {
      const j = jMap.get(s.group_event_id);
      if (!j || s.avg_rating === null) return null;
      return { j, avg: Number(s.avg_rating), cnt: Number(s.ratings_count ?? 0) };
    })
    .filter(Boolean) as Array<{ j: JourneyRow; avg: number; cnt: number }>;

  const rows = sortByRating(joined);

  return (
    <div className="px-4 py-6 md:px-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Top Rated Journeys</h1>

      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {rows.map(({ j, avg, cnt }) => {
          const title = j.translation_title ?? "Untitled";
          const cover = j.journey_cover_url;

          return (
            <li
              key={j.journey_id}
              className="
                group relative
                rounded-3xl bg-card outline-none
                shadow-[0_8px_24px_rgba(0,0,0,0.08)]
                hover:shadow-[0_16px_40px_rgba(0,0,0,0.16)]
                transition-transform duration-200
                will-change-transform
                hover:-translate-y-1.5
                overflow-hidden
              "
            >
              <Link
                href={`/module/group_event?gid=${encodeURIComponent(j.journey_id)}`}
                prefetch={false}
                className="block"
              >
                <div className="relative aspect-[16/9] bg-muted">
                  {cover ? (
                    <Image
                      src={cover}
                      alt={title}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
                    />
                  ) : (
                    <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
                      No cover
                    </div>
                  )}
                </div>

                <div className="p-4">
                  <h2 className="line-clamp-2 text-base font-semibold">{title}</h2>

                  <div className="mt-3 flex items-center gap-2">
                    <Star className="h-5 w-5 fill-current text-yellow-400" aria-hidden="true" />
                    <span className="text-sm font-semibold">{avg.toFixed(1)}</span>
                    {cnt > 0 && <span className="text-xs text-muted-foreground">({cnt})</span>}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
