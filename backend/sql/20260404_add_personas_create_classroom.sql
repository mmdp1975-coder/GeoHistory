-- Add explicit Classroom creation capability to personas and backfill current roles.

alter table public.personas
  add column if not exists create_classroom boolean not null default false;

update public.personas
set create_classroom = true
where
  upper(coalesce(code, '')) in ('TEACHER', 'RESEARCH')
  or upper(coalesce(code, '')) like 'ADMIN%'
  or upper(coalesce(code, '')) like 'MOD%';

comment on column public.personas.create_classroom is
  'Whether this persona is allowed to create and manage classrooms.';

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
    left join personas pe
      on pe.id = p.persona_id
    where p.id = auth.uid()
      and coalesce(pe.create_classroom, false) = true
  );
$$;
