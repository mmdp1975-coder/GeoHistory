'use server';

/**
 * GeoHistory – Build Journey (Server Actions) — FULL REPLACEMENT
 * Compatibile con lo schema reale condiviso (2025-10-09)
 *
 * Modalità supportate:
 * 1) buildJourneyFromScratch(payload) → form guidato
 * 2) buildJourneyFromVideo(payload)   → auto-build da URL video (YouTube/Vimeo)
 *
 * NOTE:
 * - Usiamo Supabase Auth Helpers lato server.
 * - Inseriamo solo i campi realmente presenti nelle tabelle che hai condiviso.
 * - Per media: archiviamo il file/URL in `media_assets` e le relazioni in `media_attachments`.
 * - Per `entity_type` usiamo i literal enum: 'group_event' | 'event' (coerente con la tua impostazione).
 */

import { cookies } from 'next/headers';
import { createServerActionClient } from '@supabase/auth-helpers-nextjs';

// ========================= SCHEMA MAP (ADERENTE) =========================

const TBL = {
  groupEvents: 'group_events',
  groupEventTranslations: 'group_event_translations',
  eventsList: 'events_list',
  eventTranslations: 'event_translations',
  eventGroupEvent: 'event_group_event',
  mediaAssets: 'media_assets',
  mediaAttachments: 'media_attachments',
} as const;

const COL = {
  ge: {
    id: 'id',
    slug: 'slug',
    title: 'title',
    pitch: 'pitch',
    coverUrl: 'cover_url',
    description: 'description',
    visibility: 'visibility',
    status: 'status',
    isOfficial: 'is_official',
    ownerUserRef: 'owner_user_ref',
    colorHex: 'color_hex',
    iconName: 'icon_name',
    ownerProfileId: 'owner_profile_id',
  },
  getr: {
    id: 'id',
    groupEventId: 'group_event_id',
    lang: 'lang',
    title: 'title',
    shortName: 'short_name',
    description: 'description',
    videoUrl: 'video_url',
  },
  ev: {
    id: 'id',
    yearFrom: 'year_from',
    yearTo: 'year_to',
    exactDate: 'exact_date',
    era: 'era',
    continent: 'continent',
    country: 'country',
    location: 'location',
    latitude: 'latitude',
    longitude: 'longitude',
    imageUrl: 'image_url',
    images: 'images', // jsonb
  },
  evtr: {
    id: 'id',
    eventId: 'event_id',
    lang: 'lang',
    title: 'title',
    description: 'description',
    descriptionShort: 'description_short',
    wikipediaUrl: 'wikipedia_url',
    videoUrl: 'video_url',
  },
  pvt: {
    id: 'id',
    eventId: 'event_id',
    groupEventId: 'group_event_id',
    addedBy: 'added_by_user_ref',
    createdAt: 'created_at',
  },
  ma: {
    id: 'id',
    storageBucket: 'storage_bucket',
    storagePath: 'storage_path',
    mediaType: 'media_type',      // USER-DEFINED (enum)
    status: 'status',             // USER-DEFINED (enum)
    mimeType: 'mime_type',
    originalFileName: 'original_filename',
    fileSize: 'file_size_bytes',
    checksum: 'checksum_sha256',
    width: 'width',
    height: 'height',
    duration: 'duration_seconds',
    publicUrl: 'public_url',
    previewUrl: 'preview_url',
    sourceUrl: 'source_url',
    credits: 'credits',
    metadata: 'metadata',         // jsonb
    createdBy: 'created_by',
    updatedBy: 'updated_by',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  mat: {
    id: 'id',
    mediaId: 'media_id',
    entityType: 'entity_type',    // USER-DEFINED (enum): 'group_event' | 'event'
    eventId: 'event_id',
    groupEventId: 'group_event_id',
    role: 'role',                 // USER-DEFINED (enum) — es. 'cover' | 'gallery' | 'source'
    title: 'title',
    caption: 'caption',
    altText: 'alt_text',
    isPrimary: 'is_primary',
    sortOrder: 'sort_order',
    createdBy: 'created_by',
    updatedBy: 'updated_by',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    metadata: 'metadata',         // jsonb
    entityId: 'entity_id',        // presente nella tabella ma NON necessario se usiamo event_id/group_event_id
  },
} as const;

// ============================= TYPES ==============================

export type JourneyCore = {
  slug: string;
  title: string;
  pitch?: string | null;
  cover_url?: string | null;
  description?: string | null;
  visibility?: string; // 'private' | 'shared' | 'public' (testo)
  status?: string;     // 'draft' | 'review' | 'published' | ...
  is_official?: boolean;
  owner_user_ref?: string | null; // opzionale
  owner_profile_id?: string | null;
  color_hex?: string | null;
  icon_name?: string | null;
};

export type JourneyI18n = {
  lang: string;
  title: string;
  short_name?: string | null;
  description?: string | null;
  video_url?: string | null;
};

export type MiniMedia = {
  url: string;                      // pubblico o sorgente (youtube, vimeo, immagine http…)
  media_type?: string | null;       // 'image' | 'video' | 'audio' | 'doc' | 'link' (enum nel tuo DB)
  status?: string | null;           // se vuoi valorizzarlo (es. 'active')
  role?: string | null;             // 'cover' | 'gallery' | 'source' (enum nel tuo DB)
  title?: string | null;
  caption?: string | null;
  alt_text?: string | null;
  is_primary?: boolean | null;
  sort_order?: number | null;
  preview_url?: string | null;
  credits?: string | null;
  metadata?: Record<string, any> | null;
};

export type MiniEvent = {
  // campi strutturali events_list:
  year_from: number;
  year_to?: number | null;
  exact_date?: string | null;   // 'YYYY-MM-DD'
  era?: string | null;          // 'BC' | 'AD' | altro
  continent?: string | null;
  country?: string | null;
  location?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  image_url?: string | null;
  images?: any | null;          // jsonb

  // traduzioni evento (almeno una)
  translations: Array<{
    lang: string;
    title: string;
    description?: string | null;
    description_short?: string | null;
    wikipedia_url?: string | null;
    video_url?: string | null;
  }>;

  // media collegati all’evento (facoltativi)
  media?: MiniMedia[];
};

export type BuildJourneyFromScratchPayload = {
  core: JourneyCore;           // dati base group_events
  i18n?: JourneyI18n[];        // traduzioni journey
  events?: MiniEvent[];        // eventi + traduzioni + media
  media?: MiniMedia[];         // media a livello di journey (cover, gallery, source)
};

export type BuildJourneyFromVideoPayload = {
  videoUrl: string;            // YouTube/Vimeo
  lang?: string;               // lingua di default per i18n
  coreDefaults?: Partial<JourneyCore>; // override di base
};

// ======================= UTILS & HELPERS ==========================

function reqStr(v: any, label: string) {
  if (typeof v !== 'string' || !v.trim()) throw new Error(`Campo obbligatorio mancante: ${label}`);
}
function asInt(v: any, label: string) {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`Valore numerico non valido per ${label}`);
  return Math.trunc(n);
}
function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80);
}
function fmtTime(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}

// Parsing capitoli: righe tipo "00:00 Intro" oppure "1:02:30 - Capitolo"
function parseChapters(text: string): { time: number; label: string }[] {
  const lines = (text || '').split(/\r?\n/);
  const out: { time: number; label: string }[] = [];
  const re = /^\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\s+[-–—:]?\s*(.+)$/;
  for (const line of lines) {
    const m = line.match(re);
    if (!m) continue;
    const h = m[1] ? Number(m[1]) : 0;
    const mi = Number(m[2]);
    const s = Number(m[3]);
    const label = m[4].trim();
    const seconds = h * 3600 + mi * 60 + s;
    if (Number.isFinite(seconds) && label) out.push({ time: seconds, label });
  }
  return out;
}

async function getOEmbed(url: string): Promise<{ oembed?: any; provider: 'youtube'|'vimeo'|'link' }> {
  let endpoint: string | null = null;
  let provider: 'youtube'|'vimeo'|'link' = 'link';
  if (/youtu\.be|youtube\.com/i.test(url)) {
    provider = 'youtube';
    endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
  } else if (/vimeo\.com/i.test(url)) {
    provider = 'vimeo';
    endpoint = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`;
  }
  if (!endpoint) return { provider };

  try {
    const res = await fetch(endpoint, { cache: 'no-store' });
    if (!res.ok) return { provider };
    const data = await res.json();
    return { oembed: data, provider };
  } catch {
    return { provider };
  }
}

// Inserisce media_assets e ritorna media_id
async function insertMediaAsset(supabase: ReturnType<typeof createServerActionClient>, mm: MiniMedia) {
  const insert: Record<string, any> = {};
  // Impostiamo un set minimo e sicuro di colonne; il resto è opzionale.
  if (mm.url) {
    // Se è un asset “esterno” (YouTube, img http), usiamo public_url e/o source_url.
    insert[COL.ma.publicUrl] = mm.url;
    // Se il contenuto è un video YouTube/Vimeo, valorizziamo anche source_url:
    if (/youtu\.be|youtube\.com|vimeo\.com/i.test(mm.url)) {
      insert[COL.ma.sourceUrl] = mm.url;
    }
  }
  if (mm.media_type) insert[COL.ma.mediaType] = mm.media_type;
  if (mm.preview_url) insert[COL.ma.previewUrl] = mm.preview_url;
  if (mm.credits) insert[COL.ma.credits] = mm.credits;
  if (mm.metadata) insert[COL.ma.metadata] = mm.metadata;

  const { data, error } = await supabase
    .from(TBL.mediaAssets)
    .insert([insert as any])    // 👈 array + cast per fixare il build
    .select('id')
    .single();

  if (error) throw error;
  return data.id as string;

}

// Collega un media_id a group_event/event in media_attachments
async function attachMedia(
  supabase: ReturnType<typeof createServerActionClient>,
  params: {
    media_id: string;
    entity_type: 'group_event' | 'event';
    group_event_id?: string | null;
    event_id?: string | null;
    role?: string | null;
    title?: string | null;
    caption?: string | null;
    alt_text?: string | null;
    is_primary?: boolean | null;
    sort_order?: number | null;
    metadata?: Record<string, any> | null;
  }
) {
  const payload: Record<string, any> = {
    [COL.mat.mediaId]: params.media_id,
    [COL.mat.entityType]: params.entity_type, // enum: 'group_event' | 'event'
    [COL.mat.role]: params.role ?? null,
    [COL.mat.title]: params.title ?? null,
    [COL.mat.caption]: params.caption ?? null,
    [COL.mat.altText]: params.alt_text ?? null,
    [COL.mat.isPrimary]: params.is_primary ?? null,
    [COL.mat.sortOrder]: params.sort_order ?? null,
    [COL.mat.metadata]: params.metadata ?? null,
  };
  if (params.entity_type === 'group_event') {
    payload[COL.mat.groupEventId] = params.group_event_id;
    payload[COL.mat.eventId] = null;
  } else {
    payload[COL.mat.eventId] = params.event_id;
    payload[COL.mat.groupEventId] = null;
  }
  const { error } = await supabase.from(TBL.mediaAttachments).insert(payload);
  if (error) throw error;
}

// Inserisce un array di media e li collega
async function upsertMediaArray(
  supabase: ReturnType<typeof createServerActionClient>,
  arr: MiniMedia[] | undefined,
  linkTo: { type: 'group_event'; id: string } | { type: 'event'; id: string }
) {
  if (!arr || arr.length === 0) return;
  for (let i = 0; i < arr.length; i++) {
    const m = arr[i];
    if (!m?.url?.trim()) continue;
    const media_id = await insertMediaAsset(supabase, m);
    await attachMedia(supabase, {
      media_id,
      entity_type: linkTo.type,
      group_event_id: linkTo.type === 'group_event' ? linkTo.id : null,
      event_id: linkTo.type === 'event' ? linkTo.id : null,
      role: m.role ?? null,
      title: m.title ?? null,
      caption: m.caption ?? null,
      alt_text: m.alt_text ?? null,
      is_primary: m.is_primary ?? (m.role === 'cover' ? true : null),
      sort_order: m.sort_order ?? i,
      metadata: m.metadata ?? null,
    });
  }
}

// ======================== PUBLIC ACTIONS ==========================

/**
 * Costruzione guidata da form
 */
export async function buildJourneyFromScratch(payload: BuildJourneyFromScratchPayload) {
  const supabase = createServerActionClient({ cookies });

  // ---- validazioni principali
  reqStr(payload?.core?.slug, 'core.slug');
  reqStr(payload?.core?.title, 'core.title');

  // 1) Crea group_events (Journey)
  const geInsert: Record<string, any> = {
    [COL.ge.slug]: payload.core.slug.trim(),
    [COL.ge.title]: payload.core.title.trim(),
    [COL.ge.pitch]: payload.core.pitch ?? null,
    [COL.ge.coverUrl]: payload.core.cover_url ?? null,
    [COL.ge.description]: payload.core.description ?? null,
    [COL.ge.visibility]: payload.core.visibility ?? 'private',
    [COL.ge.status]: payload.core.status ?? 'draft',
    [COL.ge.isOfficial]: payload.core.is_official ?? false,
    [COL.ge.ownerUserRef]: payload.core.owner_user_ref ?? null,
    [COL.ge.colorHex]: payload.core.color_hex ?? null,
    [COL.ge.iconName]: payload.core.icon_name ?? null,
  };
  if (payload.core.owner_profile_id) geInsert[COL.ge.ownerProfileId] = payload.core.owner_profile_id;

  const { data: ge, error: geErr } = await supabase.from(TBL.groupEvents).insert(geInsert).select().single();
  if (geErr) throw geErr;
  const geId = ge[COL.ge.id] as string;

  // 2) Traduzioni Journey (opzionali)
  if (payload.i18n?.length) {
    for (const t of payload.i18n) {
      reqStr(t.lang, 'i18n.lang');
      reqStr(t.title, 'i18n.title');
      const trIns = {
        [COL.getr.groupEventId]: geId,
        [COL.getr.lang]: t.lang,
        [COL.getr.title]: t.title,
        [COL.getr.shortName]: t.short_name ?? null,
        [COL.getr.description]: t.description ?? null,
        [COL.getr.videoUrl]: t.video_url ?? null,
      };
      const { error } = await supabase.from(TBL.groupEventTranslations).insert(trIns);
      if (error) throw error;
    }
  }

  // 3) Media Journey (opzionali)
  if (payload.media?.length) {
    await upsertMediaArray(supabase, payload.media, { type: 'group_event', id: geId });
  }

  // 4) Eventi (opzionali)
  if (payload.events?.length) {
    for (let i = 0; i < payload.events.length; i++) {
      const e = payload.events[i];
      // Validazioni base evento
      const yf = asInt(e.year_from, `events[${i}].year_from`);
      let yt: number | null = null;
      if (e.year_to != null && e.year_to !== undefined && e.year_to !== '') {
        yt = asInt(e.year_to, `events[${i}].year_to`);
        if (yt < yf) throw new Error(`Intervallo non valido evento ${i}: year_to < year_from`);
      }

      // 4.1 Inserisci events_list
      const evIns: Record<string, any> = {
        [COL.ev.yearFrom]: yf,
        [COL.ev.yearTo]: yt,
        [COL.ev.exactDate]: e.exact_date ?? null,
        [COL.ev.era]: e.era ?? null,
        [COL.ev.continent]: e.continent ?? null,
        [COL.ev.country]: e.country ?? null,
        [COL.ev.location]: e.location ?? null,
        [COL.ev.latitude]: e.latitude ?? null,
        [COL.ev.longitude]: e.longitude ?? null,
        [COL.ev.imageUrl]: e.image_url ?? null,
        [COL.ev.images]: e.images ?? null,
      };
      const { data: evd, error: evErr } = await supabase.from(TBL.eventsList).insert(evIns).select().single();
      if (evErr) throw evErr;
      const evId = evd[COL.ev.id] as string;

      // 4.2 Traduzioni evento (almeno una)
      if (!e.translations?.length) throw new Error(`events[${i}].translations è obbligatorio (min 1)`);
      for (const tr of e.translations) {
        reqStr(tr.lang, `events[${i}].translations.lang`);
        reqStr(tr.title, `events[${i}].translations.title`);
        const evTrIns: Record<string, any> = {
          [COL.evtr.eventId]: evId,
          [COL.evtr.lang]: tr.lang,
          [COL.evtr.title]: tr.title,
          [COL.evtr.description]: tr.description ?? null,
          [COL.evtr.descriptionShort]: tr.description_short ?? null,
          [COL.evtr.wikipediaUrl]: tr.wikipedia_url ?? null,
          [COL.evtr.videoUrl]: tr.video_url ?? null,
        };
        const { error } = await supabase.from(TBL.eventTranslations).insert(evTrIns);
        if (error) throw error;
      }

      // 4.3 Pivot
      const { error: pErr } = await supabase.from(TBL.eventGroupEvent).insert({
        [COL.pvt.eventId]: evId,
        [COL.pvt.groupEventId]: geId,
        [COL.pvt.addedBy]: null,
      });
      if (pErr) throw pErr;

      // 4.4 Media evento (opzionali)
      if (e.media?.length) {
        await upsertMediaArray(supabase, e.media, { type: 'event', id: evId });
      }
    }
  }

  return { ok: true, group_event_id: geId, message: 'Journey creato con successo.' };
}

/**
 * Costruzione automatica da URL Video (YouTube/Vimeo)
 * - oEmbed (title/description/thumbnail)
 * - parsing capitoli con timestamp → eventi
 * - media: video come 'source', thumbnail come 'cover'
 */
export async function buildJourneyFromVideo(payload: BuildJourneyFromVideoPayload) {
  const supabase = createServerActionClient({ cookies });
  reqStr(payload.videoUrl, 'videoUrl');

  const { oembed, provider } = await getOEmbed(payload.videoUrl);
  const mainTitle: string = (oembed?.title as string) || 'Untitled Journey';
  const description: string = (oembed?.description as string) || null as any;
  const thumb: string | null = (oembed as any)?.thumbnail_url ?? null;
  const author: string | null = (oembed as any)?.author_name ?? null;
  const chapters = parseChapters(description || '');

  // 1) Journey base
  const slug = slugify(mainTitle);
  const geInsert: Record<string, any> = {
    [COL.ge.slug]: payload.coreDefaults?.slug ?? slug,
    [COL.ge.title]: payload.coreDefaults?.title ?? mainTitle,
    [COL.ge.pitch]: payload.coreDefaults?.pitch ?? (author ? `By ${author}` : null),
    [COL.ge.coverUrl]: payload.coreDefaults?.cover_url ?? thumb,
    [COL.ge.description]: payload.coreDefaults?.description ?? description,
    [COL.ge.visibility]: payload.coreDefaults?.visibility ?? 'private',
    [COL.ge.status]: payload.coreDefaults?.status ?? 'draft',
    [COL.ge.isOfficial]: payload.coreDefaults?.is_official ?? false,
    [COL.ge.ownerUserRef]: payload.coreDefaults?.owner_user_ref ?? null,
    [COL.ge.colorHex]: payload.coreDefaults?.color_hex ?? null,
    [COL.ge.iconName]: payload.coreDefaults?.icon_name ?? null,
  };
  if (payload.coreDefaults?.owner_profile_id) geInsert[COL.ge.ownerProfileId] = payload.coreDefaults.owner_profile_id;

  const { data: ge, error: geErr } = await supabase.from(TBL.groupEvents).insert(geInsert).select().single();
  if (geErr) throw geErr;
  const geId = ge[COL.ge.id] as string;

  // 2) Traduzione principale
  const lang = payload.lang ?? 'en';
  const { error: trErr } = await supabase.from(TBL.groupEventTranslations).insert({
    [COL.getr.groupEventId]: geId,
    [COL.getr.lang]: lang,
    [COL.getr.title]: mainTitle,
    [COL.getr.shortName]: null,
    [COL.getr.description]: description,
    [COL.getr.videoUrl]: payload.videoUrl,
  });
  if (trErr) throw trErr;

  // 3) Media: video (source) + thumbnail (cover)
  const mediaJourney: MiniMedia[] = [
    { url: payload.videoUrl, media_type: 'video', role: 'source', title: mainTitle, metadata: oembed || undefined },
  ];
  if (thumb) mediaJourney.push({ url: thumb, media_type: 'image', role: 'cover', title: `${mainTitle} (thumbnail)` });
  await upsertMediaArray(supabase, mediaJourney, { type: 'group_event', id: geId });

  // 4) Eventi dai capitoli (se esistono)
  const yearNow = new Date().getFullYear();
  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    // (Non abbiamo date storiche; usiamo un placeholder coerente)
    const evIns: Record<string, any> = {
      [COL.ev.yearFrom]: yearNow,
      [COL.ev.yearTo]: yearNow,
      [COL.ev.exactDate]: null,
      [COL.ev.era]: 'AD',
      [COL.ev.continent]: null,
      [COL.ev.country]: null,
      [COL.ev.location]: null,
      [COL.ev.latitude]: null,
      [COL.ev.longitude]: null,
      [COL.ev.imageUrl]: null,
      [COL.ev.images]: null,
    };
    const { data: evd, error: evErr } = await supabase.from(TBL.eventsList).insert(evIns).select().single();
    if (evErr) throw evErr;
    const evId = evd[COL.ev.id] as string;

    // traduzione evento con titolo = label capitolo
    const evTitle = ch.label || `Chapter ${i + 1}`;
    const { error: trE } = await supabase.from(TBL.eventTranslations).insert({
      [COL.evtr.eventId]: evId,
      [COL.evtr.lang]: lang,
      [COL.evtr.title]: evTitle,
      [COL.evtr.description]: `Chapter starting at ${fmtTime(ch.time)}.`,
      [COL.evtr.descriptionShort]: null,
      [COL.evtr.wikipediaUrl]: null,
      [COL.evtr.videoUrl]: payload.videoUrl,
    });
    if (trE) throw trE;

    // pivot
    const { error: pErr } = await supabase.from(TBL.eventGroupEvent).insert({
      [COL.pvt.eventId]: evId,
      [COL.pvt.groupEventId]: geId,
      [COL.pvt.addedBy]: null,
    });
    if (pErr) throw pErr;
  }

  return { ok: true, group_event_id: geId, message: 'Journey creato automaticamente dal video.' };
}
