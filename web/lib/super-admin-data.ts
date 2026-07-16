import type { SupabaseClient } from '@supabase/supabase-js';

// Cross-school analytics for the super-admin dashboard. All reads go through the
// caller's session (a verified SUPER_ADMIN), relying on the SUPER_ADMIN SELECT
// RLS policies on each table — no service role needed.

export type SchoolOverviewRow = {
  id: string;
  name: string;
  address: string;
  isActive: boolean;
  buses: number;
  routes: number;
  students: number;
  drivers: number;
  activeTrips: number;
  bestOnTime: { name: string; avgBoardSeconds: number | null } | null;
};

export type SchoolsOverview = {
  schools: SchoolOverviewRow[];
  total: number;
  totals: { schools: number; buses: number; students: number; activeTrips: number };
};

function lagosTodayStart(): string {
  // Start of "today" in Africa/Lagos (UTC+1), expressed as a UTC instant.
  const now = new Date();
  const lagos = new Date(now.getTime() + 60 * 60 * 1000);
  lagos.setUTCHours(0, 0, 0, 0);
  return new Date(lagos.getTime() - 60 * 60 * 1000).toISOString();
}

function lagosTodayDate(): string {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 10);
}

export async function fetchSchoolsOverview(
  supabase: SupabaseClient,
  page = 1,
  pageSize = 25,
): Promise<SchoolsOverview> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // Platform totals are exact head-counts — no rows leave the DB — and the
  // school list itself is a single paginated page, so this stays flat no
  // matter how many schools are onboarded.
  const [
    { data: schools, count: schoolCount },
    { count: busTotal },
    { count: studentTotal },
    { count: activeTripTotal },
  ] = await Promise.all([
    supabase
      .from('schools')
      .select('id, name, address, is_active', { count: 'exact' })
      .order('name')
      .range(from, to),
    supabase.from('buses').select('id', { count: 'exact', head: true }).neq('status', 'RETIRED'),
    supabase.from('students').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('trips').select('id', { count: 'exact', head: true }).eq('status', 'ACTIVE'),
  ]);

  const schoolRows = (schools ?? []) as { id: string; name: string; address: string; is_active: boolean }[];
  const pageIds = schoolRows.map((s) => s.id);

  // Per-school detail only for the schools on this page.
  const emptyResult = { data: [] as never[] };
  const [
    { data: buses },
    { data: routes },
    { data: students },
    { data: drivers },
    { data: activeTrips },
    { data: awards },
  ] = pageIds.length
    ? await Promise.all([
        supabase.from('buses').select('school_id, status').in('school_id', pageIds),
        supabase.from('routes').select('school_id').in('school_id', pageIds),
        supabase.from('students').select('school_id, is_active').in('school_id', pageIds),
        supabase
          .from('profiles')
          .select('school_id')
          .eq('role', 'DRIVER')
          .eq('is_active', true)
          .in('school_id', pageIds),
        supabase
          .from('trips')
          .select('bus:buses!inner(school_id)')
          .eq('status', 'ACTIVE')
          .in('bus.school_id', pageIds),
        supabase
          .from('semester_awards')
          .select('school_id, winner_name, winner_avg_board_seconds, computed_at')
          .in('school_id', pageIds)
          .order('computed_at', { ascending: false }),
      ])
    : [emptyResult, emptyResult, emptyResult, emptyResult, emptyResult, emptyResult];

  const countBy = <T extends { school_id: string | null }>(
    rows: T[] | null,
    pred?: (row: T) => boolean,
  ) => {
    const map = new Map<string, number>();
    for (const row of rows ?? []) {
      if (!row.school_id) continue;
      if (pred && !pred(row)) continue;
      map.set(row.school_id, (map.get(row.school_id) ?? 0) + 1);
    }
    return map;
  };

  const busCount = countBy(buses as { school_id: string | null; status: string }[], (b) => b.status !== 'RETIRED');
  const routeCount = countBy(routes as { school_id: string | null }[]);
  const studentCount = countBy(
    students as { school_id: string | null; is_active: boolean }[],
    (s) => s.is_active,
  );
  const driverCount = countBy(drivers as { school_id: string | null }[]);

  const activeTripCount = new Map<string, number>();
  for (const t of (activeTrips ?? []) as { bus: { school_id: string } | { school_id: string }[] | null }[]) {
    const bus = Array.isArray(t.bus) ? t.bus[0] : t.bus;
    if (!bus?.school_id) continue;
    activeTripCount.set(bus.school_id, (activeTripCount.get(bus.school_id) ?? 0) + 1);
  }

  // Awards come newest-first; the first row seen per school is the latest.
  const bestOnTime = new Map<string, { name: string; avgBoardSeconds: number | null }>();
  for (const a of (awards ?? []) as {
    school_id: string;
    winner_name: string | null;
    winner_avg_board_seconds: number | null;
  }[]) {
    if (!a.school_id || bestOnTime.has(a.school_id) || !a.winner_name) continue;
    bestOnTime.set(a.school_id, { name: a.winner_name, avgBoardSeconds: a.winner_avg_board_seconds });
  }

  return {
    schools: schoolRows.map((s) => ({
      id: s.id,
      name: s.name,
      address: s.address,
      isActive: s.is_active,
      buses: busCount.get(s.id) ?? 0,
      routes: routeCount.get(s.id) ?? 0,
      students: studentCount.get(s.id) ?? 0,
      drivers: driverCount.get(s.id) ?? 0,
      activeTrips: activeTripCount.get(s.id) ?? 0,
      bestOnTime: bestOnTime.get(s.id) ?? null,
    })),
    total: schoolCount ?? 0,
    totals: {
      schools: schoolCount ?? 0,
      buses: busTotal ?? 0,
      students: studentTotal ?? 0,
      activeTrips: activeTripTotal ?? 0,
    },
  };
}

export type LeaderboardEntry = {
  name: string;
  className: string;
  avgBoardSeconds: number;
  timedBoardings: number;
};

export type SchoolAnalytics = {
  school: { id: string; name: string; address: string; isActive: boolean };
  counts: { buses: number; routes: number; students: number; drivers: number };
  today: {
    activeTrips: number;
    tripsToday: number;
    boardedToday: number;
    absentToday: number;
    busesBroadcasting: number;
  };
  onTime: {
    winnerName: string | null;
    winnerAvgBoardSeconds: number | null;
    period: string | null;
    leaderboard: LeaderboardEntry[];
  };
  health: {
    busesInMaintenance: number;
    driversWithoutPin: number;
    routesWithoutBus: number;
    studentsWithoutParent: number;
    studentsWithoutStop: number;
  };
  trend: { date: string; trips: number; boardings: number }[];
};

export async function fetchSchoolAnalytics(
  supabase: SupabaseClient,
  schoolId: string,
): Promise<SchoolAnalytics | null> {
  const { data: school } = await supabase
    .from('schools')
    .select('id, name, address, is_active')
    .eq('id', schoolId)
    .maybeSingle();
  if (!school) return null;

  const todayStart = lagosTodayStart();
  const today = lagosTodayDate();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Buses, routes, students, drivers, driver PINs, parents links.
  const [
    { data: buses },
    { data: routes },
    { data: students },
    { data: drivers },
    { data: pins },
    { data: latestAward },
  ] = await Promise.all([
    supabase.from('buses').select('id, status').eq('school_id', schoolId),
    supabase.from('routes').select('id, bus_id').eq('school_id', schoolId),
    supabase
      .from('students')
      .select('id, is_active, route_id, stop_id, student_parents(count)')
      .eq('school_id', schoolId),
    supabase.from('profiles').select('id').eq('role', 'DRIVER').eq('is_active', true).eq('school_id', schoolId),
    supabase.from('driver_pins').select('driver_id'),
    supabase
      .from('semester_awards')
      .select('winner_name, winner_avg_board_seconds, period_start, period_end, leaderboard, computed_at')
      .eq('school_id', schoolId)
      .order('computed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const busRows = (buses ?? []) as { id: string; status: string }[];
  const routeRows = (routes ?? []) as { id: string; bus_id: string | null }[];
  const studentRows = (students ?? []) as {
    id: string;
    is_active: boolean;
    route_id: string | null;
    stop_id: string | null;
    student_parents: { count: number }[];
  }[];
  const activeStudents = studentRows.filter((s) => s.is_active);
  const pinSet = new Set((pins ?? []).map((p: { driver_id: string }) => p.driver_id));
  const driverRows = (drivers ?? []) as { id: string }[];

  // Trips for this school (via its buses) — active now, today, and last 7 days.
  const busIds = busRows.map((b) => b.id);
  let allTrips: { id: string; status: string; started_at: string }[] = [];
  if (busIds.length > 0) {
    const { data: trips } = await supabase
      .from('trips')
      .select('id, status, started_at')
      .in('bus_id', busIds)
      .gte('started_at', weekAgo);
    allTrips = (trips ?? []) as typeof allTrips;
  }
  const activeTripIds = allTrips.filter((t) => t.status === 'ACTIVE').map((t) => t.id);
  const todayTripIds = allTrips.filter((t) => t.started_at >= todayStart).map((t) => t.id);

  // Boarded today + buses currently broadcasting (recent GPS on an active trip).
  let boardedToday = 0;
  if (todayTripIds.length > 0) {
    const { count } = await supabase
      .from('attendance')
      .select('id', { count: 'exact', head: true })
      .in('trip_id', todayTripIds)
      .eq('status', 'BOARDED')
      .gte('marked_at', todayStart);
    boardedToday = count ?? 0;
  }

  let busesBroadcasting = 0;
  if (activeTripIds.length > 0) {
    const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from('trip_locations')
      .select('trip_id')
      .in('trip_id', activeTripIds)
      .gte('recorded_at', twoMinAgo);
    busesBroadcasting = new Set((recent ?? []).map((r: { trip_id: string }) => r.trip_id)).size;
  }

  // Absences reported today for this school's students.
  let absentToday = 0;
  const studentIds = activeStudents.map((s) => s.id);
  if (studentIds.length > 0) {
    const { count } = await supabase
      .from('student_absences')
      .select('student_id', { count: 'exact', head: true })
      .eq('absence_date', today)
      .in('student_id', studentIds);
    absentToday = count ?? 0;
  }

  // 7-day trend: trips started and boardings, per Lagos day.
  const trendMap = new Map<string, { trips: number; boardings: number }>();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() + 60 * 60 * 1000 - i * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    trendMap.set(d, { trips: 0, boardings: 0 });
  }
  for (const t of allTrips) {
    const d = new Date(new Date(t.started_at).getTime() + 60 * 60 * 1000).toISOString().slice(0, 10);
    const entry = trendMap.get(d);
    if (entry) entry.trips += 1;
  }
  const weekTripIds = allTrips.map((t) => t.id);
  if (weekTripIds.length > 0) {
    const { data: weekBoardings } = await supabase
      .from('attendance')
      .select('marked_at')
      .in('trip_id', weekTripIds)
      .eq('status', 'BOARDED')
      .gte('marked_at', weekAgo);
    for (const b of (weekBoardings ?? []) as { marked_at: string }[]) {
      const d = new Date(new Date(b.marked_at).getTime() + 60 * 60 * 1000).toISOString().slice(0, 10);
      const entry = trendMap.get(d);
      if (entry) entry.boardings += 1;
    }
  }

  const award = latestAward as {
    winner_name: string | null;
    winner_avg_board_seconds: number | null;
    period_start: string | null;
    period_end: string | null;
    leaderboard: LeaderboardEntry[] | null;
  } | null;

  return {
    school: { id: school.id, name: school.name, address: school.address, isActive: school.is_active },
    counts: {
      buses: busRows.filter((b) => b.status !== 'RETIRED').length,
      routes: routeRows.length,
      students: activeStudents.length,
      drivers: driverRows.length,
    },
    today: {
      activeTrips: activeTripIds.length,
      tripsToday: todayTripIds.length,
      boardedToday,
      absentToday,
      busesBroadcasting,
    },
    onTime: {
      winnerName: award?.winner_name ?? null,
      winnerAvgBoardSeconds: award?.winner_avg_board_seconds ?? null,
      period:
        award?.period_start && award?.period_end
          ? `${award.period_start} → ${award.period_end}`
          : null,
      leaderboard: (award?.leaderboard ?? []).slice(0, 5),
    },
    health: {
      busesInMaintenance: busRows.filter((b) => b.status === 'MAINTENANCE').length,
      driversWithoutPin: driverRows.filter((d) => !pinSet.has(d.id)).length,
      routesWithoutBus: routeRows.filter((r) => !r.bus_id).length,
      studentsWithoutParent: activeStudents.filter(
        (s) => (Array.isArray(s.student_parents) ? s.student_parents[0]?.count ?? 0 : 0) === 0,
      ).length,
      studentsWithoutStop: activeStudents.filter((s) => s.route_id && !s.stop_id).length,
    },
    trend: Array.from(trendMap.entries()).map(([date, v]) => ({ date, ...v })),
  };
}
