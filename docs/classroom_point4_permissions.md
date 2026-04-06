# Classroom Point 4 Permissions

## 1. Purpose

- This document describes the database permission model added for the Classroom schema in Point 4.
- It covers row-level security, policy intent, and the conservative access model applied at the database layer.
- It does not add frontend behavior, invite/join flow logic, QR logic, or Classroom business workflows.

## 2. Permission model

- All 7 Classroom tables are RLS-enabled.
- Access is authenticated-only at Point 4.
- Anonymous/public row access is not enabled for any Classroom table.
- Ownership is based on `classrooms.owner_profile_id -> profiles.id`.
- Membership is based on `classroom_members` with `status = active`.
- Persona-based creator capability is based on the existing repo model:
  - `profiles.persona_id`
  - `personas.code`
  - `personas.create_classroom`
- Minimal helper SQL functions are used to keep policy expressions readable and to avoid circular table checks inside RLS.

## 3. Persona-based creator rules

- Only authenticated profiles whose persona has `personas.create_classroom = true` can insert rows into `classrooms`.
- Student personas cannot create Classroom rows through the database permission model.
- The same creator check is also applied to `journey_requests` inserts, because those requests are creator-scoped.
- Point 4 does not create a parallel role system.
- It reuses the repo’s current `profiles -> personas` identity structure.

## 4. Table-by-table policy summary

### `classrooms`

- Owner can:
  - read
  - update
  - delete
- Active members can:
  - read
- Insert is allowed only when:
  - user is authenticated
  - `owner_profile_id = auth.uid()`
  - the current persona has `create_classroom = true`

### `classroom_members`

- Classroom owner can:
  - read all membership rows for owned classrooms
  - insert membership rows
  - update non-owner membership rows
  - delete non-owner membership rows
- Any user can:
  - read their own membership rows
- Any user cannot:
  - manage membership rows for other users unless they own that classroom
- Owner membership consistency is enforced by:
  - the Point 3 unique owner index
  - Point 4 policy checks that only allow `member_role = owner` when the member profile matches `classrooms.owner_profile_id`
- Point 4 stays conservative and does not implement self-service join/leave behavior yet.

### `classroom_invites`

- Only the classroom owner can:
  - read
  - insert
  - update
  - delete
- Invite rows are not publicly readable.

### `classroom_journeys`

- Classroom owner can:
  - insert
  - update
  - delete
- Classroom owner and active members can:
  - read
- Non-members cannot read classroom journey assignments.

### `journey_requests`

- A requester can:
  - insert their own request
  - read their own request
  - update their own request
  - delete their own request
- If a request references a classroom:
  - the requester must own that classroom
- Classroom owners can:
  - read requests tied to their classrooms
  - update requests tied to their classrooms
  - delete requests tied to their classrooms
- Other users’ requests are not exposed.

### `journey_progress`

- A user can:
  - read their own progress rows
  - insert their own progress rows
  - update their own progress rows
- Classroom owner can:
  - read progress rows for their owned classrooms
- Insert/update is allowed only when:
  - `profile_id = auth.uid()`
  - the user is an active member of the classroom
  - the journey is assigned to that classroom
- No policy allows writing progress for another user.

### `quiz_attempts`

- A user can:
  - read their own attempts
  - insert their own attempts
- Classroom owner can:
  - read attempts for their owned classrooms
- Insert is allowed only when:
  - `profile_id = auth.uid()`
  - the user is an active member of the classroom
  - the journey is assigned to that classroom
- Point 4 does not allow arbitrary update/delete of attempts.

## 5. What access_mode does and does not enforce at Point 4

- `classrooms.access_mode` is stored and preserved as approved product intent.
- Point 4 does not translate `private`, `community`, or `open` into anonymous/public row access.
- Point 4 does not implement open join behavior.
- Point 4 does not implement invite-token access behavior.
- Point 4 does not implement QR-driven access behavior.
- At this stage, classroom visibility remains conservative:
  - owner can read
  - active members can read where specified
  - anonymous/non-members cannot read protected classroom data

## 6. Assumptions from the current repo

- `profiles.id` matches the authenticated actor identity used by existing repo policies (`auth.uid() = id`).
- Persona capability is derived from `profiles.persona_id` joined to `personas`, including the explicit `personas.create_classroom` flag.
- The effective creator-capable set is controlled by persona data instead of hardcoded persona-code checks.
- Journey assignment is anchored on `group_events.id`, matching the existing GeoHistory journey model.
- Active classroom participation is represented by `classroom_members.status = active`.
- The repo’s current SQL/RLS style uses:
  - explicit policy names
  - `authenticated` role targeting
  - `do $$ ... if not exists ... $$` guards for policy creation

## 7. What is intentionally deferred to Point 5 and later

- Automatic owner membership creation flow
- Invite-token consumption logic
- QR rendering or QR join behavior
- Student self-join flow
- Access-mode-specific join semantics for `private`, `community`, and `open`
- Public/anonymous classroom exposure
- Ranking queries and leaderboard permissions
- Frontend routes, pages, UI, or server-route integration
- Additional business rules beyond the approved Point 4 scope

## 8. Acceptance criteria for Point 4

Point 4 is complete when:

- The repository contains a migration file for Classroom permissions and RLS.
- RLS and explicit policies exist for all 7 Classroom tables.
- Profiles whose persona has `create_classroom = true` can create Classroom rows through the database permission model.
- Student personas cannot create Classroom rows through the database permission model.
- Owners can manage their own Classroom rows and related protected rows.
- Members can read the Classroom data they are allowed to read.
- `journey_progress` and `quiz_attempts` are restricted to self-writes and owner reads as approved.
- `access_mode` remains documented but does not open anonymous/public access yet.
- `docs/classroom_point4_permissions.md` exists.
- No frontend, UI, invite/join flow, or later-point business logic was implemented.
