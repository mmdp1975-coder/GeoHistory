// frontend/app/module/build-journey/actions.ts
"use server";

/**
 * Build Journey — Server Actions (Supabase + Analisi Video)
 * - analyzeVideoDeep: estrae transcript/descrizione (YouTube/Vimeo) con *molteplici fallback*
 *   ► 1) API youtube-transcript
 *   ► 2) captionTracks via HTML (VTT/XML)
 *   ► 3) ytInitialPlayerResponse.shortDescription
 *   ► 4) **ytInitialData.description/descriptionSnippet (NUOVO)**
 *   ► 5) meta description (og:description / name="description")
 *   Poi usa LLM per ricavare eventi con date/luoghi e precompila il form.
 * - saveJourney: scrive su 9 tabelle come da specifica.
 *
 * Requisiti:
 * - Env: OPENAI_API_KEY
 * - npm: youtube-transcript, openai, zod
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabaseServerClient";
import { YoutubeTranscript } from "youtube-transcript";
import { z } from "zod";
import OpenAI from "openai";

type Visibility = "private" | "public";
type MediaRole = "cover" | "attachment" | "gallery";
type EntityType = "group_event" | "event";

// ====== Mappatura tabelle (aggiorna se necessario) ======
const T = {
  group_events: "group_events",
  ge_trans: "group_event_translations",
  events: "events_list",
  ev_trans: "event_translations",
  ev_ge: "event_group_event",
  ev_types: "event_types",
  ev_type_map: "event_type_map",
  media: "media_assets",
  attach: "media_attachments",
} as const;

function sb() {
  return createClient();
}
function ts() {
  return new Date().toISOString();
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ========================= Helpers comuni =========================
function withUA(init?: RequestInit): RequestInit {
  return {
    ...init,
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
      "accept-language": "en-US,en;q=0.9,it;q=0.8",
      ...(init?.headers || {}),
    },
  };
}

function extractYouTubeId(url: string) {
  const m =
    url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})(?:&|$)/) ||
    url.match(/youtu\.be\/([0-9A-Za-z_-]{11})/);
  return m?.[1] ?? null;
}

// decode stringhe JSON di YouTube (\n, \u0026, ecc.)
function unescapeYT(s: string) {
  try {
    return s
      .replaceAll("\\n", "\n")
      .replaceAll("\\u0026", "&")
      .replaceAll("\\/", "/")
      .replaceAll('\\"', '"');
  } catch {
    return s;
  }
}

function parseVTTtoPlain(vtt: string) {
  return vtt
    .split("\n")
    .filter((line) => line && !/^\d+$/.test(line) && !/-->/i.test(line) && !/^WEBVTT/i.test(line))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

// Combina array di runs { text } in una stringa
function textFromRuns(runs: any[]): string {
  if (!Array.isArray(runs)) return "";
  return runs.map((r) => (typeof r?.text === "string" ? r.text : "")).join(" ").replace(/\s+/g, " ").trim();
}

async function fetchOembed(videoUrl: string) {
  const isYouTube = /youtu(\.be|be\.com)/i.test(videoUrl);
  const isVimeo = /vimeo\.com/i.test(videoUrl);
  const oembed = isYouTube
    ? `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`
    : `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(videoUrl)}`;
  const res = await fetch(oembed, withUA({ cache: "no-store" }));
  if (!res.ok) throw new Error(`oEmbed ${res.status}`);
  return res.json() as Promise<any>;
}

async function fetchPageHTML(url: string) {
  const res = await fetch(url, withUA({ cache: "no-store" }));
  if (!res.ok) throw new Error(`fetch HTML ${res.status}`);
  return res.text();
}

function metaDescriptionFromHTML(html: string) {
  const m1 = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  if (m1?.[1]) return m1[1].trim();
  const m2 = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
  if (m2?.[1]) return m2[1].trim();
  return "";
}

// ========================= Transcript / Description =========================
async function getYouTubeTranscriptOrDesc(videoUrl: string) {
  const ytId = extractYouTubeId(videoUrl);
  if (!ytId) throw new Error("YouTube ID non riconosciuto.");

  // 1) API youtube-transcript
  try {
    const items = await YoutubeTranscript.fetchTranscript(ytId);
    const text = items.map((i) => i.text).join(" ");
    if (text && text.length > 50) {
      return { source: "youtube_transcript_api", text };
    }
  } catch {
    // continua
  }

  // 2) HTML → captionTracks (VTT/XML)
  let html = "";
  try {
    html = await fetchPageHTML(`https://www.youtube.com/watch?v=${ytId}&hl=en`);
    const m1 = html.match(/ytInitialPlayerResponse\s*=\s*(\{.*?\});/s);
    if (m1) {
      const json = JSON.parse(unescapeYT(m1[1]));
      const tracks =
        json?.captions?.playerCaptionsTracklistRenderer?.captionTracks ||
        json?.playerCaptionsTracklistRenderer?.captionTracks;
      if (Array.isArray(tracks) && tracks.length) {
        const pref =
          tracks.find((t: any) => /(\bit\b|\ben\b)/i.test(t.languageCode)) || tracks[0];
        const base = pref?.baseUrl;
        if (base) {
          const vttRes = await fetch(base + "&fmt=vtt", withUA());
          if (vttRes.ok) {
            const vtt = await vttRes.text();
            const txt = parseVTTtoPlain(vtt);
            if (txt && txt.length > 50) return { source: "youtube_caption_vtt", text: txt };
          }
          const xmlRes = await fetch(base, withUA());
          if (xmlRes.ok) {
            const xml = await xmlRes.text();
            const txt = xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
            if (txt && txt.length > 50) return { source: "youtube_caption_xml", text: txt };
          }
        }
      }
      // 3) ytInitialPlayerResponse.shortDescription
      const shortDesc =
        json?.videoDetails?.shortDescription ||
        json?.microformat?.playerMicroformatRenderer?.description?.simpleText;
      if (shortDesc && shortDesc.length > 20)
        return { source: "youtube_short_description", text: String(shortDesc) };
    }
  } catch {
    // continua
  }

  // 4) **NUOVO**: ytInitialData.description/descriptionSnippet nei blocchi HTML
  try {
    if (!html) html = await fetchPageHTML(`https://www.youtube.com/watch?v=${ytId}&hl=en`);
    const m2 = html.match(/ytInitialData\s*=\s*(\{.*?\});/s);
    if (m2) {
      const json2 = JSON.parse(unescapeYT(m2[1]));
      // Percorsi comuni per la descrizione testuale in watch
      const results =
        json2?.contents?.twoColumnWatchNextResults?.results?.results?.contents || [];
      // Scansiona i content alla ricerca dei renderer con description
      for (const c of results) {
        const sec = c?.videoSecondaryInfoRenderer;
        const pri = c?.videoPrimaryInfoRenderer;
        const possibleRuns =
          sec?.attributedDescription?.content?.runs ||
          sec?.description?.runs ||
          pri?.attributedDescription?.content?.runs ||
          pri?.description?.runs ||
          undefined;
        const txt = textFromRuns(possibleRuns || []);
        if (txt && txt.length > 50) {
          return { source: "youtube_ytInitialData_desc", text: txt };
        }
      }
      // fallback: descriptionSnippet dal lato “related”
      const related =
        json2?.contents?.twoColumnWatchNextResults?.secondaryResults?.secondaryResults
          ?.results || [];
      for (const r of related) {
        const s =
          r?.compactVideoRenderer?.descriptionSnippet?.runs ||
          r?.richItemRenderer?.content?.videoRenderer?.descriptionSnippet?.runs ||
          [];
        const txt = textFromRuns(s);
        if (txt && txt.length > 50) {
          return { source: "youtube_descriptionSnippet", text: txt };
        }
      }
    }

    // Ultimo fallback HTML: <meta name="description"> / og:description
    const meta = metaDescriptionFromHTML(html);
    if (meta && meta.length > 20) {
      return { source: "youtube_meta_description", text: meta };
    }
  } catch {
    // continua
  }

  // 5) oEmbed description come ultimissimo tentativo
  try {
    const meta = await fetchOembed(videoUrl);
    const d = String(meta?.description || "");
    if (d && d.length > 20) return { source: "oembed_description", text: d };
  } catch {
    // ignore
  }

  throw new Error("Transcript/description non disponibile.");
}

async function getVimeoDesc(videoUrl: string) {
  try {
    const meta = await fetchOembed(videoUrl);
    const desc = String(meta?.description || "");
    if (desc && desc.length > 20) return { source: "oembed_description", text: desc };
  } catch {
    // continua
  }
  try {
    const html = await fetchPageHTML(videoUrl);
    const m = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
    if (m?.[1]) {
      return { source: "og_description", text: m[1].trim() };
    }
  } catch {}
  throw new Error("Transcript/description non disponibile.");
}

async function getTranscriptOrDescription(videoUrl: string) {
  if (/youtu(\.be|be\.com)/i.test(videoUrl)) return getYouTubeTranscriptOrDesc(videoUrl);
  if (/vimeo\.com/i.test(videoUrl)) return getVimeoDesc(videoUrl);
  throw new Error("Supportati solo YouTube/Vimeo.");
}

// ========================= LLM: estrazione eventi =========================
const EventOutSchema = z.object({
  title: z.string().min(3),
  description_short: z.string().min(3),
  description: z.string().optional().default(""),
  era: z.enum(["AD", "BC"]).optional().default("AD"),
  year_from: z.number().nullable().optional().default(null),
  year_to: z.number().nullable().optional().default(null),
  exact_date: z.string().nullable().optional().default(null), // YYYY-MM-DD
  continent: z.string().nullable().optional().default(null),
  country: z.string().nullable().optional().default(null),
  location: z.string().nullable().optional().default(null),
  latitude: z.number().nullable().optional().default(null),
  longitude: z.number().nullable().optional().default(null),
  wikipedia_url: z.string().url().nullable().optional().default(null),
  video_url: z.string().url().nullable().optional().default(null),
  type_codes: z.array(z.string()).optional().default([]),
});
const EventsArraySchema = z.array(EventOutSchema).min(1).max(50);

function buildPromptForEvents(transcript: string, lang: string) {
  return [
    {
      role: "system",
      content:
        "Sei un estrattore di eventi storici. Dato un transcript, individua eventi con data e/o luogo. Rispondi SOLO con un array JSON valido (nessun testo extra).",
    },
    {
      role: "user",
      content:
        `Transcript (può essere ${lang}). Regole:\n` +
        `- Ogni evento: title, description_short, description, era("AD"|"BC"), year_from, year_to, exact_date(YYYY-MM-DD o null), continent, country, location, latitude, longitude, wikipedia_url (se noto), video_url(null), type_codes tra ["war","exploration","culture","science"].\n` +
        `- Usa exact_date se disponibile, altrimenti year_from/year_to.\n` +
        `- Inserisci luogo e paese quando possibile; lat/lon se noti, altrimenti null.\n` +
        `- 2–12 eventi sono sufficienti.\n\n` +
        `Transcript:\n` + transcript.slice(0, 24000),
    },
  ] as OpenAI.Chat.Completions.ChatCompletionMessageParam[];
}

export async function analyzeVideoDeep(input: { videoUrl: string; lang?: string }) {
  const { videoUrl, lang = "it" } = input;
  if (!videoUrl?.trim()) throw new Error("Video URL mancante.");
  if (!/(youtu\.be|youtube\.com|vimeo\.com)/i.test(videoUrl)) throw new Error("Supportati solo YouTube/Vimeo.");

  const meta: any = await fetchOembed(videoUrl).catch(() => ({}));
  const title = String(meta?.title || "Untitled");
  const author = String(meta?.author_name || "");
  const thumbnail = String(meta?.thumbnail_url || "");

  const { text } = await getTranscriptOrDescription(videoUrl);

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: buildPromptForEvents(text, lang),
    temperature: 0.2,
  });

  let raw = completion.choices[0]?.message?.content?.trim() || "[]";
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) && parsed?.data && Array.isArray(parsed.data)) {
      parsed = parsed.data;
    }
  } catch {
    const first = raw.indexOf("[");
    const last = raw.lastIndexOf("]");
    if (first >= 0 && last > first) {
      parsed = JSON.parse(raw.slice(first, last + 1));
    } else {
      throw new Error("Parsing LLM fallito.");
    }
  }

  const events = EventsArraySchema.parse(parsed);

  return {
    ok: true,
    provider: /youtu/i.test(videoUrl) ? "YouTube" : "Vimeo",
    video: { url: videoUrl, title, author, thumbnail },
    prefill: {
      group_event: {
        title,
        pitch: "",
        description: "",
        cover_url: thumbnail,
        visibility: "private" as Visibility,
        status: "draft" as const,
        language: lang,
      },
      events: events.map((e) => ({
        era: e.era,
        year_from: e.year_from,
        year_to: e.year_to,
        exact_date: e.exact_date,
        continent: e.continent,
        country: e.country,
        location: e.location,
        latitude: e.latitude,
        longitude: e.longitude,
        geom: null,
        source_event_id: null,
        image_url: null,
        images_json: null,
        translations: [
          {
            lang,
            title: e.title,
            description: e.description || "",
            description_short: e.description_short,
            wikipedia_url: e.wikipedia_url || "",
            video_url: null as any,
          },
        ],
        type_codes: e.type_codes || [],
        media: [],
        added_by_user_ref: null,
      })),
    },
  };
}

// ========================= SALVATAGGIO (immutato) =========================
export type SaveJourneyPayload = {
  group_event: {
    title: string;
    cover_url: string;
    visibility: Visibility;
    status: "draft" | "published";
    pitch?: string;
    description?: string;
    language?: string;

    code?: string;
    slug?: string;
    is_official?: boolean;
    owner_user_ref?: string;
    owner_profile_id?: string;
    color_hex?: string;
    icon_name?: string;
    workflow_state?: string;
    audience_scope?: string;
    requested_approval_at?: string;
    approved_at?: string;
    approved_by_profile_id?: string;
    refused_at?: string;
    refused_by_profile_id?: string;
    refusal_reason?: string;

    era_from?: "AD" | "BC" | null;
    era_to?: "AD" | "BC" | null;
    year_from?: number | null;
    year_to?: number | null;
  };

  group_event_translation?: {
    lang: string;
    title?: string;
    short_name?: string;
    description?: string;
    video_url?: string;
  } | null;

  video_media_url?: string | null;

  events: Array<{
    era?: "AD" | "BC";
    year_from?: number | null;
    year_to?: number | null;
    exact_date?: string | null;
    continent?: string | null;
    country?: string | null;
    location?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    geom?: string | null;
    source_event_id?: string | null;
    image_url?: string | null;
    images_json?: any | null;

    translations: Array<{
      lang: string;
      title: string;
      description: string;
      description_short: string;
      wikipedia_url?: string;
      video_url?: string | null;
    }>;

    type_codes: string[];

    media: Array<{
      public_url?: string;
      source_url?: string;
      title?: string;
      caption?: string;
      alt_text?: string;
      role: MediaRole;
      sort_order?: number;
      is_primary?: boolean;
    }>;

    added_by_user_ref?: string | null;
  }>;
};

async function insertRow(table: string, record: any) {
  const { data, error } = await sb().from(table).insert(record).select().single();
  if (error) throw new Error(`${table} insert: ${error.message}`);
  return data;
}
async function updateRow(table: string, match: any, patch: any) {
  const { data, error } = await sb().from(table).update(patch).match(match).select().single();
  if (error) throw new Error(`${table} update: ${error.message}`);
  return data;
}

export async function saveJourney(payload: SaveJourneyPayload) {
  const created = {
    group_event_id: "" as string,
    media_ids: [] as string[],
    ge_attach_ids: [] as string[],
    event_ids: [] as string[],
    ev_trans_ids: [] as string[],
    ev_media_attach_ids: [] as string[],
  };

  try {
    // 1) GROUP EVENT
    const geRow = await insertRow(T.group_events, {
      title: payload.group_event.title,
      cover_url: payload.group_event.cover_url ?? null,
      visibility: payload.group_event.visibility,
      status: payload.group_event.status,
      pitch: payload.group_event.pitch ?? null,
      description: payload.group_event.description ?? null,
      color_hex: payload.group_event.color_hex ?? null,
      icon_name: payload.group_event.icon_name ?? null,
      is_official: payload.group_event.is_official ?? false,
      owner_user_ref: payload.group_event.owner_user_ref ?? null,
      owner_profile_id: payload.group_event.owner_profile_id ?? null,
      code: payload.group_event.code ?? null,
      slug: payload.group_event.slug ?? null,
      workflow_state: payload.group_event.workflow_state ?? null,
      audience_scope: payload.group_event.audience_scope ?? null,
      requested_approval_at: payload.group_event.requested_approval_at ?? null,
      approved_at: payload.group_event.approved_at ?? null,
      approved_by_profile_id: payload.group_event.approved_by_profile_id ?? null,
      refused_at: payload.group_event.refused_at ?? null,
      refused_by_profile_id: payload.group_event.refused_by_profile_id ?? null,
      refusal_reason: payload.group_event.refusal_reason ?? null,

      era_from: payload.group_event.era_from ?? null,
      era_to: payload.group_event.era_to ?? null,
      year_from: payload.group_event.year_from ?? null,
      year_to: payload.group_event.year_to ?? null,

      created_at: ts(),
      updated_at: ts(),
    });

    const group_event_id = geRow.id as string;
    created.group_event_id = group_event_id;

    // 1b) TRADUZIONE opzionale
    if (payload.group_event_translation?.lang) {
      await insertRow(T.ge_trans, {
        group_event_id,
        lang: payload.group_event_translation.lang,
        title: payload.group_event_translation.title ?? null,
        short_name: payload.group_event_translation.short_name ?? null,
        description: payload.group_event_translation.description ?? null,
        video_url: payload.group_event_translation.video_url ?? null,
        created_at: ts(),
        updated_at: ts(),
      });
    }

    // 1c) COVER in media_assets + media_attachments
    if (payload.group_event.cover_url) {
      const cov = await insertRow(T.media, {
        url: payload.group_event.cover_url,
        kind: "image",
        alt_text: `${payload.group_event.title} cover`,
        created_at: ts(),
      });
      created.media_ids.push(cov.id);
      const att = await insertRow(T.attach, {
        media_id: cov.id,
        entity_type: "group_event" as EntityType,
        entity_id: group_event_id,
        role: "cover" as MediaRole,
        position: 0,
        is_primary: true,
        created_at: ts(),
      });
      created.ge_attach_ids.push(att.id);
      await updateRow(T.group_events, { id: group_event_id }, { cover_media_id: cov.id, updated_at: ts() });
    }

    // 1d) VIDEO allegato al group_event (se presente)
    if (payload.video_media_url) {
      const v = await insertRow(T.media, {
        url: payload.video_media_url,
        kind: "video",
        alt_text: `${payload.group_event.title} video`,
        created_at: ts(),
      });
      created.media_ids.push(v.id);
      const att = await insertRow(T.attach, {
        media_id: v.id,
        entity_type: "group_event" as EntityType,
        entity_id: group_event_id,
        role: "attachment" as MediaRole,
        position: 1,
        is_primary: false,
        created_at: ts(),
      });
      created.ge_attach_ids.push(att.id);
    }

    // 2) EVENTS + traduzioni + tipi + media
    for (let i = 0; i < payload.events.length; i++) {
      const ev = payload.events[i];

      // 2a) events_list
      const evRow = await insertRow(T.events, {
        era: ev.era ?? null,
        year_from: ev.year_from ?? null,
        year_to: ev.year_to ?? null,
        exact_date: ev.exact_date ?? null,
        continent: ev.continent ?? null,
        country: ev.country ?? null,
        location: ev.location ?? null,
        latitude: ev.latitude ?? null,
        longitude: ev.longitude ?? null,
        geom: ev.geom ?? null,
        source_event_id: ev.source_event_id ?? null,
        image_url: ev.image_url ?? null,
        images: ev.images_json ?? null,
        created_at: ts(),
        updated_at: ts(),
      });
      const event_id = evRow.id as string;
      created.event_ids.push(event_id);

      // 2b) link evento ↔ group_event
      await insertRow(T.ev_ge, {
        event_id,
        group_event_id,
        role: "primary",
        title: null,
        caption: null,
        alt_text: null,
        added_by_user_ref: ev.added_by_user_ref ?? null,
        created_at: ts(),
      });

      // 2c) event_translations
      for (const tr of ev.translations) {
        const trRow = await insertRow(T.ev_trans, {
          event_id,
          lang: tr.lang,
          title: tr.title,
          description: tr.description ?? "",
          description_short: tr.description_short ?? "",
          wikipedia_url: tr.wikipedia_url ?? null,
          video_url: tr.video_url ?? null,
          created_at: ts(),
          updated_at: ts(),
        });
        created.ev_trans_ids.push(trRow.id);
      }

      // 2d) event_type_map
      for (const code of ev.type_codes || []) {
        await insertRow(T.ev_type_map, {
          event_id,
          type_code: code,
          created_at: ts(),
        });
      }

      // 2e) media per evento
      for (let mIdx = 0; mIdx < (ev.media?.length || 0); mIdx++) {
        const m = ev.media[mIdx];
        const asset = await insertRow(T.media, {
          url: m.public_url ?? m.source_url ?? null,
          source_url: m.source_url ?? null,
          kind: "other",
          alt_text: m.alt_text ?? null,
          created_at: ts(),
        });
        created.media_ids.push(asset.id);

        const att = await insertRow(T.attach, {
          media_id: asset.id,
          entity_type: "event" as EntityType,
          entity_id: event_id,
          role: m.role,
          position: m.sort_order ?? mIdx,
          is_primary: !!m.is_primary,
          title: m.title ?? null,
          caption: m.caption ?? null,
          alt_text: m.alt_text ?? null,
          created_at: ts(),
        });
        created.ev_media_attach_ids.push(att.id);
      }
    }

    revalidatePath("/module/build-journey");
    return { ok: true, group_event_id: created.group_event_id };
  } catch (err: any) {
    // CLEANUP best-effort
    try {
      const s = sb();
      if (created.ev_media_attach_ids.length)
        await s.from(T.attach).delete().in("id", created.ev_media_attach_ids);
      if (created.ge_attach_ids.length)
        await s.from(T.attach).delete().in("id", created.ge_attach_ids);
      if (created.ev_trans_ids.length)
        await s.from(T.ev_trans).delete().in("id", created.ev_trans_ids);
      if (created.event_ids.length)
        await s.from(T.events).delete().in("id", created.event_ids);
      if (created.media_ids.length)
        await s.from(T.media).delete().in("id", created.media_ids);
      if (created.group_event_id)
        await s.from(T.group_events).delete().eq("id", created.group_event_id);
    } catch {}
    throw new Error(`saveJourney failed: ${err.message}`);
  }
}
