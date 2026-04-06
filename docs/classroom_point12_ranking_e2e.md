## 1. Purpose

This document records the Point 12 implementation for Classroom ranking and final end-to-end polish.
It adds Journey-level ranking based on persisted `quiz_attempts` and exposes that ranking in both owner and member Classroom views without introducing new product areas.

## 2. Files changed

- `backend/sql/20260404_add_classroom_ranking_functions.sql`
- `frontend/app/module/classroom/[id]/page_inner.tsx`
- `frontend/app/module/classroom/[id]/member/page_inner.tsx`
- `frontend/app/module/classroom/types.ts`
- `frontend/app/module/classroom/utils.ts`
- `docs/classroom_point12_ranking_e2e.md`

## 3. Ranking rule

- Ranking is derived from persisted `quiz_attempts`.
- Ranking scope is:
  - one Classroom
  - one assigned Journey
- The ranking function is:
  - `public.classroom_journey_ranking(p_classroom_id uuid, p_group_event_id uuid default null)`
- Members are ranked by:
  1. highest `best_score`
  2. earliest `best_completed_at` among attempts with that best score
  3. higher `latest_score`
  4. `profile_id` as final deterministic fallback
- Only active student members of the Classroom are included in the ranking output.

## 4. Owner-facing ranking view

- The owner Classroom detail page now shows a minimal ranking block inside each assigned Journey card.
- Each row shows:
  - ranking position
  - member display name
  - attempts count
  - best score
  - latest score
- Empty state:
  - if no attempts exist for that Journey, the owner sees a controlled `ranking will appear...` message.

## 5. Member-facing ranking view

- The member Classroom page now shows a ranking block for each assigned Journey.
- The member sees:
  - full Journey-level ranking list
  - attempts count per ranked member
  - best score
  - latest score
- The current member’s own row is highlighted and labeled `You`.
- The current member’s own position is also shown explicitly at the top of the ranking block when available.

## 6. End-to-end polish added

- Ranking no-data states for Journeys with no quiz attempts yet
- Clear member self-position message
- Consistent CTA labels retained from previous points:
  - `Start Journey`
  - `Continue Journey`
  - `Review Journey`
  - `Start Quiz`
  - `Retry Quiz`
- Ranking loading/fallback remains non-invasive and does not redesign existing Classroom layouts

## 7. Remaining known limitations

- Ranking starts only at Classroom + Journey level
- No leaderboard across multiple Journeys
- No class-wide aggregate analytics dashboard
- No score trend charts
- No owner/member comparative analytics beyond the Journey ranking list

## 8. Acceptance criteria for Point 12

Point 12 is complete when:

- ranking is derived from persisted `quiz_attempts`
- ranking works at Classroom + Journey level
- owner can see ranking for assigned Journeys
- member can see ranking for assigned Journeys
- the member can identify their own position clearly
- empty and no-attempt states are handled cleanly
- no new speculative product areas are added
- `docs/classroom_point12_ranking_e2e.md` exists
