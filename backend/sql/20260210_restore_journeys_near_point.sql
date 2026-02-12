-- Restore RPC used by timeline geo filter.
-- Returns group_event_id values whose events fall within radius_km of (lat, lon).

create extension if not exists postgis;

drop function if exists public.journeys_near_point(double precision, double precision, double precision);

create function public.journeys_near_point(
  lat double precision,
  lon double precision,
  radius_km double precision
)
returns setof uuid
language sql
stable
as $$
  select distinct ege.group_event_id
  from event_group_event ege
  join events_list e on e.id = ege.event_id
  where e.latitude is not null
    and e.longitude is not null
    and radius_km > 0
    and st_dwithin(
      geography(st_makepoint(e.longitude, e.latitude)),
      geography(st_makepoint(lon, lat)),
      radius_km * 1000.0
    );
$$;

grant execute on function public.journeys_near_point(double precision, double precision, double precision)
  to anon, authenticated;
