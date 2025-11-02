// frontend/app/module/rating/page.tsx
"use client";

/**
 * GeoHistory — Top Rated Journeys
 * - Migrazione a client component per usare l’hook centralizzato useCurrentUser()
 * - I dati sono letti via Supabase client rispettando RLS/policy esistenti
 * - Nessun requisito di essere loggati: la pagina funziona da "guest" ma mostra la persona se presente
 * - Link corretto ai Journey: /module/group_event?gid=<journey_id>
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Star } from "lucide-react";
import { useCurrentUser } from "@/lib/useCurrentUser";

type StatsRow = {
  group_event_id: string;          // corrisponde a journey_id
  avg_rating: number | null;
  ratings_count: number | null;
};

type JourneyRow = {
  journey_id: string;
  translation_title: string | null;
  journey_cover_url: string | null;
};

type Joined = { j: JourneyRow; avg: number; cnt: number };

function sortByRating(rows: Joined[]) {
  return [...rows].sort((a, b) => {
    if (b.avg !== a.avg) return b.avg - a.avg;
    return b.cnt - a.cnt;
  });
}

export default function RatingPage() {
  const supabase = useMemo(() => createClientComponentClient(), []);
  // 🔸 stato utente centralizzato (identico agli altri moduli)
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

        // 1) Leggi le statistiche rating dalla VIEW
        const { data: statsRaw, error: statsErr } = await supabase
          .from("v_group_event_rating_stats")
          .select("group_event_id, avg_rating, ratings_count");

        if (statsErr) throw statsErr;

        const stats = (statsRaw ?? []) as StatsRow[];
        const filtered = stats.filter((s) => s.avg_rating !== null && (s.ratings_count ?? 0) > 0);
        if (filtered.length === 0) {
          if (!alive) return;
          setRows([]);
          return;
        }

        // 2) Dettagli Journey (VIEW) solo per gli ID in classifica
        const geIds = Array.from(new Set(filtered.map((s) => s.group_event_id)));
        const { data: jRowsRaw, error: jErr } = await supabase
          .from("v_journeys")
          .select("journey_id, translation_title, journey_cover_url")
          .in("journey_id", geIds);

        if (jErr) throw jErr;

        const jMap = new Map<string, JourneyRow>((jRowsRaw ?? []).map((r) => [r.journey_id, r as JourneyRow]));

        const joined = filtered
          .map((s) => {
            const j = jMap.get(s.group_event_id);
            if (!j || s.avg_rating === null) return null;
            return { j, avg: Number(s.avg_rating), cnt: Number(s.ratings_count ?? 0) } as Joined;
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

    return () => { alive = false; };
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
                        priority={false}
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
      )}
    </div>
  );
}
