## 1. Purpose

This document records the Point 9 implementation for assigning existing GeoHistory Journeys to a Classroom and showing assigned Journeys in both the owner and member Classroom views.

## 2. Files changed

- `frontend/app/module/classroom/[id]/page_inner.tsx`
- `frontend/app/module/classroom/[id]/member/page_inner.tsx`
- `frontend/app/module/classroom/types.ts`
- `frontend/app/module/classroom/utils.ts`

## 3. Journey source used

- The owner assignment flow loads assignable Journeys from `v_journeys`.
- The assigned Journey detail rows are also resolved from `v_journeys`.
- The assignment itself is stored in `classroom_journeys`.
- The implementation uses the existing Journey identity pattern already present in the repo:
  - `classroom_journeys.group_event_id`
  - `v_journeys.journey_id`

## 4. Owner assignment behavior

- The owner Classroom detail page now contains an `Assigned Journeys` section.
- The owner can:
  - see all assigned Journeys for the Classroom
  - search existing Journeys from `v_journeys`
  - assign one selected Journey to the Classroom
  - see basic Journey metadata before assigning
- Assignment creates only a `classroom_journeys` row.
- The underlying Journey record is never duplicated or modified.

## 5. Reorder/toggle/remove behavior

- Reorder:
  - the owner can move an assigned Journey up or down
  - the UI rewrites `sort_order` across the affected `classroom_journeys` rows
- Toggle required:
  - the owner can switch `is_required` on or off for each assigned Journey
- Remove:
  - the owner can unassign a Journey
  - this deletes only the `classroom_journeys` row
  - the underlying Journey remains unchanged in GeoHistory
- Duplicate assignment prevention:
  - the UI prevents assigning a Journey already present in the assigned list
  - the schema unique constraint remains the database safety net

## 6. Member-facing assigned Journey view

- The member Classroom page now loads the assigned Journeys for the joined Classroom.
- The member view is read-only.
- It shows:
  - title
  - description preview
  - sort order
  - required/optional state
  - basic metadata such as events count, visibility, and published date when available
- No owner controls are exposed in the member page.

## 7. Access control behavior

- Owner assignment management continues to rely on the existing owner-only Classroom detail access.
- Database RLS remains the true enforcement layer for `classroom_journeys`.
- Members can read assigned Journey rows through the existing Point 4 read policies.
- Non-members and non-owners do not gain new access paths through Point 9.

## 8. What is intentionally deferred to Point 10 and later

- Journey progress tracking
- Journey completion state
- Quiz attempt evolution
- Ranking and analytics
- Custom Journey request flow
- Student execution flow inside assigned Journeys

## 9. Acceptance criteria for Point 9

Point 9 is complete when:

- the owner can view assigned Journeys for a Classroom
- the owner can add an existing Journey to a Classroom
- the owner can remove an assigned Journey
- the owner can reorder assigned Journeys
- the owner can toggle required on and off
- duplicate assignment is prevented cleanly
- the member Classroom view shows assigned Journeys read-only
- no progress tracking is implemented
- no quiz logic is implemented
- no ranking or analytics logic is implemented
