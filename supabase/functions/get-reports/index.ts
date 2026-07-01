import { createClient } from 'npm:@supabase/supabase-js@2';
import { getReportsQuerySchema } from '../../../shared/schemas.ts';

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
  const tripIds = tripList.map((t: { id: string }) => t.id);

  let attendanceCounts: Record<string, number> = {};
  if (tripIds.length > 0) {
    const { data: attendanceRows, error: attendanceError } =
      await serviceSupabase
        .from('attendance')
        .select('trip_id')
        .in('trip_id', tripIds);

    if (attendanceError) {
      return jsonResponse(
        { error: 'Database query failed', statusCode: 500 },
        500,
      );
    }

    attendanceCounts = (attendanceRows ?? []).reduce(
      (acc: Record<string, number>, row: { trip_id: string }) => {
        acc[row.trip_id] = (acc[row.trip_id] ?? 0) + 1;
        return acc;
      },
      {},
    );
  }

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
        studentCount: attendanceCounts[trip.id] ?? 0,
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
    .select('id, name, class_name, route_id')
    .eq('school_id', schoolId)
    .eq('is_active', true);

  if (studentsError) {
    return jsonResponse(
      { error: 'Database query failed', statusCode: 500 },
      500,
    );
  }

  const studentList = students ?? [];

  // 8b-2. Trips in date range for this school, grouped by route
  const { data: trips, error: tripsError } = await serviceSupabase
    .from('trips')
    .select('id, route:routes!inner(id, school_id)')
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

  const routeTripCounts: Record<string, number> = {};
  for (const trip of tripList) {
    const routeId = trip.route?.id;
    if (routeId) {
      routeTripCounts[routeId] = (routeTripCounts[routeId] ?? 0) + 1;
    }
  }

  // 8b-3. Attendance records for trips in range, grouped by student_id
  let boardedCounts: Record<string, number> = {};
  let absentCounts: Record<string, number> = {};
  if (tripIds.length > 0) {
    const { data: attendanceRows, error: attendanceError } =
      await serviceSupabase
        .from('attendance')
        .select('student_id, status')
        .in('trip_id', tripIds);

    if (attendanceError) {
      return jsonResponse(
        { error: 'Database query failed', statusCode: 500 },
        500,
      );
    }

    for (const row of attendanceRows ?? []) {
      if (row.status === 'BOARDED') {
        boardedCounts[row.student_id] = (boardedCounts[row.student_id] ?? 0) + 1;
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
      }) => {
        const totalTrips = student.route_id
          ? routeTripCounts[student.route_id] ?? 0
          : 0;
        const boardedCount = boardedCounts[student.id] ?? 0;
        const absentCount = absentCounts[student.id] ?? 0;
        const attendancePercentage =
          totalTrips > 0
            ? Math.round((boardedCount / totalTrips) * 1000) / 10
            : 0;

        return {
          studentId: student.id,
          studentName: student.name,
          className: student.class_name,
          totalTrips,
          boardedCount,
          absentCount,
          attendancePercentage,
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

  // 8c-2. On-time percentage
  const completedTrips = tripList.filter(
    (t: { status: string; ended_at: string | null }) =>
      t.status === 'COMPLETED' && t.ended_at,
  );

  const routeIds = Array.from(
    new Set(
      completedTrips
        .map((t: { route: { id: string } | null }) => t.route?.id)
        .filter((id: string | undefined): id is string => Boolean(id)),
    ),
  );

  let routeMaxEta: Record<string, number | null> = {};
  if (routeIds.length > 0) {
    const { data: stopRows, error: stopsError } = await serviceSupabase
      .from('stops')
      .select('route_id, eta_minutes')
      .in('route_id', routeIds);

    if (stopsError) {
      return jsonResponse(
        { error: 'Database query failed', statusCode: 500 },
        500,
      );
    }

    for (const routeId of routeIds) {
      routeMaxEta[routeId] = null;
    }

    for (const stop of stopRows ?? []) {
      if (stop.eta_minutes != null) {
        const current = routeMaxEta[stop.route_id];
        if (current === null || current === undefined || stop.eta_minutes > current) {
          routeMaxEta[stop.route_id] = stop.eta_minutes;
        }
      }
    }
  }

  let eligibleCount = 0;
  let onTimeCount = 0;
  for (const trip of completedTrips) {
    const routeId = trip.route?.id;
    const expectedDuration = routeId ? routeMaxEta[routeId] : null;
    if (expectedDuration === null || expectedDuration === undefined) {
      continue; // exclude routes with no eta_minutes data
    }
    eligibleCount += 1;
    const actualDuration =
      (new Date(trip.ended_at).getTime() - new Date(trip.started_at).getTime()) /
      60000;
    if (actualDuration <= expectedDuration + 10) {
      onTimeCount += 1;
    }
  }

  const onTimePercentage =
    eligibleCount > 0 ? Math.round((onTimeCount / eligibleCount) * 1000) / 10 : 0;

  // 8c-3. Distinct students with at least one BOARDED record this range
  const tripIds = tripList.map((t: { id: string }) => t.id);
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
