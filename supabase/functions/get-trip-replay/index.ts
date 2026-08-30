import { createClient } from 'npm:@supabase/supabase-js@2';

// Returns everything needed to replay one past trip on a map: ordered GPS
// breadcrumbs, the route's stops with their geofence-arrival times, and the
// attendance events (boarded / dropped off / absent) with driver timestamps —
// all normalised to milliseconds since trip start so the client can scrub a
// single timeline. Read-only, via a service-role read after an ownership
// check: SCHOOL_ADMIN / SUPER_ADMIN get any trip in their school (all
// attendance events); a PARENT gets trips on their own child's route, with
// events filtered to their own children only — no other family's child is
// ever named in a parent's replay.

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

  const role = profile?.role as string | undefined;
  const isAdmin = role === 'SCHOOL_ADMIN' || role === 'SUPER_ADMIN';
  const isParent = role === 'PARENT';
  if (profileError || !profile || (!isAdmin && !isParent)) {
    return jsonResponse({ error: 'Forbidden', statusCode: 403 }, 403);
  }
  if (isAdmin && !profile.school_id) {
    return jsonResponse({ error: 'No school associated with this account', statusCode: 403 }, 403);
  }
  const schoolId = (profile.school_id as string | null) ?? null;

  const url = new URL(req.url);
  const tripId = url.searchParams.get('tripId') ?? '';
  if (!UUID_RE.test(tripId)) {
    return jsonResponse({ error: 'A valid tripId is required', statusCode: 400 }, 400);
  }

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')!)['default'],
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
    if (!route) {
      return jsonResponse({ error: 'Trip not found', statusCode: 404 }, 404);
    }

    // Ownership: admins must own the school; parents must have a child on
    // this trip's route. Both failures 404 rather than 403 so a probing
    // caller can't distinguish "exists but not yours" from "doesn't exist".
    let ownStudentIds: Set<string> | null = null; // null = no event filtering (admin)
    if (isAdmin) {
      if (route.school_id !== schoolId) {
        return jsonResponse({ error: 'Trip not found', statusCode: 404 }, 404);
      }
    } else {
      const { data: links, error: linksError } = await service
        .from('student_parents')
        .select('student_id, students!inner(route_id)')
        .eq('parent_id', userData.user.id)
        .eq('students.route_id', trip.route_id);
      if (linksError || !links || links.length === 0) {
        return jsonResponse({ error: 'Trip not found', statusCode: 404 }, 404);
      }
      ownStudentIds = new Set(links.map((l: { student_id: string }) => l.student_id));
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
      .filter((a: { student_id: string }) =>
        ownStudentIds === null || ownStudentIds.has(a.student_id),
      )
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
