-- Drivers had no RLS SELECT policies, so the driver app's own queries returned
-- zero rows — the first one (buses) failed with "No active bus assigned to your
-- school" even though a bus was assigned. Grant drivers read access to the data
-- for the bus assigned to them (buses.driver_id = auth.uid()), scoped tightly so
-- a driver only ever sees their own bus's routes, stops, students, trips, and
-- attendance.
--
-- Ownership checks are SECURITY DEFINER so their internal joins bypass RLS
-- (mirrors the existing busbuzz_is_parent_of_bus helper), avoiding recursive
-- policy evaluation.

create or replace function busbuzz_driver_owns_bus(p_bus_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from buses b where b.id = p_bus_id and b.driver_id = auth.uid()
  );
$$;

create or replace function busbuzz_driver_owns_route(p_route_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from routes r join buses b on b.id = r.bus_id
    where r.id = p_route_id and b.driver_id = auth.uid()
  );
$$;

create or replace function busbuzz_driver_owns_trip(p_trip_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from trips t join buses b on b.id = t.bus_id
    where t.id = p_trip_id and b.driver_id = auth.uid()
  );
$$;

drop policy if exists buses_select_driver on buses;
create policy buses_select_driver on buses for select
  using (busbuzz_auth_role() = 'DRIVER'::user_role and driver_id = auth.uid());

drop policy if exists routes_select_driver on routes;
create policy routes_select_driver on routes for select
  using (busbuzz_auth_role() = 'DRIVER'::user_role and busbuzz_driver_owns_bus(bus_id));

drop policy if exists stops_select_driver on stops;
create policy stops_select_driver on stops for select
  using (busbuzz_auth_role() = 'DRIVER'::user_role and busbuzz_driver_owns_route(route_id));

drop policy if exists students_select_driver on students;
create policy students_select_driver on students for select
  using (busbuzz_auth_role() = 'DRIVER'::user_role and busbuzz_driver_owns_route(route_id));

drop policy if exists trips_select_driver on trips;
create policy trips_select_driver on trips for select
  using (busbuzz_auth_role() = 'DRIVER'::user_role and busbuzz_driver_owns_bus(bus_id));

drop policy if exists attendance_select_driver on attendance;
create policy attendance_select_driver on attendance for select
  using (busbuzz_auth_role() = 'DRIVER'::user_role and busbuzz_driver_owns_trip(trip_id));

drop policy if exists schools_select_driver on schools;
create policy schools_select_driver on schools for select
  using (busbuzz_auth_role() = 'DRIVER'::user_role and id = busbuzz_auth_school_id());
