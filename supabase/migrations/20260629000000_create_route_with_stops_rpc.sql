-- RPC function: atomically inserts a route and its stops in a single transaction.
-- Called from the manage-route Edge Function after auth + validation.
-- Uses SECURITY DEFINER so it bypasses RLS (the Edge Function handles auth).

create or replace function create_route_with_stops(
  p_school_id uuid,
  p_bus_id uuid,
  p_name text,
  p_type route_type,
  p_stops jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_route_id uuid;
  v_stop jsonb;
  v_result jsonb;
begin
  -- Insert the route
  insert into routes (school_id, bus_id, name, type)
  values (p_school_id, p_bus_id, p_name, p_type)
  returning id into v_route_id;

  -- Insert all stops
  for v_stop in select * from jsonb_array_elements(p_stops)
  loop
    insert into stops (route_id, name, latitude, longitude, sequence, eta_minutes)
    values (
      v_route_id,
      v_stop->>'name',
      (v_stop->>'latitude')::double precision,
      (v_stop->>'longitude')::double precision,
      (v_stop->>'sequence')::int,
      (v_stop->>'etaMinutes')::int
    );
  end loop;

  -- Build the response: route with embedded stops array
  select jsonb_build_object(
    'id', r.id,
    'schoolId', r.school_id,
    'busId', r.bus_id,
    'name', r.name,
    'type', r.type,
    'stops', coalesce(
      (select jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'routeId', s.route_id,
          'name', s.name,
          'latitude', s.latitude,
          'longitude', s.longitude,
          'sequence', s.sequence,
          'etaMinutes', s.eta_minutes
        ) order by s.sequence
      ) from stops s where s.route_id = r.id),
      '[]'::jsonb
    )
  ) into v_result
  from routes r
  where r.id = v_route_id;

  return v_result;
end;
$$;
