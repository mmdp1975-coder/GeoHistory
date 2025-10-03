"use server";

import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

/** === CONFIG event_translations (adatta qui i nomi se diversi nel tuo DB) === */
const EVENT_TRANSLATIONS_TABLE = "event_translations";
const COL_EVENT_ID   = "event_id";
const COL_LANG       = "lang";
const COL_TITLE      = "title";
const COL_NARRATIVE  = "narrative"; // se nel tuo DB è "description", cambia questo nome

type Era = "AD" | "BC";

type EventMinimal = {
  year_from?: number | null;
  year_to?: number | null;
  exact_date?: string | null;
  era?: Era | null;
  continent?: string | null;
  country?: string | null;
  location?: string | null;
  latitude?: number | null;
  longitude?: number | null;

  // --- extra per event_translations ---
  title_text?: string | null;
  description_text?: string | null;
};

type CreateJourneyPayload = {
  title: string;
  slug: string;
  pitch?: string | null;
  cover_url?: string | null;
  description?: string | null;
  visibility: string;
  status: string;

  year_from?: number | null;
  year_to?: number | null;
  era?: Era | null;
  journey_location?: string | null;
  journey_latitude?: number | null;
  journey_longitude?: number | null;

  events: EventMinimal[];
};

function getSupabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, { global: { headers: { Cookie: cookies().toString() } } });
}

async function getSessionProfileId(supabase: ReturnType<typeof createClient>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { profileId: null as string | null, userRef: null as string | null };

  const { data: profRow } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  return { profileId: profRow?.id ?? null, userRef: user.email ?? user.id };
}

/** Traduzione con OpenAI (usa stesso modello usato per estrazione) */
async function translate(text: string, target: "en" | "it"): Promise<string> {
  if (!text?.trim()) return "";
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  const sys = `Sei un traduttore accurato verso ${target === "en" ? "inglese" : "italiano"}. Mantieni il significato e un tono enciclopedico.`;
  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [{ role: "system", content: sys }, { role: "user", content: text }]
  });
  return resp.choices[0]?.message?.content?.trim() || text;
}

/** Crea 2 righe event_translations (en, it) se il testo è presente */
async function createEventTranslations(supabase: ReturnType<typeof createClient>, eventId: string, title?: string | null, narrative?: string | null) {
  const baseTitle = (title || "").trim();
  const baseNarr  = (narrative || "").trim();

  if (!baseTitle && !baseNarr) return; // niente da salvare

  // Heuristica: assumiamo fonte inglese e traduciamo in IT; se vuoi invertire, cambia qui
  const enTitle = baseTitle ? baseTitle : "";
  const enNarr  = baseNarr  ? baseNarr  : "";

  const itTitle = baseTitle ? await translate(baseTitle, "it") : "";
  const itNarr  = baseNarr  ? await translate(baseNarr,  "it") : "";

  const rows = [
    { [COL_EVENT_ID]: eventId, [COL_LANG]: "en", [COL_TITLE]: enTitle || null, [COL_NARRATIVE]: enNarr || null },
    { [COL_EVENT_ID]: eventId, [COL_LANG]: "it", [COL_TITLE]: itTitle || null, [COL_NARRATIVE]: itNarr || null }
  ];

  await supabase.from(EVENT_TRANSLATIONS_TABLE).insert(rows);
}

/**
 * Inserisce:
 * - group_events
 * - events_list (bulk)
 * - event_group_event (bulk)
 * - event_translations (2 lingue per evento, se abbiamo titolo/descrizione)
 */
export async function createJourneyWithEvents(payload: CreateJourneyPayload) {
  const supabase = getSupabaseServer();
  const { profileId, userRef } = await getSessionProfileId(supabase);

  // 1) group_events
  const geInsert = {
    slug: payload.slug,
    title: payload.title,
    pitch: payload.pitch ?? null,
    cover_url: payload.cover_url ?? null,
    description: payload.description ?? null,
    visibility: payload.visibility,
    status: payload.status,
    is_official: false,
    owner_user_ref: userRef,
    owner_profile_id: profileId,
  };
  const { data: geRow, error: geErr } = await supabase.from("group_events").insert(geInsert).select("id").single();
  if (geErr) return { ok: false as const, error: `group_events insert failed: ${geErr.message}` };
  const group_event_id = geRow!.id as string;

  // 2) events_list
  const eventsListRows = (payload.events || []).map((e) => ({
    year_from: e.year_from ?? null,
    year_to: e.year_to ?? null,
    exact_date: e.exact_date ?? null,
    era: e.era ?? null,
    continent: e.continent ?? null,
    country: e.country ?? null,
    location: e.location ?? null,
    latitude: e.latitude ?? null,
    longitude: e.longitude ?? null,
  }));
  const { data: evRows, error: evErr } = await supabase.from("events_list").insert(eventsListRows).select("id");
  if (evErr) return { ok: false as const, error: `events_list insert failed: ${evErr.message}`, group_event_id };
  const insertedEvents = (evRows as { id: string }[]) || [];

  // 3) event_group_event
  if (insertedEvents.length > 0) {
    const links = insertedEvents.map((r) => ({ event_id: r.id, group_event_id, added_by_user_ref: userRef }));
    const { error: linkErr } = await supabase.from("event_group_event").insert(links);
    if (linkErr) return { ok: false as const, error: `event_group_event insert failed: ${linkErr.message}`, group_event_id };
  }

  // 4) event_translations (EN + IT) — se presenti title/description nell’input in posizione corrispondente
  try {
    await Promise.all(
      insertedEvents.map((row, idx) => {
        const src = payload.events[idx];
        return createEventTranslations(supabase, row.id, src?.title_text || null, src?.description_text || null);
      })
    );
  } catch (e: any) {
    // Non blocchiamo la creazione del Journey se fallisce la traduzione/scrittura
    console.warn("event_translations insert warning:", e?.message || e);
  }

  return { ok: true as const, group_event_id };
}
