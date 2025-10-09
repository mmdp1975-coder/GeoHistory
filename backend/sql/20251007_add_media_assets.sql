-- Media asset management for events and group events
-- Creates asset catalog and polymorphic attachments with integrity guarantees.

-- Ensure uuid generator available (Supabase enables pgcrypto by default, but guard anyway)
create extension if not exists "pgcrypto";

-- Asset classification
do $$
begin
  if not exists (
    select 1
    from pg_type t
    where t.typname = 'media_asset_type'
  ) then
    create type media_asset_type as enum ('image', 'video', 'audio', 'document');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    where t.typname = 'media_asset_status'
  ) then
    create type media_asset_status as enum ('draft', 'processing', 'ready', 'archived', 'error');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    where t.typname = 'media_attachment_role'
  ) then
    create type media_attachment_role as enum ('cover', 'gallery', 'thumbnail', 'hero', 'document');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    where t.typname = 'media_attachment_entity'
  ) then
    create type media_attachment_entity as enum ('event', 'group_event');
  end if;
end $$;

create table if not exists media_assets (
  id uuid primary key default gen_random_uuid(),
  storage_bucket text not null default 'public',
  storage_path text not null,
  media_type media_asset_type not null default 'image',
  status media_asset_status not null default 'draft',
  mime_type text,
  original_filename text,
  file_size_bytes bigint,
  checksum_sha256 text,
  width integer,
  height integer,
  duration_seconds numeric(10,3),
  public_url text,
  preview_url text,
  source_url text,
  credits text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id)
);

alter table media_assets
  add column if not exists public_url text;

comment on table media_assets is 'Catalog of uploaded media files stored in object storage.';
comment on column media_assets.storage_bucket is 'Bucket or logical namespace where the asset binary resides.';
comment on column media_assets.storage_path is 'Path or key of the asset within the storage bucket.';
comment on column media_assets.public_url is 'Public URL consumable by clients (derived or explicitly stored).';
comment on column media_assets.preview_url is 'Optional pre-rendered preview (thumbnail, animated gif, etc.).';
comment on column media_assets.metadata is 'Free-form JSON with transcoding metadata, EXIF, subtitles references, etc.';

create unique index if not exists media_assets_bucket_path_idx
  on media_assets (storage_bucket, storage_path);

-- Keep updated_at fresh on row update
create or replace function trg_touch_media_assets()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_media_assets on media_assets;
create trigger touch_media_assets
  before update on media_assets
  for each row
  execute function trg_touch_media_assets();

create table if not exists media_attachments (
  id uuid primary key default gen_random_uuid(),
  media_id uuid not null references media_assets(id) on delete cascade,
  entity_type media_attachment_entity not null,
  event_id uuid references events_list(id) on delete cascade,
  group_event_id uuid references group_events(id) on delete cascade,
  role media_attachment_role not null default 'gallery',
  title text,
  caption text,
  alt_text text,
  is_primary boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id),
  metadata jsonb not null default '{}'::jsonb,
  constraint media_attachments_entity_chk check (
    (entity_type = 'event' and event_id is not null and group_event_id is null)
    or
    (entity_type = 'group_event' and group_event_id is not null and event_id is null)
  )
);

comment on table media_attachments is 'Links media assets to events or group events with presentation metadata.';
comment on column media_attachments.role is 'Visual role (cover, gallery, thumbnail, etc.).';
comment on column media_attachments.sort_order is 'Stable ordering for gallery rendering.';
comment on column media_attachments.is_primary is 'Marks the preferred asset for the given role/entity.';

-- Generated helper column for quick joins (entity UUID regardless of type)
alter table media_attachments
  drop column if exists entity_id;

alter table media_attachments
  add column entity_id uuid generated always as (
    coalesce(event_id, group_event_id)
  ) stored;

create or replace function trg_touch_media_attachments()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_media_attachments on media_attachments;
create trigger touch_media_attachments
  before update on media_attachments
  for each row
  execute function trg_touch_media_attachments();

-- Fast lookup indexes
create index if not exists media_attachments_event_idx
  on media_attachments (event_id, role, sort_order);

create index if not exists media_attachments_group_idx
  on media_attachments (group_event_id, role, sort_order);

create index if not exists media_attachments_media_idx
  on media_attachments (media_id);

create index if not exists media_attachments_entity_idx
  on media_attachments (entity_type, entity_id);

create unique index if not exists media_attachments_unique_slot_idx
  on media_attachments (entity_type, entity_id, media_id, role, sort_order);

-- Ensure only one cover per entity
create unique index if not exists media_attachments_event_cover_uidx
  on media_attachments (event_id)
  where role = 'cover';

create unique index if not exists media_attachments_group_cover_uidx
  on media_attachments (group_event_id)
  where role = 'cover';

-- Expanded view with asset details for API consumption
create or replace view media_attachments_expanded as
select
  ma.id,
  ma.media_id,
  ma.entity_type,
  ma.event_id,
  ma.group_event_id,
  ma.entity_id,
  ma.role,
  ma.title,
  ma.caption,
  ma.alt_text,
  ma.is_primary,
  ma.sort_order,
  ma.created_at,
  ma.created_by,
  ma.updated_at,
  ma.updated_by,
  ma.metadata as attachment_metadata,
  a.storage_bucket,
  a.storage_path,
  a.media_type,
  a.status,
  a.mime_type,
  a.original_filename,
  a.file_size_bytes,
  a.checksum_sha256,
  a.width,
  a.height,
  a.duration_seconds,
  a.public_url,
  a.preview_url,
  a.source_url,
  a.credits,
  a.metadata as asset_metadata
from media_attachments ma
join media_assets a
  on a.id = ma.media_id;

-- Optional: cover assets fallback views for quick access
create or replace view event_cover_assets as
select
  e.id as event_id,
  ma.id as attachment_id,
  a.id as asset_id,
  a.storage_bucket,
  a.storage_path,
  a.public_url,
  a.media_type,
  a.status,
  a.preview_url,
  a.metadata,
  ma.title,
  ma.caption,
  ma.alt_text
from events_list e
left join media_attachments ma
  on ma.event_id = e.id and ma.role = 'cover'
left join media_assets a
  on ma.media_id = a.id;

create or replace view group_event_cover_assets as
select
  g.id as group_event_id,
  ma.id as attachment_id,
  a.id as asset_id,
  a.storage_bucket,
  a.storage_path,
  a.public_url,
  a.media_type,
  a.status,
  a.preview_url,
  a.metadata,
  ma.title,
  ma.caption,
  ma.alt_text
from group_events g
left join media_attachments ma
  on ma.group_event_id = g.id and ma.role = 'cover'
left join media_assets a
  on ma.media_id = a.id;

-- Helper routines to keep legacy URL columns in sync with cover attachments
create or replace function sync_event_cover(p_event_id uuid)
returns void
language plpgsql
as $$
declare
  v_url text;
begin
  if p_event_id is null then
    return;
  end if;

  select coalesce(a.public_url, a.preview_url, a.source_url)
  into v_url
  from media_attachments ma
  join media_assets a on a.id = ma.media_id
  where ma.event_id = p_event_id
    and ma.role = 'cover'
  order by ma.is_primary desc, ma.sort_order asc, ma.created_at asc
  limit 1;

  update events_list
  set image_url = v_url
  where id = p_event_id;
end;
$$;

create or replace function sync_group_event_cover(p_group_event_id uuid)
returns void
language plpgsql
as $$
declare
  v_url text;
begin
  if p_group_event_id is null then
    return;
  end if;

  select coalesce(a.public_url, a.preview_url, a.source_url)
  into v_url
  from media_attachments ma
  join media_assets a on a.id = ma.media_id
  where ma.group_event_id = p_group_event_id
    and ma.role = 'cover'
  order by ma.is_primary desc, ma.sort_order asc, ma.created_at asc
  limit 1;

  update group_events
  set cover_url = v_url
  where id = p_group_event_id;
end;
$$;

create or replace function trg_media_attachments_sync_legacy()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'INSERT' or tg_op = 'UPDATE') then
    if new.role = 'cover' then
      if new.event_id is not null then
        perform sync_event_cover(new.event_id);
      end if;
      if new.group_event_id is not null then
        perform sync_group_event_cover(new.group_event_id);
      end if;
    end if;
  end if;

  if (tg_op = 'UPDATE' or tg_op = 'DELETE') then
    if old.role = 'cover' then
      if old.event_id is not null then
        perform sync_event_cover(old.event_id);
      end if;
      if old.group_event_id is not null then
        perform sync_group_event_cover(old.group_event_id);
      end if;
    end if;
  end if;

  return null;
end;
$$;

drop trigger if exists media_attachments_sync_legacy on media_attachments;
create trigger media_attachments_sync_legacy
  after insert or update or delete on media_attachments
  for each row
  execute function trg_media_attachments_sync_legacy();
