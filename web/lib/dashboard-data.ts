import type { SupabaseClient } from '@supabase/supabase-js';
import type { TripRow } from '@/components/dashboard/TripsTable';

// Shared dashboard aggregate loader. Runs with either the server (SSR first
// paint) or the browser (live polling) Supabase client — both are RLS-scoped to
// the signed-in admin's school, so no explicit school_id filter is needed here.

export type DashboardRouteItem = {
  id: string;
  name: string;
  type: 'MORNING' | 'AFTERNOON';
  busPlateNumber: string | null;
  studentCount: number;
};

export type DashboardData = {
  busesCount: number;
  studentsCount: number;
  routesCount: number;
  activeTripsTodayCount: number;
  totalTripsToday: number;
  onTimePercentage: number | null;
  weeklyChartData: { day: string; count: number }[];
  weekTotal: number;
  boardedCount: number;
  absentCount: number;
  routeItems: DashboardRouteItem[];
  trips: TripRow[];
};

// A bus is "on time" at a stop when it arrives no later than the stop's
// scheduled eta_minutes plus this grace window. Arriving early is on time —
// only lateness beyond the grace counts as a miss. (An earlier version compared
// the absolute difference, which wrongly flagged every early arrival as late.)
const ON_TIME_GRACE_MINUTES = 5;

export function computeOnTimePercentage(
  arrivals: { triggeredAt: string; tripStartedAt: string; etaMinutes: number | null }[],
): number | null {
  const scored = arrivals.filter((a) => a.etaMinutes != null);
  if (scored.length === 0) return null;

  const onTimeCount = scored.filter((a) => {
    const actualOffsetMs = new Date(a.triggeredAt).getTime() - new Date(a.tripStartedAt).getTime();
    const allowedMs = (a.etaMinutes! + ON_TIME_GRACE_MINUTES) * 60_000;
    return actualOffsetMs <= allowedMs;
  }).length;

  return Math.round((onTimeCount / scored.length) * 100);
}

function startOfTodayISO(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
}
function startOfTomorrowISO(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
}
function startOf7DaysAgoISO(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6).toISOString();
}
function startOf30DaysAgoISO(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29).toISOString();
}

function groupByDay(trips: { started_at: string }[]): { day: string; count: number }[] {
  const days: Record<string, number> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days[d.toLocaleDateString('en-GB', { weekday: 'short' })] = 0;
  }
  for (const trip of trips) {
    const key = new Date(trip.started_at).toLocaleDateString('en-GB', { weekday: 'short' });
    if (key in days) days[key]++;
  }
  return Object.entries(days).map(([day, count]) => ({ day, count }));
}

// deno-lint-ignore no-explicit-any
export async function fetchDashboardData(supabase: SupabaseClient<any>): Promise<DashboardData> {
  const todayStart = startOfTodayISO();
  const todayEnd = startOfTomorrowISO();
  const weekAgo = startOf7DaysAgoISO();
  const thirtyDaysAgo = startOf30DaysAgoISO();

  const [
    { count: busesCount },
    { count: studentsCount },
    { count: routesCount },
    { count: activeTripsTodayCount },
    { count: completedTripsTodayCount },
    { data: todaysTrips },
    { data: routesData },
    { data: weekTripsData },
    { data: attendanceData },
    { data: stopArrivalsData },
  ] = await Promise.all([
    supabase.from('buses').select('*', { count: 'exact', head: true }).eq('status', 'ACTIVE'),
    supabase.from('students').select('*', { count: 'exact', head: true }),
    supabase.from('routes').select('*', { count: 'exact', head: true }),
    supabase.from('trips').select('*', { count: 'exact', head: true }).eq('status', 'ACTIVE').gte('started_at', todayStart).lt('started_at', todayEnd),
    supabase.from('trips').select('*', { count: 'exact', head: true }).eq('status', 'COMPLETED').gte('started_at', todayStart).lt('started_at', todayEnd),
    supabase.from('trips').select('id, started_at, status, bus:buses(plate_number), route:routes(name)').gte('started_at', todayStart).lt('started_at', todayEnd).order('started_at', { ascending: false }),
    supabase.from('routes').select('id, name, type, bus:buses(plate_number), students(count)').order('name').limit(4),
    supabase.from('trips').select('started_at').gte('started_at', weekAgo).lt('started_at', todayEnd),
    supabase.from('attendance').select('status'),
    supabase.from('trip_stop_triggers').select('triggered_at, stop:stops(eta_minutes), trip:trips(started_at)').gte('triggered_at', thirtyDaysAgo),
  ]);

  const weeklyChartData = groupByDay((weekTripsData ?? []) as { started_at: string }[]);
  const weekTotal = (weekTripsData ?? []).length;

  const allAttendance = (attendanceData ?? []) as { status: string }[];
  const boardedCount = allAttendance.filter((a) => a.status === 'BOARDED').length;
  const absentCount = allAttendance.filter((a) => a.status === 'ABSENT').length;

  type StopArrivalRow = {
    triggered_at: string;
    stop: { eta_minutes: number | null } | { eta_minutes: number | null }[] | null;
    trip: { started_at: string } | { started_at: string }[] | null;
  };
  const arrivals = ((stopArrivalsData ?? []) as unknown as StopArrivalRow[])
    .map((row) => {
      const stop = Array.isArray(row.stop) ? row.stop[0] ?? null : row.stop;
      const trip = Array.isArray(row.trip) ? row.trip[0] ?? null : row.trip;
      if (!trip) return null;
      return { triggeredAt: row.triggered_at, tripStartedAt: trip.started_at, etaMinutes: stop?.eta_minutes ?? null };
    })
    .filter((a): a is NonNullable<typeof a> => a !== null);
  const onTimePercentage = computeOnTimePercentage(arrivals);

  type RouteQueryRow = {
    id: string;
    name: string;
    type: 'MORNING' | 'AFTERNOON';
    bus: { plate_number: string } | { plate_number: string }[] | null;
    students: { count: number }[];
  };
  const routeItems: DashboardRouteItem[] = ((routesData ?? []) as unknown as RouteQueryRow[]).map((r) => {
    const bus = Array.isArray(r.bus) ? r.bus[0] ?? null : r.bus;
    const studentCount = Array.isArray(r.students) ? r.students[0]?.count ?? 0 : 0;
    return { id: r.id, name: r.name, type: r.type, busPlateNumber: bus?.plate_number ?? null, studentCount };
  });

  return {
    busesCount: busesCount ?? 0,
    studentsCount: studentsCount ?? 0,
    routesCount: routesCount ?? 0,
    activeTripsTodayCount: activeTripsTodayCount ?? 0,
    totalTripsToday: (activeTripsTodayCount ?? 0) + (completedTripsTodayCount ?? 0),
    onTimePercentage,
    weeklyChartData,
    weekTotal,
    boardedCount,
    absentCount,
    routeItems,
    trips: (todaysTrips ?? []) as unknown as TripRow[],
  };
}
