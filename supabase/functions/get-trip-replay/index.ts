import { createClient } from 'npm:@supabase/supabase-js@2';

// Returns everything needed to replay one past trip on a map: ordered GPS
// breadcrumbs, the route's stops with their geofence-arrival times, and the
// attendance events (boarded / dropped off / absent) with driver timestamps —
// all normalised to milliseconds since trip start so the client can scrub a
// single timeline. Read-only, SCHOOL_ADMIN / SUPER_ADMIN, scoped to the trip's
// own school via a service-role read after an ownership check.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, content-type, x-client-info, apikey',
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed', statusCode: 405 }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Missing Authorization header', statusCode: 401 }, 401);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse({ error: 'Invalid or expired session', statusCode: 401 }, 401);
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, school_id')
    .eq('id', userData.user.id)
    .single();

  if (
    profileError ||
    !profile ||
    (profile.role !== 'SCHOOL_ADMIN' && profile.role !== 'SUPER_ADMIN')
  ) {
    return jsonResponse(
      { error: 'Forbidden: SCHOOL_ADMIN or SUPER_ADMIN role required', statusCode: 403 },
      403,
    );
  }
  if (!profile.school_id) {
    return jsonResponse({ error: 'No school associated with this account', statusCode: 403 }, 403);
  }
  const schoolId = profile.school_id as string;

  const url = new URL(req.url);
  const tripId = url.searchParams.get('tripId') ?? '';
  if (!UUID_RE.test(tripId)) {
    return jsonResponse({ error: 'A valid tripId is required', statusCode: 400 }, 400);
  }

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // Trip + route, verifying the route belongs to the admin's school.
    const { data: trip, error: tripError } = await service
      .from('trips')
      .select(
        'id, started_at, ended_at, route_id, bus:buses(plate_number), route:routes!inner(id, name, type, school_id)',
      )
      .eq('id', tripId)
      .single();

    if (tripError || !trip) {
      return jsonResponse({ error: 'Trip not found', statusCode: 404 }, 404);
    }
    const route = trip.route as { id: string; name: string; type: string; school_id: string } | null;
    if (!route || route.school_id !== schoolId) {
      return jsonResponse({ error: 'Trip not found', statusCode: 404 }, 404);
    }

    const startMs = new Date(trip.started_at).getTime();
    const endMs = trip.ended_at ? new Date(trip.ended_at).getTime() : null;

    const [locationsRes, stopsRes, triggersRes, attendanceRes] = await Promise.all([
      service
        .from('trip_locations')
        .select('latitude, longitude, speed, recorded_at')
        .eq('trip_id', tripId)
        .order('recorded_at', { ascending: true }),
      service
        .from('stops')
        .select('id, name, latitude, longitude, sequence')
        .eq('route_id', trip.route_id)
        .order('sequence', { ascending: true }),
      service
        .from('trip_stop_triggers')
        .select('stop_id, triggered_at')
        .eq('trip_id', tripId),
      service
        .from('attendance')
        .select('student_id, status, marked_at, student:students(name, stop_id)')
        .eq('trip_id', tripId),
    ]);

    if (locationsRes.error || stopsRes.error || triggersRes.error || attendanceRes.error) {
      return jsonResponse({ error: 'Database query failed', statusCode: 500 }, 500);
    }

    const points = (locationsRes.data ?? []).map(
      (p: { latitude: number; longitude: number; speed: number | null; recorded_at: string }) => ({
        lat: p.latitude,
        lng: p.longitude,
        speed: p.speed,
        t: new Date(p.recorded_at).getTime() - startMs,
        recordedAt: p.recorded_at,
      }),
    );

    // Fall back to the last breadcrumb time when the trip was never formally ended.
    const lastPointT = points.length > 0 ? points[points.length - 1].t : 0;
    const durationMs = endMs !== null ? endMs - startMs : lastPointT;

    const triggerByStop = new Map<string, number>();
    for (const tr of triggersRes.data ?? []) {
      triggerByStop.set(tr.stop_id, new Date(tr.triggered_at).getTime() - startMs);
    }

    const stops = (stopsRes.data ?? []).map(
      (s: { id: string; name: string; latitude: number; longitude: number; sequence: number }) => ({
        id: s.id,
        name: s.name,
        lat: s.latitude,
        lng: s.longitude,
        sequence: s.sequence,
        arrivedT: triggerByStop.has(s.id) ? triggerByStop.get(s.id)! : null,
      }),
    );

    const events = (attendanceRes.data ?? [])
      .map((a: {
        student_id: string;
        status: string;
        marked_at: string;
        student: { name: string; stop_id: string | null } | { name: string; stop_id: string | null }[] | null;
      }) => {
        const student = Array.isArray(a.student) ? a.student[0] : a.student;
        return {
          studentId: a.student_id,
          studentName: student?.name ?? 'Student',
          stopId: student?.stop_id ?? null,
          status: a.status,
          t: new Date(a.marked_at).getTime() - startMs,
          markedAt: a.marked_at,
        };
      })
      .sort((a, b) => a.t - b.t);

    return jsonResponse(
      {
        data: {
          tripId: trip.id,
          busPlateNumber: (Array.isArray(trip.bus) ? trip.bus[0] : trip.bus)?.plate_number ?? '—',
          routeName: route.name,
          routeType: route.type,
          startedAt: trip.started_at,
          endedAt: trip.ended_at,
          durationMs: Math.max(0, durationMs),
          points,
          stops,
          events,
        },
        message: 'Trip replay fetched',
      },
      200,
    );
  } catch (_err) {
    return jsonResponse({ error: 'Database query failed', statusCode: 500 }, 500);
  }
});
