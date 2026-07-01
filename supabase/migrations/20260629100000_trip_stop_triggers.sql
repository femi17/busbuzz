-- Trip stop triggers: records which stops have been geofence-triggered during a trip.
-- Written and read exclusively by Edge Functions via service-role client.

create table trip_stop_triggers (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references trips(id) on delete cascade,
  stop_id     uuid not null references stops(id) on delete cascade,
  triggered_at timestamptz not null default now(),
  unique (trip_id, stop_id)
);

create index idx_trip_stop_triggers_trip_id on trip_stop_triggers (trip_id);

-- Enable RLS but add no public policies.
-- All access is via service-role client which bypasses RLS.
-- School admins get a SELECT policy for debugging/visibility in the dashboard.
alter table trip_stop_triggers enable row level security;

create policy trip_stop_triggers_select_school_admin
on trip_stop_triggers for select
using (
  busbuzz_auth_role() = 'SCHOOL_ADMIN'
  and exists (
    select 1 from trips t
    join routes r on r.id = t.route_id
    where t.id = trip_stop_triggers.trip_id
      and r.school_id = busbuzz_auth_school_id()
  )
);
