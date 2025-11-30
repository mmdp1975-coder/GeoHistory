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
import { supabaseAdmin } from "@/lib/supabaseServerClient";
import { YoutubeTranscript } from "youtube-transcript";
import { z } from "zod";
import OpenAI from "openai";

type Visibility = "private" | "public";
type MediaRole = "cover" | "attachment" | "gallery";
export type MediaKind = "image" | "video" | "other";
type MediaAssetType = "image" | "video" | "audio" | "document";

export type GroupEventMediaEntry = {
  public_url?: string;
  source_url?: string;
  title?: string;
  caption?: string;
  alt_text?: string;
  role?: MediaRole;
  sort_order?: number;
  is_primary?: boolean;
  kind?: MediaKind;
};
type EntityType = "group_event" | "event";

type GroupEventTranslationPayload = {
  lang: string;
  title?: string;
  description?: string;
};

type EventTranslationPayload = {
  id?: string;
  lang: string;
  title?: string;
  description_short?: string;
  description?: string;
  wikipedia_url?: string;
  video_url?: string;
};

type EventCorrelationPayload = {
  group_event_id: string;
  correlation_type?: string | null;
};

const DEFAULT_LANGUAGE = "it";

// ====== Mappatura tabelle (aggiorna se necessario) ======
const T = {
  group_events: "group_events",
  ge_trans: "group_event_translations",
  events: "events_list",
  ev_trans: "event_translations",
  ev_ge: "event_group_event",
  ev_type_map: "event_type_map",
  media: "media_assets",
  attach: "media_attachments",
  ev_corr: "event_group_event_correlated",
  ev_types: "event_types",
} as const;

const normalizeTypeId = (val: any) => {
  if (val == null) return null;
  return String(val).trim() || null;
};

function sb() {
  return supabaseAdmin;
}
function ts() {
  return new Date().toISOString();
}

function toMediaAssetType(kind?: MediaKind | null): MediaAssetType {
  if (kind === "video") return "video";
  if (kind === "image") return "image";
  // Bucket anything unknown/other as document to fit the enum.
  return "document";
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
          description: "",
          cover_url: thumbnail,
          visibility: "private" as Visibility,
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
  group_event_id?: string;
  group_event: {
    cover_url?: string;
    visibility: Visibility;
    description?: string;
    language?: string;

    allow_fan?: boolean;
    allow_stud_high?: boolean;
    allow_stud_middle?: boolean;
    allow_stud_primary?: boolean;

    code?: string;
    slug?: string;
    owner_profile_id?: string;
    workflow_state?: string;
    requested_approval_at?: string;
    approved_at?: string;
    approved_by_profile_id?: string;
    refused_at?: string;
    refused_by_profile_id?: string;
    refusal_reason?: string;

    created_at?: string;
    updated_at?: string;

  };

  group_event_translations?: GroupEventTranslationPayload[];
  deleted_group_event_translation_langs?: string[];

  video_media_url?: string | null;

  group_event_media?: GroupEventMediaEntry[];

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

export type JourneyEventEditPayload = {
  event_id?: string;
  event: {
    era?: "AD" | "BC" | null;
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
  };
  translation?: EventTranslationPayload | null;
  type_codes?: string[];
  media?: GroupEventMediaEntry[];
  correlations?: EventCorrelationPayload[];
  added_by_user_ref?: string | null;
};

export type SaveJourneyEventsPayload = {
  group_event_id: string;
  events: JourneyEventEditPayload[];
  delete_event_ids?: string[];
};

async function insertRow(table: string, record: any) {
  const { data, error } = await sb().from(table).insert(record).select().single();
  if (error) throw new Error(`${table} insert: ${error.message}`);
  return data;
}
async function updateRow(table: string, match: any, patch: any) {
  const { error } = await sb().from(table).update(patch).match(match);
  if (error) throw new Error(`${table} update: ${error.message}`);
  return true;
}

async function findOrCreateMediaAsset({
  url,
  kind,
  sourceUrl,
}: {
  url: string;
  kind?: MediaKind | null;
  sourceUrl?: string | null;
}) {
  const { data, error } = await sb()
    .from(T.media)
    .select("id")
    .eq("storage_bucket", "public")
    .eq("storage_path", url)
    .maybeSingle();
  if (error && error.code !== "PGRST116") {
    throw new Error(`media select: ${error.message}`);
  }
  if (data?.id) {
    return data;
  }
  return insertRow(T.media, {
    storage_bucket: "public",
    storage_path: url,
    public_url: url,
    source_url: sourceUrl ?? url,
    media_type: toMediaAssetType(kind),
    status: "ready",
    created_at: ts(),
  });
}

async function upsertGroupEventTranslations(
  group_event_id: string,
  translations?: GroupEventTranslationPayload[] | null,
) {
  const payloads =
    translations
      ?.map((translation) => ({
        ...translation,
        lang: translation.lang?.trim(),
      }))
      .filter((translation) => translation.lang && translation.lang.length)
      .map((translation) => ({
        group_event_id,
        lang: translation.lang as string,
        title: translation.title ?? null,
        description: translation.description ?? null,
      })) ?? [];
  if (!payloads.length) {
    return null;
  }
  const { error } = await sb()
    .from(T.ge_trans)
    .upsert(payloads, { onConflict: "group_event_id,lang" })
    .select();
  if (error) throw new Error(`group_event_translations upsert: ${error.message}`);
  return true;
}

async function deleteGroupEventTranslations(
  group_event_id: string,
  langs?: string[] | null,
) {
  const trimmed = (langs ?? []).map((lang) => lang.trim()).filter(Boolean);
  if (!trimmed.length) {
    return null;
  }
  const { error } = await sb()
    .from(T.ge_trans)
    .delete()
    .eq("group_event_id", group_event_id)
    .in("lang", trimmed);
  if (error) throw new Error(`group_event_translations delete: ${error.message}`);
  return true;
}

function normalizeDeletedTranslationLangs(
  deleted?: string[] | null,
  translations?: GroupEventTranslationPayload[] | null,
) {
  const normalizedDeleted = (deleted ?? []).map((lang) => lang.trim()).filter(Boolean);
  if (!normalizedDeleted.length) {
    return [];
  }
  const translationLangs = new Set((translations ?? []).map((tr) => tr.lang));
  return normalizedDeleted.filter((lang) => !translationLangs.has(lang));
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
    const now = ts();
    const fallbackTitle =
      payload.group_event_translations?.[0]?.title?.trim() ||
      payload.group_event.slug ||
      payload.group_event.code ||
      "journey";
  const groupEventPayload = {
    visibility: payload.group_event.visibility,
    allow_fan: payload.group_event.allow_fan ?? false,
      allow_stud_high: payload.group_event.allow_stud_high ?? false,
      allow_stud_middle: payload.group_event.allow_stud_middle ?? false,
      allow_stud_primary: payload.group_event.allow_stud_primary ?? false,
      owner_profile_id: payload.group_event.owner_profile_id ?? null,
      code: payload.group_event.code ?? null,
      slug: payload.group_event.slug ?? null,
      workflow_state: payload.group_event.workflow_state ?? null,
      requested_approval_at: payload.group_event.requested_approval_at ?? null,
      approved_at: payload.group_event.approved_at ?? null,
      approved_by_profile_id: payload.group_event.approved_by_profile_id ?? null,
      refused_at: payload.group_event.refused_at ?? null,
      refused_by_profile_id: payload.group_event.refused_by_profile_id ?? null,
      refusal_reason: payload.group_event.refusal_reason ?? null,
    };
    const galleryOnlyMedia = (payload.group_event_media ?? []).filter(
      (m) => (m.role ?? "gallery") !== "cover",
    );

    if (payload.group_event_id) {
      await updateRow(T.group_events, { id: payload.group_event_id }, {
        ...groupEventPayload,
        updated_at: now,
      });
      const deletedLangs = normalizeDeletedTranslationLangs(
        payload.deleted_group_event_translation_langs,
        payload.group_event_translations,
      );
      await deleteGroupEventTranslations(payload.group_event_id, deletedLangs);
      await upsertGroupEventTranslations(payload.group_event_id, payload.group_event_translations);
      if (galleryOnlyMedia.length) {
        await sb()
          .from(T.attach)
          .delete()
          .eq("entity_type", "group_event")
          .eq("group_event_id", payload.group_event_id)
          .eq("role", "gallery");
        for (let mIdx = 0; mIdx < galleryOnlyMedia.length; mIdx++) {
          const m = galleryOnlyMedia[mIdx];
          const resolvedUrl = m.public_url ?? m.source_url ?? null;
          if (!resolvedUrl) {
            continue;
          }
          const asset = await findOrCreateMediaAsset({
            url: resolvedUrl,
            kind: m.kind,
            sourceUrl: m.source_url ?? m.public_url ?? resolvedUrl,
          });
          if (asset?.id) {
            created.media_ids.push(asset.id);
            const att = await insertRow(T.attach, {
              media_id: asset.id,
              entity_type: "group_event" as EntityType,
              group_event_id: payload.group_event_id,
              role: m.role ?? "gallery",
              sort_order: m.sort_order ?? mIdx,
              is_primary: !!m.is_primary,
              title: m.title ?? null,
              caption: m.caption ?? null,
              alt_text: m.alt_text ?? null,
              created_at: ts(),
            });
            created.ge_attach_ids.push(att.id);
          }
        }
      }
      return { ok: true, group_event_id: payload.group_event_id };
    }

    // 1) GROUP EVENT
    const geRow = await insertRow(T.group_events, {
      ...groupEventPayload,
      created_at: now,
      updated_at: now,
    });

    const group_event_id = geRow.id as string;
    created.group_event_id = group_event_id;

    const deletedLangs = normalizeDeletedTranslationLangs(
      payload.deleted_group_event_translation_langs,
      payload.group_event_translations,
    );
    await deleteGroupEventTranslations(group_event_id, deletedLangs);
    await upsertGroupEventTranslations(group_event_id, payload.group_event_translations);

    // 1c) COVER in media_assets + media_attachments
    if (payload.group_event.cover_url) {
      const cov = await findOrCreateMediaAsset({
        url: payload.group_event.cover_url,
        kind: "image",
        sourceUrl: payload.group_event.cover_url,
      });
      if (cov?.id) {
        created.media_ids.push(cov.id);
        const att = await insertRow(T.attach, {
          media_id: cov.id,
          entity_type: "group_event" as EntityType,
          group_event_id,
          role: "cover" as MediaRole,
          sort_order: 0,
          is_primary: true,
          created_at: ts(),
        });
        created.ge_attach_ids.push(att.id);
        await updateRow(T.group_events, { id: group_event_id }, { cover_media_id: cov.id, updated_at: ts() });
      }
    }

    // 1d) VIDEO allegato al group_event (se presente)
    if (payload.video_media_url) {
      const v = await findOrCreateMediaAsset({
        url: payload.video_media_url,
        kind: "video",
        sourceUrl: payload.video_media_url,
      });
      if (v?.id) {
        created.media_ids.push(v.id);
        const att = await insertRow(T.attach, {
          media_id: v.id,
          entity_type: "group_event" as EntityType,
          group_event_id,
          role: "attachment" as MediaRole,
          sort_order: 1,
          is_primary: false,
          created_at: ts(),
        });
        created.ge_attach_ids.push(att.id);
      }
    }

    if (galleryOnlyMedia.length) {
      await sb()
        .from(T.attach)
        .delete()
        .eq("entity_type", "group_event")
        .eq("group_event_id", group_event_id)
        .eq("role", "gallery");

      for (let mIdx = 0; mIdx < galleryOnlyMedia.length; mIdx++) {
        const m = galleryOnlyMedia[mIdx];
        const resolvedUrl = m.public_url ?? m.source_url ?? null;
        if (!resolvedUrl) {
          continue;
        }
        const asset = await findOrCreateMediaAsset({
          url: resolvedUrl,
          kind: m.kind,
          sourceUrl: m.source_url ?? m.public_url ?? resolvedUrl,
        });
        if (asset?.id) {
          created.media_ids.push(asset.id);
          const att = await insertRow(T.attach, {
            media_id: asset.id,
            entity_type: "group_event" as EntityType,
            group_event_id,
            role: m.role ?? "gallery",
            sort_order: m.sort_order ?? mIdx,
            is_primary: !!m.is_primary,
            title: m.title ?? null,
            caption: m.caption ?? null,
            alt_text: m.alt_text ?? null,
            created_at: ts(),
          });
          created.ge_attach_ids.push(att.id);
        }
      }
    }

    // 2) EVENTS + traduzioni + tipi + media
    for (let i = 0; i < payload.events.length; i++) {
      const ev = payload.events[i];

      // 2a) events_list
      const firstType = Array.isArray(ev.type_codes) ? normalizeTypeId(ev.type_codes[0]) : null;
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
        event_types_id: firstType ?? null,
        created_at: ts(),
      });
      const event_id = evRow.id as string;
      created.event_ids.push(event_id);

      // 2b) link evento ↔ group_event
      await insertRow(T.ev_ge, {
        event_id,
        group_event_id,
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
        });
      }

      // 2e) media per evento
      for (let mIdx = 0; mIdx < (ev.media?.length || 0); mIdx++) {
        const m = ev.media[mIdx];
        const resolvedUrl = m.public_url ?? m.source_url ?? null;
        if (!resolvedUrl) {
          continue;
        }
        const asset = await insertRow(T.media, {
          storage_bucket: "public",
          storage_path: resolvedUrl,
          public_url: resolvedUrl,
          source_url: m.source_url ?? m.public_url ?? resolvedUrl,
          media_type: toMediaAssetType((m as any).kind ?? null),
          status: "ready",
          created_at: ts(),
        });
        created.media_ids.push(asset.id);

        const att = await insertRow(T.attach, {
          media_id: asset.id,
          entity_type: "event" as EntityType,
          event_id,
          role: m.role,
          sort_order: m.sort_order ?? mIdx,
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

export async function saveJourneyEvents(payload: SaveJourneyEventsPayload) {
  if (!payload.group_event_id) {
    throw new Error("group_event_id mancante.");
  }
  const now = ts();
  const processedEventIds: string[] = [];
  const toDelete = new Set(payload.delete_event_ids ?? []);
  try {
    for (const item of payload.events ?? []) {
      // 1) upsert event
      let event_id = item.event_id;
      const base = item.event || {};
      const typeCodes =
        Array.isArray(item.type_codes) && item.type_codes.length
          ? item.type_codes.map((code) => normalizeTypeId(code)).filter(Boolean)
          : [];
      const firstType = typeCodes[0] ?? normalizeTypeId((base as any).event_types_id);
      if (event_id) {
        await updateRow(T.events, { id: event_id }, {
          era: base.era ?? null,
          year_from: base.year_from ?? null,
          year_to: base.year_to ?? null,
          exact_date: base.exact_date ?? null,
          continent: base.continent ?? null,
          country: base.country ?? null,
          location: base.location ?? null,
          latitude: base.latitude ?? null,
          longitude: base.longitude ?? null,
          geom: base.geom ?? null,
          source_event_id: base.source_event_id ?? null,
          image_url: base.image_url ?? null,
          images: base.images_json ?? null,
          event_types_id: firstType ?? null,
        });
      } else {
        const evRow = await insertRow(T.events, {
          era: base.era ?? null,
          year_from: base.year_from ?? null,
          year_to: base.year_to ?? null,
          exact_date: base.exact_date ?? null,
          continent: base.continent ?? null,
          country: base.country ?? null,
          location: base.location ?? null,
          latitude: base.latitude ?? null,
          longitude: base.longitude ?? null,
          geom: base.geom ?? null,
          source_event_id: base.source_event_id ?? null,
          image_url: base.image_url ?? null,
          images: base.images_json ?? null,
          event_types_id: firstType ?? null,
          created_at: now,
        });
        event_id = evRow.id;
      }
      if (!event_id) {
        throw new Error("event_id non risolto.");
      }
      processedEventIds.push(event_id);
      toDelete.delete(event_id);

      // 2) upsert translation (solo lang fornita)
      const translationsArray =
        (item as any).translations && Array.isArray((item as any).translations)
          ? ((item as any).translations as EventTranslationPayload[])
          : (item.translation?.lang ? [item.translation] : []);

      if (translationsArray.length) {
        await sb().from(T.ev_trans).delete().eq("event_id", event_id);
        const payloads = translationsArray
          .map((tr) => ({
            event_id,
            lang: tr.lang || DEFAULT_LANGUAGE,
            title: tr.title ?? null,
            description_short: tr.description_short ?? null,
            description: tr.description ?? null,
            wikipedia_url: tr.wikipedia_url ?? null,
            video_url: tr.video_url ?? null,
          }))
          .filter((tr) => tr.lang);
        if (payloads.length) {
          const { error: trError } = await sb().from(T.ev_trans).upsert(payloads, { onConflict: "event_id,lang" }).select();
          if (trError) throw new Error(`event_translations upsert: ${trError.message}`);
        }
      } else if (item.translation?.lang) {
        const tr = item.translation;
        const { error: trError } = await sb()
          .from(T.ev_trans)
          .upsert(
            [
              {
                event_id,
                lang: tr.lang,
                title: tr.title ?? null,
            description_short: tr.description_short ?? null,
            description: tr.description ?? null,
            wikipedia_url: tr.wikipedia_url ?? null,
            video_url: tr.video_url ?? null,
          },
        ],
        { onConflict: "event_id,lang" },
      )
      .select();
        if (trError) throw new Error(`event_translations upsert: ${trError.message}`);
      }

      // 3) replace type_map
      await sb().from(T.ev_type_map).delete().eq("event_id", event_id);
      for (const code of typeCodes) {
        await insertRow(T.ev_type_map, {
          event_id,
          type_code: code,
        });
      }

      // 4) replace media (attachments + assets)
      await sb()
        .from(T.attach)
        .delete()
        .eq("entity_type", "event")
        .eq("event_id", event_id);

      for (let mIdx = 0; mIdx < (item.media?.length || 0); mIdx++) {
        const m = item.media![mIdx];
        const resolvedUrl = m.public_url ?? m.source_url ?? null;
        if (!resolvedUrl) continue;
        const asset = await insertRow(T.media, {
          storage_bucket: "public",
          storage_path: resolvedUrl,
          public_url: resolvedUrl,
          source_url: m.source_url ?? m.public_url ?? resolvedUrl,
          media_type: toMediaAssetType(m.kind),
          status: "ready",
          created_at: now,
        });
        const att = await insertRow(T.attach, {
          media_id: asset.id,
          entity_type: "event" as EntityType,
          event_id,
          role: m.role ?? "gallery",
          sort_order: m.sort_order ?? mIdx,
          is_primary: !!m.is_primary,
          title: m.title ?? null,
          caption: m.caption ?? null,
          alt_text: m.alt_text ?? null,
          created_at: now,
        });
        // track ids for potential cleanup not needed here
      }

      // 5) ensure link event_group_event
      await sb()
        .from(T.ev_ge)
        .delete()
        .eq("event_id", event_id)
        .eq("group_event_id", payload.group_event_id);
      await insertRow(T.ev_ge, {
        event_id,
        group_event_id: payload.group_event_id,
        added_by_user_ref: item.added_by_user_ref ?? null,
        created_at: now,
      });

      // 6) correlations
      await sb().from(T.ev_corr).delete().eq("event_id", event_id);
      const sanitizedCorrs = (item.correlations ?? [])
        .map((corr) => ({
          group_event_id: normalizeTypeId(corr.group_event_id),
          correlation_type: corr.correlation_type ?? "related",
        }))
        .filter((corr) => !!corr.group_event_id);
      for (const corr of sanitizedCorrs) {
        await insertRow(T.ev_corr, {
          event_id,
          group_event_id: corr.group_event_id,
          correlation_type: corr.correlation_type ?? "related",
          created_at: now,
        });
      }
    }

    // Delete requested events (only if not processed)
    for (const event_id of Array.from(toDelete)) {
      await sb().from(T.attach).delete().eq("entity_type", "event").eq("event_id", event_id);
      await sb().from(T.ev_type_map).delete().eq("event_id", event_id);
      await sb().from(T.ev_trans).delete().eq("event_id", event_id);
      await sb().from(T.ev_corr).delete().eq("event_id", event_id);
      await sb().from(T.ev_ge).delete().eq("event_id", event_id).eq("group_event_id", payload.group_event_id);
      await sb().from(T.events).delete().eq("id", event_id);
    }

    revalidatePath("/module/build-journey");
    return { ok: true, event_ids: processedEventIds };
  } catch (err: any) {
    throw new Error(`saveJourneyEvents failed: ${err.message}`);
  }
}

export async function deleteJourneyCascade(group_event_id: string) {
  if (!group_event_id) throw new Error("group_event_id mancante.");
  try {
    const { data: evLinks, error: linksError } = await sb()
      .from(T.ev_ge)
      .select("event_id")
      .eq("group_event_id", group_event_id);
    if (linksError) throw linksError;
    const eventIds = (evLinks ?? []).map((row) => row.event_id).filter(Boolean);

    if (eventIds.length) {
      await sb().from(T.ev_corr).delete().in("event_id", eventIds);
      await sb().from(T.attach).delete().eq("entity_type", "event").in("event_id", eventIds);
      await sb().from(T.ev_type_map).delete().in("event_id", eventIds);
      await sb().from(T.ev_trans).delete().in("event_id", eventIds);
      await sb().from(T.ev_ge).delete().in("event_id", eventIds);
      await sb().from(T.events).delete().in("id", eventIds);
    }

    await sb().from(T.ev_corr).delete().eq("group_event_id", group_event_id);
    await sb().from(T.attach).delete().eq("entity_type", "group_event").eq("group_event_id", group_event_id);
    await sb().from(T.ge_trans).delete().eq("group_event_id", group_event_id);
    await sb().from(T.group_events).delete().eq("id", group_event_id);
    revalidatePath("/module/build-journey");
    return { ok: true };
  } catch (err: any) {
    throw new Error(`deleteJourney failed: ${err.message}`);
  }
}

export async function requestJourneyApproval(group_event_id: string) {
  if (!group_event_id) throw new Error("group_event_id mancante.");
  try {
    const now = ts();
    const { error } = await sb()
      .from(T.group_events)
      .update({ workflow_state: "submitted", requested_approval_at: now })
      .eq("id", group_event_id);
    if (error) throw error;
    revalidatePath("/module/build-journey");
    return { ok: true, requested_approval_at: now };
  } catch (err: any) {
    throw new Error(`requestJourneyApproval failed: ${err.message}`);
  }
}
