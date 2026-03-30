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
  allowTextFeedback?: boolean;
  compactStatsClassName?: string;
  compactWrapClassName?: string;
};

export default function RatingStars(props: Props) {
  const supabase = useMemo(() => createClientComponentClient(), []);
  const id = props.journeyId ?? props.group_event_id ?? null;
  const size = props.size ?? 18;
  const readOnly = !!props.readOnly;
  const compact = !!props.compact;
  const allowTextFeedback = !!props.allowTextFeedback;
  const compactStatsClassName = props.compactStatsClassName ?? "text-slate-600";
  const compactWrapClassName = props.compactWrapClassName ?? "";

  const [avg, setAvg] = useState<number | null>(null);
  const [cnt, setCnt] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [langCode, setLangCode] = useState<string>("en");
  const [compactPickerOpen, setCompactPickerOpen] = useState(false);
  const [selectedCompactRating, setSelectedCompactRating] = useState<number | null>(null);
  const [pendingRating, setPendingRating] = useState<number | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
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

  useEffect(() => {
    if (!allowTextFeedback || pendingRating == null) return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPendingRating(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [allowTextFeedback, pendingRating]);

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

  async function persistRating(n: number, text: string) {
    const trimmedFeedback = text.trim();
    const payloadBase: Record<string, any> = { group_event_id: id, rating: n };
    const payloads = trimmedFeedback
      ? [
          { ...payloadBase, feedback_text: trimmedFeedback },
          { ...payloadBase, feedback: trimmedFeedback },
          payloadBase,
        ]
      : [payloadBase];
    let lastError: any = null;

    for (const payload of payloads) {
      const { error } = await supabase.from("v_rate_journey_upsert").insert(payload as any);
      if (!error) return { savedText: payload !== payloadBase && !!trimmedFeedback, error: null };
      lastError = error;
    }

    return { savedText: false, error: lastError };
  }

  async function rate(n: number, text = feedbackText) {
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
      const { savedText, error } = await persistRating(n, text);
      if (error) throw error;
      setSelectedCompactRating(n);
      setPendingRating(null);
      if (savedText || !text.trim()) {
        setFeedbackText("");
      } else if (text.trim()) {
        alert(tUI(langCode, "rating.stars.feedback_unavailable"));
      }
      await refreshStats();
      setCompactPickerOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleRatingSelection(n: number) {
    if (allowTextFeedback) {
      await rate(n, "");
      setPendingRating(n);
      return;
    }
    await rate(n);
  }

  function openFeedbackModal(n: number) {
    setPendingRating(n);
    setCompactPickerOpen(false);
  }

  function closeFeedbackModal() {
    setPendingRating(null);
  }

  const stars = useMemo(() => {
    const val = avg ?? 0;
    const full = Math.floor(val);
    return { full };
  }, [avg]);

  const feedbackLabel = tUI(langCode, "rating.stars.feedback_label");
  const feedbackPlaceholder = tUI(langCode, "rating.stars.feedback_placeholder");
  const submitLabel = saving ? tUI(langCode, "generic.loading") : tUI(langCode, "rating.stars.submit");
  const cancelLabel = tUI(langCode, "rating.stars.cancel");
  const ratePrefix = tUI(langCode, "rating.stars.rate_prefix");
  const feedbackModal =
    allowTextFeedback && pendingRating != null ? (
      <div
        className="fixed inset-0 z-[240] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[2px]"
        role="dialog"
        aria-modal="true"
        onClick={closeFeedbackModal}
      >
        <div
          className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_30px_80px_-32px_rgba(15,23,42,0.45)]"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">{feedbackLabel}</div>
              <div className="mt-1 text-xs text-slate-500">{`${ratePrefix}: ${pendingRating}/5`}</div>
              <div className="mt-2 flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((starIdx) => (
                  <svg
                    key={`modal-star-${starIdx}`}
                    width={18}
                    height={18}
                    viewBox="0 0 24 24"
                    fill={starIdx <= pendingRating ? STAR_FILL : "none"}
                    stroke={STAR_STROKE}
                    strokeWidth="1.6"
                  >
                    <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.62L12 2 9.19 8.62 2 9.24l5.46 4.73L5.82 21 12 17.27z" />
                  </svg>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={closeFeedbackModal}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200"
              aria-label={cancelLabel}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                <path d="m7 7 10 10M17 7 7 17" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
          <textarea
            value={feedbackText}
            onChange={(event) => setFeedbackText(event.target.value.slice(0, 500))}
            placeholder={feedbackPlaceholder}
            rows={5}
            className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[13px] text-slate-700 outline-none ring-0 placeholder:text-slate-400 focus:border-amber-300"
          />
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={closeFeedbackModal}
              className="inline-flex items-center rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:cursor-default"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                void rate(pendingRating);
              }}
              className="inline-flex items-center rounded-full bg-amber-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-amber-600 disabled:cursor-default disabled:bg-slate-300"
            >
              {submitLabel}
            </button>
          </div>
        </div>
      </div>
    ) : null;

  if (compact) {
    return (
      <>
        <div
          ref={compactWrapRef}
          className={`relative z-[80] inline-flex items-center gap-1 ${compactWrapClassName}`}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              if (readOnly) return;
              setCompactPickerOpen((open) => !open);
            }}
            title={`${ratePrefix} 1-5`}
            aria-label={`${ratePrefix} 1-5`}
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
        <div className={`shrink-0 whitespace-nowrap text-[11px] font-semibold tabular-nums ${compactStatsClassName}`}>
          {avg != null ? avg.toFixed(1) : "-"}
          {cnt > 0 ? ` (${cnt})` : ""}
        </div>
          {compactPickerOpen ? (
            <div
              className="absolute left-1/2 top-[calc(100%+6px)] z-[120] flex -translate-x-1/2 flex-col gap-1 rounded-2xl border border-amber-200/80 bg-white/95 p-1.5 shadow-[0_14px_32px_-20px_rgba(16,32,51,0.45)] backdrop-blur"
              onClick={(event) => event.stopPropagation()}
            >
          {[5, 4, 3, 2, 1].map((n) => {
            const title = `${ratePrefix} ${n}`;
            const isPending = pendingRating === n;
            const isFilled = n <= (pendingRating ?? selectedCompactRating ?? stars.full);
            const isSelected = selectedCompactRating === n;
            const handleClick: MouseEventHandler<HTMLButtonElement> = () => {
              if (allowTextFeedback) {
                void handleRatingSelection(n);
                return;
              }
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
                          fill={starIdx <= n && isFilled ? STAR_FILL : "none"}
                          stroke={STAR_STROKE}
                          strokeWidth="1.6"
                          className={isPending ? "drop-shadow-[0_0_8px_rgba(234,179,8,0.45)]" : undefined}
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
        {feedbackModal}
      </>
    );
  }

  return (
    <>
      <div className="inline-flex items-center gap-2">
        <div className="flex items-center">
          {[1, 2, 3, 4, 5].map((n) => {
            const title = `${ratePrefix} ${n}`;
            const displayRating = pendingRating ?? selectedCompactRating ?? stars.full;

            const handleClick: MouseEventHandler<HTMLButtonElement> = () => {
              if (allowTextFeedback) {
                void handleRatingSelection(n);
                return;
              }
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
                  fill={n <= displayRating ? STAR_FILL : "none"}
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
      {feedbackModal}
    </>
  );
}
