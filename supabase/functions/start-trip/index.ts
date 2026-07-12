import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'zod';

// Inlined (was ../../../shared/schemas.ts) so the deploy bundler ships one file.
const startTripSchema = z.object({
  busId: z.string().uuid(),
  routeId: z.string().uuid(),
  // Which run this is. A route of type BOTH runs twice a day — the driver app
  // sends MORNING or AFTERNOON so only that journey's students are loaded.
  direction: z.enum(['MORNING', 'AFTERNOON']).optional(),
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, content-type, x-client-info, apikey',
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed', statusCode: 405 }, 405);
  }

  // Auth header check
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse(
      { error: 'Missing Authorization header', statusCode: 401 },
      401,
    );
  }

  // Anon-key client with user's JWT
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: { headers: { Authorization: authHeader } },
    },
  );

  // Verify user
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse(
      { error: 'Invalid or expired session', statusCode: 401 },
      401,
    );
  }

  // Verify DRIVER role
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, school_id')
    .eq('id', userData.user.id)
    .single();

  if (profileError || !profile || profile.role !== 'DRIVER') {
    return jsonResponse(
      { error: 'Forbidden: DRIVER role required', statusCode: 403 },
      403,
    );
  }

  // Parse JSON body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body', statusCode: 400 }, 400);
  }

  // Validate with Zod
  const parseResult = startTripSchema.safeParse(body);
  if (!parseResult.success) {
    return jsonResponse(
      {
        error: 'Validation error',
        statusCode: 400,
        details: parseResult.error.issues,
      },
      400,
    );
  }

  const validated = parseResult.data;

  // Service-role client for privileged writes
  const serviceSupabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Verify bus exists and belongs to driver's school
  const { data: bus, error: busError } = await serviceSupabase
    .from('buses')
    .select('id, school_id, status')
    .eq('id', validated.busId)
    .single();

  if (busError || !bus) {
    return jsonResponse({ error: 'Bus not found', statusCode: 404 }, 404);
  }

  if (bus.school_id !== profile.school_id) {
    return jsonResponse(
      { error: 'Bus does not belong to your school', statusCode: 403 },
      403,
    );
  }

  if (bus.status !== 'ACTIVE') {
    return jsonResponse({ error: 'Bus is not active', statusCode: 400 }, 400);
  }

  // Verify route exists and belongs to the same school
  const { data: route, error: routeError } = await serviceSupabase
    .from('routes')
    .select('id, school_id, bus_id, name, type')
    .eq('id', validated.routeId)
    .single();

  if (routeError || !route) {
    return jsonResponse({ error: 'Route not found', statusCode: 404 }, 404);
  }

  if (route.school_id !== profile.school_id) {
    return jsonResponse(
      { error: 'Route does not belong to your school', statusCode: 403 },
      403,
    );
  }

  // Check no active trip for this bus
  const { data: existingTrip, error: existingTripError } = await serviceSupabase
    .from('trips')
    .select('id')
    .eq('bus_id', validated.busId)
    .eq('status', 'ACTIVE')
    .limit(1)
    .maybeSingle();

  if (existingTripError) {
    return jsonResponse(
      { error: 'Failed to create trip', statusCode: 500 },
      500,
    );
  }

  if (existingTrip) {
    return jsonResponse(
      { error: 'This bus already has an active trip', statusCode: 409 },
      409,
    );
  }

  // Insert new trip
  const { data: trip, error: tripInsertError } = await serviceSupabase
    .from('trips')
    .insert({
      bus_id: validated.busId,
      route_id: validated.routeId,
      driver_id: userData.user.id,
      status: 'ACTIVE',
      started_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (tripInsertError || !trip) {
    return jsonResponse(
      { error: 'Failed to create trip', statusCode: 500 },
      500,
    );
  }

  // Load stops for the route
  const { data: stops, error: stopsError } = await serviceSupabase
    .from('stops')
    .select('id, route_id, name, latitude, longitude, sequence, eta_minutes')
    .eq('route_id', validated.routeId)
    .order('sequence', { ascending: true });

  if (stopsError) {
    return jsonResponse(
      { error: 'Failed to create trip', statusCode: 500 },
      500,
    );
  }

  // Which run is this? Dedicated routes carry their own direction; a BOTH
  // route uses the client-sent direction, falling back to the local clock
  // (Africa/Lagos, UTC+1 — the edge runtime clock is UTC).
  const lagosHour = (new Date().getUTCHours() + 1) % 24;
  const direction: 'MORNING' | 'AFTERNOON' =
    route.type === 'MORNING' || route.type === 'AFTERNOON'
      ? route.type
      : validated.direction ?? (lagosHour < 12 ? 'MORNING' : 'AFTERNOON');

  // Load students riding THIS journey, in the driver-arranged pickup order
  // (unarranged students sort last, then by name). The afternoon drop order is
  // the reverse of the morning pickup order.
  const { data: students, error: studentsError } = await serviceSupabase
    .from('students')
    .select('id, name, class_name, photo_url, stop_id, pickup_lat, pickup_lng, pickup_sequence')
    .eq('route_id', validated.routeId)
    .eq('is_active', true)
    .in('trip_type', [direction, 'BOTH'])
    .order('pickup_sequence', { ascending: direction === 'MORNING', nullsFirst: false })
    .order('name', { ascending: true });

  if (studentsError) {
    return jsonResponse(
      { error: 'Failed to create trip', statusCode: 500 },
      500,
    );
  }

  // Parent-reported absences for today: auto-mark those students ABSENT on
  // this trip so the driver sees them cancelled immediately and skips their
  // stop — no tap needed.
  try {
    const lagosToday = new Date(Date.now() + 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const studentIds = (students ?? []).map((s) => s.id);
    if (studentIds.length > 0) {
      const { data: absences } = await serviceSupabase
        .from('student_absences')
        .select('student_id')
        .eq('absence_date', lagosToday)
        .in('student_id', studentIds);

      const absentIds = (absences ?? []).map(
        (a: { student_id: string }) => a.student_id,
      );
      if (absentIds.length > 0) {
        await serviceSupabase.from('attendance').upsert(
          absentIds.map((sid: string) => ({
            trip_id: trip.id,
            student_id: sid,
            status: 'ABSENT',
            marked_at: new Date().toISOString(),
          })),
          { onConflict: 'trip_id,student_id' },
        );
      }
    }
  } catch (err) {
    console.error('[start-trip] absence auto-mark failed:', err);
  }

  // Tell proactively-subscribed parents the trip has started, so they begin
  // tracking instantly instead of waiting for a poll (private bus channel).
  try {
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    await fetch(`${Deno.env.get('SUPABASE_URL')}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        messages: [
          {
            topic: `bus:${trip.bus_id}`,
            event: 'trip_started',
            payload: { tripId: trip.id, routeId: trip.route_id },
            private: true,
          },
        ],
      }),
    });
  } catch (err) {
    console.error('[start-trip] Realtime broadcast failed:', err);
  }

  return jsonResponse(
    {
      data: {
        id: trip.id,
        busId: trip.bus_id,
        routeId: trip.route_id,
        driverId: trip.driver_id,
        status: trip.status,
        startedAt: trip.started_at,
        direction,
        route: {
          id: route.id,
          name: route.name,
          type: route.type,
          stops: (stops ?? []).map((s) => ({
            id: s.id,
            routeId: s.route_id,
            name: s.name,
            latitude: s.latitude,
            longitude: s.longitude,
            sequence: s.sequence,
            etaMinutes: s.eta_minutes,
          })),
        },
        students: (students ?? []).map((s) => ({
          id: s.id,
          name: s.name,
          className: s.class_name,
          photoUrl: s.photo_url,
          stopId: s.stop_id,
          pickupLat: s.pickup_lat,
          pickupLng: s.pickup_lng,
        })),
      },
      message: 'Trip started',
    },
    201,
  );
});
