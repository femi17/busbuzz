-- Captures get_parent_track_bundle, which already exists on busbuzz-dev
-- (created directly against the DB via the Supabase MCP tools) but was
-- never checked into migrations — so a fresh dev DB or a straight
-- `supabase db push` replay wouldn't recreate it. HomeScreen.tsx's Track
-- screen depends on this RPC for bus/driver/stop data in one round trip
-- instead of a route -> bus -> driver + stops query waterfall.
--
-- SECURITY DEFINER, but self-enforces access: returns null unless the
-- calling user (auth.uid()) is a parent linked to the requested student via
-- student_parents, so it can't be used to read another family's data.

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
    'routeType', v_route.type,
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
