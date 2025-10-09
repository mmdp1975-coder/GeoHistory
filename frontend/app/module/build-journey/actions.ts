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
...
// ============================================================================
// Costanti tabelle/colonne (allinea ai tuoi nomi effettivi)
// ============================================================================

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
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    visibility: 'visibility',     // 'private' | 'shared' | 'public'
    status: 'status',             // 'draft' | 'review' | 'published' | 'refused'
    coverMediaId: 'cover_media_id',
  },
  get: {
    id: 'id',
    groupEventId: 'group_event_id',
    lang: 'lang',
    title: 'title',
    shortName: 'short_name',
    description: 'description',
    videoUrl: 'video_url',
  },
  evl: {
    id: 'id',
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
    eventId: 'event_id',
    groupEventId: 'group_event_id',
    addedBy: 'added_by',
  },
  ma: {
    id: 'id',
    url: 'url',
    storagePath: 'storage_path',
    kind: 'kind',
    mime: 'mime',
    metadata: 'metadata',
    createdBy: 'created_by',
  },
  matt: {
    id: 'id',
    mediaId: 'media_id',
    entityType: 'entity_type',    // 'group_event' | 'event'
    entityId: 'entity_id',
    role: 'role',
    position: 'position',
  },
  pvt: {
    id: 'id',
    eventId: 'event_id',
    groupEventId: 'group_event_id',
    addedBy: 'added_by',
  },
} as const;

// ============================================================================
// Helpers Supabase (server)
// ============================================================================

import { cookies, headers } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

function getSupabaseServer(): SupabaseClient {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
      global: {
        headers: {
          'x-forwarded-host': headers().get('x-forwarded-host') ?? '',
          'x-forwarded-proto': headers().get('x-forwarded-proto') ?? '',
        },
      },
    }
  );
}

// ============================================================================
// Tipi locali per evitare overload `never[]` su .insert()
// ============================================================================

type Visibility = 'private' | 'shared' | 'public';
type Status = 'draft' | 'review' | 'published' | 'refused';
type Era = 'BC' | 'AD';

type MediaKind = 'image' | 'video' | 'audio' | 'doc';

type GroupEventInsert = {
  id?: string;
  created_by?: string | null;
  visibility?: Visibility | null;
  status?: Status | null;
  cover_media_id?: string | null;
};

type GroupEventTranslationInsert = {
  id?: string;
  group_event_id: string;
  lang: string;
  title?: string | null;
  short_name?: string | null;
  description?: string | null;
  video_url?: string | null;
};

type EventListInsert = {
  id?: string;
  year_from?: number | null;
  year_to?: number | null;
  era?: Era | null;
  exact_date?: string | null; // ISO date
  tags?: string[] | null;
};

type EventTranslationInsert = {
  id?: string;
  event_id: string;
  lang: string;
  title?: string | null;
  short_name?: string | null;
  description?: string | null;
};

type EventGroupEventInsert = {
  id?: string;
  event_id: string;
  group_event_id: string;
  added_by?: string | null;
};

type MediaAssetInsert = {
  id?: string;
  url?: string | null;
  storage_path?: string | null;
  kind?: MediaKind | null;
  mime?: string | null;
  metadata?: Record<string, unknown> | null;
  created_by?: string | null;
};

type MediaAttachmentInsert = {
  id?: string;
  media_id: string;
  entity_type: 'group_event' | 'event';
  entity_id: string;
  role?: string | null;
  position?: number | null;
};

// ============================================================================
// Media: crea asset e allega (FIX definitivo per overload insert())
// ============================================================================

async function uploadMediaAndAttach(opts: {
  kind: MediaKind;
  mime?: string | null;
  metadata?: unknown;
  createdBy?: string | null;
  attachTo: { entityType: 'group_event' | 'event'; entityId: string; role: string; position?: number | null };
}) {
  const supabase = getSupabaseServer();

  // 1) media_assets
  const mm = opts;
  const row: MediaAssetInsert = {
    url: null,
    storage_path: null,
    kind: mm.kind ?? null,
    mime: mm.mime ?? null,
    metadata: (mm.metadata ?? null) as Record<string, unknown> | null,
    created_by: mm.createdBy ?? null,
  };
  const rows: MediaAssetInsert[] = [row];

  // **QUI IL FIX**: array tipizzato + .select('id').single()
  const { data, error } = await supabase
    .from(TBL.mediaAssets as string)
    .insert(rows)
    .select('id')
    .single();

  if (error) throw error;
  const mediaId = data.id as string;

  // 2) media_attachments
  const payload: MediaAttachmentInsert = {
    media_id: mediaId,
    entity_type: opts.attachTo.entityType,
    entity_id: opts.attachTo.entityId,
    role: opts.attachTo.role,
    position: opts.attachTo.position ?? 0,
  };

  const { error: attErr } = await supabase
    .from(TBL.mediaAttachments as string)
    .insert([payload]);

  if (attErr) throw attErr;

  return mediaId;
}

// ============================================================================
// BUILD JOURNEY: from scratch (esempio minimale, coerente con schema)
// ============================================================================

export async function buildJourneyFromScratch(payload: {
  createdBy?: string | null;
  visibility?: Visibility;
  status?: Status;
  lang: string;
  title: string;
  shortName?: string | null;
  description?: string | null;
  cover?: { kind: MediaKind; mime?: string | null; metadata?: unknown; role?: string } | null;
}) {
  const supabase = getSupabaseServer();

  // 1) group_events
  const geInsert: GroupEventInsert = {
    created_by: payload.createdBy ?? null,
    visibility: payload.visibility ?? 'private',
    status: payload.status ?? 'draft',
    cover_media_id: null,
  };

  const { data: ge, error: geErr } = await supabase
    .from(TBL.groupEvents as string)
    .insert([geInsert])
    .select('id')
    .single();

  if (geErr) throw geErr;
  const geId = ge.id as string;

  // 2) group_event_translations
  const trIns: GroupEventTranslationInsert = {
    group_event_id: geId,
    lang: payload.lang,
    title: payload.title,
    short_name: payload.shortName ?? null,
    description: payload.description ?? null,
    video_url: null,
  };

  const { error: trErr } = await supabase
    .from(TBL.groupEventTranslations as string)
    .insert([trIns]);

  if (trErr) throw trErr;

  // 3) cover media (opzionale)
  if (payload.cover) {
    const mediaId = await uploadMediaAndAttach({
      kind: payload.cover.kind,
      mime: payload.cover.mime ?? null,
      metadata: payload.cover.metadata ?? null,
      createdBy: payload.createdBy ?? null,
      attachTo: { entityType: 'group_event', entityId: geId, role: payload.cover.role ?? 'cover', position: 0 },
    });

    // aggiorna cover_media_id su group_events
    const { error: updErr } = await supabase
      .from(TBL.groupEvents as string)
      .update({ [COL.ge.coverMediaId]: mediaId })
      .eq(COL.ge.id, geId);

    if (updErr) throw updErr;
  }

  return { id: geId };
}

// ============================================================================
// BUILD JOURNEY: from video URL (esempio, include eventi collegati)
// ============================================================================

export async function buildJourneyFromVideo(payload: {
  createdBy?: string | null;
  lang: string;
  videoUrl: string;
  title: string;
  shortName?: string | null;
  description?: string | null;
  events?: Array<{
    yearFrom?: number | null;
    yearTo?: number | null;
    era?: Era | null;
    exactDate?: string | null;
    tags?: string[] | null;
    title?: string | null;
    shortName?: string | null;
    description?: string | null;
  }>;
}) {
  const supabase = getSupabaseServer();

  // 1) Crea il group_event
  const geIns: GroupEventInsert = {
    created_by: payload.createdBy ?? null,
    visibility: 'private',
    status: 'draft',
    cover_media_id: null,
  };

  const { data: ge, error: geErr } = await supabase
    .from(TBL.groupEvents as string)
    .insert([geIns])
    .select('id')
    .single();

  if (geErr) throw geErr;
  const geId = ge.id as string;

  // 2) Traduzione con video_url
  const trIns: GroupEventTranslationInsert = {
    group_event_id: geId,
    lang: payload.lang,
    title: payload.title,
    short_name: payload.shortName ?? null,
    description: payload.description ?? null,
    video_url: payload.videoUrl ?? null,
  };

  const { error: trErr } = await supabase
    .from(TBL.groupEventTranslations as string)
    .insert([trIns]);

  if (trErr) throw trErr;

  // 3) Eventi collegati (se presenti)
  if (payload.events?.length) {
    for (const ev of payload.events) {
      const evIns: EventListInsert = {
        year_from: ev.yearFrom ?? null,
        year_to: ev.yearTo ?? null,
        era: ev.era ?? null,
        exact_date: ev.exactDate ?? null,
        tags: ev.tags ?? null,
      };

      const { data: evRow, error: evErr } = await supabase
        .from(TBL.eventsList as string)
        .insert([evIns])
        .select('id')
        .single();

      if (evErr) throw evErr;
      const evId = evRow.id as string;

      if (ev.title || ev.shortName || ev.description) {
        const evTrIns: EventTranslationInsert = {
          event_id: evId,
          lang: payload.lang,
          title: ev.title ?? null,
          short_name: ev.shortName ?? null,
          description: ev.description ?? null,
        };

        const { error: evTrErr } = await supabase
          .from(TBL.eventTranslations as string)
          .insert([evTrIns]);

        if (evTrErr) throw evTrErr;
      }

      const { error: pErr } = await supabase
        .from(TBL.eventGroupEvent as string)
        .insert([{
          [COL.pvt.eventId]: evId,
          [COL.pvt.groupEventId]: geId,
          [COL.pvt.addedBy]: null,
        }]);

      if (pErr) throw pErr;
    }
  }

  return { id: geId };
}
