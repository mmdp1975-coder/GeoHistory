// frontend/lib/ai.ts
import OpenAI from "openai";
import { z } from "zod";

const EventZ = z.object({
  title: z.string().min(2).max(200).optional().nullable(),
  year_from: z.number().int().optional().nullable(),
  year_to: z.number().int().optional().nullable(),
  era: z.enum(["AD", "BC"]).optional().nullable(),
  location_text: z.string().optional().nullable(),
  description: z.string().min(10).max(1000).optional().nullable()
});
const ExtractedZ = z.object({
  journey_title: z.string().min(3).max(200),
  journey_description: z.string().optional().nullable(),
  cover_hint: z.string().optional().nullable(),
  events: z.array(EventZ).min(1).max(200)
});
export type Extracted = z.infer<typeof ExtractedZ>;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export function chunkTranscript(text: string, max = 7000): string[] {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return [clean];
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + max, clean.length);
    if (end < clean.length) {
      const back = clean.lastIndexOf(". ", end);
      const backSpace = clean.lastIndexOf(" ", end);
      const cut = Math.max(back, backSpace);
      if (cut > start + 1000) end = cut + 1;
    }
    chunks.push(clean.slice(start, end));
    start = end;
  }
  return chunks;
}

function buildSystemPrompt(targetEventsMin: number) {
  return `
Sei un estrattore strutturato. Dato un chunk di transcript, restituisci JSON con eventi *specifici*:
- Almeno ${targetEventsMin} eventi se possibile.
- year_to = year_from se non noto.
- Era default AD.
- location_text breve (es. "Rome, Italy").
- Ogni evento ha una descrizione di 2–3 frasi.
Schema obbligatorio: { journey_title, journey_description?, cover_hint?, events: [{title?, year_from?, year_to?, era?, location_text?, description?}] }`;
}

async function extractFromChunk(params: {
  transcriptChunk: string;
  metaTitle?: string;
  metaDescription?: string;
  targetEventsMin: number;
}) {
  const { transcriptChunk, metaTitle, metaDescription, targetEventsMin } = params;
  const sys = buildSystemPrompt(targetEventsMin);
  const user = `Meta title: ${metaTitle || ""}\nMeta description: ${metaDescription || ""}\n\nTranscript chunk:\n${transcriptChunk}`;
  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [{ role: "system", content: sys }, { role: "user", content: user }],
    response_format: { type: "json_object" }
  });
  const raw = resp.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(raw);
  const data = ExtractedZ.safeParse(parsed);
  if (!data.success) throw new Error("AI extraction schema error: " + data.error.message);
  return data.data;
}

export function mergeAndDedup(all: Extracted[]): Extracted {
  const first = all.find(Boolean);
  const title = first?.journey_title || "Journey";
  const desc = first?.journey_description || null;
  const cover = first?.cover_hint || null;
  const map = new Map<string, z.infer<typeof EventZ>>();
  for (const part of all) {
    for (const ev of part.events) {
      const key = [
        ev.era || "AD",
        ev.year_from ?? "",
        ev.year_to ?? ev.year_from ?? "",
        (ev.location_text || "").toLowerCase().trim(),
        (ev.title || "").toLowerCase().trim()
      ].join("|");
      if (!map.has(key)) {
        map.set(key, {
          title: ev.title || null,
          year_from: ev.year_from ?? null,
          year_to: ev.year_to ?? ev.year_from ?? null,
          era: (ev.era as any) || "AD",
          location_text: ev.location_text || null,
          description: ev.description || null
        });
      }
    }
  }
  return { journey_title: title, journey_description: desc, cover_hint: cover, events: Array.from(map.values()) };
}

async function withConcurrency<T, R>(items: T[], limit: number, worker: (x: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let i = 0;
  async function next(): Promise<void> {
    if (i >= items.length) return;
    const idx = i++; const item = items[idx];
    const r = await worker(item);
    results[idx] = r;
    return next();
  }
  const starters = Array.from({ length: Math.min(limit, items.length) }, () => next());
  await Promise.all(starters);
  return results;
}

export async function extractEventsFromTranscriptLong(input: {
  transcript: string;
  metaTitle?: string;
  metaDescription?: string;
}) {
  const chunks = chunkTranscript(input.transcript, 7000);
  const minPerChunk = Math.max(4, Math.min(12, Math.floor(input.transcript.length / 15000) + 6));
  const parts = await withConcurrency(chunks, 3, (ch) =>
    extractFromChunk({ transcriptChunk: ch, metaTitle: input.metaTitle, metaDescription: input.metaDescription, targetEventsMin: minPerChunk })
  );
  return mergeAndDedup(parts);
}
