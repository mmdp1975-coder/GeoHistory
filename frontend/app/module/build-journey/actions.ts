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
    createdBy: 'created_by',
    visibility: 'visibility', // 'private' | 'shared' | 'public'
    status: 'status',         // 'draft' | 'review' | 'published' | 'refused'
    place: 'place',
    country: 'country',
    continent: 'continent',
    latitude: 'latitude',
    longitude: 'longitude',
    yearFrom: 'year_from',
    yearTo: 'year_to',
    era: 'era',               // 'BC' | 'AD'
    exactDate: 'exact_date',  // date | null
    tags: 'tags',             // text[] | null
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
    place: 'location',
    country: 'country',
    continent: 'continent',
    latitude: 'latitude',
    longitude: 'longitude',
    yearFrom: 'year_from',
    yearTo: 'year_to',
    era: 'era',
    exactDate: 'exact_date',
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
    addedBy: 'added_by',
  },
  ma: {
    id: 'id',
    url: 'url',
    kind: 'kind',          // 'image' | 'video' | 'audio' | 'doc' | ...
    mime: 'mime_type',
    metadata: 'metadata',  // jsonb
    createdBy: 'created_by',
  },
  matt: {
    id: 'id',
    mediaId: 'media_id',
    entityType: 'entity_type', // 'group_event' | 'event'
    entityId: 'entity_id',
    role: 'role',              // 'cover' | 'gallery' | 'doc' | ...
    position: 'position',
  },
} as const;

// ========================= UTILS =========================

type Json = any;

function assert(value: unknown, msg: string): asserts value {
  if (!value) throw new Error(msg);
}

function nowIso(): string {
  return new Date().toISOString();
}

function safeNum(n: any, def: number | null = null): number | null {
  const v = Number(n);
  return isFinite(v) ? v : def;
}

function fmtTime(sec: number) {
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ========================= CLIENT SUPABASE (SERVER) =========================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function getSupabaseServer() {
  return createServerActionClient({ cookies });
}

// ========================= MEDIA HELPERS =========================

type FileInput = File | Blob | { fileId?: string; url?: string } | null | undefined;

async function resolveFileForCurrentEnv(input: FileInput): Promise<Blob> {
  if (!input) throw new Error('No media provided');

  if (input instanceof File || input instanceof Blob) return input;

  if (input?.url) {
    const res = await fetch(input.url);
    if (!res.ok) throw new Error(`Download failed from url: ${input.url}`);
    return await res.blob();
  }

  if (input?.fileId?.startsWith('file-')) {
    const key = process.env.OPENAI_API_KEY;
    assert(key, 'OPENAI_API_KEY is missing on this environment');
    const res = await fetch(`https://api.openai.com/v1/files/${input.fileId}/content`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) throw new Error(`OpenAI file not accessible: ${input.fileId}`);
    return await res.blob();
  }

  throw new Error('Unsupported media input: provide File/Blob, public url, or fileId');
}

async function uploadMediaAndAttach(opts: {
  blobOrUrl: FileInput;
  kind: 'image' | 'video' | 'audio' | 'doc';
  mime?: string | null;
  metadata?: Json | null;
  createdBy?: string | null;
  attachTo: { entityType: 'group_event' | 'event'; entityId: string; role: string; position?: number | null };
}) {
  const supabase = getSupabaseServer();

  // 1) Salva un record in media_assets (qui gestiamo solo il record metadati; lo storage fisico è demandato)
  const mm = opts;
  const insert: Record<string, any> = {
    [COL.ma.url]: null, // se usi storage esterno, metti la url; per ora null
    [COL.ma.kind]: mm.kind,
    [COL.ma.mime]: mm.mime ?? null,
    [COL.ma.metadata]: mm.metadata ?? null,
    [COL.ma.createdBy]: mm.createdBy ?? null,
  };

  const { data, error } = await supabase
    .from(TBL.mediaAssets as any)
    .insert([insert as any])      // ARRAY + CAST: evita overload 'never'
    .select('id')
    .single();

  if (error) throw error;
  const mediaId = data.id as string;

  // 2) Crea l’attachment
  const payload = {
    [COL.matt.mediaId]: mediaId,
    [COL.matt.entityType]: mm.attachTo.entityType,
    [COL.matt.entityId]: mm.attachTo.entityId,
    [COL.matt.role]: mm.attachTo.role,
    [COL.matt.position]: mm.attachTo.position ?? 0,
  };

  const { error: attErr } = await getSupabaseServer()
    .from(TBL.mediaAttachments as any)
    .insert([payload as any]);

  if (attErr) throw attErr;

  return mediaId;
}

// ========================= PAYLOAD TYPES (SEMPLIFICATI) =========================

type NewJourneyPayload = {
  lang: string;
  title: string;
  shortName?: string | null;
  description?: string | null;
  visibility?: 'private' | 'shared' | 'public';
  status?: 'draft' | 'review' | 'published' | 'refused';

  place?: string | null;
  country?: string | null;
  continent?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  yearFrom?: number | null;
  yearTo?: number | null;
  era?: 'BC' | 'AD' | null;
  exactDate?: string | null;
  tags?: string[] | null;

  cover?: FileInput;

  events?: Array<{
    title: string;
    description?: string | null;
    wikipediaUrl?: string | null;
    place?: string | null;
    country?: string | null;
    continent?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    yearFrom?: number | null;
    yearTo?: number | null;
    era?: 'BC' | 'AD' | null;
    exactDate?: string | null;
  }>;
};

type BuildFromVideoPayload = {
  lang: string;
  mainTitle: string;
  description?: string | null;
  videoUrl: string;
  place?: string | null;
  country?: string | null;
  continent?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  yearFrom?: number | null;
  yearTo?: number | null;
  era?: 'BC' | 'AD' | null;
  exactDate?: string | null;
  chapters: Array<{ time: number; title: string }>;
};

// ========================= AZIONI =========================

export async function buildJourneyFromScratch(payload: NewJourneyPayload) {
  const supabase = getSupabaseServer();

  // 1) Crea group_events
  const geInsert = {
    [COL.ge.createdBy]: null,
    [COL.ge.visibility]: payload.visibility ?? 'private',
    [COL.ge.status]: payload.status ?? 'draft',
    [COL.ge.place]: payload.place ?? null,
    [COL.ge.country]: payload.country ?? null,
    [COL.ge.continent]: payload.continent ?? null,
    [COL.ge.latitude]: safeNum(payload.latitude),
    [COL.ge.longitude]: safeNum(payload.longitude),
    [COL.ge.yearFrom]: safeNum(payload.yearFrom),
    [COL.ge.yearTo]: safeNum(payload.yearTo),
    [COL.ge.era]: payload.era ?? null,
    [COL.ge.exactDate]: payload.exactDate ?? null,
    [COL.ge.tags]: payload.tags ?? null,
  };

  const { data: ge, error: geErr } = await supabase
    .from(TBL.groupEvents as any)
    .insert([geInsert as any])
    .select()
    .single();

  if (geErr) throw geErr;
  const geId = ge[COL.ge.id] as string;

  // 2) Traduzione principale
  const trIns = {
    [COL.getr.groupEventId]: geId,
    [COL.getr.lang]: payload.lang,
    [COL.getr.title]: payload.title,
    [COL.getr.shortName]: payload.shortName ?? null,
    [COL.getr.description]: payload.description ?? null,
    [COL.getr.videoUrl]: null,
  };

  {
    const { error } = await supabase
      .from(TBL.groupEventTranslations as any)
      .insert([trIns as any]);
    if (error) throw error;
  }

  // 3) Cover opzionale
  if (payload.cover) {
    await uploadMediaAndAttach({
      blobOrUrl: payload.cover,
      kind: 'image',
      mime: null,
      metadata: { note: 'cover' },
      createdBy: null,
      attachTo: { entityType: 'group_event', entityId: geId, role: 'cover', position: 0 },
    });
  }

  // 4) Eventi opzionali
  if (payload.events?.length) {
    for (const ev of payload.events) {
      const evIns = {
        [COL.ev.place]: ev.place ?? null,
        [COL.ev.country]: ev.country ?? null,
        [COL.ev.continent]: ev.continent ?? null,
        [COL.ev.latitude]: safeNum(ev.latitude),
        [COL.ev.longitude]: safeNum(ev.longitude),
        [COL.ev.yearFrom]: safeNum(ev.yearFrom),
        [COL.ev.yearTo]: safeNum(ev.yearTo),
        [COL.ev.era]: ev.era ?? null,
        [COL.ev.exactDate]: ev.exactDate ?? null,
      };

      const { data: evd, error: evErr } = await supabase
        .from(TBL.eventsList as any)
        .insert([evIns as any])
        .select()
        .single();

      if (evErr) throw evErr;
      const evId = evd[COL.ev.id] as string;

      // 4.2 Traduzione evento
      const evTrIns = {
        [COL.evtr.eventId]: evId,
        [COL.evtr.lang]: payload.lang,
        [COL.evtr.title]: ev.title,
        [COL.evtr.description]: ev.description ?? null,
        [COL.evtr.descriptionShort]: null,
        [COL.evtr.wikipediaUrl]: ev.wikipediaUrl ?? null,
        [COL.evtr.videoUrl]: null,
      };

      {
        const { error } = await supabase
          .from(TBL.eventTranslations as any)
          .insert([evTrIns as any]);
        if (error) throw error;
      }

      // 4.3 Pivot con group_event
      const { error: pErr } = await supabase
        .from(TBL.eventGroupEvent as any)
        .insert([{
          [COL.pvt.eventId]: evId,
          [COL.pvt.groupEventId]: geId,
          [COL.pvt.addedBy]: null,
        } as any]);

      if (pErr) throw pErr;

      // 4.4 Media evento (opzionali)
      // (se servono, usa uploadMediaAndAttach({ attachTo: { entityType: 'event', entityId: evId, ... } }))
    }
  }

  return { id: geId };
}

export async function buildJourneyFromVideo(payload: BuildFromVideoPayload) {
  const supabase = getSupabaseServer();

  // 1) Crea group_event
  const geInsert = {
    [COL.ge.createdBy]: null,
    [COL.ge.visibility]: 'private',
    [COL.ge.status]: 'draft',
    [COL.ge.place]: payload.place ?? null,
    [COL.ge.country]: payload.country ?? null,
    [COL.ge.continent]: payload.continent ?? null,
    [COL.ge.latitude]: safeNum(payload.latitude),
    [COL.ge.longitude]: safeNum(payload.longitude),
    [COL.ge.yearFrom]: safeNum(payload.yearFrom),
    [COL.ge.yearTo]: safeNum(payload.yearTo),
    [COL.ge.era]: payload.era ?? null,
    [COL.ge.exactDate]: payload.exactDate ?? null,
    [COL.ge.tags]: null,
  };

  const { data: ge, error: geErr } = await supabase
    .from(TBL.groupEvents as any)
    .insert([geInsert as any])
    .select()
    .single();

  if (geErr) throw geErr;
  const geId = ge[COL.ge.id] as string;

  // 2) Traduzione principale con video_url
  {
    const lang = payload.lang;
    const mainTitle = payload.mainTitle;
    const description = payload.description ?? null;

    const { error: trErr } = await supabase
      .from(TBL.groupEventTranslations as any)
      .insert([{
        [COL.getr.groupEventId]: geId,
        [COL.getr.lang]: lang,
        [COL.getr.title]: mainTitle,
        [COL.getr.shortName]: null,
        [COL.getr.description]: description,
        [COL.getr.videoUrl]: payload.videoUrl,
      } as any]);

    if (trErr) throw trErr;
  }

  // 3) Eventi dai chapters del video
  for (let i = 0; i < payload.chapters.length; i++) {
    const ch = payload.chapters[i];
    const evTitle = ch.title;
    const lang = payload.lang;

    const evIns = {
      [COL.ev.place]: payload.place ?? null,
      [COL.ev.country]: payload.country ?? null,
      [COL.ev.continent]: payload.continent ?? null,
      [COL.ev.latitude]: safeNum(payload.latitude),
      [COL.ev.longitude]: safeNum(payload.longitude),
      [COL.ev.yearFrom]: safeNum(payload.yearFrom),
      [COL.ev.yearTo]: safeNum(payload.yearTo),
      [COL.ev.era]: payload.era ?? null,
      [COL.ev.exactDate]: payload.exactDate ?? null,
    };

    const { data: evd, error: evErr } = await supabase
      .from(TBL.eventsList as any)
      .insert([evIns as any])
      .select()
      .single();

    if (evErr) throw evErr;
    const evId = evd[COL.ev.id] as string;

    // 3.2 Traduzione evento con riferimento temporale nel video
    {
      const { error: trE } = await supabase
        .from(TBL.eventTranslations as any)
        .insert([{
          [COL.evtr.eventId]: evId,
          [COL.evtr.lang]: lang,
          [COL.evtr.title]: evTitle,
          [COL.evtr.description]: `Chapter starting at ${fmtTime(ch.time)}.`,
          [COL.evtr.descriptionShort]: null,
          [COL.evtr.wikipediaUrl]: null,
          [COL.evtr.videoUrl]: payload.videoUrl,
        } as any]);
      if (trE) throw trE;
    }

    // 3.3 Pivot con group_event
    {
      const { error: pErr } = await supabase
        .from(TBL.eventGroupEvent as any)
        .insert([{
          [COL.pvt.eventId]: evId,
          [COL.pvt.groupEventId]: geId,
          [COL.pvt.addedBy]: null,
        } as any]);
      if (pErr) throw pErr;
    }
  }

  // (opzionale) allega anteprima video come media_attachments se necessario
  return { id: geId };
}
