-- trip_summaries: the durable analytics archive.
--
-- Raw GPS pings (trip_locations) are purged after 30 days, which caps table
-- growth but would erase the platform's long-term data asset. This table keeps
-- a compact per-trip roll-up forever: distance, duration, speeds, a simplified
-- route polyline, per-stop arrival times, and attendance counts. It is written
-- once per finished trip by a nightly job that runs BEFORE the purge job.
--
-- Deliberately denormalized (school_id, route_id, bus_id, driver_id copied in,
-- no FK on trip_id) so a summary outlives anything else being deleted.

create table if not exists public.trip_summaries (
  trip_id       uuid primary key,
  school_id     uuid,
  route_id      uuid,
  bus_id        uuid,
  driver_id     uuid,
  status        text not null,
  started_at    timestamptz not null,
  ended_at      timestamptz,
  duration_s    int,
  ping_count    int not null default 0,
  distance_m    double precision,
  -- Same unit as trip_locations.speed (as reported by the driver device).
  avg_speed     real,
  max_speed     real,
  -- Simplified [lng, lat] coordinate list, capped at ~200 points.
  path          jsonb,
  -- [{ stop_id, name, sequence, arrived_at }] — arrived_at null if never reached.
  stop_arrivals jsonb,
  boarded_count int not null default 0,
  absent_count  int not null default 0,
  dropped_count int not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists idx_trip_summaries_school_started
  on public.trip_summaries (school_id, started_at desc);

alter table public.trip_summaries enable row level security;

-- Read-only from the app: super admins see everything, school admins their
-- school. Rows are written only by the summarize job (definer function).
drop policy if exists trip_summaries_admin_read on public.trip_summaries;
create policy trip_summaries_admin_read on public.trip_summaries
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          p.role = 'SUPER_ADMIN'
          or (p.role = 'SCHOOL_ADMIN' and p.school_id = trip_summaries.school_id)
        )
    )
  );

create or replace function public.summarize_trips()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  inserted integer;
begin
  insert into trip_summaries (
    trip_id, school_id, route_id, bus_id, driver_id, status,
    started_at, ended_at, duration_s,
    ping_count, distance_m, avg_speed, max_speed, path, stop_arrivals,
    boarded_count, absent_count, dropped_count
  )
  select
    t.id, b.school_id, t.route_id, t.bus_id, t.driver_id, t.status::text,
    t.started_at, t.ended_at,
    case when t.ended_at is not null
      then extract(epoch from t.ended_at - t.started_at)::int end,
    coalesce(g.ping_count, 0), g.distance_m, g.avg_speed, g.max_speed, g.path,
    sa.stop_arrivals,
    coalesce(a.boarded, 0), coalesce(a.absent, 0), coalesce(a.dropped, 0)
  from trips t
  join buses b on b.id = t.bus_id
  left join lateral (
    with pts as (
      select
        latitude, longitude, speed, recorded_at,
        lag(latitude)  over (order by recorded_at) as plat,
        lag(longitude) over (order by recorded_at) as plng,
        row_number()   over (order by recorded_at) as rn,
        count(*)       over () as n
      from trip_locations
      where trip_id = t.id
    )
    select
      count(*)::int as ping_count,
      sum(
        case when plat is null then 0 else
          2 * 6371000 * asin(sqrt(
            power(sin(radians(latitude - plat) / 2), 2)
            + cos(radians(plat)) * cos(radians(latitude))
              * power(sin(radians(longitude - plng) / 2), 2)
          ))
        end
      ) as distance_m,
      avg(speed)::real as avg_speed,
      max(speed)::real as max_speed,
      (
        select jsonb_agg(
                 jsonb_build_array(round(longitude::numeric, 6), round(latitude::numeric, 6))
                 order by recorded_at
               )
        from pts
        where mod(rn - 1, greatest(1, ceil(n / 200.0)::int)) = 0 or rn = n
      ) as path
    from pts
  ) g on true
  left join lateral (
    select jsonb_agg(
             jsonb_build_object(
               'stop_id', s.id, 'name', s.name, 'sequence', s.sequence,
               'arrived_at', fa.arrived_at
             )
             order by s.sequence
           ) as stop_arrivals
    from stops s
    left join lateral (
      select min(tl.recorded_at) as arrived_at
      from trip_locations tl
      where tl.trip_id = t.id
        and 2 * 6371000 * asin(sqrt(
              power(sin(radians(tl.latitude - s.latitude) / 2), 2)
              + cos(radians(s.latitude)) * cos(radians(tl.latitude))
                * power(sin(radians(tl.longitude - s.longitude) / 2), 2)
            )) < 300
    ) fa on true
    where s.route_id = t.route_id
  ) sa on true
  left join lateral (
    select
      count(*) filter (where status = 'BOARDED')     as boarded,
      count(*) filter (where status = 'ABSENT')      as absent,
      count(*) filter (where status = 'DROPPED_OFF') as dropped
    from attendance
    where trip_id = t.id
  ) a on true
  where t.status <> 'ACTIVE'
    and not exists (select 1 from trip_summaries ts where ts.trip_id = t.id)
  on conflict (trip_id) do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end;
$fn$;

-- Nightly at 03:00 — half an hour BEFORE purge-old-trip-locations (03:30), so
-- every finished trip is summarized while its raw pings still exist.
-- cron.schedule upserts by job name, so re-running is safe.
select cron.schedule(
  'summarize-completed-trips',
  '0 3 * * *',
  $job$ select public.summarize_trips() $job$
);

-- Backfill everything finish-able right now (raw pings from the last 30 days
-- are still present).
select public.summarize_trips();
