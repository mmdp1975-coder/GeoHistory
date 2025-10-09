-- Backfill media_assets and media_attachments from legacy URL columns.
-- Run this AFTER 20251007_add_media_assets.sql.

begin;

with legacy_media as (
  -- Event cover image_url column
  select
    'event'::media_attachment_entity as entity_type,
    e.id as entity_id,
    'cover'::media_attachment_role as role,
    0 as sort_order,
    true as is_primary,
    trim(e.image_url) as url,
    'events_list.image_url'::text as source_column
  from events_list e
  where e.image_url is not null

  union all

  -- Event gallery from JSONB array
  select
    'event'::media_attachment_entity,
    e.id,
    'gallery'::media_attachment_role,
    (arr.ord - 1)::integer as sort_order,
    case when arr.ord = 1 then true else false end as is_primary,
    trim(arr.url) as url,
    'events_list.images'::text
  from events_list e
  left join lateral (
    select value as url, ordinality as ord
    from jsonb_array_elements_text(e.images) with ordinality
  ) as arr(url, ord)
    on jsonb_typeof(e.images) = 'array'
  where arr.url is not null

  union all

  -- Group cover_url column
  select
    'group_event'::media_attachment_entity,
    g.id,
    'cover'::media_attachment_role,
    0,
    true,
    trim(g.cover_url) as url,
    'group_events.cover_url'::text
  from group_events g
  where g.cover_url is not null
),
normalized_media as (
  select
    entity_type,
    entity_id,
    role,
    sort_order,
    case when url = '' then null else url end as url,
    is_primary,
    source_column
  from legacy_media
),
distinct_urls as (
  select distinct nm.url
  from normalized_media nm
  where nm.url is not null
)
insert into media_assets (
  storage_bucket,
  storage_path,
  media_type,
  status,
  public_url,
  preview_url,
  source_url,
  original_filename,
  metadata
)
select
  'legacy' as storage_bucket,
  du.url as storage_path,
  'image'::media_asset_type as media_type,
  'ready'::media_asset_status as status,
  du.url as public_url,
  du.url as preview_url,
  du.url as source_url,
  nullif(regexp_replace(du.url, '^.*[\\\\/]', ''), '') as original_filename,
  jsonb_build_object('imported_at', now(), 'imported_via', '20251007_migrate_legacy_media.sql')
from distinct_urls du
on conflict (storage_bucket, storage_path) do update
  set public_url = coalesce(media_assets.public_url, excluded.public_url),
      source_url = coalesce(media_assets.source_url, excluded.source_url),
      preview_url = coalesce(media_assets.preview_url, excluded.preview_url),
      metadata = media_assets.metadata || jsonb_build_object(
        'imported_at', now(),
        'imported_via', '20251007_migrate_legacy_media.sql'
      );

with legacy_media as (
  -- Event cover image_url column
  select
    'event'::media_attachment_entity as entity_type,
    e.id as entity_id,
    'cover'::media_attachment_role as role,
    0 as sort_order,
    true as is_primary,
    trim(e.image_url) as url,
    'events_list.image_url'::text as source_column
  from events_list e
  where e.image_url is not null

  union all

  -- Event gallery from JSONB array
  select
    'event'::media_attachment_entity,
    e.id,
    'gallery'::media_attachment_role,
    (arr.ord - 1)::integer as sort_order,
    case when arr.ord = 1 then true else false end as is_primary,
    trim(arr.url) as url,
    'events_list.images'::text
  from events_list e
  left join lateral (
    select value as url, ordinality as ord
    from jsonb_array_elements_text(e.images) with ordinality
  ) as arr(url, ord)
    on jsonb_typeof(e.images) = 'array'
  where arr.url is not null

  union all

  -- Group cover_url column
  select
    'group_event'::media_attachment_entity,
    g.id,
    'cover'::media_attachment_role,
    0,
    true,
    trim(g.cover_url) as url,
    'group_events.cover_url'::text
  from group_events g
  where g.cover_url is not null
),
normalized_media as (
  select
    entity_type,
    entity_id,
    role,
    sort_order,
    case when url = '' then null else url end as url,
    is_primary,
    source_column
  from legacy_media
),
asset_lookup as (
  select
    ma.id,
    ma.storage_path
  from media_assets ma
  where ma.storage_bucket = 'legacy'
)
insert into media_attachments (
  media_id,
  entity_type,
  event_id,
  group_event_id,
  role,
  title,
  caption,
  alt_text,
  is_primary,
  sort_order,
  metadata
)
select
  al.id as media_id,
  nm.entity_type,
  case when nm.entity_type = 'event'::media_attachment_entity then nm.entity_id else null end as event_id,
  case when nm.entity_type = 'group_event'::media_attachment_entity then nm.entity_id else null end as group_event_id,
  nm.role,
  null as title,
  null as caption,
  null as alt_text,
  nm.is_primary,
  nm.sort_order,
  jsonb_build_object(
    'imported_from', nm.source_column,
    'imported_via', '20251007_migrate_legacy_media.sql'
  )
from normalized_media nm
join asset_lookup al
  on al.storage_path = nm.url
where nm.url is not null
on conflict (entity_type, entity_id, media_id, role, sort_order) do update
  set is_primary = excluded.is_primary,
      metadata = media_attachments.metadata || excluded.metadata,
      updated_at = now();

commit;
