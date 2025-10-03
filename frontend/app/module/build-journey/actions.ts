"use server";

import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

/** Tabelle/colonne (adatta i nomi se diversi nel tuo DB) */
const EVENT_TRANSLATIONS_TABLE = "event_translations" as const;
const COL_EVENT_ID = "event_id" as const;
const COL_LANG = "lang" as const;
const COL_TITLE = "title" as const;
const COL_NARRATIVE = "narrative" as const; // se nel DB è "description", cambia anche qui

type Era = "AD" | "BC";

/** Struttura minima evento in input */
type EventMinimal = {
  title_text?: string | null;
  description_text?: string | null;

  year_from?: number | null;
  year_to?: number | null;
  era?: Era | null;

  latitude?: number | null;
  longitude?: number | null;
  location_name?: string | null;

  event_type_id?: string | null;
  wikipedia_url?: string | null;
};

/** Payload principale per costruire il Journey */
type BuildJourneyPayload = {
  name_en: string;
  name_it: string;
  subtitle_en?: string | null;
  subtitle_it?: string | null;

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
  return createClient(url, key, {
    global: { headers: { Cookie: cookies().toString() } },
  });
}

/** Recupera user e profileId dalla sessione */
async function getSessionProfileId(supabase: ReturnType<typeof getSupabaseServer>) {
  const { data: authData } = await supabase.auth.getUser();
  const user = authData?.user ?? null;
  if (!user) return { profileId: null as string | null, userRef: null as string | null };

  const { data: profRow, error: profErr } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id) // <-- Se nel tuo schema è "auth_user_id" o altro, cambia SOLO questa riga.
    .maybeSingle<{ id: string }>();

  if (profErr) throw profErr;

  return { profileId: profRow?.id ?? null, userRef: user.email ?? user.id };
}

/** Traduzione con OpenAI */
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

  return choices?.[0]?.message?.content?.trim() || "";
}

/** Tipo locale per inserire righe in event_translations */
type EventTranslationInsert = {
  event_id: string;
  lang: "it" | "en";
  title: string | null;
  narrative: string | null;
};

/** Scrive traduzioni IT/EN in event_translations se presenti */
async function createEventTranslations(
  supabase: ReturnType<typeof getSupabaseServer>,
  event_id: string,
  title_source: string | null,
  narrative_source: string | null
) {
  if (!title_source && !narrative_source) return;

  // Assumo input IT e genero EN. Se non vuoi tradurre, puoi salvare solo IT.
  const title_it = title_source || null;
  const narrative_it = narrative_source || null;

  const title_en = title_it ? await translate(title_it, "en") : null;
  const narrative_en = narrative_it ? await translate(narrative_it, "en") : null;

  const rows: EventTranslationInsert[] = [];
  if (title_it || narrative_it) {
    rows.push({
      event_id,
      lang: "it",
      title: title_it,
      narrative: narrative_it,
    });
  }
  if (title_en || narrative_en) {
    rows.push({
      event_id,
      lang: "en",
      title: title_en,
      narrative: narrative_en,
    });
  }
  if (!rows.length) return;

  // Usa nome tabella letterale per evitare "never"
  const { error } = await supabase.from("event_translations").insert(rows);
  if (error) throw error;
}

/** ACTION principale: crea Journey + eventi + traduzioni */
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

  // 1) Crea group_event (adatta i nomi campi alla tua tabella)
  const groupEventRow = {
    name: payload.name_en, // se hai una sola colonna "name"
    subtitle: payload.subtitle_en || null,
    era_from: payload.era_from || null,
    era_to: payload.era_to || null,

    year_from: payload.year_from ?? null,
    year_to: payload.year_to ?? null,
    era: payload.era ?? null,

    journey_location: payload.journey_location ?? null,
    journey_latitude: payload.journey_latitude ?? null,
    journey_longitude: payload.journey_longitude ?? null,

    owner_profile_id: profileId,
    visibility: "Private", // opzionale
    state: "Draft",        // opzionale
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
  const getSafe = (s: string | undefined | null) => (s?.trim() ? s.trim() : null);
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
    cover_url: null,
    description: null,
  });

  // EN (se mancano i testi in EN, traduco quelli IT)
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

  // 4) event_translations (IT/EN) per ogni evento inserito
  try {
    await Promise.all(
      insertedEvents.map((row, idx) => {
        const src = payload.events[idx];
        return createEventTranslations(
          supabase,
          row.id,
          src?.title_text || null,
          src?.description_text || null
        );
      })
    );
  } catch (e: any) {
    // Non bloccare il Journey se falliscono le traduzioni
    console.warn("event_translations insert warning:", e?.message || e);
  }

  return { ok: true as const, group_event_id };
}

/** Alias per compatibilità con page.tsx */
export { buildJourney as createJourneyWithEvents };
