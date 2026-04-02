-- Unified feedback intake for support requests and journey rating comments.
-- This table intentionally accepts both structured support tickets and lighter
-- rating-modal submissions so the product has a single feedback pipeline.

create extension if not exists "pgcrypto";

do $$
begin
  if not exists (
    select 1
    from pg_type t
    where t.typname = 'feedback_source'
  ) then
    create type feedback_source as enum (
      'support_page',
      'journey_rating_modal',
      'admin_panel',
      'api'
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    where t.typname = 'feedback_type'
  ) then
    create type feedback_type as enum (
      'rating_feedback',
      'bug',
      'support',
      'feature_request',
      'content_feedback',
      'account_issue',
      'billing',
      'other'
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    where t.typname = 'feedback_status'
  ) then
    create type feedback_status as enum (
      'new',
      'triaged',
      'in_progress',
      'resolved',
      'closed',
      'spam'
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    where t.typname = 'feedback_priority'
  ) then
    create type feedback_priority as enum (
      'low',
      'medium',
      'high',
      'urgent'
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    where t.typname = 'feedback_area'
  ) then
    create type feedback_area as enum (
      'home',
      'journey',
      'timeline',
      'create_journey',
      'quiz',
      'settings',
      'account',
      'support',
      'other'
    );
  end if;
end $$;

create table if not exists user_feedback (
  id uuid primary key default gen_random_uuid(),
  source feedback_source not null,
  type feedback_type not null default 'other',
  status feedback_status not null default 'new',
  priority feedback_priority not null default 'medium',

  user_id uuid references profiles(id) on delete set null,
  assigned_to uuid references profiles(id) on delete set null,

  title text,
  message text,
  rating smallint,

  area feedback_area,
  page_path text,
  page_url text,
  language_code text,
  browser_user_agent text,

  contact_email text,
  wants_reply boolean not null default false,

  group_event_id uuid references group_events(id) on delete set null,

  repro_steps text,
  expected_result text,
  actual_result text,
  suggested_improvement text,

  metadata jsonb not null default '{}'::jsonb,
  internal_notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint user_feedback_rating_chk
    check (rating is null or rating between 1 and 5),
  constraint user_feedback_payload_chk
    check (
      nullif(btrim(coalesce(title, '')), '') is not null
      or nullif(btrim(coalesce(message, '')), '') is not null
      or rating is not null
    ),
  constraint user_feedback_contact_email_chk
    check (
      contact_email is null
      or contact_email ~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$'
    )
);

comment on table user_feedback is 'Unified inbox for support tickets, product feedback, and journey rating comments.';
comment on column user_feedback.source is 'Origin of the submission (support page, rating modal, admin, API).';
comment on column user_feedback.type is 'Categorization used for routing and analytics.';
comment on column user_feedback.status is 'Operational triage state managed by staff.';
comment on column user_feedback.priority is 'User-facing urgency or staff-assigned importance.';
comment on column user_feedback.rating is 'Optional 1-5 rating when feedback originates from rating UI.';
comment on column user_feedback.area is 'Optional product area classification used for routing and analytics.';
comment on column user_feedback.metadata is 'Free-form JSON for UI context, browser/device info, and future extensions.';
comment on column user_feedback.internal_notes is 'Staff-only notes for follow-up and triage.';

create or replace function trg_touch_user_feedback()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_user_feedback on user_feedback;
create trigger touch_user_feedback
  before update on user_feedback
  for each row
  execute function trg_touch_user_feedback();

create index if not exists user_feedback_created_at_idx
  on user_feedback (created_at desc);

create index if not exists user_feedback_status_created_at_idx
  on user_feedback (status, created_at desc);

create index if not exists user_feedback_source_type_idx
  on user_feedback (source, type, created_at desc);

create index if not exists user_feedback_user_idx
  on user_feedback (user_id, created_at desc);

create index if not exists user_feedback_group_event_idx
  on user_feedback (group_event_id, created_at desc);

create index if not exists user_feedback_area_idx
  on user_feedback (area, created_at desc);

alter table public.user_feedback enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_feedback'
      and policyname = 'user_feedback_insert_anon'
  ) then
    execute $policy$
      create policy user_feedback_insert_anon
      on public.user_feedback
      for insert
      to anon
      with check (user_id is null)
    $policy$;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_feedback'
      and policyname = 'user_feedback_insert_authenticated'
  ) then
    execute $policy$
      create policy user_feedback_insert_authenticated
      on public.user_feedback
      for insert
      to authenticated
      with check (user_id is null or auth.uid() = user_id)
    $policy$;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_feedback'
      and policyname = 'user_feedback_select_own'
  ) then
    execute $policy$
      create policy user_feedback_select_own
      on public.user_feedback
      for select
      to authenticated
      using (auth.uid() = user_id)
    $policy$;
  end if;
end $$;
