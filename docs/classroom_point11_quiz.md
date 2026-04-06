## 1. Purpose

This document records the Point 11 implementation for Classroom quiz persistence.
It extends the existing Classroom member flow so quiz attempts are stored in `quiz_attempts`
only when the quiz is launched from Classroom context, while keeping normal non-Classroom quiz behavior unchanged.

## 2. Files changed

- `frontend/app/module/quiz/page.tsx`
- `frontend/app/module/group_event/page_inner.tsx`
- `frontend/app/module/classroom/[id]/member/page_inner.tsx`
- `frontend/app/module/classroom/[id]/page_inner.tsx`
- `frontend/app/module/classroom/types.ts`
- `frontend/app/module/classroom/utils.ts`

## 3. How Classroom quiz context is passed

- Classroom quiz context uses the same query-param pattern already introduced for Classroom Journey progress.
- When a Journey is opened from Classroom context, `group_event/page_inner.tsx` now builds the quiz URL with:
  - `gid`
  - `classroomId`
  - optional `lang`
- If the Journey is opened outside Classroom context, the quiz URL remains the normal `/module/quiz?...` route without `classroomId`.

## 4. How quiz attempts are created

- `frontend/app/module/quiz/page.tsx` parses `classroomId` from the quiz route.
- If `classroomId` is absent, the page behaves as the normal GeoHistory quiz and does not write to `quiz_attempts`.
- If `classroomId` is present and valid:
  - the page tracks `attemptStartedAt` for the current run
  - completion inserts one new row into `quiz_attempts`
  - retries reset `attemptStartedAt` and create a new row on the next completion
- Stored fields are:
  - `classroom_id`
  - `group_event_id`
  - `profile_id`
  - `score`
  - `correct_answers`
  - `total_questions`
  - `started_at`
  - `completed_at`

## 5. How result metrics are computed

- Personal quiz history is loaded from `quiz_attempts` for the current:
  - classroom
  - journey
  - member
- Shared helper `summarizeClassroomQuizAttempts()` computes:
  - attempts count
  - latest score
  - best score
  - average score
  - percentage variants for latest, best, and average
- The latest attempt is determined by the most recent `completed_at`, with `started_at` as fallback ordering.

## 6. Member-facing quiz summary UI

- The Classroom member page now loads the current member’s `quiz_attempts` for assigned journeys.
- For each assigned Journey, it shows:
  - attempts count
  - latest score
  - best score
  - average score
- Existing Point 10 progress state remains visible in the same card.
- Each assigned Journey also exposes a Classroom-aware quiz entry action:
  - `Start Quiz` when no attempts exist
  - `Retry Quiz` when attempts already exist
- The quiz result view now shows:
  - this-attempt score
  - attempts count
  - latest score
  - best score
  - average score
  - retry action

## 7. Owner-facing minimal quiz visibility

- The owner Classroom detail page now shows only minimal quiz visibility per assigned Journey:
  - total attempts
  - number of members with attempts
- No comparative score table, ranking, leaderboard, or analytics dashboard is included.

## 8. What is intentionally deferred to Point 12

- ranking
- leaderboards
- comparative scoreboards
- analytics dashboards
- cross-member score analysis
- any owner-facing competitive view

## 9. Acceptance criteria for Point 11

Point 11 is complete when:

- Classroom quiz attempts are persisted in `quiz_attempts`
- multiple attempts are supported
- retries append new rows instead of overwriting history
- the member Classroom page shows attempts count, latest score, best score, and average score
- the Classroom quiz result view shows this-attempt score plus personal summary
- normal non-Classroom quiz behavior remains intact
- no ranking, leaderboard, or analytics UI is implemented
