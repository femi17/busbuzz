-- Platform-wide analytics for the super admin, aggregated in the database
-- from the trip_summaries archive so the payload stays tiny at any scale.

create or replace function public.get_platform_analytics()
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  result jsonb;
begin
  -- Super admin only.
  if not exists (
    select 1 from profiles where id = auth.uid() and role = 'SUPER_ADMIN'
  ) then
    raise exception 'not authorized';
  end if;

  select jsonb_build_object(
    'totals', (
      select jsonb_build_object(
        'trips',      count(*),
        'distanceM',  coalesce(sum(distance_m), 0),
        'boarded',    coalesce(sum(boarded_count), 0),
        'absent',     coalesce(sum(absent_count), 0),
        'dropped',    coalesce(sum(dropped_count), 0),
        'firstTripAt', min(started_at)
      )
      from trip_summaries
    ),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'date', d.day, 'trips', coalesce(s.trips, 0),
        'boarded', coalesce(s.boarded, 0), 'distanceM', coalesce(s.distance_m, 0)
      ) order by d.day), '[]'::jsonb)
      from generate_series(
        (now() at time zone 'Africa/Lagos')::date - 13,
        (now() at time zone 'Africa/Lagos')::date,
        interval '1 day'
      ) as d(day)
      left join (
        select (started_at at time zone 'Africa/Lagos')::date as day,
               count(*) as trips,
               sum(boarded_count) as boarded,
               sum(distance_m) as distance_m
        from trip_summaries
        where started_at >= now() - interval '15 days'
        group by 1
      ) s on s.day = d.day::date
    ),
    'perSchool', (
      select coalesce(jsonb_agg(row order by (row->>'trips')::int desc), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'schoolId', ts.school_id,
          'name', coalesce(sc.name, 'Unknown school'),
          'trips', count(*),
          'distanceM', coalesce(sum(ts.distance_m), 0),
          'boarded', coalesce(sum(ts.boarded_count), 0),
          'lastTripAt', max(ts.started_at)
        ) as row
        from trip_summaries ts
        left join schools sc on sc.id = ts.school_id
        group by ts.school_id, sc.name
        order by count(*) desc
        limit 20
      ) t
    )
  ) into result;

  return result;
end;
$fn$;
