-- Point 12: Classroom ranking RPCs.
-- This file is NOT applied automatically. Execute it manually against the target database.

create or replace function public.classroom_journey_ranking(
  p_classroom_id uuid,
  p_group_event_id uuid default null
)
returns table (
  classroom_id uuid,
  group_event_id uuid,
  profile_id uuid,
  display_name text,
  attempts_count bigint,
  latest_score integer,
  best_score integer,
  latest_completed_at timestamptz,
  best_completed_at timestamptz,
  ranking_position bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with authorized as (
    select public.classroom_can_read(p_classroom_id, auth.uid()) as ok
  ),
  attempt_scope as (
    select
      qa.id,
      qa.classroom_id,
      qa.group_event_id,
      qa.profile_id,
      qa.score,
      qa.completed_at,
      qa.started_at
    from quiz_attempts qa
    join classroom_members cm
      on cm.classroom_id = qa.classroom_id
     and cm.member_profile_id = qa.profile_id
     and cm.member_role = 'student'
     and cm.status = 'active'
    join classroom_journeys cj
      on cj.classroom_id = qa.classroom_id
     and cj.group_event_id = qa.group_event_id
    join authorized a
      on a.ok = true
    where qa.classroom_id = p_classroom_id
      and (p_group_event_id is null or qa.group_event_id = p_group_event_id)
  ),
  latest_attempt as (
    select distinct on (a.group_event_id, a.profile_id)
      a.group_event_id,
      a.profile_id,
      a.score as latest_score,
      a.completed_at as latest_completed_at
    from attempt_scope a
    order by
      a.group_event_id,
      a.profile_id,
      a.completed_at desc nulls last,
      a.started_at desc,
      a.id desc
  ),
  best_attempt as (
    select distinct on (a.group_event_id, a.profile_id)
      a.group_event_id,
      a.profile_id,
      a.score as best_score,
      a.completed_at as best_completed_at
    from attempt_scope a
    order by
      a.group_event_id,
      a.profile_id,
      a.score desc,
      a.completed_at asc nulls last,
      a.started_at asc,
      a.id asc
  ),
  summary as (
    select
      a.classroom_id,
      a.group_event_id,
      a.profile_id,
      count(*)::bigint as attempts_count
    from attempt_scope a
    group by
      a.classroom_id,
      a.group_event_id,
      a.profile_id
  ),
  ranked as (
    select
      s.classroom_id,
      s.group_event_id,
      s.profile_id,
      coalesce(
        nullif(trim(p.full_name), ''),
        nullif(trim(p.username), ''),
        left(s.profile_id::text, 8)
      ) as display_name,
      s.attempts_count,
      la.latest_score,
      ba.best_score,
      la.latest_completed_at,
      ba.best_completed_at,
      row_number() over (
        partition by s.group_event_id
        order by
          ba.best_score desc,
          ba.best_completed_at asc nulls last,
          la.latest_score desc,
          s.profile_id asc
      ) as ranking_position
    from summary s
    join latest_attempt la
      on la.group_event_id = s.group_event_id
     and la.profile_id = s.profile_id
    join best_attempt ba
      on ba.group_event_id = s.group_event_id
     and ba.profile_id = s.profile_id
    left join profiles p
      on p.id = s.profile_id
  )
  select
    classroom_id,
    group_event_id,
    profile_id,
    display_name,
    attempts_count,
    latest_score,
    best_score,
    latest_completed_at,
    best_completed_at,
    ranking_position
  from ranked
  order by group_event_id, ranking_position;
$$;

revoke all on function public.classroom_journey_ranking(uuid, uuid) from public;
grant execute on function public.classroom_journey_ranking(uuid, uuid) to authenticated;
