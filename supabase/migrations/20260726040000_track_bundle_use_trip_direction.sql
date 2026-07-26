-- get_parent_track_bundle returned the ROUTE's nominal type (MORNING /
-- AFTERNOON / BOTH) as 'routeType', which the parent app uses to decide
-- whether a DROPPED_OFF child was left "In school" or "Home". For a
-- BOTH-type route that's ambiguous by definition — it stayed 'BOTH'
-- regardless of which actual run was in progress, so the afternoon run on a
-- BOTH route could show "In school" for a child who was just dropped at
-- home. trips.direction (added in 20260726010000) now records which run a
-- given trip actually is; prefer that when a trip is active, falling back
-- to the route's own type only when there's no trip to ask.
--
-- Note: the parent app only re-fetches this bundle when the selected child
-- changes, not when a trip starts — so this closes the gap for the common
-- case (app opened/reloaded while a trip is already active) but not for a
-- trip that starts while the bundle is already loaded and untouched. The
-- push notification path (mark-attendance) reads trips.direction directly
-- on every send and isn't affected by that staleness.

create or replace function public.get_parent_track_bundle(p_student_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path = public
as $function$
declare
  v_student students%rowtype;
  v_route routes%rowtype;
  v_bus buses%rowtype;
  v_driver profiles%rowtype;
  v_trip trips%rowtype;
begin
  if not exists (
    select 1 from student_parents sp
    where sp.student_id = p_student_id and sp.parent_id = auth.uid()
  ) then
    return null;
  end if;

  select * into v_student from students where id = p_student_id;
  if not found then return null; end if;

  if v_student.route_id is not null then
    select * into v_route from routes where id = v_student.route_id;
    if v_route.bus_id is not null then
      select * into v_bus from buses where id = v_route.bus_id;
      if v_bus.driver_id is not null then
        select * into v_driver from profiles where id = v_bus.driver_id;
      end if;
      select * into v_trip from trips
        where bus_id = v_bus.id and status = 'ACTIVE'
        order by started_at desc limit 1;
    end if;
  end if;

  return jsonb_build_object(
    'busId', v_bus.id,
    'plateNumber', v_bus.plate_number,
    'routeName', v_route.name,
    'routeType', coalesce(v_trip.direction, v_route.type),
    'driver', case when v_driver.id is not null then jsonb_build_object(
      'name', v_driver.name, 'photoUrl', v_driver.photo_url, 'phone', v_driver.phone
    ) else null end,
    'stops', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'latitude', s.latitude,
        'longitude', s.longitude, 'sequence', s.sequence, 'etaMinutes', s.eta_minutes
      ) order by s.sequence)
      from stops s where s.route_id = v_route.id
    ), '[]'::jsonb),
    'assignedStop', (
      select jsonb_build_object(
        'id', s.id, 'name', s.name, 'latitude', s.latitude,
        'longitude', s.longitude, 'etaMinutes', s.eta_minutes
      ) from stops s where s.id = v_student.stop_id
    ),
    'activeTrip', case when v_trip.id is not null then jsonb_build_object(
      'id', v_trip.id, 'busId', v_trip.bus_id, 'routeId', v_trip.route_id,
      'hasSos', coalesce(v_trip.has_sos, false)
    ) else null end,
    'attendanceStatus', (
      select a.status from attendance a
      where a.trip_id = v_trip.id and a.student_id = p_student_id
    )
  );
end;
$function$;
