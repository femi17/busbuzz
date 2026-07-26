import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'zod';

// Inlined (was ../../../shared/schemas.ts) so the deploy bundler ships one file.
const getReportsQuerySchema = z.object({
  type: z.enum(['trips', 'attendance', 'summary']),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format'),
});

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

function startOfCurrentMonthISODate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

function todayISODate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'GET') {
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

  // Verify SCHOOL_ADMIN or SUPER_ADMIN role
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
      {
        error: 'Forbidden: SCHOOL_ADMIN or SUPER_ADMIN role required',
        statusCode: 403,
      },
      403,
    );
  }

  if (!profile.school_id) {
    return jsonResponse(
      { error: 'No school associated with this account', statusCode: 403 },
      403,
    );
  }

  const schoolId = profile.school_id as string;

  // Parse query params
  const url = new URL(req.url);
  const type = url.searchParams.get('type') ?? undefined;
  const startDate = url.searchParams.get('startDate') ?? startOfCurrentMonthISODate();
  const endDate = url.searchParams.get('endDate') ?? todayISODate();

  const parseResult = getReportsQuerySchema.safeParse({
    type,
    startDate,
    endDate,
  });

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

  // Compute exclusive end boundary (endDate + 1 day)
  const endDateExclusive = new Date(`${validated.endDate}T00:00:00.000Z`);
  endDateExclusive.setUTCDate(endDateExclusive.getUTCDate() + 1);
  const endDateExclusiveISO = endDateExclusive.toISOString();
  const startDateISO = `${validated.startDate}T00:00:00.000Z`;

  // Service-role client for privileged reads
  const serviceSupabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    if (validated.type === 'trips') {
      return await handleTrips(
        serviceSupabase,
        schoolId,
        startDateISO,
        endDateExclusiveISO,
      );
    } else if (validated.type === 'attendance') {
      return await handleAttendance(
        serviceSupabase,
        schoolId,
        startDateISO,
        endDateExclusiveISO,
      );
    } else {
      return await handleSummary(
        serviceSupabase,
        schoolId,
        startDateISO,
        endDateExclusiveISO,
      );
    }
  } catch (_err) {
    return jsonResponse(
      { error: 'Database query failed', statusCode: 500 },
      500,
    );
  }
});

async function handleTrips(
  // deno-lint-ignore no-explicit-any
  serviceSupabase: any,
  schoolId: string,
  startDateISO: string,
  endDateExclusiveISO: string,
) {
  const { data: trips, error: tripsError } = await serviceSupabase
    .from('trips')
    .select(
      'id, started_at, ended_at, status, bus:buses(plate_number), route:routes!inner(id, name, type, school_id)',
    )
    .eq('route.school_id', schoolId)
    .gte('started_at', startDateISO)
    .lt('started_at', endDateExclusiveISO)
    .order('started_at', { ascending: false });

  if (tripsError) {
    return jsonResponse(
      { error: 'Database query failed', statusCode: 500 },
      500,
    );
  }

  const tripList = trips ?? [];

  // A per-trip student/attendance count used to be computed here
  // (attendanceCounts, one query over the `attendance` table per report
  // load) and returned as `studentCount`, but nothing on the Reports page —
  // not the trip table, not the CSV export — ever read it. It was also
  // counting every attendance status including ABSENT, which would have
  // been a misleading "how many students rode this trip" figure had it
  // ever been surfaced. Removed rather than wired up, since nothing needs it.

  const result = tripList.map(
    (trip: {
      id: string;
      started_at: string;
      ended_at: string | null;
      status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
      bus: { plate_number: string } | null;
      route: { id: string; name: string; type: 'MORNING' | 'AFTERNOON' } | null;
    }) => {
      let durationMinutes: number | null = null;
      if (trip.ended_at) {
        durationMinutes = Math.round(
          (new Date(trip.ended_at).getTime() -
            new Date(trip.started_at).getTime()) /
            60000,
        );
      }

      return {
        id: trip.id,
        date: trip.started_at,
        busPlateNumber: trip.bus?.plate_number ?? '—',
        routeName: trip.route?.name ?? '—',
        routeType: trip.route?.type ?? 'MORNING',
        startedAt: trip.started_at,
        endedAt: trip.ended_at,
        durationMinutes,
        status: trip.status,
      };
    },
  );

  return jsonResponse(
    { data: { trips: result }, message: 'Trips report fetched' },
    200,
  );
}

async function handleAttendance(
  // deno-lint-ignore no-explicit-any
  serviceSupabase: any,
  schoolId: string,
  startDateISO: string,
  endDateExclusiveISO: string,
) {
  // 8b-1. Active students in this school
  const { data: students, error: studentsError } = await serviceSupabase
    .from('students')
    .select('id, name, class_name, route_id, stop_id, trip_type')
    .eq('school_id', schoolId)
    .eq('is_active', true);

  if (studentsError) {
    return jsonResponse(
      { error: 'Database query failed', statusCode: 500 },
      500,
    );
  }

  const studentList = students ?? [];

  // 8b-2. Trips in date range for this school, grouped by route AND
  // direction. A BOTH-type route runs both a morning and an afternoon leg —
  // a student whose own trip_type is MORNING or AFTERNOON only ever rides
  // one of those, so counting every trip on the route (both legs) toward
  // their totalTrips denominator understated their attendance % by up to
  // half. trips.direction (null on trips predating that column) lets this
  // scope each student's totalTrips to the leg(s) they actually ride.
  const { data: trips, error: tripsError } = await serviceSupabase
    .from('trips')
    .select('id, direction, route:routes!inner(id, school_id)')
    .eq('route.school_id', schoolId)
    .gte('started_at', startDateISO)
    .lt('started_at', endDateExclusiveISO);

  if (tripsError) {
    return jsonResponse(
      { error: 'Database query failed', statusCode: 500 },
      500,
    );
  }

  const tripList = trips ?? [];
  const tripIds = tripList.map((t: { id: string }) => t.id);

  // routeTripCounts[routeId] = { MORNING, AFTERNOON, unknown } — unknown
  // covers trips with no recorded direction (legacy data); those count
  // toward every student on the route regardless of trip_type, same as
  // this whole calculation behaved before trips.direction existed.
  type DirectionCounts = { MORNING: number; AFTERNOON: number; unknown: number };
  const routeTripCounts: Record<string, DirectionCounts> = {};
  for (const trip of tripList) {
    const routeId = trip.route?.id;
    if (!routeId) continue;
    if (!routeTripCounts[routeId]) {
      routeTripCounts[routeId] = { MORNING: 0, AFTERNOON: 0, unknown: 0 };
    }
    if (trip.direction === 'MORNING' || trip.direction === 'AFTERNOON') {
      routeTripCounts[routeId][trip.direction] += 1;
    } else {
      routeTripCounts[routeId].unknown += 1;
    }
  }

  function totalTripsFor(routeId: string | null, tripType: string | null): number {
    if (!routeId) return 0;
    const counts = routeTripCounts[routeId];
    if (!counts) return 0;
    if (tripType === 'MORNING') return counts.MORNING + counts.unknown;
    if (tripType === 'AFTERNOON') return counts.AFTERNOON + counts.unknown;
    // BOTH, null, or any other value: every trip on the route is relevant
    // (this is also what a dedicated MORNING/AFTERNOON route's students —
    // whose trip_type is always 'BOTH' since direction is meaningless there
    // — resolve to: all of that route's trips share the one direction).
    return counts.MORNING + counts.AFTERNOON + counts.unknown;
  }

  // Student → assigned stop, so a boarding can be matched to its stop-arrival time.
  const studentStopId: Record<string, string | null> = {};
  for (const s of studentList) {
    studentStopId[s.id] = s.stop_id ?? null;
  }

  // 8b-3. Attendance records for trips in range, grouped by student_id
  let boardedCounts: Record<string, number> = {};
  let absentCounts: Record<string, number> = {};
  // Boarding readiness: sum of seconds between the bus reaching a student's stop
  // (geofence trigger) and the driver marking them BOARDED, plus a count of how
  // many boardings could be timed, per student.
  const boardDelaySum: Record<string, number> = {};
  const timedBoardings: Record<string, number> = {};
  if (tripIds.length > 0) {
    const [attendanceRes, triggersRes] = await Promise.all([
      serviceSupabase
        .from('attendance')
        .select('student_id, trip_id, status, marked_at')
        .in('trip_id', tripIds),
      serviceSupabase
        .from('trip_stop_triggers')
        .select('trip_id, stop_id, triggered_at')
        .in('trip_id', tripIds),
    ]);

    if (attendanceRes.error || triggersRes.error) {
      return jsonResponse(
        { error: 'Database query failed', statusCode: 500 },
        500,
      );
    }

    // Key stop-arrival times by trip+stop for O(1) lookup per boarding.
    const arrivalByTripStop = new Map<string, number>();
    for (const tr of triggersRes.data ?? []) {
      arrivalByTripStop.set(
        `${tr.trip_id}:${tr.stop_id}`,
        new Date(tr.triggered_at).getTime(),
      );
    }

    for (const row of attendanceRes.data ?? []) {
      if (row.status === 'BOARDED') {
        boardedCounts[row.student_id] = (boardedCounts[row.student_id] ?? 0) + 1;
        const stopId = studentStopId[row.student_id];
        const arrival = stopId
          ? arrivalByTripStop.get(`${row.trip_id}:${stopId}`)
          : undefined;
        if (arrival !== undefined && row.marked_at) {
          const delaySec = Math.max(
            0,
            (new Date(row.marked_at).getTime() - arrival) / 1000,
          );
          boardDelaySum[row.student_id] = (boardDelaySum[row.student_id] ?? 0) + delaySec;
          timedBoardings[row.student_id] = (timedBoardings[row.student_id] ?? 0) + 1;
        }
      } else if (row.status === 'ABSENT') {
        absentCounts[row.student_id] = (absentCounts[row.student_id] ?? 0) + 1;
      }
    }
  }

  // 8b-4/5. Build per-student rows
  const result = studentList
    .map(
      (student: {
        id: string;
        name: string;
        class_name: string;
        route_id: string | null;
        trip_type: string | null;
      }) => {
        const totalTrips = totalTripsFor(student.route_id, student.trip_type);
        const boardedCount = boardedCounts[student.id] ?? 0;
        const absentCount = absentCounts[student.id] ?? 0;
        const attendancePercentage =
          totalTrips > 0
            ? Math.round((boardedCount / totalTrips) * 1000) / 10
            : 0;
        const timed = timedBoardings[student.id] ?? 0;
        const avgBoardSeconds =
          timed > 0 ? Math.round(boardDelaySum[student.id] / timed) : null;

        return {
          studentId: student.id,
          studentName: student.name,
          className: student.class_name,
          totalTrips,
          boardedCount,
          absentCount,
          attendancePercentage,
          avgBoardSeconds,
          timedBoardings: timed,
        };
      },
    )
    .sort(
      (
        a: { attendancePercentage: number },
        b: { attendancePercentage: number },
      ) => a.attendancePercentage - b.attendancePercentage,
    );

  return jsonResponse(
    { data: { students: result }, message: 'Attendance report fetched' },
    200,
  );
}

async function handleSummary(
  // deno-lint-ignore no-explicit-any
  serviceSupabase: any,
  schoolId: string,
  startDateISO: string,
  endDateExclusiveISO: string,
) {
  // 8c-1. All trips in school in date range, with route info
  const { data: trips, error: tripsError } = await serviceSupabase
    .from('trips')
    .select(
      'id, started_at, ended_at, status, route:routes!inner(id, name, school_id)',
    )
    .eq('route.school_id', schoolId)
    .gte('started_at', startDateISO)
    .lt('started_at', endDateExclusiveISO);

  if (tripsError) {
    return jsonResponse(
      { error: 'Database query failed', statusCode: 500 },
      500,
    );
  }

  const tripList = trips ?? [];
  const totalTrips = tripList.length;
  const tripIds = tripList.map((t: { id: string }) => t.id);

  // 8c-2. On-time percentage — per-stop arrival vs. that stop's own
  // eta_minutes, ON_TIME_GRACE_MINUTES grace. This used to instead compare
  // a trip's whole duration against its route's single MAX eta_minutes with
  // a 10-minute grace, which computed a completely different number than
  // the identically-labeled "On-Time %" on the main dashboard
  // (dashboard-data.ts / shared/geo.ts computeOnTimePercentage) for the
  // same period. Inlined here (not imported) since this Deno function
  // bundles standalone — keep in sync with shared/geo.ts if it changes.
  const ON_TIME_GRACE_MINUTES = 5;
  const tripStartedAtById: Record<string, string> = {};
  for (const trip of tripList) {
    tripStartedAtById[trip.id] = trip.started_at;
  }

  let onTimePercentage = 0;
  if (tripIds.length > 0) {
    const { data: triggerRows, error: triggersError } = await serviceSupabase
      .from('trip_stop_triggers')
      .select('trip_id, triggered_at, stop:stops(eta_minutes)')
      .in('trip_id', tripIds);

    if (triggersError) {
      return jsonResponse(
        { error: 'Database query failed', statusCode: 500 },
        500,
      );
    }

    const scored = ((triggerRows ?? []) as Array<{
      trip_id: string;
      triggered_at: string;
      stop: { eta_minutes: number | null } | { eta_minutes: number | null }[] | null;
    }>)
      .map((row) => {
        const stop = Array.isArray(row.stop) ? row.stop[0] ?? null : row.stop;
        const etaMinutes = stop?.eta_minutes ?? null;
        const tripStartedAt = tripStartedAtById[row.trip_id];
        if (etaMinutes == null || !tripStartedAt) return null;
        return { triggeredAt: row.triggered_at, tripStartedAt, etaMinutes };
      })
      .filter(
        (x): x is { triggeredAt: string; tripStartedAt: string; etaMinutes: number } =>
          x !== null,
      );

    if (scored.length > 0) {
      const onTimeCount = scored.filter((a) => {
        const actualOffsetMs =
          new Date(a.triggeredAt).getTime() - new Date(a.tripStartedAt).getTime();
        const allowedMs = (a.etaMinutes + ON_TIME_GRACE_MINUTES) * 60_000;
        return actualOffsetMs <= allowedMs;
      }).length;
      onTimePercentage = Math.round((onTimeCount / scored.length) * 1000) / 10;
    }
  }

  // 8c-3. Distinct students with at least one BOARDED record this range
  let totalStudentsTransported = 0;
  if (tripIds.length > 0) {
    const { data: boardedRows, error: boardedError } = await serviceSupabase
      .from('attendance')
      .select('student_id')
      .eq('status', 'BOARDED')
      .in('trip_id', tripIds);

    if (boardedError) {
      return jsonResponse(
        { error: 'Database query failed', statusCode: 500 },
        500,
      );
    }

    totalStudentsTransported = new Set(
      (boardedRows ?? []).map((r: { student_id: string }) => r.student_id),
    ).size;
  }

  // 8c-4. Most active route
  const routeTripCounts: Record<string, { name: string; count: number }> = {};
  for (const trip of tripList) {
    const route = trip.route as { id: string; name: string } | null;
    if (!route) continue;
    if (!routeTripCounts[route.id]) {
      routeTripCounts[route.id] = { name: route.name, count: 0 };
    }
    routeTripCounts[route.id].count += 1;
  }

  let mostActiveRoute: { id: string; name: string; tripCount: number } | null =
    null;
  for (const [routeId, info] of Object.entries(routeTripCounts)) {
    if (!mostActiveRoute || info.count > mostActiveRoute.tripCount) {
      mostActiveRoute = { id: routeId, name: info.name, tripCount: info.count };
    }
  }

  return jsonResponse(
    {
      data: {
        totalTrips,
        onTimePercentage,
        totalStudentsTransported,
        mostActiveRoute,
      },
      message: 'Summary report fetched',
    },
    200,
  );
}
