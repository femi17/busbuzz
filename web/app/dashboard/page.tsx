import { Bus, GraduationCap, Route as RouteIcon, Navigation } from 'lucide-react';
import { createClient } from '@/lib/supabase-server';
import { StatCard } from '@/components/dashboard/StatCard';
import { TripsTable, type TripRow } from '@/components/dashboard/TripsTable';

function startOfTodayISO(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
}

function startOfTomorrowISO(): string {
  const now = new Date();
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  ).toISOString();
}

export default async function DashboardHomePage() {
  const supabase = await createClient();

  const todayStart = startOfTodayISO();
  const todayEnd = startOfTomorrowISO();

  const [
    { count: busesCount },
    { count: studentsCount },
    { count: routesCount },
    { count: activeTripsTodayCount },
    { data: todaysTrips },
  ] = await Promise.all([
    supabase
      .from('buses')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'ACTIVE'),
    supabase.from('students').select('*', { count: 'exact', head: true }),
    supabase.from('routes').select('*', { count: 'exact', head: true }),
    supabase
      .from('trips')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'ACTIVE')
      .gte('started_at', todayStart)
      .lt('started_at', todayEnd),
    supabase
      .from('trips')
      .select('id, started_at, status, bus:buses(plate_number), route:routes(name)')
      .gte('started_at', todayStart)
      .lt('started_at', todayEnd)
      .order('started_at', { ascending: false }),
  ]);

  const trips = (todaysTrips ?? []) as unknown as TripRow[];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Buses" value={busesCount ?? 0} icon={Bus} index={0} />
        <StatCard
          label="Total Students"
          value={studentsCount ?? 0}
          icon={GraduationCap}
          index={1}
        />
        <StatCard
          label="Trips Today"
          value={activeTripsTodayCount ?? 0}
          icon={Navigation}
          index={2}
        />
        <StatCard
          label="Active Routes"
          value={routesCount ?? 0}
          icon={RouteIcon}
          index={3}
        />
      </div>

      <div className="rounded-xl border border-navy/10 bg-white shadow-sm">
        <div className="border-b border-navy/10 px-5 py-4">
          <h2 className="font-display text-base font-bold text-navy">
            Today&apos;s Trips
          </h2>
        </div>

        <TripsTable trips={trips} />
      </div>
    </div>
  );
}
