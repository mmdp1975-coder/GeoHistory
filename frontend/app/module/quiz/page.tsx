"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

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
};

function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-50">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-8">
        <div className="rounded-3xl bg-white/5 p-5 shadow-lg ring-1 ring-white/10 backdrop-blur">
          <div className="h-6 w-44 rounded-full bg-white/10" />
          <div className="mt-3 h-10 w-80 rounded-2xl bg-white/10" />
          <div className="mt-2 h-4 w-64 rounded-full bg-white/10" />
        </div>
        <div className="rounded-3xl bg-white text-slate-900 shadow-2xl ring-1 ring-slate-200">
          <div className="grid gap-3 p-6 sm:grid-cols-2 sm:p-8">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="h-24 rounded-2xl bg-slate-100" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function QuizPage() {
  const sp = useSearchParams();
  const gid = sp.get("gid");
  const lang = (sp.get("lang") || "").slice(0, 5) || "it";

  const [questions, setQuestions] = useState<Question[]>([]);
  const [journeyTitle, setJourneyTitle] = useState<string>("Quiz");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

  const current = questions[index];
  const total = questions.length;

  const progressPercent = useMemo(() => {
    if (!total) return 0;
    return Math.round(((finished ? total : index) / total) * 100);
  }, [index, total, finished]);

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
      if (data.fallback) {
        setError("Quiz generato in modalità offline (senza AI).");
        setTimeout(() => setError(null), 4000);
      }
    } catch (e: any) {
      setError(e?.message || "Errore nella generazione del quiz");
    } finally {
      setLoading(false);
    }
  }, [gid, lang]);

  useEffect(() => {
    loadQuiz();
  }, [loadQuiz]);

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

  if (loading) return <LoadingSkeleton />;

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
              <h1 className="text-2xl font-bold leading-7 text-white sm:text-3xl">{journeyTitle || "Allenamento"}</h1>
              <p className="text-sm text-slate-200">10 domande generate sugli eventi del journey.</p>
            </div>
            <div className="rounded-2xl bg-white/10 px-4 py-3 text-right shadow-inner ring-1 ring-white/15">
              <div className="text-xs text-slate-200">Punteggio</div>
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
                  <p className="text-sm font-semibold text-slate-600">Risultato finale</p>
                  <h2 className="text-3xl font-bold text-slate-900">
                    {score} / {total}
                  </h2>
                  <p className="text-sm text-slate-600">Rivedi le risposte oppure riparti da capo.</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={restart}
                    className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  >
                    Riparti
                  </button>
                  <button
                    onClick={loadQuiz}
                    className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  >
                    Rigenera quiz
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
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Domanda {q.id}</div>
                      <div className="mt-1 text-sm font-medium text-slate-900">{q.question}</div>
                      <div className="mt-2 text-sm">
                        <span className="font-semibold">Tua risposta:</span> {chosen ?? "Non risposto"}
                      </div>
                      {!correct ? (
                        <div className="text-sm text-rose-700">
                          <span className="font-semibold">Corretto:</span> {q.answer}
                        </div>
                      ) : null}
                      {q.explanation ? (
                        <div className="mt-1 text-xs text-slate-600">Nota: {q.explanation}</div>
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
                    Domanda {index + 1} di {total}
                  </div>
                  <h2 className="text-2xl font-semibold text-slate-900">{current?.question}</h2>
                </div>
                <div className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-100">
                  {checked ? (lastCorrect ? "Risposta corretta" : "Risposta errata") : "Seleziona e conferma"}
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
                    Conferma risposta
                  </button>
                  <button
                    onClick={goNext}
                    disabled={!checked}
                    className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                  >
                    {index >= total - 1 ? "Mostra risultati" : "Domanda successiva"}
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
