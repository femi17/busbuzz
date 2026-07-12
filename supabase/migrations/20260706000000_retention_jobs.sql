-- Cap unbounded growth of the two append-only tables.
--
-- trip_locations gains one row every ~10s per active bus and is read by the
-- parent History screen + admin live map, so we keep a 30-day window (recent
-- history intact) and purge older rows nightly. notifications is in-app history
-- and keeps 90 days.
--
-- A plain recorded_at / created_at index makes the range delete efficient (the
-- existing composite indexes lead with trip_id / user_id, so a time-only
-- predicate couldn't use them).

create extension if not exists pg_cron;

create index if not exists idx_trip_locations_recorded_at
  on public.trip_locations (recorded_at);

create index if not exists idx_notifications_created_at
  on public.notifications (created_at);

-- cron.schedule upserts by job name, so re-running this migration is safe.
select cron.schedule(
  'purge-old-trip-locations',
  '30 3 * * *',
  $$ delete from public.trip_locations where recorded_at < now() - interval '30 days' $$
);

select cron.schedule(
  'purge-old-notifications',
  '45 3 * * *',
  $$ delete from public.notifications where created_at < now() - interval '90 days' $$
);
