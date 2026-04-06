-- Point 8: token-based invite resolution and classroom join RPCs.
-- This file is NOT applied automatically. Execute it manually against the target database.

create or replace function public.classroom_resolve_active_invite(p_token text)
returns table (
  invite_id uuid,
  classroom_id uuid,
  invite_type classroom_invite_type,
  email_target text,
  created_at timestamptz,
  title text,
  description text,
  access_mode classroom_access_mode,
  status classroom_status,
  owner_profile_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ci.id,
    ci.classroom_id,
    ci.invite_type,
    ci.email_target,
    ci.created_at,
    c.title,
    c.description,
    c.access_mode,
    c.status,
    c.owner_profile_id
  from classroom_invites ci
  join classrooms c
    on c.id = ci.classroom_id
  where ci.token = p_token
    and ci.active = true
  limit 1
$$;

create or replace function public.join_classroom_by_token(p_token text)
returns table (
  classroom_id uuid,
  membership_id uuid,
  joined boolean,
  already_member boolean,
  is_owner boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := auth.uid();
  v_classroom_id uuid;
  v_owner_profile_id uuid;
  v_membership_id uuid;
  v_member_role classroom_member_role;
  v_member_status classroom_member_status;
begin
  if v_profile_id is null then
    raise exception 'Authentication required';
  end if;

  select
    c.id,
    c.owner_profile_id
  into
    v_classroom_id,
    v_owner_profile_id
  from classroom_invites ci
  join classrooms c
    on c.id = ci.classroom_id
  where ci.token = p_token
    and ci.active = true
  limit 1;

  if v_classroom_id is null then
    raise exception 'Invalid or inactive invite';
  end if;

  if v_owner_profile_id = v_profile_id then
    return query
    select v_classroom_id, null::uuid, false, false, true;
    return;
  end if;

  select
    cm.id,
    cm.member_role,
    cm.status
  into
    v_membership_id,
    v_member_role,
    v_member_status
  from classroom_members cm
  where cm.classroom_id = v_classroom_id
    and cm.member_profile_id = v_profile_id
  limit 1;

  if v_membership_id is not null then
    if v_member_role = 'owner' then
      return query
      select v_classroom_id, v_membership_id, false, false, true;
      return;
    end if;

    if v_member_status = 'active' then
      return query
      select v_classroom_id, v_membership_id, false, true, false;
      return;
    end if;

    update classroom_members
    set
      member_role = 'student',
      status = 'active',
      joined_at = coalesce(joined_at, now())
    where id = v_membership_id;

    return query
    select v_classroom_id, v_membership_id, true, false, false;
    return;
  end if;

  insert into classroom_members (
    classroom_id,
    member_profile_id,
    member_role,
    status,
    joined_at
  )
  values (
    v_classroom_id,
    v_profile_id,
    'student',
    'active',
    now()
  )
  returning id into v_membership_id;

  return query
  select v_classroom_id, v_membership_id, true, false, false;
end;
$$;

revoke all on function public.classroom_resolve_active_invite(text) from public;
revoke all on function public.join_classroom_by_token(text) from public;

grant execute on function public.classroom_resolve_active_invite(text) to anon;
grant execute on function public.classroom_resolve_active_invite(text) to authenticated;
grant execute on function public.join_classroom_by_token(text) to authenticated;
