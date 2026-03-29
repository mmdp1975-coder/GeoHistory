"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { tUI } from "@/lib/i18n/uiLabels";

type Question = {
  id: number;
  question: string;
  options: string[];
  answer: string;
  explanation?: string | null;
};

type ApiResponse = {
  journeyTitle?: string | null;
  questions?: Question[];
  error?: string;
  fallback?: boolean;
  aiError?: string;
};

function LoadingSkeleton({ lang }: { lang: string }) {
  const loadingLabel = tUI(lang, "quiz.loading.message");
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(72,116,255,0.18),transparent_28%),linear-gradient(180deg,#090b12_0%,#0b1020_100%)] text-slate-50">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-8">
        <div className="rounded-[28px] border border-white/10 bg-white/6 p-6 shadow-[0_28px_60px_-30px_rgba(0,0,0,0.82)] backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 animate-pulse rounded-2xl bg-emerald-400/30" />
            <div>
              <div className="h-3 w-24 animate-pulse rounded-full bg-white/15" />
              <div className="mt-2 h-5 w-48 animate-pulse rounded-full bg-white/10" />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <div className="h-4 w-full animate-pulse rounded-full bg-white/10" />
            <div className="h-4 w-3/4 animate-pulse rounded-full bg-white/10" />
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm text-[#f4dca0]">
            <svg viewBox="0 0 24 24" width="18" height="18" className="animate-spin text-[#f6c86a]" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" strokeOpacity="0.2" />
              <path d="M21 12a9 9 0 0 1-9 9" strokeLinecap="round" />
            </svg>
            <span>{loadingLabel}</span>
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-white/6 p-6 shadow-[0_28px_60px_-30px_rgba(0,0,0,0.82)] backdrop-blur-xl">
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="h-24 animate-pulse rounded-2xl bg-white/8" />
            ))}
          </div>
          <div className="mt-4 flex items-center justify-end gap-3 text-sm text-white/35">
            <div className="h-3 w-20 animate-pulse rounded-full bg-white/10" />
            <div className="h-3 w-14 animate-pulse rounded-full bg-white/10" />
          </div>
        </div>
      </div>
    </div>
  );
}

function QuizInner() {
  const sp = useSearchParams();
  const gid = sp.get("gid");
  const preferredLang = useMemo(() => {
    const qp = sp.get("lang");
    if (qp && qp.trim()) return qp.trim().slice(0, 5).toLowerCase();
    if (typeof navigator !== "undefined") {
      const cand = (navigator.languages && navigator.languages.find((l) => !!l)) || navigator.language;
      if (cand) return cand.slice(0, 5).toLowerCase();
    }
    try {
      const intl = Intl.DateTimeFormat().resolvedOptions().locale;
      if (intl) return intl.slice(0, 5).toLowerCase();
    } catch {
      /* ignore */
    }
    return "it";
  }, [sp]);
  const [lang, setLang] = useState<string>(preferredLang);
  const supabase = useMemo(() => createClientComponentClient(), []);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [journeyTitle, setJourneyTitle] = useState<string>("Quiz");
  const [localizedJourneyTitle, setLocalizedJourneyTitle] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [fallbackInfo, setFallbackInfo] = useState<string | null>(null);
  const [aiErrorInfo, setAiErrorInfo] = useState<string | null>(null);

  const t = useCallback((key: string) => tUI(lang, key), [lang]);

  const current = questions[index];
  const total = questions.length;

  const progressPercent = useMemo(() => {
    if (!total) return 0;
    return Math.round(((finished ? total : index) / total) * 100);
  }, [index, total, finished]);

  const displayJourneyTitle = localizedJourneyTitle || journeyTitle || "Allenamento";

  const loadQuiz = useCallback(async () => {
    if (!gid) {
      setError("Parametro gid mancante: impossibile generare il quiz.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setQuestions([]);
    setIndex(0);
    setSelected(null);
    setChecked(false);
    setLastCorrect(null);
    setAnswers({});
    setScore(0);
    setFinished(false);

    try {
      const resp = await fetch("/api/quiz/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gid, lang }),
      });
      if (!resp.ok) {
        const txt = await resp.text();
        let friendly = txt;
        try {
          const parsed = JSON.parse(txt);
          friendly = parsed?.error || parsed?.message || txt;
        } catch {
          friendly = txt || resp.statusText;
        }
        throw new Error(friendly || "Errore nella generazione del quiz");
      }
      const data = (await resp.json()) as ApiResponse;
      if (data.error) throw new Error(data.error);
      const qs = (data.questions || []).slice(0, 10).map((q, idx) => ({
        ...q,
        id: q.id ?? idx + 1,
        options: Array.isArray(q.options) && q.options.length ? q.options.slice(0, 4) : [],
      }));
      if (!qs.length) throw new Error("Nessuna domanda generata.");
      setQuestions(qs);
      setJourneyTitle(data.journeyTitle || "Quiz");
      setFallbackInfo(data.fallback ? "Quiz generato in modalità offline (senza AI)." : null);
      setAiErrorInfo(data.aiError || null);
    } catch (e: any) {
      setError(e?.message || "Errore nella generazione del quiz");
    } finally {
      setLoading(false);
    }
  }, [gid, lang]);

  useEffect(() => {
    loadQuiz();
  }, [loadQuiz, lang]);

  useEffect(() => {
    setLang(preferredLang);
  }, [preferredLang]);

  useEffect(() => {
    if (!gid) return;
    const fetchJourneyTitle = async () => {
      try {
        const lang2 = lang.slice(0, 2).toLowerCase();
        const { data: exact, error: exactErr } = await supabase
          .from("v_journey")
          .select("journey_title, description, lang")
          .eq("group_event_id", gid)
          .ilike("lang", `${lang2}%`)
          .limit(1);
        if (exactErr) throw exactErr;
        let row = exact?.[0];
        if (!row) {
          const { data: anyLang, error: anyErr } = await supabase
            .from("v_journey")
            .select("journey_title, description, lang")
            .eq("group_event_id", gid)
            .limit(1);
          if (anyErr) throw anyErr;
          row = anyLang?.[0];
        }
        if (row?.journey_title) setLocalizedJourneyTitle(row.journey_title);
      } catch (e) {
        console.error("[Quiz] journey title fetch failed", e);
      }
    };
    fetchJourneyTitle();
  }, [gid, lang, supabase]);

  if (loading) return <LoadingSkeleton lang={lang} />;

  const confirmAnswer = () => {
    if (!selected || checked || !current) return;
    const isCorrect = selected.trim() === current.answer.trim();
    setAnswers((prev) => ({ ...prev, [current.id]: selected }));
    if (isCorrect) setScore((s) => s + 1);
    setChecked(true);
    setLastCorrect(isCorrect);
  };

  const goNext = () => {
    if (!checked) return;
    if (index >= total - 1) {
      setFinished(true);
      return;
    }
    setIndex((i) => i + 1);
    setSelected(null);
    setChecked(false);
    setLastCorrect(null);
  };

  const restart = () => {
    setIndex(0);
    setSelected(null);
    setChecked(false);
    setLastCorrect(null);
    setAnswers({});
    setScore(0);
    setFinished(false);
  };

  if (loading) return <LoadingSkeleton lang={lang} />;

  if (!gid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#090b12_0%,#0b1020_100%)] px-4">
        <div className="max-w-xl rounded-[28px] border border-white/10 bg-white/6 p-6 text-white shadow-[0_28px_60px_-30px_rgba(0,0,0,0.82)] backdrop-blur-xl">
          <div className="text-lg font-semibold">Parametro mancante</div>
          <p className="mt-2 text-sm text-white/65">Aggiungi ?gid=&lt;group_event_id&gt; all'URL per generare il quiz.</p>
        </div>
      </div>
    );
  }

  if (error || !questions.length) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#090b12_0%,#0b1020_100%)] px-4">
        <div className="max-w-xl rounded-[28px] border border-white/10 bg-white/6 p-6 text-white shadow-[0_28px_60px_-30px_rgba(0,0,0,0.82)] backdrop-blur-xl">
          <div className="text-lg font-semibold">Impossibile generare il quiz</div>
          <p className="mt-2 text-sm text-white/65">{error || "Nessuna domanda disponibile."}</p>
          {aiErrorInfo ? (
            <p className="mt-2 text-xs text-rose-300">
              Dettaglio AI: {aiErrorInfo}
            </p>
          ) : null}
          <div className="mt-4 flex gap-2">
            <button
              onClick={loadQuiz}
              className="inline-flex items-center justify-center rounded-full border border-[#f6c86a]/35 bg-[#f6c86a] px-4 py-2 text-sm font-semibold text-[#0b1020] shadow-[0_14px_30px_-18px_rgba(246,200,106,0.65)] hover:brightness-105 focus:outline-none focus:ring-2 focus:ring-[#f6c86a]/40"
            >
              Riprova
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,rgba(255,191,71,0.14),transparent_24%),radial-gradient(circle_at_50%_30%,rgba(111,152,255,0.16),transparent_34%),linear-gradient(180deg,#090b12_0%,#0b1020_100%)] text-slate-50">
      <div className="relative mx-auto flex min-h-screen w-full max-w-none flex-col px-3 pb-[calc(1.25rem,env(safe-area-inset-bottom))] pt-[calc(0.9rem,env(safe-area-inset-top))] sm:max-w-md sm:px-4 sm:pb-8 sm:pt-8">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[42vh] bg-[radial-gradient(circle_at_50%_0%,rgba(255,196,97,0.18),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.02)_0%,rgba(255,255,255,0)_100%)]" />
        <div className="relative z-10 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="line-clamp-2 text-[12px] text-white/58">{displayJourneyTitle}</div>
          </div>
          <div className="rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-[12px] font-semibold text-white/78">
            {score}/{total}
          </div>
        </div>

        {fallbackInfo ? (
          <div className="relative z-10 mt-3 rounded-full border border-[#f6c86a]/25 bg-[#f6c86a]/14 px-3 py-1.5 text-[11px] font-semibold text-[#f4dca0]">
            {fallbackInfo}
            {aiErrorInfo ? <span className="ml-1 font-normal text-[#f1d18a]">({aiErrorInfo})</span> : null}
          </div>
        ) : null}

        <div className="relative z-10 mt-5 flex-1 rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06)_0%,rgba(255,255,255,0.04)_100%)] p-4 shadow-[0_32px_80px_-36px_rgba(0,0,0,0.9)] backdrop-blur-xl sm:mx-0">
          {finished ? (
            <div className="flex h-full flex-col">
              <div className="rounded-[24px] border border-white/10 bg-white/6 px-4 py-4">
                <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#f6c86a]">{t("quiz.result.title")}</div>
                <div className="mt-2 text-4xl font-bold tracking-[-0.04em] text-white">{score} / {total}</div>
                <div className="mt-2 text-sm text-white/62">{t("quiz.result.subtitle")}</div>
              </div>
              <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
                {questions.map((q) => {
                  const chosen = answers[q.id];
                  const correct = chosen === q.answer;
                  return (
                    <div
                      key={q.id}
                      className={`rounded-[22px] border px-4 py-3 ${correct ? "border-emerald-300/30 bg-emerald-400/10" : "border-rose-300/25 bg-rose-400/10"}`}
                    >
                      <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/46">
                        {t("quiz.question.progress").replace("{n}", String(q.id)).replace("{total}", String(total))}
                      </div>
                      <div className="mt-2 text-[15px] font-medium leading-6 text-white">{q.question}</div>
                      <div className="mt-2 text-sm text-white/78">
                        <span className="font-semibold">{t("quiz.review.your_answer")}</span> {chosen ?? t("quiz.review.not_answered")}
                      </div>
                      {!correct ? (
                        <div className="mt-1 text-sm text-rose-200">
                          <span className="font-semibold">{t("quiz.review.correct")}</span> {q.answer}
                        </div>
                      ) : null}
                      {q.explanation ? <div className="mt-1 text-xs text-white/54">{t("quiz.review.note")} {q.explanation}</div> : null}
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  onClick={restart}
                  className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/8 px-4 py-3 text-sm font-semibold text-white hover:bg-white/12 focus:outline-none focus:ring-2 focus:ring-white/20"
                >
                  {t("quiz.restart")}
                </button>
                <button
                  onClick={loadQuiz}
                  className="inline-flex items-center justify-center rounded-full border border-[#f6c86a]/35 bg-[#f6c86a] px-4 py-3 text-sm font-semibold text-[#0b1020] shadow-[0_14px_30px_-18px_rgba(246,200,106,0.65)] hover:brightness-105 focus:outline-none focus:ring-2 focus:ring-[#f6c86a]/40"
                >
                  {t("quiz.regenerate")}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between gap-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-[12px] font-semibold text-white/76">
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-white/10 text-[10px]">•</span>
                  {t("quiz.question.progress").replace("{n}", String(index + 1)).replace("{total}", String(total))}
                </div>
                <div className="text-[13px] font-semibold text-white/72">
                  {checked ? (lastCorrect ? "✓" : "✕") : ""}
                </div>
              </div>

              <div className="mt-4 h-[3px] rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#f6c86a] to-[#e5a93b] transition-all"
                  style={{ width: `${progressPercent}%` }}
                  aria-label={`Avanzamento ${progressPercent}%`}
                />
              </div>

              <div className="mt-5 text-[2rem] font-semibold leading-[1.08] tracking-[-0.04em] text-white">
                {current?.question}
              </div>

              <div className="mt-6 space-y-3">
                {current?.options.map((option) => {
                  const isSelected = selected === option;
                  const isCorrect = checked && option === current.answer;
                  const isWrongSelection = checked && isSelected && option !== current.answer;
                  return (
                    <button
                      key={option}
                      onClick={() => setSelected(option)}
                      className={`w-full rounded-[18px] border px-4 py-3 text-left text-[1.05rem] font-medium transition focus:outline-none focus:ring-2 focus:ring-[#f6c86a]/30 ${
                        isCorrect
                          ? "border-[#d9c56b] bg-[linear-gradient(180deg,rgba(132,126,46,0.45),rgba(88,88,30,0.42))] text-[#f7e89f] shadow-[inset_0_0_0_1px_rgba(255,235,140,0.12)]"
                          : isWrongSelection
                          ? "border-rose-300/30 bg-rose-400/10 text-rose-100"
                          : isSelected
                          ? "border-[#f6c86a]/40 bg-white/12 text-white"
                          : "border-white/12 bg-white/6 text-white/88 hover:bg-white/10"
                      }`}
                      aria-pressed={isSelected}
                      disabled={checked}
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span>{option}</span>
                        {isCorrect ? (
                          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="shrink-0 text-[#f7e89f]">
                            <path d="m5 12 4.5 4.5L19 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 min-h-[2.25rem] text-sm text-white/62">
                {checked ? (
                  <span className={`font-semibold ${lastCorrect ? "text-[#f7e89f]" : "text-rose-200"}`}>
                    {lastCorrect ? "Corretto!" : "Risposta errata"}
                  </span>
                ) : (
                  <span>{t("quiz.status.select")}</span>
                )}
                {current?.explanation && checked ? <span className="ml-2 text-xs text-white/52">Spiegazione: {current.explanation}</span> : null}
              </div>

              <div className="mt-auto pt-3">
                {!checked ? (
                  <button
                    onClick={confirmAnswer}
                    disabled={!selected}
                    className="inline-flex w-full items-center justify-center rounded-full border border-[#f6c86a]/35 bg-[#f6c86a] px-5 py-3.5 text-[1.15rem] font-semibold text-[#0b1020] shadow-[0_16px_34px_-18px_rgba(246,200,106,0.7)] hover:brightness-105 focus:outline-none focus:ring-2 focus:ring-[#f6c86a]/40 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/12 disabled:text-white/38"
                  >
                    {t("quiz.actions.confirm")}
                  </button>
                ) : (
                  <button
                    onClick={goNext}
                    className="inline-flex w-full items-center justify-center rounded-full border border-[#f6c86a]/35 bg-[#f6c86a] px-5 py-3.5 text-[1.15rem] font-semibold text-[#0b1020] shadow-[0_16px_34px_-18px_rgba(246,200,106,0.7)] hover:brightness-105 focus:outline-none focus:ring-2 focus:ring-[#f6c86a]/40"
                  >
                    {index >= total - 1 ? t("quiz.actions.show_results") : t("quiz.actions.next")}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function QuizPage() {
  // Suspense richiesto per l'uso di useSearchParams (client-side)
  return (
    <Suspense fallback={<LoadingSkeleton lang="it" />}>
      <QuizInner />
    </Suspense>
  );
}
