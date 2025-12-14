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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-50">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-8">
        <div className="rounded-3xl bg-gradient-to-br from-slate-800/70 to-slate-900/70 p-6 shadow-2xl ring-1 ring-white/10 backdrop-blur">
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
          <div className="mt-4 flex items-center gap-2 text-sm text-emerald-100">
            <svg viewBox="0 0 24 24" width="18" height="18" className="animate-spin text-emerald-300" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" strokeOpacity="0.2" />
              <path d="M21 12a9 9 0 0 1-9 9" strokeLinecap="round" />
            </svg>
            <span>{loadingLabel}</span>
          </div>
        </div>

        <div className="rounded-3xl bg-white/95 p-6 shadow-2xl ring-1 ring-slate-200">
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
          <div className="mt-4 flex items-center justify-end gap-3 text-sm text-slate-500">
            <div className="h-3 w-20 animate-pulse rounded-full bg-slate-200" />
            <div className="h-3 w-14 animate-pulse rounded-full bg-slate-200" />
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
      <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
        <div className="max-w-xl rounded-2xl bg-white p-6 text-slate-900 shadow-xl ring-1 ring-slate-200">
          <div className="text-lg font-semibold">Parametro mancante</div>
          <p className="mt-2 text-sm text-slate-600">Aggiungi ?gid=&lt;group_event_id&gt; all'URL per generare il quiz.</p>
        </div>
      </div>
    );
  }

  if (error || !questions.length) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
        <div className="max-w-xl rounded-2xl bg-white p-6 text-slate-900 shadow-xl ring-1 ring-slate-200">
          <div className="text-lg font-semibold">Impossibile generare il quiz</div>
          <p className="mt-2 text-sm text-slate-600">{error || "Nessuna domanda disponibile."}</p>
          {aiErrorInfo ? (
            <p className="mt-2 text-xs text-rose-600">
              Dettaglio AI: {aiErrorInfo}
            </p>
          ) : null}
          <div className="mt-4 flex gap-2">
            <button
              onClick={loadQuiz}
              className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
            >
              Riprova
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-50">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-8">
        <header className="rounded-3xl bg-white/5 p-5 shadow-lg ring-1 ring-white/10 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.12em] text-emerald-200">Quiz</p>
              <h1 className="text-2xl font-bold leading-7 text-white sm:text-3xl">{displayJourneyTitle}</h1>
              <p className="text-sm text-slate-200">{t("quiz.subtitle")}</p>
              {fallbackInfo ? (
                <p className="mt-1 inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900 ring-1 ring-amber-200">
                  {fallbackInfo}
                  {aiErrorInfo ? <span className="text-[11px] font-normal text-amber-800">({aiErrorInfo})</span> : null}
                </p>
              ) : null}
            </div>
            <div className="rounded-2xl bg-white/10 px-4 py-3 text-right shadow-inner ring-1 ring-white/15">
              <div className="text-xs text-slate-200">{t("quiz.score")}</div>
              <div className="text-2xl font-semibold text-emerald-200">
                {score}
                <span className="text-base text-slate-300"> / {total}</span>
              </div>
            </div>
          </div>
          <div className="mt-4 h-2 rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-blue-500 transition-all"
              style={{ width: `${progressPercent}%` }}
              aria-label={`Avanzamento ${progressPercent}%`}
            />
          </div>
        </header>

        <main className="rounded-3xl bg-white text-slate-900 shadow-2xl ring-1 ring-slate-200">
          {finished ? (
            <div className="flex flex-col gap-4 p-6 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-600">{t("quiz.result.title")}</p>
                  <h2 className="text-3xl font-bold text-slate-900">
                    {score} / {total}
                  </h2>
                  <p className="text-sm text-slate-600">{t("quiz.result.subtitle")}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={restart}
                    className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  >
                    {t("quiz.restart")}
                  </button>
                  <button
                    onClick={loadQuiz}
                    className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  >
                    {t("quiz.regenerate")}
                  </button>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {questions.map((q) => {
                  const chosen = answers[q.id];
                  const correct = chosen === q.answer;
                  return (
                    <div
                      key={q.id}
                      className={`rounded-2xl border p-4 ${correct ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}
                    >
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {t("quiz.question.progress").replace("{n}", String(q.id)).replace("{total}", String(total))}
                      </div>
                      <div className="mt-1 text-sm font-medium text-slate-900">{q.question}</div>
                      <div className="mt-2 text-sm">
                        <span className="font-semibold">{t("quiz.review.your_answer")}</span> {chosen ?? t("quiz.review.not_answered")}
                      </div>
                      {!correct ? (
                        <div className="text-sm text-rose-700">
                          <span className="font-semibold">{t("quiz.review.correct")}</span> {q.answer}
                        </div>
                      ) : null}
                      {q.explanation ? (
                        <div className="mt-1 text-xs text-slate-600">
                          {t("quiz.review.note")} {q.explanation}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-6 p-6 sm:p-8">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.08em] text-indigo-600">
                    {t("quiz.question.progress")
                      .replace("{n}", String(index + 1))
                      .replace("{total}", String(total))}
                  </div>
                  <h2 className="text-2xl font-semibold text-slate-900">{current?.question}</h2>
                </div>
                <div className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-100">
                  {checked
                    ? lastCorrect
                      ? t("quiz.status.correct")
                      : t("quiz.status.wrong")
                    : t("quiz.status.select")}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {current?.options.map((option) => {
                  const isSelected = selected === option;
                  const isCorrect = checked && option === current.answer;
                  const isWrongSelection = checked && isSelected && option !== current.answer;
                  return (
                    <button
                      key={option}
                      onClick={() => setSelected(option)}
                      className={`w-full rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-indigo-300 ${
                        isCorrect
                          ? "border-emerald-300 bg-emerald-50 text-emerald-800 shadow"
                          : isWrongSelection
                          ? "border-rose-300 bg-rose-50 text-rose-800 shadow"
                          : isSelected
                          ? "border-indigo-300 bg-indigo-50 text-indigo-800 shadow"
                          : "border-slate-200 bg-white hover:border-indigo-200 hover:bg-indigo-50/40"
                      }`}
                      aria-pressed={isSelected}
                      disabled={checked}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-slate-600">
                  {checked ? (
                    <span className={`inline-flex items-center gap-2 text-sm font-semibold ${lastCorrect ? "text-emerald-600" : "text-rose-600"}`}>
                      {lastCorrect ? "Corretto!" : "Risposta errata"}
                    </span>
                  ) : null}
                  {current?.explanation && checked ? (
                    <span className="ml-2 text-xs text-slate-500">Spiegazione: {current.explanation}</span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={confirmAnswer}
                    disabled={!selected || checked}
                    className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:cursor-not-allowed disabled:bg-indigo-300"
                  >
                    {t("quiz.actions.confirm")}
                  </button>
                  <button
                    onClick={goNext}
                    disabled={!checked}
                    className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                  >
                    {index >= total - 1 ? t("quiz.actions.show_results") : t("quiz.actions.next")}
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
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
