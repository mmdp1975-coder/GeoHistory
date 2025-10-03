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
  // Dati minimi per la creazione degli eventi
  // NB: tieni coerenti i nomi con la tua tabella events_list o v_events
  //     Se i nomi nel DB sono diversi, adatta i campi qui e la insert più sotto.
  title_text?: string | null;
  description_text?: string | null;

  // campi temporali
  year_from?: number | null;
  year_to?: number | null;
  era?: Era | null;

  // campi geografici
  latitude?: number | null;
  longitude?: number | null;
  location_name?: string | null;

  // foreign key per il tipo evento, se già determinato
  event_type_id?: string | null;

  // opzionale: eventuale link wikipedia (se previsto nel tuo DB)
  wikipedia_url?: string | null;

  // opzionale: qualunque altro campo tu voglia mappare
  // ...
};

type BuildJourneyPayload = {
  // Dati minimi per creare il Journey (= group_event)
  // Adatta ai nomi dei campi reali della tua tabella group_events
  name_en: string;
  name_it: string;
  subtitle_en?: string | null;
  subtitle_it?: string | null;

  // metadata del journey
  era_from?: Era | null;
  era_to?: Era | null;

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

/** Recupero user + profileId dalla sessione */
async function getSessionProfileId(supabase: ReturnType<typeof createClient>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { profileId: null as string | null, userRef: null as string | null };

  const { data: profRow, error: profErr } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id) // <-- Se nel tuo schema è "auth_user_id" o altro, cambia qui.
    .maybeSingle<{ id: string }>();
  if (profErr) throw profErr;

  return { profileId: profRow?.id ?? null, userRef: user.email ?? user.id };
}

/** Traduzione con OpenAI (usa stesso modello usato per estrazione) */
async function translate(text: string, target: "en" | "it"): Promise<string> {
  if (!text?.trim()) return "";
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

  const system =
    target === "en"
      ? "You are a professional translator. Translate the following Italian text into concise, fluent English suitable for a history website."
      : "Sei un traduttore professionista. Traduci il seguente testo inglese in italiano conciso e fluente, adatto a un portale di storia.";

  const { choices } = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: text },
    ],
    temperature: 0.2,
  });

  const out = choices?.[0]?.message?.content?.trim() || "";
  return out;
}

/** Scrivi le due traduzioni IT/EN in event_translations se presenti */
async function createEventTranslations(
  supabase: ReturnType<typeof createClient>,
  event_id: string,
  title_source: string | null,
  narrative_source: string | null
) {
  // Se non abbiamo nessun testo, esci
  if (!title_source && !narrative_source) return;

  // Prepara EN e IT (se la lingua sorgente è una sola, traduciamo l'altra)
  const title_it = title_source ? title_source : null;
  const narrative_it = narrative_source ? narrative_source : null;

  // Traduco in EN se ho l'IT (o se il testo sembra IT). Qui assumo input in IT per semplicità.
  const title_en = title_it ? await translate(title_it, "en") : null;
  const narrative_en = narrative_it ? await translate(narrative_it, "en") : null;

  const rows: any[] = [];
  if (title_it || narrative_it) {
    rows.push({
      [COL_EVENT_ID]: event_id,
      [COL_LANG]: "it",
      [COL_TITLE]: title_it,
      [COL_NARRATIVE]: narrative_it,
    });
  }
  if (title_en || narrative_en) {
    rows.push({
      [COL_EVENT_ID]: event_id,
      [COL_LANG]: "en",
      [COL_TITLE]: title_en,
      [COL_NARRATIVE]: narrative_en,
    });
  }
  if (!rows.length) return;

  const { error } = await supabase.from(EVENT_TRANSLATIONS_TABLE).insert(rows);
  if (error) throw error;
}

/** ACTION principale: crea un Journey + suoi eventi (e relative traduzioni minime) */
export async function buildJourney(payload: BuildJourneyPayload) {
  const supabase = getSupabaseServer();
  const { profileId, userRef } = await getSessionProfileId(supabase);

  if (!profileId) {
    return {
      ok: false as const,
      error: "NO_SESSION",
      message: "Utente non loggato o profilo non trovato.",
    };
  }

  // 1) Crea group_event
  const groupEventRow = {
    // Adatta Nomi campi della tua tabella group_events
    name: payload.name_en, // se hai una colonna unica name, puoi mettere quello EN/IT che preferisci come "master"
    subtitle: payload.subtitle_en || null, // idem
    era_from: payload.era_from || null,
    era_to: payload.era_to || null,

    year_from: payload.year_from || null,
    year_to: payload.year_to || null,
    era: payload.era || null,

    journey_location: payload.journey_location || null,
    journey_latitude: payload.journey_latitude || null,
    journey_longitude: payload.journey_longitude || null,

    owner_profile_id: profileId,
    visibility: "Private", // opzionale, adatta al tuo schema/stati
    state: "Draft",        // idem
  };

  const { data: geIns, error: geErr } = await supabase
    .from("group_events")
    .insert(groupEventRow)
    .select("id")
    .single();

  if (geErr) {
    return { ok: false as const, error: "GE_INSERT", message: geErr.message };
  }
  const group_event_id = geIns.id as string;

  // 2) Crea group_event_translations (IT + EN)
  const getSafe = (s: string | undefined | null) => (s?.trim() ? s!.trim() : null);
  const name_en = getSafe(payload.name_en);
  const name_it = getSafe(payload.name_it);
  const subtitle_en = getSafe(payload.subtitle_en ?? null);
  const subtitle_it = getSafe(payload.subtitle_it ?? null);

  const transRows: Array<{
    group_event_id: string;
    lang: "it" | "en";
    name: string | null;
    subtitle?: string | null;
    cover_url?: string | null;
    description?: string | null;
  }> = [];

  // IT
  transRows.push({
    group_event_id,
    lang: "it",
    name: name_it,
    subtitle: subtitle_it,
    cover_url: null, // se hai una cover la puoi mettere qui
    description: null,
  });

  // EN
  // se non fornisci in input i testi inglesi, traduciamo al volo il titolo/sottotitolo italiani
  transRows.push({
    group_event_id,
    lang: "en",
    name: name_en ?? (name_it ? await translate(name_it, "en") : null),
    subtitle: subtitle_en ?? (subtitle_it ? await translate(subtitle_it, "en") : null),
    cover_url: null,
    description: null,
  });

  const { error: getErr } = await supabase.from("group_event_translations").insert(transRows);
  if (getErr) {
    return { ok: false as const, error: "GET_INSERT", message: getErr.message };
  }

  // 3) Inserisci gli eventi collegati
  const eventRows = (payload.events || []).map((e) => ({
    // Adatta i nomi col tuo schema "events_list" (o tabella eventi effettiva)
    group_event_id,
    title_text: e.title_text ?? null,
    description_text: e.description_text ?? null,

    year_from: e.year_from ?? null,
    year_to: e.year_to ?? null,
    era: e.era ?? null,

    latitude: e.latitude ?? null,
    longitude: e.longitude ?? null,
    location_name: e.location_name ?? null,

    event_type_id: e.event_type_id ?? null,
    wikipedia_url: e.wikipedia_url ?? null,

    // eventuali default
    visibility: "Private",
    state: "Draft",
    owner_profile_id: profileId,
    owner_ref: userRef,
  }));

  let insertedEvents: Array<{ id: string }> = [];
  if (eventRows.length > 0) {
    const { data: evIns, error: evErr } = await supabase
      .from("events_list")
      .insert(eventRows)
      .select("id");

    if (evErr) {
      return { ok: false as const, error: "EV_INSERT", message: evErr.message };
    }
    insertedEvents = (evIns || []) as Array<{ id: string }>;
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
