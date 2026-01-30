-- Fix regressions by allowing safe reads while keeping sensitive data protected.
-- - personas: readable by authenticated users (catalog/labels)
-- - profiles: readable/updatable only by the owner

do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'personas'
  ) then
    if not exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'personas' and c.relrowsecurity
    ) then
      execute 'alter table public.personas enable row level security';
    end if;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'profiles'
  ) then
    if not exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'profiles' and c.relrowsecurity
    ) then
      execute 'alter table public.profiles enable row level security';
    end if;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'personas'
      and policyname = 'personas_select_authenticated'
  ) then
    execute 'create policy personas_select_authenticated on public.personas for select to authenticated using (true)';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_select_own'
  ) then
    execute 'create policy profiles_select_own on public.profiles for select to authenticated using (auth.uid() = id)';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_update_own'
  ) then
    execute 'create policy profiles_update_own on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id)';
  end if;
end $$;
