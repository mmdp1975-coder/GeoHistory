"use client";

import React, {
  useEffect,
  useMemo,
  useRef,
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
  compact?: boolean;
};

export default function RatingStars(props: Props) {
  const supabase = useMemo(() => createClientComponentClient(), []);
  const id = props.journeyId ?? props.group_event_id ?? null;
  const size = props.size ?? 18;
  const readOnly = !!props.readOnly;
  const compact = !!props.compact;

  const [avg, setAvg] = useState<number | null>(null);
  const [cnt, setCnt] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [langCode, setLangCode] = useState<string>("en");
  const [compactPickerOpen, setCompactPickerOpen] = useState(false);
  const [selectedCompactRating, setSelectedCompactRating] = useState<number | null>(null);
  const compactWrapRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    if (!compact || !compactPickerOpen) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!compactWrapRef.current?.contains(target)) {
        setCompactPickerOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [compact, compactPickerOpen]);

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
      setSelectedCompactRating(n);
      await refreshStats();
      setCompactPickerOpen(false);
    } finally {
      setSaving(false);
    }
  }

  const stars = useMemo(() => {
    const val = avg ?? 0;
    const full = Math.floor(val);
    return { full };
  }, [avg]);

  if (compact) {
    const labelPrefix = tUI(langCode, "rating.stars.rate_prefix");
    return (
      <div
        ref={compactWrapRef}
        className="relative z-[80] inline-flex items-center gap-1"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => {
            if (readOnly) return;
            setCompactPickerOpen((open) => !open);
          }}
          title={`${labelPrefix} 1-5`}
          aria-label={`${labelPrefix} 1-5`}
          disabled={saving || readOnly}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-amber-50/90 text-amber-500 ring-1 ring-amber-200/80 transition hover:bg-amber-100 disabled:cursor-default"
        >
          <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill={STAR_FILL}
            stroke={STAR_STROKE}
            strokeWidth="1.6"
          >
            <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.62L12 2 9.19 8.62 2 9.24l5.46 4.73L5.82 21 12 17.27z" />
          </svg>
        </button>
        <div className="text-[11px] text-slate-600 tabular-nums">
          {avg != null ? avg.toFixed(1) : "-"}
          {cnt > 0 ? ` (${cnt})` : ""}
        </div>
        {compactPickerOpen ? (
          <div
            className="absolute left-1/2 top-[calc(100%+6px)] z-[120] flex -translate-x-1/2 flex-col gap-1 rounded-2xl border border-amber-200/80 bg-white/95 p-1.5 shadow-[0_14px_32px_-20px_rgba(16,32,51,0.45)] backdrop-blur"
            onClick={(event) => event.stopPropagation()}
          >
            {[5, 4, 3, 2, 1].map((n) => {
              const title = `${labelPrefix} ${n}`;
              const isSelected = selectedCompactRating === n;
              const handleClick: MouseEventHandler<HTMLButtonElement> = () => {
                void rate(n);
              };
              return (
                <button
                  key={n}
                  onClick={handleClick}
                  title={title}
                  disabled={saving}
                  className={`inline-flex items-center justify-center rounded-xl px-2 py-1.5 transition disabled:cursor-default ${
                    isSelected
                      ? "bg-amber-50 text-amber-500 ring-2 ring-amber-300"
                      : "bg-white text-amber-500 ring-1 ring-amber-200/80 hover:bg-amber-50"
                  }`}
                  aria-label={title}
                  type="button"
                >
                  <span className="inline-flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((starIdx) => (
                      <svg
                        key={starIdx}
                        width={14}
                        height={14}
                        viewBox="0 0 24 24"
                        fill={starIdx <= n ? STAR_FILL : "none"}
                        stroke={STAR_STROKE}
                        strokeWidth="1.6"
                      >
                        <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.62L12 2 9.19 8.62 2 9.24l5.46 4.73L5.82 21 12 17.27z" />
                      </svg>
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  }

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
