# Classroom Point 3 Schema

## 1. Purpose

- This document describes the database schema added for the Classroom feature in Point 3.
- It covers only the structural database layer required by the approved Classroom specification.
- It does not implement permissions, RLS, frontend behavior, invite flows, QR rendering, or business logic.

## 2. Tables created

- `classrooms`
- `classroom_members`
- `classroom_invites`
- `classroom_journeys`
- `journey_requests`
- `journey_progress`
- `quiz_attempts`

## 3. Columns by table

### `classrooms`

- `id`
- `owner_profile_id`
- `title`
- `description`
- `access_mode`
- `status`
- `created_at`
- `updated_at`

### `classroom_members`

- `id`
- `classroom_id`
- `member_profile_id`
- `member_role`
- `status`
- `joined_at`
- `created_at`
- `updated_at`

### `classroom_invites`

- `id`
- `classroom_id`
- `token`
- `invite_type`
- `email_target`
- `active`
- `created_at`

### `classroom_journeys`

- `id`
- `classroom_id`
- `group_event_id`
- `sort_order`
- `is_required`
- `assigned_at`

### `journey_requests`

- `id`
- `requester_profile_id`
- `classroom_id`
- `title`
- `topic`
- `notes`
- `status`
- `completed_group_event_id`
- `created_at`
- `updated_at`

### `journey_progress`

- `id`
- `classroom_id`
- `group_event_id`
- `profile_id`
- `progress_percentage`
- `is_completed`
- `completed_at`
- `last_event_id`
- `created_at`
- `updated_at`

### `quiz_attempts`

- `id`
- `profile_id`
- `classroom_id`
- `group_event_id`
- `score`
- `correct_answers`
- `total_questions`
- `started_at`
- `completed_at`

## 4. Keys and relationships

- All 7 entities use UUID primary keys with `gen_random_uuid()`, matching the repo SQL convention.
- User-facing ownership and membership reuse the existing `profiles(id)` foreign-key pattern:
  - `classrooms.owner_profile_id -> profiles.id`
  - `classroom_members.member_profile_id -> profiles.id`
  - `journey_requests.requester_profile_id -> profiles.id`
  - `journey_progress.profile_id -> profiles.id`
  - `quiz_attempts.profile_id -> profiles.id`
- Journey references reuse the existing Journey root table `group_events(id)`:
  - `classroom_journeys.group_event_id -> group_events.id`
  - `journey_requests.completed_group_event_id -> group_events.id`
  - `journey_progress.group_event_id -> group_events.id`
  - `quiz_attempts.group_event_id -> group_events.id`
- Optional event resume uses the existing event table:
  - `journey_progress.last_event_id -> events_list.id`
- Classroom-scoped relationships are:
  - `classroom_members.classroom_id -> classrooms.id`
  - `classroom_invites.classroom_id -> classrooms.id`
  - `classroom_journeys.classroom_id -> classrooms.id`
  - `journey_requests.classroom_id -> classrooms.id`
  - `journey_progress.classroom_id -> classrooms.id`
  - `quiz_attempts.classroom_id -> classrooms.id`

## 5. Constraints and indexes

### Enums

- `classroom_access_mode`
- `classroom_status`
- `classroom_member_role`
- `classroom_member_status`
- `classroom_invite_type`
- `journey_request_status`

### Main constraints

- `classrooms`
  - non-empty `title`
- `classroom_members`
  - unique `(classroom_id, member_profile_id)`
  - at most one `owner` membership row per classroom
  - owner rows must be `active` and have `joined_at`
  - `joined_at` is only allowed for active memberships
- `classroom_invites`
  - unique `token`
  - optional email format validation
  - `invite_type = email` requires `email_target`
- `classroom_journeys`
  - unique `(classroom_id, group_event_id)`
  - non-negative `sort_order`
- `journey_requests`
  - non-empty `title`
  - non-empty `topic`
  - `completed_group_event_id` requires `status = completed`
- `journey_progress`
  - unique `(classroom_id, group_event_id, profile_id)`
  - `progress_percentage` bounded to `0..100`
  - `is_completed` and `completed_at` must stay consistent
- `quiz_attempts`
  - `score >= 0`
  - `correct_answers >= 0`
  - `total_questions > 0`
  - `correct_answers <= total_questions`
  - `completed_at >= started_at` when present

### Indexes

- `classrooms_owner_status_idx`
- `classrooms_access_mode_idx`
- `classroom_members_member_idx`
- `classroom_members_classroom_role_idx`
- `classroom_members_owner_uidx`
- `classroom_invites_classroom_active_idx`
- `classroom_journeys_group_event_idx`
- `classroom_journeys_classroom_order_idx`
- `journey_requests_requester_status_idx`
- `journey_requests_classroom_status_idx`
- `journey_progress_profile_idx`
- `journey_progress_classroom_journey_idx`
- `journey_progress_last_event_idx`
- `quiz_attempts_profile_journey_idx`
- `quiz_attempts_classroom_journey_idx`
- `quiz_attempts_completed_at_idx`

### `updated_at` handling

- `updated_at` was added only to tables that are expected to change over time:
  - `classrooms`
  - `classroom_members`
  - `journey_requests`
  - `journey_progress`
- A shared trigger function updates `updated_at` on those mutable tables.
- `classroom_invites`, `classroom_journeys`, and `quiz_attempts` intentionally keep only creation/completion timestamps because they are append-oriented records in the approved Point 3 scope.

## 6. Assumptions made from the current repo

- The existing authenticated user model is `auth.users` plus `profiles`, so Classroom ownership and membership reference `profiles(id)` instead of `auth.users.id`.
- The existing Journey root entity is `group_events`, so Classroom journey links use `group_event_id`.
- The existing event root entity is `events_list`, so optional resume support uses `last_event_id -> events_list.id`.
- The current quiz UI stores a raw correct-answer count and total question count, so `quiz_attempts` stores both and also keeps a generic `score` field for later metrics.
- The repository SQL style already uses enums, UUID primary keys, `if not exists` guards, explicit indexes, and touch triggers where `updated_at` is meaningful.
- No Classroom-specific RLS or policy work is included here because Point 4 is reserved for permissions.

## 7. What is intentionally deferred to Point 4 and later points

- Row-level security policies and permission enforcement
- Persona-based authorization behavior for teacher, researcher, and student actions
- Invite acceptance rules and join-flow logic
- QR generation and QR consumption logic
- Any API routes, frontend pages, or UI behavior
- Aggregated score views or ranking views
- Validation that `journey_progress.last_event_id` belongs to the same assigned journey
- Automatic insertion of owner membership rows or other business-side write behavior

## 8. Acceptance criteria for Point 3

Point 3 is complete when:

- The repository contains the migration file for the Classroom schema.
- The 7 approved entities are represented in the schema.
- Primary keys, foreign keys, unique constraints, checks, and indexes are present and aligned with the current repo conventions.
- `docs/classroom_point3_schema.md` exists and documents the schema clearly.
- No frontend or business logic was implemented.
- No RLS or policy work was added.
