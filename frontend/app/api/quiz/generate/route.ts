import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  gid: z.string().uuid(),
  lang: z.string().min(2).max(5).optional().nullable(),
});

const QuizSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z.string().min(4),
        options: z.array(z.string().min(1)).min(3).max(6),
        answer: z.string().min(1),
        explanation: z.string().optional().nullable(),
      })
    )
    .min(5),
});

function formatYear(ev: any) {
  const y = ev.year_from ?? ev.year_to ?? null;
  if (y == null) return null;
  const era = (ev.era || "AD").toUpperCase();
  return `${Math.abs(y)} ${era === "BC" ? "a.C." : "d.C."}`;
}

function pick<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  const res: T[] = [];
  while (copy.length && res.length < n) {
    const i = Math.floor(Math.random() * copy.length);
    res.push(copy.splice(i, 1)[0]);
  }
  return res;
}

function buildFallbackQuestions(rows: any[]): { questions: any[]; note: string } {
  const events = rows
    .map((r) => ({
      title: r.title || "Evento",
      description: r.description || "",
      year_from: r.year_from ?? null,
      year_to: r.year_to ?? null,
      era: r.era || "AD",
    }))
    .filter((r) => !!r.title);

  const titles = events.map((e) => e.title);
  const yearEvents = events.filter((e) => e.year_from != null || e.year_to != null);
  const questions: any[] = [];

  for (const ev of yearEvents) {
    if (questions.length >= 6) break;
    const correct = formatYear(ev);
    if (!correct) continue;
    const rawYear = ev.year_from ?? ev.year_to;
    const yearPool = yearEvents
      .map((e) => e.year_from ?? e.year_to)
      .filter((y) => y != null) as number[];
    const offsets = [-200, -100, -50, 50, 100, 200].map((d) => (rawYear as number) + d);
    const distractorsRaw = [...yearPool, ...offsets].filter((y) => y !== rawYear);
    const distractors = pick(
      Array.from(new Set(distractorsRaw)).map((y) => `${Math.abs(y)} ${(ev.era || "AD") === "BC" ? "a.C." : "d.C."}`),
      3
    );
    const opts = Array.from(new Set([correct, ...distractors])).slice(0, 4);
    if (opts.length < 3) continue;
    questions.push({
      question: `In che periodo si colloca l'evento "${ev.title}"?`,
      options: opts.sort(() => Math.random() - 0.5),
      answer: correct,
      explanation: null,
    });
  }

  const descEvents = events.filter((e) => e.description.length > 30);
  for (const ev of descEvents) {
    if (questions.length >= 10) break;
    const snippet = ev.description.length > 160 ? `${ev.description.slice(0, 157)}...` : ev.description;
    const distractors = pick(titles.filter((t) => t !== ev.title), 3);
    const opts = Array.from(new Set([ev.title, ...distractors])).slice(0, 4);
    if (opts.length < 3) continue;
    questions.push({
      question: `Quale evento è descritto da: "${snippet}"`,
      options: opts.sort(() => Math.random() - 0.5),
      answer: ev.title,
      explanation: null,
    });
  }

  if (questions.length < 10) {
    for (const ev of events) {
      if (questions.length >= 10) break;
      const distractors = pick(titles.filter((t) => t !== ev.title), 3);
      const opts = Array.from(new Set([ev.title, ...distractors])).slice(0, 4);
      questions.push({
        question: `Seleziona il titolo corretto per questo evento del journey.`,
        options: opts.sort(() => Math.random() - 0.5),
        answer: ev.title,
        explanation: null,
      });
    }
  }

  return { questions: questions.slice(0, 10), note: "fallback" };
}

async function translateQuestions(
  questions: any[],
  targetLang: string | null,
  openaiKey?: string | null,
  keyPrefix?: string | null
): Promise<any[]> {
  if (!targetLang || targetLang === "it") return questions;
  if (!openaiKey) return questions;
  try {
    const openai = new OpenAI({ apiKey: openaiKey });
    const translation = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Sei un traduttore. Ricevi una lista di domande/risposte multiple e devi restituire lo stesso JSON traducendo TUTTI i campi testuali nella lingua target indicata. Non aggiungere testo.",
        },
        {
          role: "user",
          content: JSON.stringify({
            target_lang: targetLang,
            questions,
          }),
        },
      ],
    });
    const parsed = JSON.parse(translation.choices[0]?.message?.content || "{}");
    if (Array.isArray(parsed.questions) && parsed.questions.length) {
      return parsed.questions;
    }
  } catch (e: any) {
    console.error("[quiz] translation failed", { prefix: keyPrefix || null, message: e?.message });
  }
  return questions;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload non valido" }, { status: 400 });
  }
  const { gid, lang } = parsed.data;
  const preferredLang = (lang || "").slice(0, 2).toLowerCase() || null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const openaiKeyPrefix = openaiKey ? openaiKey.slice(0, 6) : null;
  if (process.env.NODE_ENV !== "production") {
    console.info("[quiz] OPENAI key prefix", openaiKeyPrefix || "none");
  }

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Supabase non configurato" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const lang2 = (preferredLang || "it").slice(0, 2).toLowerCase();

  // Prima prova con la lingua utente (due lettere), poi fallback a qualsiasi lingua
  const { data: dataPref, error: errPref } = await supabase
    .from("v_journey")
    .select("group_event_id, event_id, title, description, lang, year_from, year_to, era, journey_title")
    .eq("group_event_id", gid)
    .eq("lang", lang2)
    .limit(200);

  let data: any[] | null = null;
  let error: any = null;
  if (dataPref && dataPref.length) {
    data = dataPref;
    error = errPref;
  } else {
    const { data: anyLang, error: anyErr } = await supabase
      .from("v_journey")
      .select("group_event_id, event_id, title, description, lang, year_from, year_to, era, journey_title")
      .eq("group_event_id", gid)
      .limit(200);
    data = anyLang;
    error = anyErr || errPref;
  }

  if (error) {
    return NextResponse.json({ error: "Errore Supabase: " + error.message }, { status: 500 });
  }
  if (!data?.length) {
    return NextResponse.json({ error: "Nessun journey trovato" }, { status: 404 });
  }

  const rows = data.map((r) => ({
    ...r,
    lang_norm: (r.lang || "").slice(0, 2).toLowerCase(),
  }));
  const preferredRows = rows.filter((r) => r.lang_norm === lang2 || (r.lang || "").toLowerCase().startsWith(lang2));
  const chosenRows = preferredRows.length ? preferredRows : rows;

  const journeyTitle = chosenRows[0]?.journey_title || data[0]?.journey_title || "Journey";
  const journeyDesc = (chosenRows.find((d) => d.description)?.description || "").toString();

  const eventsText = chosenRows
    .map((ev, idx) => {
      const parts = [
        `${idx + 1}. ${ev.title || "Evento"}`,
        ev.description ? `Descrizione: ${ev.description}` : null,
        ev.year_from ? `Periodo: ${ev.year_from}${ev.era ? " " + ev.era : ""}${ev.year_to ? " - " + ev.year_to : ""}` : null,
        ev.lang ? `Lingua origine: ${ev.lang}` : null,
      ].filter(Boolean);
      return parts.join(" | ");
    })
    .join("\n");

  let aiQuestions: any[] = [];
  let aiError: string | null = null;

  if (openaiKey) {
    const openai = new OpenAI({ apiKey: openaiKey });

    const targetLang = lang2 || "it";
    const messages: ChatCompletionMessageParam[] = [
      {
        role: "system",
        content:
          "Sei un generatore di quiz di storia. Dato un journey e i suoi eventi, crea 10 domande a scelta multipla (4 opzioni) nella lingua target indicata. Devi restituire TUTTI i campi testuali nella lingua target (traduci se necessario, ma mantieni i nomi propri). Non usare altre lingue. Le domande devono misurare comprensione di fatti, date, luoghi e contesto. Includi risposta esatta e breve spiegazione opzionale.",
      },
      {
        role: "user",
        content: `Lingua target: ${targetLang}
Titolo journey: ${journeyTitle}
Descrizione journey: ${journeyDesc}

Eventi:
${eventsText}

Genera 10 domande a scelta multipla. Restituisci JSON con chiave "questions" e per ogni domanda: question, options (4), answer, explanation (breve opzionale). Tutti i campi testuali DEVONO essere in ${targetLang}.`,
      },
    ];

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages,
      });
      const parsedQuiz = JSON.parse(completion.choices[0]?.message?.content || "{}");
      const validated = QuizSchema.safeParse(parsedQuiz);
      aiQuestions = validated.success ? validated.data.questions : [];
    } catch (e: any) {
      // Non esporre la chiave: messaggio generico per il client, log minimale lato server.
      aiError = "Errore AI: chiave non valida o non autorizzata";
      console.error("[quiz] OpenAI error", {
        prefix: openaiKeyPrefix,
        message: e?.message,
      });
    }
  } else {
    aiError = "OPENAI_API_KEY mancante";
  }

  const trimmedAi = aiQuestions.slice(0, 10).map((q, idx) => ({
    id: idx + 1,
    question: q.question,
    options: q.options.slice(0, 4),
    answer: q.answer,
    explanation: q.explanation ?? null,
  }));

  if (trimmedAi.length >= 5) {
    const translated = await translateQuestions(trimmedAi, lang2, openaiKey, openaiKeyPrefix);
    return NextResponse.json({ journeyTitle, questions: translated });
  }

  const fallback = buildFallbackQuestions(chosenRows);
  if (fallback.questions.length) {
    const translatedFallback = await translateQuestions(fallback.questions, lang2, openaiKey, openaiKeyPrefix);
    const normalized = translatedFallback.map((q, idx) => ({
      id: idx + 1,
      question: q.question,
      options: Array.isArray(q.options) ? q.options.slice(0, 4) : [],
      answer: q.answer,
      explanation: q.explanation ?? null,
    }));
    return NextResponse.json({ journeyTitle, questions: normalized, fallback: true, aiError });
  }

  return NextResponse.json({ error: aiError || "Nessuna domanda generata" }, { status: 500 });
}
