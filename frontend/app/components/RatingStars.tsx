"use client";

import React, {
  useEffect,
  useMemo,
  useState,
  type MouseEventHandler,
} from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { tUI } from "@/lib/i18n/uiLabels";

const STAR_FILL = "#facc15"; // amber-300
const STAR_STROKE = "#eab308"; // amber-400

type Props = {
  journeyId?: string;
  group_event_id?: string; // compat
  size?: number;
  readOnly?: boolean;
};

export default function RatingStars(props: Props) {
  const supabase = useMemo(() => createClientComponentClient(), []);
  const id = props.journeyId ?? props.group_event_id ?? null;
  const size = props.size ?? 18;
  const readOnly = !!props.readOnly;

  const [avg, setAvg] = useState<number | null>(null);
  const [cnt, setCnt] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [langCode, setLangCode] = useState<string>("en");

  // Carica stats rating
  async function refreshStats() {
    if (!id) return;
    const { data } = await supabase
      .from("v_group_event_rating_stats")
      .select("avg_rating, ratings_count")
      .eq("group_event_id", id)
      .maybeSingle();

    setAvg(data?.avg_rating != null ? Number(data.avg_rating) : null);
    setCnt(data?.ratings_count != null ? Number(data.ratings_count) : 0);
  }

  useEffect(() => {
    refreshStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Carica lingua (stessa logica di TopBar/Scorecard: profiles.id = user.id)
  useEffect(() => {
    let active = true;

    async function loadLanguage() {
      const browserLang =
        typeof window !== "undefined" ? window.navigator.language : "en";

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) {
          console.warn("[RatingStars] auth.getUser error:", userError.message);
        }

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
          console.warn(
            "[RatingStars] Error reading profiles.language_code:",
            error.message
          );
          if (active) setLangCode(browserLang);
          return;
        }

        if (!data || typeof data.language_code !== "string") {
          if (active) setLangCode(browserLang);
          return;
        }

        const dbLang = (data.language_code as string).trim() || browserLang;
        if (active) setLangCode(dbLang);
      } catch (err: any) {
        console.warn(
          "[RatingStars] Unexpected error loading language:",
          err?.message
        );
        if (active) {
          const browserLang =
            typeof window !== "undefined" ? window.navigator.language : "en";
          setLangCode(browserLang);
        }
      }
    }

    loadLanguage();

    return () => {
      active = false;
    };
  }, [supabase]);

  async function rate(n: number) {
    if (readOnly) return;
    if (!id) return;

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user?.id) {
      alert(tUI(langCode, "rating.stars.login_required"));
      return;
    }
    if (saving) return;

    setSaving(true);
    try {
      await supabase
        .from("v_rate_journey_upsert")
        .insert({ group_event_id: id, rating: n } as any);
      await refreshStats();
    } finally {
      setSaving(false);
    }
  }

  const stars = useMemo(() => {
    const val = avg ?? 0;
    const full = Math.floor(val);
    return { full };
  }, [avg]);

  return (
    <div className="inline-flex items-center gap-2">
      <div className="flex items-center">
        {[1, 2, 3, 4, 5].map((n) => {
          const labelPrefix = tUI(langCode, "rating.stars.rate_prefix");
          const title = `${labelPrefix} ${n}`;

          const handleClick: MouseEventHandler<HTMLButtonElement> = () => {
            void rate(n);
          };

          return (
            <button
              key={n}
              onClick={handleClick}
              title={title}
              disabled={saving || readOnly}
              className="p-0.5"
              aria-label={title}
              type="button"
            >
              <svg
                width={size}
                height={size}
                viewBox="0 0 24 24"
                fill={n <= stars.full ? STAR_FILL : "none"}
                stroke={STAR_STROKE}
                strokeWidth="1.6"
              >
                <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.62L12 2 9.19 8.62 2 9.24l5.46 4.73L5.82 21 12 17.27z" />
              </svg>
            </button>
          );
        })}
      </div>
      <div className="text-sm text-slate-600">
        {avg != null ? avg.toFixed(1) : "-"}
        {cnt > 0 ? ` (${cnt})` : ""}
      </div>
    </div>
  );
}
