-- Per-student ride direction. A route's own type (MORNING / AFTERNOON / BOTH)
-- describes the runs it operates; on a BOTH route, individual students may
-- still ride only one leg (e.g. dropped off by a parent in the afternoon).
-- trip_type lets the admin mark that, and the driver app already filters
-- each run's roster by it (`.in('trip_type', [runDirection, 'BOTH'])`).
--
-- This column already exists on busbuzz-dev (applied directly, no migration
-- file). Adding it here so `supabase db push` brings prod to parity.

alter table students
  add column if not exists trip_type route_type not null default 'BOTH';
