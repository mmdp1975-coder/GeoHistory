-- Classroom schema for controlled learning/research groups.
-- Point 3 scope only: structural tables, enums, keys, and indexes.

create extension if not exists "pgcrypto";

do $$
begin
  if not exists (
    select 1
    from pg_type t
    where t.typname = 'classroom_access_mode'
  ) then
    create type classroom_access_mode as enum (
      'private',
      'community',
      'open'
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    where t.typname = 'classroom_status'
  ) then
    create type classroom_status as enum (
      'active',
      'archived'
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    where t.typname = 'classroom_member_role'
  ) then
    create type classroom_member_role as enum (
      'owner',
      'student'
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    where t.typname = 'classroom_member_status'
  ) then
    create type classroom_member_status as enum (
      'pending',
      'active',
      'removed'
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    where t.typname = 'classroom_invite_type'
  ) then
    create type classroom_invite_type as enum (
      'link',
      'email',
      'qr'
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    where t.typname = 'journey_request_status'
  ) then
    create type journey_request_status as enum (
      'requested',
      'in_progress',
      'completed',
      'cancelled'
    );
  end if;
end $$;

create table if not exists classrooms (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references profiles(id) on delete restrict,
  title text not null,
  description text,
  access_mode classroom_access_mode not null default 'private',
  status classroom_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint classrooms_title_chk
    check (nullif(btrim(title), '') is not null)
);

comment on table classrooms is 'Controlled spaces used to group users and assign journeys in educational or research contexts.';
comment on column classrooms.owner_profile_id is 'Profile that owns and manages the classroom.';
comment on column classrooms.access_mode is 'Classroom access policy: private, community, or open.';
comment on column classrooms.status is 'Minimal lifecycle state for the classroom record.';

create table if not exists classroom_members (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references classrooms(id) on delete cascade,
  member_profile_id uuid not null references profiles(id) on delete cascade,
  member_role classroom_member_role not null,
  status classroom_member_status not null default 'pending',
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint classroom_members_unique_member unique (classroom_id, member_profile_id),
  constraint classroom_members_owner_joined_chk
    check (
      member_role <> 'owner'
      or (status = 'active' and joined_at is not null)
    ),
  constraint classroom_members_joined_status_chk
    check (
      joined_at is null
      or status = 'active'
    )
);

comment on table classroom_members is 'Membership relation between classrooms and user profiles.';
comment on column classroom_members.member_role is 'Owner or student role within the classroom.';
comment on column classroom_members.status is 'Membership state used by future invite/join flows.';
comment on column classroom_members.joined_at is 'Timestamp when the membership became active.';

create table if not exists classroom_invites (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references classrooms(id) on delete cascade,
  token text not null default encode(gen_random_bytes(16), 'hex'),
  invite_type classroom_invite_type not null default 'link',
  email_target text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint classroom_invites_token_key unique (token),
  constraint classroom_invites_email_target_chk
    check (
      email_target is null
      or email_target ~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$'
    ),
  constraint classroom_invites_email_type_chk
    check (
      invite_type <> 'email'
      or email_target is not null
    )
);

comment on table classroom_invites is 'Invite-link records used by direct link, email, and QR access channels.';
comment on column classroom_invites.token is 'Unique invite token reused across link, email, and QR channels.';
comment on column classroom_invites.invite_type is 'Channel that produced or distributed the invite token.';

create table if not exists classroom_journeys (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references classrooms(id) on delete cascade,
  group_event_id uuid not null references group_events(id) on delete cascade,
  sort_order integer not null default 0,
  is_required boolean not null default false,
  assigned_at timestamptz not null default now(),
  constraint classroom_journeys_unique_assignment unique (classroom_id, group_event_id),
  constraint classroom_journeys_sort_order_chk
    check (sort_order >= 0)
);

comment on table classroom_journeys is 'Assignment join table between classrooms and existing GeoHistory journeys.';
comment on column classroom_journeys.group_event_id is 'Assigned journey, following the existing group_events pattern.';

create table if not exists journey_requests (
  id uuid primary key default gen_random_uuid(),
  requester_profile_id uuid not null references profiles(id) on delete restrict,
  classroom_id uuid references classrooms(id) on delete set null,
  title text not null,
  topic text not null,
  notes text,
  status journey_request_status not null default 'requested',
  completed_group_event_id uuid references group_events(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint journey_requests_title_chk
    check (nullif(btrim(title), '') is not null),
  constraint journey_requests_topic_chk
    check (nullif(btrim(topic), '') is not null),
  constraint journey_requests_completion_status_chk
    check (
      completed_group_event_id is null
      or status = 'completed'
    )
);

comment on table journey_requests is 'Requests for creator-specific custom journeys, optionally linked to a classroom.';
comment on column journey_requests.requester_profile_id is 'Creator profile requesting the custom journey.';
comment on column journey_requests.completed_group_event_id is 'Journey created to fulfill the request, once available.';

create table if not exists journey_progress (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references classrooms(id) on delete cascade,
  group_event_id uuid not null references group_events(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  progress_percentage numeric(5,2) not null default 0,
  is_completed boolean not null default false,
  completed_at timestamptz,
  last_event_id uuid references events_list(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint journey_progress_unique_scope unique (classroom_id, group_event_id, profile_id),
  constraint journey_progress_percentage_chk
    check (progress_percentage >= 0 and progress_percentage <= 100),
  constraint journey_progress_completion_chk
    check (
      (is_completed = false and completed_at is null)
      or (is_completed = true and completed_at is not null)
    )
);

comment on table journey_progress is 'Per-user progress for a journey within a classroom context, separate from quiz attempts.';
comment on column journey_progress.last_event_id is 'Optional resume pointer to the last visited event when compatible with the current journey model.';

create table if not exists quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  classroom_id uuid not null references classrooms(id) on delete cascade,
  group_event_id uuid not null references group_events(id) on delete cascade,
  score numeric(8,2) not null,
  correct_answers integer not null,
  total_questions integer not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint quiz_attempts_score_chk
    check (score >= 0),
  constraint quiz_attempts_correct_answers_chk
    check (correct_answers >= 0),
  constraint quiz_attempts_total_questions_chk
    check (total_questions > 0),
  constraint quiz_attempts_answers_bounds_chk
    check (correct_answers <= total_questions),
  constraint quiz_attempts_completed_chk
    check (completed_at is null or completed_at >= started_at)
);

comment on table quiz_attempts is 'One row per quiz attempt within a classroom and journey context.';
comment on column quiz_attempts.score is 'Stored score for the attempt; current UI uses correct-answer counts and later metrics can aggregate from this field.';

create or replace function trg_touch_classroom_records()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_classrooms on classrooms;
create trigger touch_classrooms
  before update on classrooms
  for each row
  execute function trg_touch_classroom_records();

drop trigger if exists touch_classroom_members on classroom_members;
create trigger touch_classroom_members
  before update on classroom_members
  for each row
  execute function trg_touch_classroom_records();

drop trigger if exists touch_journey_requests on journey_requests;
create trigger touch_journey_requests
  before update on journey_requests
  for each row
  execute function trg_touch_classroom_records();

drop trigger if exists touch_journey_progress on journey_progress;
create trigger touch_journey_progress
  before update on journey_progress
  for each row
  execute function trg_touch_classroom_records();

create index if not exists classrooms_owner_status_idx
  on classrooms (owner_profile_id, status, created_at desc);

create index if not exists classrooms_access_mode_idx
  on classrooms (access_mode, status, created_at desc);

create index if not exists classroom_members_member_idx
  on classroom_members (member_profile_id, status, classroom_id);

create index if not exists classroom_members_classroom_role_idx
  on classroom_members (classroom_id, member_role, status);

create unique index if not exists classroom_members_owner_uidx
  on classroom_members (classroom_id)
  where member_role = 'owner';

create index if not exists classroom_invites_classroom_active_idx
  on classroom_invites (classroom_id, active, created_at desc);

create index if not exists classroom_journeys_group_event_idx
  on classroom_journeys (group_event_id, classroom_id);

create index if not exists classroom_journeys_classroom_order_idx
  on classroom_journeys (classroom_id, sort_order, assigned_at);

create index if not exists journey_requests_requester_status_idx
  on journey_requests (requester_profile_id, status, created_at desc);

create index if not exists journey_requests_classroom_status_idx
  on journey_requests (classroom_id, status, created_at desc);

create index if not exists journey_progress_profile_idx
  on journey_progress (profile_id, classroom_id, group_event_id);

create index if not exists journey_progress_classroom_journey_idx
  on journey_progress (classroom_id, group_event_id, is_completed);

create index if not exists journey_progress_last_event_idx
  on journey_progress (last_event_id)
  where last_event_id is not null;

create index if not exists quiz_attempts_profile_journey_idx
  on quiz_attempts (profile_id, classroom_id, group_event_id, completed_at desc nulls last);

create index if not exists quiz_attempts_classroom_journey_idx
  on quiz_attempts (classroom_id, group_event_id, completed_at desc nulls last);

create index if not exists quiz_attempts_completed_at_idx
  on quiz_attempts (completed_at desc nulls last);
