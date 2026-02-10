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
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Scorecard } from "@/app/components/Scorecard";
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
  hasAudio?: boolean;
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

        // Audio presence map (media_assets + media_attachments via view)
        const audioSet = new Set<string>();
        if (geIds.length) {
          const { data: audioRows, error: audioErr } = await supabase
            .from("v_media_attachments_expanded")
            .select("group_event_id, media_type")
            .in("group_event_id", geIds)
            .eq("entity_type", "group_event")
            .eq("media_type", "audio");
          if (audioErr) throw audioErr;
          (audioRows ?? []).forEach((row: any) => {
            if (typeof row?.group_event_id === "string") {
              audioSet.add(row.group_event_id);
            }
          });
        }

        // 3) Join e ordinamento
        const joined = filtered
          .map((s) => {
            const j = jMap.get(s.group_event_id);
            if (!j || s.avg_rating === null) return null;
            return {
              j,
              avg: Number(s.avg_rating),
              cnt: Number(s.ratings_count ?? 0),
              hasAudio: audioSet.has(s.group_event_id),
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
          {rows.map(({ j, avg, cnt, hasAudio }) => (
            <Scorecard
              key={j.journey_id}
              href={`/module/group_event?gid=${encodeURIComponent(j.journey_id)}`}
              title={j.translation_title ?? "Untitled"}
              coverUrl={j.journey_cover_url}
              isFavourite={j.is_favourite}
              hasAudio={hasAudio}
              publishedAt={j.approved_at}
              averageRating={avg}
              ratingsCount={cnt}
              eventsCount={j.events_count}
              yearFrom={j.year_from_min}
              yearTo={j.year_to_max}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
