# Classroom Point 5 Owner Flow

## 1. Purpose

- This document describes the Point 5 owner-side Classroom flow.
- The scope is limited to:
  - My Classrooms
  - Create Classroom
  - owner detail page
  - basic owner edits for title, description, and access mode
- It aligns the Point 5 UI with the approved creator-enablement rule:
  - a user can access Classroom owner/create UI only when their linked persona has `public.personas.create_classroom = true`
- It does not implement invite flow, QR flow, student join flow, members UI, journey assignment UI, or progress/quiz/ranking behavior.

## 2. Files changed

- `frontend/lib/useCurrentUser.ts`
- `frontend/app/module/classroom/page_inner.tsx`
- `frontend/app/module/classroom/new/page_inner.tsx`
- `docs/classroom_point5_owner_flow.md`

## 3. How create_classroom is read and used

- The current-user flow already reads:
  - `profiles.id`
  - `profiles.persona_id`
- Point 5 now also reads `personas.create_classroom` from the linked persona row.
- `frontend/lib/useCurrentUser.ts` selects:
  - `id`
  - `code`
  - `create_classroom`
- The hook exposes a minimal boolean field:
  - `canCreateClassroom`
- `canCreateClassroom` is derived directly from `personas.create_classroom`.
- Point 5 does not use hardcoded persona-code checks such as `TEACHER` or `RESEARCH` for Classroom owner/create UI.
- Database RLS remains the true enforcement layer for create/read/update access.

## 4. Pages/routes behavior

### `/module/classroom`

- Requires authentication.
- Requires `canCreateClassroom = true`.
- If enabled:
  - lists only classrooms owned by the current profile
  - shows the existing Point 5 owner list UI
- If authenticated but not enabled:
  - shows a controlled unavailable/access-denied state

### `/module/classroom/new`

- Requires authentication.
- Requires `canCreateClassroom = true`.
- If enabled:
  - shows the existing Point 5 create form
  - allows `title`, `description`, and `access_mode`
- If authenticated but not enabled:
  - shows a controlled unavailable/access-denied state
  - does not show the create form

### `/module/classroom/[id]`

- Remains owner-only.
- Loads one classroom row through the existing client-side Supabase pattern.
- Confirms `owner_profile_id = current profile id` before showing the edit UI.
- Keeps the Point 5 scope limited to basic owner metadata editing.

## 5. Access denied behavior

- Unauthenticated users are handled with a controlled sign-in-required state.
- Authenticated users whose persona does not have `create_classroom = true` are handled with a controlled unavailable/access-denied state on:
  - `/module/classroom`
  - `/module/classroom/new`
- Direct access to `/module/classroom/[id]` remains owner-focused:
  - if the row is not available through RLS or does not belong to the current owner, the page shows a controlled unavailable/access-denied state
- Point 5 uses the boolean capability for proactive UI gating and the Point 4 RLS layer for final enforcement.

## 6. What remains deferred to Point 6 and later

- Invite link generation or invite management behavior
- QR rendering or QR download behavior
- Student join flow
- Membership management UI
- Journey assignment UI
- Progress, quiz attempts, ranking, or analytics UI
- Access-mode-specific join behavior for `private`, `community`, and `open`

## 7. Acceptance criteria for Point 5

Point 5 is complete when:

- My Classrooms uses the persona boolean capability rule.
- New Classroom uses the persona boolean capability rule.
- No hardcoded persona-code gating is used for Classroom owner/create UI.
- An authenticated enabled creator can open a My Classrooms page.
- An authenticated enabled creator can access the New Classroom page.
- An authenticated owner can open Classroom detail.
- An authenticated owner can edit title, description, and access mode.
- Authenticated non-enabled users are handled with controlled unavailable/access-denied states.
- No invite flow is implemented.
- No QR logic is implemented.
- No student join flow is implemented.
- No journey assignment UI is implemented.
- `docs/classroom_point5_owner_flow.md` exists.
