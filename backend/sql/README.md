# Media Asset Schema

This folder contains handcrafted SQL migrations that extend the GeoHistory data model with reusable media assets which can be attached to both individual events and event groups.

## Files

- `20251007_add_media_assets.sql` &mdash; creates the shared `media_assets` catalog, polymorphic `media_attachments`, helper views (including the expanded attachment view), and all supporting enums/indexes/triggers plus cover-sync routines.
- `20251007_migrate_legacy_media.sql` &mdash; backfills the new tables starting from the legacy columns (`events_list.image_url`, `events_list.images`, `group_events.cover_url`). It also sets the `public_url` field for the imported assets and carries over source metadata.

## Applying the migration

1. Review the script and adapt bucket names or enum values if your storage conventions differ.
2. Execute the structural script against the Supabase/Postgres instance (replace the connection details with your environment):

   ```sh
   psql "$SUPABASE_DB_URL" -f backend/sql/20251007_add_media_assets.sql
   ```

   When using the Supabase CLI you can run:

   ```sh
   supabase db push --file backend/sql/20251007_add_media_assets.sql
   ```

3. Run the backfill:

   ```sh
   psql "$SUPABASE_DB_URL" -f backend/sql/20251007_migrate_legacy_media.sql
   ```

   or

   ```sh
   supabase db push --file backend/sql/20251007_migrate_legacy_media.sql
   ```

4. Verify that the helper views `event_cover_assets`, `group_event_cover_assets`, and the `v_media_attachments_expanded` view expose the expected rows (rows stay `NULL` until attachments exist).

## Data migration checklist

- The supplied backfill script imports every non-empty URL and ties it to the appropriate event/group with the right `role` (`cover` or `gallery`). Re-run it safely: `ON CONFLICT` clauses will update metadata and skip duplicates.
- Inspect attachments that lack a `public_url`; if the importer could not resolve one, populate `media_assets.public_url` manually so clients can display the asset.
- The trigger `media_attachments_sync_legacy` keeps the legacy columns (`events_list.image_url`, `group_events.cover_url`) aligned with the current `cover` attachment, so older code continues to work while you migrate consumers.
- When introducing upload flows, remember a new asset is created first, then attached. Use the unique `(entity_type, entity_id, media_id, role, sort_order)` index to avoid duplicates.

## Query helpers

- `v_media_attachments_expanded` view joins attachments and assets, returning both metadata blobs plus every derivative field (`public_url`, `preview_url`, dimensions, etc.).
- `event_cover_assets` / `group_event_cover_assets` expose a single cover (or `NULL`) per entity and are ideal for lightweight lookups.
- Typical pattern to list gallery items for an event group:

  ```sql
  select *
  from v_media_attachments_expanded
  where entity_type = 'group_event'::media_attachment_entity
    and group_event_id = '<uuid>'
  order by role, sort_order, created_at;
  ```

## Backend and frontend follow-up

- Update the `events_public` RPC to mirror the logic now implemented in `backend/index.js` (which already hydrates the `media` object in the `/api/events` fallback response).
- Extend any admin/upload flows so that file uploads first create a `media_assets` record, store the binary in the chosen bucket, and finally insert a `media_attachments` row that links the asset to an event or group.
- Ensure access policies (RLS) on the new tables align with existing permissions; Supabase projects default to permissive service-role access, but client-side reads will require explicit policies.
- Add automated tests or seed data that exercise both event and group-event attachments, especially validating cover uniqueness and gallery ordering.
- Update frontend components to read the new `media.cover` / `media.gallery` payload if they currently depend on the plain URL columns.

Keep this directory for future SQL changes that are independent of any ORM or migration framework already in use by the project.
