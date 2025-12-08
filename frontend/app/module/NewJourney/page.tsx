﻿// frontend/app/module/NewJourney/page.tsx
"use client";

/**
 * GeoHistory — New Journeys (scorecard con layout a griglia)
 *
 * Allineato a /module/rating:
 * - L'intera card è cliccabile.
 * - Link verso /module/group_event?gid=<journey_id>
 * - Layout titolo/data/stella identico allo stile unificato.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Scorecard } from "@/app/components/Scorecard";

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
  visibility: string | null;
  workflow_state: string | null;
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

/** Type guard per VJourney */
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
    "approved_at" in o &&
    "visibility" in o &&
    "workflow_state" in o
  );
}

/** Type guard per RatingStats */
function isRatingStats(v: unknown): v is RatingStats {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.group_event_id === "string" &&
    "avg_rating" in o &&
    "ratings_count" in o
  );
}

export default function NewJourneyPage() {
  const supabase = useMemo(() => createClientComponentClient(), []);
  const [langCode, setLangCode] = useState<string>("en");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<CardRow[]>([]);

  useEffect(() => {
    let active = true;
    const browserLang = typeof window !== "undefined" ? window.navigator.language : "en";
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          if (active) setLangCode(browserLang);
          return;
        }
        const { data, error } = await supabase
          .from("profiles")
          .select("language_code")
          .eq("id", user.id)
          .maybeSingle();
        if (error) {
          if (active) setLangCode(browserLang);
          return;
        }
        const lang = (data?.language_code as string | null)?.trim();
        if (active) setLangCode(lang || browserLang);
      } catch {
        if (active) setLangCode(browserLang);
      }
    })();
    return () => {
      active = false;
    };
  }, [supabase]);

  const isItalian = (langCode || "").toLowerCase().startsWith("it");

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
              "visibility",
              "workflow_state",
            ].join(",")
          )
          .order("approved_at", { ascending: false, nullsFirst: false });

        if (jErr) throw jErr;

        const journeysRaw = ((jRows ?? []) as unknown[]).filter(isVJourney) as VJourney[];
        const journeys = journeysRaw.filter(
          (j) => j.visibility === "public" && j.workflow_state === "published"
        );

        // 2) Rating (per mostrare stella e conteggi)
        const ids = journeys.map((j) => j.journey_id);
        const { data: statsRaw, error: sErr } = await supabase
          .from("v_group_event_rating_stats")
          .select("group_event_id, avg_rating, ratings_count")
          .in("group_event_id", ids);

        if (sErr) throw sErr;

        const statsMap = new Map<string, RatingStats>();
        const stats = ((statsRaw ?? []) as unknown[]).filter(isRatingStats) as RatingStats[];
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
        setErr(
          e?.message ?? (isItalian ? "Errore nel caricamento dei New Journeys." : "Error loading New Journeys.")
        );
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [supabase, isItalian]);

  return (
    <div className="px-4 py-6 md:px-8">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">New Journeys</h1>
        <Link
          href="/module/landing"
          className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-800 shadow hover:bg-neutral-100"
        >
          {isItalian ? "< Indietro" : "< Back"}
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
          {isItalian ? "Caricamento…" : "Loading…"}
        </div>
      )}

      {/* Empty */}
      {!loading && !err && rows.length === 0 && (
        <div className="rounded-2xl p-6 text-center shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
          <p className="text-base">
            {isItalian ? "Nessun Journey pubblicato al momento." : "No published journeys at the moment."}
          </p>
        </div>
      )}

      {/* Grid */}
      {rows.length > 0 && (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
                liProps={{ "data-jid": j.journey_id, "data-slug": j.journey_slug }}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}
