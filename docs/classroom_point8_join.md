# Classroom Point 8 Join

## 1. Purpose

- This document describes the Point 8 invite-consumption and Classroom join flow.
- The scope is limited to token-based invite landing, auth-aware join, minimum membership creation, and a minimal post-join student-facing Classroom view.
- It does not implement journey assignment, progress, quiz, ranking, analytics, email sending, or WhatsApp sharing.

## 2. Files changed

- `backend/sql/20260404_add_classroom_join_functions.sql`
- `frontend/lib/authRedirect.ts`
- `frontend/app/login/page.tsx`
- `frontend/app/login/register/page.tsx`
- `frontend/app/module/classroom/types.ts`
- `frontend/app/module/classroom/invite/page.tsx`
- `frontend/app/module/classroom/invite/page_inner.tsx`
- `frontend/app/module/classroom/[id]/member/page.tsx`
- `frontend/app/module/classroom/[id]/member/page_inner.tsx`
- `docs/classroom_point8_join.md`

## 3. Invite landing behavior

- The token landing route is:
  - `/module/classroom/invite?token=...`
- The page reads the token from the query string.
- It resolves the invite through the database RPC:
  - `public.classroom_resolve_active_invite(p_token text)`
- The landing page shows:
  - classroom title
  - classroom description
  - access mode
  - invite metadata
- Invalid or inactive tokens return a controlled unavailable state.

## 4. Auth-aware join behavior

- If the user is not authenticated:
  - the invite landing page still shows the classroom invite context
  - it prompts login/register using existing auth routes
  - it preserves `redirectTo` so the user can continue back to the same invite page
- If the user is authenticated:
  - the page shows a `Join Classroom` action
  - join is completed through the database RPC:
    - `public.join_classroom_by_token(p_token text)`

## 5. Membership creation behavior

- Join uses the existing `classroom_members` table.
- The database function creates or reuses membership rows with:
  - `classroom_id`
  - `member_profile_id = auth.uid()`
  - `member_role = 'student'`
  - `status = 'active'`
  - `joined_at = now()`
- The function does not duplicate existing active memberships.
- If a matching non-active membership exists, it reactivates it as an active student membership.
- The owner is not re-added as a student:
  - owner detection returns `is_owner = true`
  - the UI routes owners back to the owner detail page

## 6. Access mode behavior at Point 8

- `private`
  - join is allowed only through a valid active invite token
- `community`
  - currently behaves conservatively like invite-token gated access
  - no broader community-discovery model is introduced at Point 8
- `open`
  - still requires a valid active invite token in this flow
  - no anonymous/public auto-discovery is introduced
- Point 8 intentionally keeps all invite-consumption access token-gated.

## 7. Post-join routing/view

- After successful join:
  - owners are routed to `/module/classroom/[id]`
  - non-owner members are routed to `/module/classroom/[id]/member`
- The student-facing view shows:
  - classroom title
  - classroom description
  - basic metadata
  - a joined/already-member message
- It does not expose owner controls.

## 8. What is intentionally deferred to Point 9 and later

- Journey assignment UI
- Progress tracking UI
- Quiz UI/results
- Ranking or analytics
- Invite acceptance beyond the membership insert/reactivation step
- Email delivery
- WhatsApp sharing

## 9. Acceptance criteria for Point 8

Point 8 is complete when:

- The invite landing page exists for token-based access.
- Invalid or inactive token states are handled cleanly.
- An authenticated user can join through a valid invite token.
- `classroom_members` is created or reactivated correctly for student membership.
- Existing active membership is handled cleanly.
- The owner is not re-added as a student.
- The student lands on a minimal meaningful Classroom view after join.
- No journey assignment UI is implemented.
- No progress, quiz, ranking, or analytics logic is implemented.
- `docs/classroom_point8_join.md` exists.
