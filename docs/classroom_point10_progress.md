## 1. Purpose

This document records the Point 10 implementation for Classroom Journey progress tracking and resume support for Classroom members.

## 2. Files changed

- `frontend/app/module/classroom/[id]/member/page_inner.tsx`
- `frontend/app/module/classroom/[id]/page_inner.tsx`
- `frontend/app/module/classroom/types.ts`
- `frontend/app/module/classroom/utils.ts`
- `frontend/app/module/group_event/page_inner.tsx`

## 3. How Classroom Journey context is passed

- Classroom context is passed only when a member opens a Journey from the Classroom member page.
- The member page builds the Journey URL with:
  - `gid`
  - `classroomId`
  - `eid` when a saved `last_event_id` exists
- Non-Classroom Journey navigation remains unchanged.

## 4. How progress rows are created/updated

- Progress is stored only in `journey_progress`.
- In Classroom context, `group_event` loads any existing progress row for:
  - `classroom_id`
  - `group_event_id`
  - `profile_id`
- If no row exists, the page inserts one when the member opens the Journey and the first valid event is available.
- If a row exists, the page updates:
  - `progress_percentage`
  - `last_event_id`
  - `is_completed`
  - `completed_at`
- The implementation keeps one row per classroom + journey + member and relies on the existing unique constraint and RLS from previous points.

## 5. How completion is determined

- Completion is determined conservatively from the current Journey event flow.
- When the member reaches the last event in the Journey, progress becomes completed.
- Completed progress remains completed for later review/reopen scenarios.

## 6. How resume works

- If a saved `last_event_id` exists and the member opens the Journey again from Classroom context, the member page builds the Journey link with that event id.
- If the Journey is opened in Classroom context without an explicit `eid`, `group_event` also attempts to restore the saved event from `journey_progress`.
- If no valid saved event exists, the member still sees the saved percentage and started/completed state on the Classroom member page.

## 7. Member-facing progress UI

- The member Classroom page now loads `journey_progress` rows for the current member and classroom.
- For each assigned Journey, the page shows:
  - status: not started / in progress / completed
  - progress percentage
  - a progress bar
  - a contextual action:
    - Start Journey
    - Continue Journey
    - Review Journey

## 8. Owner-facing progress visibility

- The owner Classroom detail page remains minimal.
- For each assigned Journey, the owner now sees only:
  - started members count
  - completed members count
- No ranking, no quiz data, and no heavy analytics were introduced.

## 9. What is intentionally deferred to Point 11 and later

- Quiz evolution
- Score history
- Ranking
- Analytics
- Detailed progress dashboards
- Cross-classroom progress aggregation

## 10. Acceptance criteria for Point 10

Point 10 is complete when:

- member progress is persisted in `journey_progress`
- opening an assigned Journey creates or reuses a progress row
- progress updates during Classroom Journey usage
- completion can be persisted
- the member Classroom view shows progress state per assigned Journey
- resume behavior is supported at least minimally
- duplicate progress rows are prevented
- no quiz evolution is implemented
- no ranking or analytics is implemented
