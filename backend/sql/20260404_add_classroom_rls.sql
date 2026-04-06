-- Classroom row-level security and permission model.
-- Point 4 scope only: RLS, policies, and minimal helper functions.

create or replace function public.classroom_current_profile_can_create()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from profiles p
    join personas pe
      on pe.id = p.persona_id
    where p.id = auth.uid()
      and coalesce(pe.create_classroom, false) = true
  );
$$;

create or replace function public.classroom_is_owner(
  p_classroom_id uuid,
  p_profile_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from classrooms c
    where c.id = p_classroom_id
      and c.owner_profile_id = p_profile_id
  );
$$;

create or replace function public.classroom_is_active_member(
  p_classroom_id uuid,
  p_profile_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from classroom_members cm
    where cm.classroom_id = p_classroom_id
      and cm.member_profile_id = p_profile_id
      and cm.status = 'active'
  );
$$;

create or replace function public.classroom_can_read(
  p_classroom_id uuid,
  p_profile_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.classroom_is_owner(p_classroom_id, p_profile_id)
      or public.classroom_is_active_member(p_classroom_id, p_profile_id);
$$;

create or replace function public.classroom_owner_membership_is_valid(
  p_classroom_id uuid,
  p_member_profile_id uuid,
  p_member_role classroom_member_role
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_member_role <> 'owner' then true
    else exists (
      select 1
      from classrooms c
      where c.id = p_classroom_id
        and c.owner_profile_id = p_member_profile_id
    )
  end;
$$;

create or replace function public.classroom_request_scope_is_valid(
  p_classroom_id uuid,
  p_requester_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_classroom_id is null then true
    else exists (
      select 1
      from classrooms c
      where c.id = p_classroom_id
        and c.owner_profile_id = p_requester_profile_id
    )
  end;
$$;

create or replace function public.classroom_journey_is_assigned(
  p_classroom_id uuid,
  p_group_event_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from classroom_journeys cj
    where cj.classroom_id = p_classroom_id
      and cj.group_event_id = p_group_event_id
  );
$$;

create or replace function public.classroom_can_write_own_journey_activity(
  p_classroom_id uuid,
  p_group_event_id uuid,
  p_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_profile_id = auth.uid()
    and public.classroom_is_active_member(p_classroom_id, p_profile_id)
    and public.classroom_journey_is_assigned(p_classroom_id, p_group_event_id);
$$;

revoke all on function public.classroom_current_profile_can_create() from public;
revoke all on function public.classroom_is_owner(uuid, uuid) from public;
revoke all on function public.classroom_is_active_member(uuid, uuid) from public;
revoke all on function public.classroom_can_read(uuid, uuid) from public;
revoke all on function public.classroom_owner_membership_is_valid(uuid, uuid, classroom_member_role) from public;
revoke all on function public.classroom_request_scope_is_valid(uuid, uuid) from public;
revoke all on function public.classroom_journey_is_assigned(uuid, uuid) from public;
revoke all on function public.classroom_can_write_own_journey_activity(uuid, uuid, uuid) from public;

grant execute on function public.classroom_current_profile_can_create() to authenticated;
grant execute on function public.classroom_is_owner(uuid, uuid) to authenticated;
grant execute on function public.classroom_is_active_member(uuid, uuid) to authenticated;
grant execute on function public.classroom_can_read(uuid, uuid) to authenticated;
grant execute on function public.classroom_owner_membership_is_valid(uuid, uuid, classroom_member_role) to authenticated;
grant execute on function public.classroom_request_scope_is_valid(uuid, uuid) to authenticated;
grant execute on function public.classroom_journey_is_assigned(uuid, uuid) to authenticated;
grant execute on function public.classroom_can_write_own_journey_activity(uuid, uuid, uuid) to authenticated;

revoke all on public.classrooms from anon;
revoke all on public.classroom_members from anon;
revoke all on public.classroom_invites from anon;
revoke all on public.classroom_journeys from anon;
revoke all on public.journey_requests from anon;
revoke all on public.journey_progress from anon;
revoke all on public.quiz_attempts from anon;

grant select, insert, update, delete on public.classrooms to authenticated;
grant select, insert, update, delete on public.classroom_members to authenticated;
grant select, insert, update, delete on public.classroom_invites to authenticated;
grant select, insert, update, delete on public.classroom_journeys to authenticated;
grant select, insert, update, delete on public.journey_requests to authenticated;
grant select, insert, update on public.journey_progress to authenticated;
grant select, insert on public.quiz_attempts to authenticated;

alter table public.classrooms enable row level security;
alter table public.classroom_members enable row level security;
alter table public.classroom_invites enable row level security;
alter table public.classroom_journeys enable row level security;
alter table public.journey_requests enable row level security;
alter table public.journey_progress enable row level security;
alter table public.quiz_attempts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'classrooms'
      and policyname = 'classrooms_select_owner_or_active_member'
  ) then
    execute $policy$
      create policy classrooms_select_owner_or_active_member
      on public.classrooms
      for select
      to authenticated
      using (public.classroom_can_read(id))
    $policy$;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'classrooms'
      and policyname = 'classrooms_insert_creator_owner'
  ) then
    execute $policy$
      create policy classrooms_insert_creator_owner
      on public.classrooms
      for insert
      to authenticated
      with check (
        auth.uid() = owner_profile_id
        and public.classroom_current_profile_can_create()
      )
    $policy$;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'classrooms'
      and policyname = 'classrooms_update_owner_only'
  ) then
    execute $policy$
      create policy classrooms_update_owner_only
      on public.classrooms
      for update
      to authenticated
      using (public.classroom_is_owner(id))
      with check (owner_profile_id = auth.uid())
    $policy$;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'classrooms'
      and policyname = 'classrooms_delete_owner_only'
  ) then
    execute $policy$
      create policy classrooms_delete_owner_only
      on public.classrooms
      for delete
      to authenticated
      using (public.classroom_is_owner(id))
    $policy$;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'classroom_members'
      and policyname = 'classroom_members_select_owner_or_self'
  ) then
    execute $policy$
      create policy classroom_members_select_owner_or_self
      on public.classroom_members
      for select
      to authenticated
      using (
        public.classroom_is_owner(classroom_id)
        or member_profile_id = auth.uid()
      )
    $policy$;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'classroom_members'
      and policyname = 'classroom_members_insert_owner_managed'
  ) then
    execute $policy$
      create policy classroom_members_insert_owner_managed
      on public.classroom_members
      for insert
      to authenticated
      with check (
        public.classroom_is_owner(classroom_id)
        and public.classroom_owner_membership_is_valid(classroom_id, member_profile_id, member_role)
      )
    $policy$;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'classroom_members'
      and policyname = 'classroom_members_update_owner_managed_non_owner_rows'
  ) then
    execute $policy$
      create policy classroom_members_update_owner_managed_non_owner_rows
      on public.classroom_members
      for update
      to authenticated
      using (
        public.classroom_is_owner(classroom_id)
        and member_role <> 'owner'
      )
      with check (
        public.classroom_is_owner(classroom_id)
        and member_role <> 'owner'
        and public.classroom_owner_membership_is_valid(classroom_id, member_profile_id, member_role)
      )
    $policy$;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'classroom_members'
      and policyname = 'classroom_members_delete_owner_managed_non_owner_rows'
  ) then
    execute $policy$
      create policy classroom_members_delete_owner_managed_non_owner_rows
      on public.classroom_members
      for delete
      to authenticated
      using (
        public.classroom_is_owner(classroom_id)
        and member_role <> 'owner'
      )
    $policy$;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'classroom_invites'
      and policyname = 'classroom_invites_select_owner_only'
  ) then
    execute $policy$
      create policy classroom_invites_select_owner_only
      on public.classroom_invites
      for select
      to authenticated
      using (public.classroom_is_owner(classroom_id))
    $policy$;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'classroom_invites'
      and policyname = 'classroom_invites_insert_owner_only'
  ) then
    execute $policy$
      create policy classroom_invites_insert_owner_only
      on public.classroom_invites
      for insert
      to authenticated
      with check (public.classroom_is_owner(classroom_id))
    $policy$;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'classroom_invites'
      and policyname = 'classroom_invites_update_owner_only'
  ) then
    execute $policy$
      create policy classroom_invites_update_owner_only
      on public.classroom_invites
      for update
      to authenticated
      using (public.classroom_is_owner(classroom_id))
      with check (public.classroom_is_owner(classroom_id))
    $policy$;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'classroom_invites'
      and policyname = 'classroom_invites_delete_owner_only'
  ) then
    execute $policy$
      create policy classroom_invites_delete_owner_only
      on public.classroom_invites
      for delete
      to authenticated
      using (public.classroom_is_owner(classroom_id))
    $policy$;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'classroom_journeys'
      and policyname = 'classroom_journeys_select_owner_or_active_member'
  ) then
    execute $policy$
      create policy classroom_journeys_select_owner_or_active_member
      on public.classroom_journeys
      for select
      to authenticated
      using (public.classroom_can_read(classroom_id))
    $policy$;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'classroom_journeys'
      and policyname = 'classroom_journeys_insert_owner_only'
  ) then
    execute $policy$
      create policy classroom_journeys_insert_owner_only
      on public.classroom_journeys
      for insert
      to authenticated
      with check (public.classroom_is_owner(classroom_id))
    $policy$;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'classroom_journeys'
      and policyname = 'classroom_journeys_update_owner_only'
  ) then
    execute $policy$
      create policy classroom_journeys_update_owner_only
      on public.classroom_journeys
      for update
      to authenticated
      using (public.classroom_is_owner(classroom_id))
      with check (public.classroom_is_owner(classroom_id))
    $policy$;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'classroom_journeys'
      and policyname = 'classroom_journeys_delete_owner_only'
  ) then
    execute $policy$
      create policy classroom_journeys_delete_owner_only
      on public.classroom_journeys
      for delete
      to authenticated
      using (public.classroom_is_owner(classroom_id))
    $policy$;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'journey_requests'
      and policyname = 'journey_requests_select_requester_or_classroom_owner'
  ) then
    execute $policy$
      create policy journey_requests_select_requester_or_classroom_owner
      on public.journey_requests
      for select
      to authenticated
      using (
        requester_profile_id = auth.uid()
        or (
          classroom_id is not null
          and public.classroom_is_owner(classroom_id)
        )
      )
    $policy$;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'journey_requests'
      and policyname = 'journey_requests_insert_requester_owned_scope'
  ) then
    execute $policy$
      create policy journey_requests_insert_requester_owned_scope
      on public.journey_requests
      for insert
      to authenticated
      with check (
        requester_profile_id = auth.uid()
        and public.classroom_current_profile_can_create()
        and public.classroom_request_scope_is_valid(classroom_id, requester_profile_id)
      )
    $policy$;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'journey_requests'
      and policyname = 'journey_requests_update_requester_or_classroom_owner'
  ) then
    execute $policy$
      create policy journey_requests_update_requester_or_classroom_owner
      on public.journey_requests
      for update
      to authenticated
      using (
        requester_profile_id = auth.uid()
        or (
          classroom_id is not null
          and public.classroom_is_owner(classroom_id)
        )
      )
      with check (
        (
          requester_profile_id = auth.uid()
          or (
            classroom_id is not null
            and public.classroom_is_owner(classroom_id)
          )
        )
        and public.classroom_request_scope_is_valid(classroom_id, requester_profile_id)
      )
    $policy$;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'journey_requests'
      and policyname = 'journey_requests_delete_requester_or_classroom_owner'
  ) then
    execute $policy$
      create policy journey_requests_delete_requester_or_classroom_owner
      on public.journey_requests
      for delete
      to authenticated
      using (
        requester_profile_id = auth.uid()
        or (
          classroom_id is not null
          and public.classroom_is_owner(classroom_id)
        )
      )
    $policy$;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'journey_progress'
      and policyname = 'journey_progress_select_self_or_classroom_owner'
  ) then
    execute $policy$
      create policy journey_progress_select_self_or_classroom_owner
      on public.journey_progress
      for select
      to authenticated
      using (
        profile_id = auth.uid()
        or public.classroom_is_owner(classroom_id)
      )
    $policy$;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'journey_progress'
      and policyname = 'journey_progress_insert_self_active_member_assigned_journey'
  ) then
    execute $policy$
      create policy journey_progress_insert_self_active_member_assigned_journey
      on public.journey_progress
      for insert
      to authenticated
      with check (
        public.classroom_can_write_own_journey_activity(classroom_id, group_event_id, profile_id)
      )
    $policy$;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'journey_progress'
      and policyname = 'journey_progress_update_self_active_member_assigned_journey'
  ) then
    execute $policy$
      create policy journey_progress_update_self_active_member_assigned_journey
      on public.journey_progress
      for update
      to authenticated
      using (profile_id = auth.uid())
      with check (
        public.classroom_can_write_own_journey_activity(classroom_id, group_event_id, profile_id)
      )
    $policy$;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'quiz_attempts'
      and policyname = 'quiz_attempts_select_self_or_classroom_owner'
  ) then
    execute $policy$
      create policy quiz_attempts_select_self_or_classroom_owner
      on public.quiz_attempts
      for select
      to authenticated
      using (
        profile_id = auth.uid()
        or public.classroom_is_owner(classroom_id)
      )
    $policy$;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'quiz_attempts'
      and policyname = 'quiz_attempts_insert_self_active_member_assigned_journey'
  ) then
    execute $policy$
      create policy quiz_attempts_insert_self_active_member_assigned_journey
      on public.quiz_attempts
      for insert
      to authenticated
      with check (
        public.classroom_can_write_own_journey_activity(classroom_id, group_event_id, profile_id)
      )
    $policy$;
  end if;
end $$;
