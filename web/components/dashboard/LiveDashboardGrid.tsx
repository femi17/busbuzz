'use client';

import { useEffect, useRef, useState } from 'react';
import { Bus, GraduationCap, Navigation, Clock } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { fetchDashboardData, type DashboardData } from '@/lib/dashboard-data';
import { StatCard } from './StatCard';
import { BentoLiveMap } from './BentoLiveMap';
import { TodaysTripsCard } from './TodaysTripsCard';
import { TripActivityChart } from './TripActivityChart';
import { AttendanceDonut } from './AttendanceDonut';
import { RoutesCard } from './RoutesCard';

// Refresh cadence for the whole dashboard — matches the sidebar Live card's
// polling model (no Postgres change-stream is enabled on these tables).
const REFRESH_MS = 15_000;

export function LiveDashboardGrid({
  initial,
  schoolLat,
  schoolLng,
  schoolAddress,
}: {
  initial: DashboardData;
  schoolLat: number | null;
  schoolLng: number | null;
  schoolAddress: string | null;
}) {
  const [data, setData] = useState<DashboardData>(initial);
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function refresh() {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const next = await fetchDashboardData(supabase);
        if (!cancelled) setData(next);
      } catch {
        // Transient network/RLS hiccup — keep the last good values, try again next tick.
      } finally {
        inFlight.current = false;
      }
    }

    // Refresh once on mount so the client (always correctly authenticated) takes
    // over immediately, then keep it live on an interval.
    refresh();
    const interval = setInterval(refresh, REFRESH_MS);
    // Refresh immediately when the tab regains focus so a returning admin sees current data.
    const onVisible = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);

  return (
    <div className="grid grid-cols-12 gap-4">
      {/* Row 1: Stat cards */}
      <div className="col-span-6 lg:col-span-3">
        <StatCard
          label="Total Buses"
          value={data.busesCount}
          icon={<Bus size={18} strokeWidth={1.75} />}
          index={0}
          sub={`${data.activeTripsTodayCount} active now`}
          subDot={data.activeTripsTodayCount > 0 ? 'green' : null}
        />
      </div>
      <div className="col-span-6 lg:col-span-3">
        <StatCard
          label="Students"
          value={data.studentsCount}
          icon={<GraduationCap size={18} strokeWidth={1.75} />}
          index={1}
          sub={`across ${data.routesCount} routes`}
        />
      </div>
      <div className="col-span-6 lg:col-span-3">
        <StatCard
          label="Trips Today"
          value={data.totalTripsToday}
          icon={<Navigation size={18} strokeWidth={1.75} />}
          index={2}
          sub="today"
        />
      </div>
      <div className="col-span-6 lg:col-span-3">
        <StatCard
          label="On-Time %"
          value={data.onTimePercentage !== null ? `${data.onTimePercentage}%` : '--'}
          icon={<Clock size={18} strokeWidth={1.75} />}
          index={3}
          sub="last 30 days"
        />
      </div>

      {/* Row 2: Live map + trips list */}
      <div className="col-span-12 lg:col-span-7">
        <BentoLiveMap schoolLat={schoolLat} schoolLng={schoolLng} schoolAddress={schoolAddress} />
      </div>
      <div className="col-span-12 lg:col-span-5">
        <TodaysTripsCard trips={data.trips} />
      </div>

      {/* Row 3: Charts + routes */}
      <div className="col-span-12 lg:col-span-4">
        <TripActivityChart data={data.weeklyChartData} weekTotal={data.weekTotal} />
      </div>
      <div className="col-span-12 lg:col-span-4">
        <AttendanceDonut boarded={data.boardedCount} absent={data.absentCount} />
      </div>
      <div className="col-span-12 lg:col-span-4">
        <RoutesCard routes={data.routeItems} />
      </div>
    </div>
  );
}
