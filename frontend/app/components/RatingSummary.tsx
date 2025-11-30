"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { tUI } from "@/lib/i18n/uiLabels";

type Props = {
  groupEventId: string;
  size?: number; // dimensione icona stella in px
  className?: string;
};

export default function RatingSummary({
  groupEventId,
  size = 14,
  className = "",
}: Props) {
  const supabase = createClientComponentClient();
  const [avg, setAvg] = useState<number | null>(null);
  const [count, setCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [langCode, setLangCode] = useState<string>("en");

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { data: stats } = await supabase
          .from("v_group_event_rating_stats")
          .select("*")
          .eq("group_event_id", groupEventId)
          .maybeSingle();

        if (!mounted) return;
        if (stats) {
          setAvg(Number(stats.avg_rating));
          setCount(Number(stats.ratings_count));
        } else {
          setAvg(null);
          setCount(0);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [groupEventId, supabase]);

  // Carica lingua (stessa logica già usata altrove)
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
          console.warn("[RatingSummary] auth.getUser error:", userError.message);
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
            "[RatingSummary] Error reading profiles.language_code:",
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
          "[RatingSummary] Unexpected error loading language:",
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

  const Star = () => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className="opacity-80"
    >
      <path d="M12 17.27l6.18 3.73-1.64-7.03L21.5 9.24l-7.19-.62L12 2 9.69 8.62 2.5 9.24l4.96 4.73L5.82 21z" />
    </svg>
  );

  if (loading)
    return (
      <span className={`text-xs text-neutral-400 ${className}`}>—</span>
    );

  if (!count || avg == null) {
    return (
      <span className={`text-xs text-neutral-400 ${className}`}>
        {tUI(langCode, "rating.summary.no_ratings")}
      </span>
    );
  }

  const avgLabel = avg.toFixed(2);
  const votesLabel = tUI(langCode, "rating.summary.votes");
  const title = `${avgLabel} • ${count} ${votesLabel}`;

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs text-neutral-700 ${className}`}
      title={title}
    >
      <Star />
      <span className="tabular-nums">{avgLabel}</span>
      <span>•</span>
      <span className="tabular-nums">{count}</span>
    </span>
  );
}
