# Classroom Point 2 Audit

## 1. Purpose of the audit

- This document maps the current GeoHistory implementation against the approved Classroom specification.
- It records what already exists in the repository, what can be reused later, and what is currently missing.
- It is an implementation audit only.
- It does not introduce Classroom behavior, database schema, or UI changes.

## 2. Existing user/account model

### Current sources of truth

- Supabase Auth `auth.users` is the current authentication user store.
- Public profile data is managed through the `profiles` table.
- Persona catalog data is managed through the `personas` table.

### Files and database areas currently managing this

- `profiles` and `personas` access policies are defined in `backend/sql/20260130_fix_rls_personas_profiles.sql`.
- Public persona list is exposed by `frontend/app/api/public/personas/route.ts`.
- Profile bootstrap/upsert is handled by `frontend/app/api/register/profile/route.ts`.
- Profile updates are handled by `frontend/app/api/profile/update/route.ts`.
- Current user resolution is centralized in `frontend/lib/useCurrentUser.ts`.
- Login is handled by `frontend/app/login/page.tsx`.
- Registration is handled by `frontend/app/login/register/page.tsx`.
- Settings reads and updates `profiles.language_code`, `profiles.persona_id`, and `profiles.is_admin` in `frontend/app/module/settings/page.tsx`.
- Admin-only user listing uses Supabase Auth plus `profiles` in `frontend/app/api/(admin)/admin/users/route.ts`.
- Admin authorization is based on `profiles.is_admin` in `frontend/lib/api/adminAuth.ts`.

### Current persona selection logic

- Registration requires the user to choose a persona from `/api/public/personas`.
- `/api/public/personas` excludes `ADMIN`, `MOD`, and `MODERATOR` from the selectable list.
- The selected persona is written into `profiles.persona_id` through `frontend/app/api/register/profile/route.ts`.
- `frontend/lib/useCurrentUser.ts` resolves the current persona by reading `profiles.persona_id` and then loading `personas.code`.
- `frontend/app/api/profile/update/route.ts` allows persona changes, but prevents non-privileged users from switching into privileged personas.
- Privileged detection is code-based and currently means persona codes beginning with `ADMIN` or `MOD`.

### Existing role/capability logic

- General capability checks are minimal.
- The active repo uses:
  - `profiles.persona_id` plus `personas.code` for persona identity
  - `profiles.is_admin` for admin access
  - code-prefix checks for privileged personas (`ADMIN*`, `MOD*`)
- Journey audience flags already exist on `group_events`:
  - `allow_fan`
  - `allow_stud_high`
  - `allow_stud_middle`
  - `allow_stud_primary`
- Those flags are journey audience flags, not Classroom permissions.

### Whether teacher/researcher/student distinctions already exist

- Researcher exists in current code through the legacy/active persona code `RESEARCH` in `frontend/lib/postLoginRedirect.ts`.
- Student distinctions exist as three separate persona codes:
  - `STUD_PRIMARY`
  - `STUD_MIDDLE`
  - `STUD_HIGH`
- Teacher does not appear as an active current persona code in the inspected production code.
- The repo references teachers in marketing copy, but not as a current persona/capability implementation.

### What can be reused for Classroom permissions

- `profiles.persona_id` and `personas.code` can be reused as the base identity model.
- `frontend/lib/useCurrentUser.ts` can be reused to resolve the current actor for Classroom owner/member checks.
- `frontend/app/api/public/personas/route.ts` shows an existing pattern for controlled persona exposure.
- `frontend/app/api/profile/update/route.ts` already contains persona-based restriction logic that can be adapted for Classroom create/manage permissions.

### What is missing

- No current `teacher` persona implementation was found.
- No Classroom-specific permission model exists.
- No owner/member relationship for Classroom exists.
- No classroom-scoped capabilities for `teacher`, `researcher`, and `student` exist.
- Current privileged logic is only `ADMIN/MOD`, not educational-role logic.

## 3. Existing Journey model

### Main database tables and views involved

- `group_events`
- `group_event_translations`
- `events_list`
- `event_translations`
- `event_group_event`
- `event_type_map`
- `event_group_event_correlated`
- `media_assets`
- `media_attachments`
- `v_journeys`
- `v_journey`
- `v_media_attachments_expanded`
- `journeys_near_point` RPC

### Where Journeys are currently defined and loaded

- Server-side journey persistence logic is in `frontend/app/module/build-journey/actions.ts`.
- Journey editing and listing for owners is in `frontend/app/module/build-journey/page.tsx`.
- Journey approval flow is in `frontend/app/module/build-journey/approval/page.tsx`.
- Public journey listing is loaded from `v_journeys` in `frontend/app/module/timeline/page_inner.tsx`.
- Journey detail/event playback is loaded from `v_journey` in `frontend/app/module/group_event/page_inner.tsx`.
- Admin maintenance of raw `group_events` rows is in `frontend/app/module/DB_Manager/journey_edit/page.tsx`.

### Key fields already present

- On `group_events`, the codebase actively uses:
  - `id`
  - `owner_profile_id`
  - `visibility`
  - `workflow_state`
  - `slug`
  - `code`
  - `guest_access`
  - `allow_fan`
  - `allow_stud_high`
  - `allow_stud_middle`
  - `allow_stud_primary`
  - approval-related timestamps and profile references
- On `v_journeys`, the UI actively uses:
  - `journey_id`
  - `journey_slug`
  - `journey_cover_url`
  - `translation_title`
  - `translation_description`
  - `events_count`
  - `year_from_min`
  - `year_to_max`
  - `visibility`
  - `approved_at`
  - `is_favourite`
- On `v_journey`, the detail and quiz flows use:
  - `group_event_id`
  - `event_id`
  - `title`
  - `description`
  - `lang`
  - `year_from`
  - `year_to`
  - `era`
  - `journey_title`
  - journey and event media fields

### Current ownership or visibility logic

- Journey ownership already exists through `group_events.owner_profile_id`.
- Journey visibility currently supports `private` and `public`.
- Publishing state exists through `workflow_state` with values used in code such as:
  - `draft`
  - `submitted`
  - `published`
  - `refused`
- Guest access exists separately through `group_events.guest_access`.
- Journey audience filters also exist through `allow_fan` and the `allow_stud_*` flags.

### Whether the current model can support assigning one Journey to multiple Classrooms later

- Yes, the current Journey model is a standalone entity centered on `group_events.id`.
- Because Journeys already exist independently from any higher-level container, they can later be attached to multiple Classrooms through a join table.
- No current code forces a Journey to belong to only one parent container.

### What is missing for Classroom assignment

- No `classrooms` table exists.
- No `classroom_journeys` join table exists.
- No Classroom-aware visibility or assignment state exists.
- No classroom-scoped ordering, status, or assignment metadata exists.
- No distinction exists between globally owned journeys and classroom assignment records.

## 4. Existing quiz model

### Where quiz generation, display, and result handling currently live

- Quiz generation route: `frontend/app/api/quiz/generate/route.ts`
- Quiz UI and answer flow: `frontend/app/module/quiz/page.tsx`
- Quiz data source for question generation: `v_journey`
- Journey title fallback for the quiz page: `frontend/app/module/quiz/page.tsx`

### Current behavior

- The server generates multiple-choice questions from `v_journey`.
- If OpenAI generation fails, the route builds fallback questions locally.
- The quiz page stores answers, score, and finished state in React state only.
- The final result screen is client-side only.

### Whether quiz attempts are already persisted

- No quiz-attempt persistence was found.
- No quiz-attempt insert/update route was found.
- No quiz-attempt table or view was found in the inspected repo files.

### Whether only a final result exists or no persistence exists

- A final result exists only in the client UI state inside `frontend/app/module/quiz/page.tsx`.
- There is no server-side persistence for:
  - attempt history
  - final score
  - best score
  - latest score
  - average score
  - attempts count

### What can be reused

- `frontend/app/api/quiz/generate/route.ts` can be reused for question generation.
- `frontend/app/module/quiz/page.tsx` can be reused as the base quiz-taking UI.
- `v_journey` already provides a stable input shape for building journey-based quizzes.

### What is missing for Classroom requirements

- No multiple-attempt persistence.
- No stored per-attempt score.
- No per-user-per-journey quiz metrics.
- No classroom-scoped quiz context.
- No ranking based on quiz outcomes.
- No classroom + journey leaderboard logic.

## 5. Existing progress/completion logic

### What currently exists

- The journey detail page stores and reads `active_group_event_id` from local storage in `frontend/app/module/group_event/page_inner.tsx`.
- The journey detail page has in-session audio resume behavior through `audio.currentTime` and related component state in `frontend/app/module/group_event/page_inner.tsx`.
- The current page can reopen a journey by `gid`, but it does not restore a persisted classroom progress state.

### Journey start

- No dedicated persisted "journey started" record was found.
- Journey opening is handled by UI navigation and route parameters only.

### Journey progress

- No persisted per-user journey progress model was found.
- No stored percentage, current event index, or classroom-scoped progress row was found.

### Journey completion

- No persisted journey completion model was found.
- No `completed_at` handling was found for user journey completion.

### Last visited event or resume logic

- There is limited client-side resume behavior only:
  - `active_group_event_id` in local storage
  - in-session audio resume time
- No persisted "last visited event" row was found.
- No database-backed resume logic was found.

### Where this logic currently lives

- `frontend/app/module/group_event/page_inner.tsx`

### What is missing

- Per-user persisted journey start state.
- Per-user persisted journey progress.
- Per-user persisted journey completion.
- Per-user persisted last visited event.
- Separation between journey progress and quiz performance.
- Classroom-scoped progress tracking.

## 6. Existing auth/access/invite logic

### Current login and registration flow

- Login uses Supabase password auth in `frontend/app/login/page.tsx`.
- Registration uses Supabase sign-up in `frontend/app/login/register/page.tsx`.
- Session refresh middleware exists in `frontend/middleware.ts`.
- Browser auth client is in `frontend/lib/supabaseBrowserClient.ts`.
- Server auth/admin clients are in `frontend/lib/supabaseServerClient.ts`.

### Existing access logic already present

- Admin route protection is implemented in `frontend/lib/api/adminAuth.ts`.
- Journey guest gating exists in `frontend/app/module/group_event/page_inner.tsx`.
- Guest journey access checks currently rely on:
  - `group_events.guest_access`
  - `group_events.visibility`
  - `group_events.workflow_state`
- Timeline and journey detail pages already distinguish authenticated users from guests.

### Whether invite-token logic already exists anywhere

- No application invite-token flow was found.
- The only invite reference found is a commented Supabase email template block in `frontend/supabase/config.toml`.
- No Classroom invite link model or route exists.

### Whether QR-related logic already exists anywhere

- No QR code generation or QR handling logic was found in the current app code.

### Whether membership/community logic already exists anywhere

- No classroom-style membership model was found.
- No member join table or member-management flow was found.
- Existing `group_event_favourites` is a personal preference relation, not group membership.

### What can be reused for Classroom access modes

- The existing auth/session stack can be reused:
  - `frontend/app/login/page.tsx`
  - `frontend/app/login/register/page.tsx`
  - `frontend/middleware.ts`
  - `frontend/lib/supabaseBrowserClient.ts`
  - `frontend/lib/supabaseServerClient.ts`
- Existing journey gating fields can inform future access logic:
  - `visibility`
  - `workflow_state`
  - `guest_access`
- Existing route-level user resolution in `frontend/lib/useCurrentUser.ts` can be reused to attach invite acceptance to an authenticated user when required.

### What is missing

- No Classroom access modes (`private`, `community`, `open`).
- No invite link generation.
- No invite link validation.
- No classroom membership acceptance flow.
- No QR generation from invite links.
- No email invitation flow tied to classroom membership.
- No WhatsApp-ready invite-link reuse flow.

## 7. Existing pages/components that can be reused

### Classroom creation

- `frontend/app/module/build-journey/page.tsx`
  - Reusable owner-oriented form/list patterns for creating and managing records.
- `frontend/app/module/settings/page.tsx`
  - Reusable profile-aware settings form patterns and persona gating checks.
- `frontend/lib/useCurrentUser.ts`
  - Reusable actor resolution hook for owner/member checks.
- `frontend/lib/api/adminAuth.ts`
  - Reusable server-side authorization pattern for protected APIs.

### Classroom detail page

- `frontend/app/module/landing/page.tsx`
  - Reusable two-panel page composition and mobile/desktop layout switching.
- `frontend/app/components/TopBar.tsx`
  - Reusable shared app shell and authenticated navigation.
- `frontend/app/components/Scorecard.tsx`
  - Reusable assigned-journey card UI.

### Student access flow

- `frontend/app/login/page.tsx`
- `frontend/app/login/register/page.tsx`
- `frontend/middleware.ts`
- `frontend/lib/supabaseBrowserClient.ts`
- `frontend/lib/supabaseServerClient.ts`
- `frontend/lib/useCurrentUser.ts`

### Journey assignment

- `frontend/app/module/build-journey/page.tsx`
  - Already lists owner journeys through `group_events.owner_profile_id` and `v_journeys`.
- `frontend/app/module/timeline/page_inner.tsx`
  - Reusable journey listing/filtering logic from `v_journeys`.
- `frontend/app/module/DB_Manager/journey_edit/page.tsx`
  - Reusable simple record maintenance pattern for admin/internal tooling.

### Quiz result display

- `frontend/app/module/quiz/page.tsx`
  - Already contains a final-result review screen.

### Rankings/progress display

- `frontend/app/module/rating/page.tsx`
  - Reusable ranking-page pattern, but currently based on journey ratings only.
- `frontend/app/components/RatingSummary.tsx`
  - Reusable small metric-summary display pattern.
- `frontend/app/components/Scorecard.tsx`
  - Reusable card-based list display.

## 8. Future implementation touchpoints

### Database areas likely to change

- `backend/sql/`
  - New Classroom migrations will likely live here.
- Existing data areas likely to be extended or joined against:
  - `profiles`
  - `personas`
  - `group_events`
  - `group_event_translations`
  - `v_journeys`
  - `v_journey`

### Frontend pages likely to change

- `frontend/app/module/landing/page.tsx`
- `frontend/app/module/timeline/page_inner.tsx`
- `frontend/app/module/group_event/page_inner.tsx`
- `frontend/app/module/quiz/page.tsx`
- `frontend/app/login/page.tsx`
- `frontend/app/login/register/page.tsx`
- `frontend/app/module/settings/page.tsx`
- New Classroom pages will likely need a new folder under `frontend/app/module/`

### Backend/server logic likely to change

- `frontend/app/api/`
  - New Classroom APIs will likely be added here.
- Existing auth/profile-related APIs that may need coordination:
  - `frontend/app/api/public/personas/route.ts`
  - `frontend/app/api/register/profile/route.ts`
  - `frontend/app/api/profile/update/route.ts`
  - `frontend/app/api/quiz/generate/route.ts`
- Existing admin auth helper that may be mirrored for Classroom owner checks:
  - `frontend/lib/api/adminAuth.ts`

### Shared utilities/services likely to change

- `frontend/lib/useCurrentUser.ts`
- `frontend/lib/supabaseBrowserClient.ts`
- `frontend/lib/supabaseServerClient.ts`
- `frontend/lib/postLoginRedirect.ts`
- `frontend/lib/i18n/uiLabels.ts`

## 9. Gaps versus Classroom specification

| Area | Already exists | Reusable | Missing | Notes |
|---|---|---|---|---|
| personas/capabilities | `profiles.persona_id`, `personas.code`, `profiles.is_admin` | Yes | Teacher persona and Classroom capability rules | Researcher exists, student exists as split school-level personas, teacher not found |
| classroom ownership | No | Partial | Full ownership model | `group_events.owner_profile_id` shows an ownership pattern but only for Journeys |
| classroom membership | No | No | Full membership model | No member table or member flow found |
| access modes | Partial | Partial | Classroom `private/community/open` | Current journey model has `public/private` plus `guest_access`, but not Classroom modes |
| invite links | No | No | Full invite-link model | No classroom invite routes or tokens found |
| QR code | No | No | Full QR generation and handling | No QR logic found |
| journey assignment | Partial | Yes | Classroom assignment join model | Journeys already exist independently and can later be linked to multiple Classrooms |
| custom journey request | Partial | Partial | Classroom-specific request flow | Journey creation exists, but no Classroom request flow and no special request tracking |
| progress tracking | Minimal | Low | Persisted per-user journey progress | Only local storage `active_group_event_id` and in-session audio resume were found |
| quiz attempts | No | Partial | Persisted multi-attempt model | Quiz UI exists, but attempts are not stored |
| score history | No | Partial | Latest/best/average/attempt-count metrics | No server-side quiz scoring history exists |
| ranking | Partial | Partial | Classroom + Journey ranking | Rating leaderboard exists, but it is based on journey ratings, not quiz performance |

## 10. Risks and dependencies

- The current persona model does not include an active `teacher` implementation, so Classroom permissions cannot be mapped exactly without extending the persona catalog or adding capability rules.
- `frontend/lib/postLoginRedirect.ts` still references legacy fields (`landing_slug`, `persona_code`, `persona`) that differ from the active `useCurrentUser` pattern based on `profiles.persona_id` and `personas.code`.
- The current student model is split across `STUD_PRIMARY`, `STUD_MIDDLE`, and `STUD_HIGH`, while the Classroom specification treats `student` as one functional role.
- Journey visibility/access logic is already spread across multiple fields (`visibility`, `workflow_state`, `guest_access`, `allow_*`), so Classroom access must be added carefully to avoid conflicting rules.
- Quiz logic is currently stateless from the database perspective, so Point 2 confirms that progress/performance separation will require new persistence rather than a small patch.
- The existing ranking page (`frontend/app/module/rating/page.tsx`) ranks journeys by community rating, not by classroom quiz performance, so the name "ranking" already has a different meaning in the current product.
- The root `v_journey.sql` file is effectively empty in this repo snapshot, so the exact database definition of `v_journey` is not documented locally even though the app depends on it.

## 11. Recommended next implementation order

- Point 3: define the Classroom data model and repo-level technical design in documentation first, because the current repo has no classroom, membership, invite, or quiz-attempt persistence model.
- Point 4: align personas and permission rules next, because the current repo has researcher and student variants but no active teacher persona implementation.
- Point 5: implement Classroom core entities and ownership first, because everything else depends on having a classroom record.
- Point 6: implement classroom membership and access-mode rules next, because invite links, entry flow, and student access all depend on membership/access semantics.
- Point 7: implement invite-link flow and QR generation after access rules, because QR must derive from the same invite-link logic.
- Point 8: implement journey assignment to classrooms after classroom and membership exist, because journeys are already standalone and can then be attached cleanly through a join model.
- Point 9: implement the classroom creation/detail pages and owner flows after the data model is stable, reusing current owner-facing form and list patterns.
- Point 10: implement the student classroom entry flow and assigned-journey access after invite and assignment are ready.
- Point 11: implement persisted journey progress and persisted quiz attempts after classroom access is working, because these records must be classroom-aware from the start.
- Point 12: implement classroom ranking and reporting after progress and quiz-attempt persistence exist, because ranking depends on stored attempt history and per-user-per-journey metrics.

## 12. Acceptance criteria for Point 2

Point 2 is complete when:

- The repository contains one audit document at `docs/classroom_point2_audit.md`.
- The document maps the current GeoHistory implementation against the approved Classroom specification.
- The document identifies the current user/account, Journey, quiz, progress, and auth/access touchpoints using actual repo files and current database references.
- The document clearly distinguishes what already exists, what is reusable, and what is missing.
- No application logic, routes, UI behavior, database schema, or tests were changed as part of Point 2.
