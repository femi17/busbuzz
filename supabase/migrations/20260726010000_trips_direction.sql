-- Which run a trip actually is (MORNING/AFTERNOON). start-trip already
-- resolves this per trip (from the route's own type, the client-sent
-- direction for a BOTH route, or the Lagos clock as a last resort) but never
-- persisted it — so nothing downstream of trip creation could tell a
-- morning run from an afternoon one on a BOTH-type route. That's what made
-- mark-attendance's "dropped off" push always say "at school," even on the
-- afternoon run where DROPPED_OFF means arriving home.

alter table public.trips
  add column if not exists direction text
  check (direction in ('MORNING', 'AFTERNOON'));
