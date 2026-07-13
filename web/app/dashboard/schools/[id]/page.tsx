import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  Bus,
  Route as RouteIcon,
  GraduationCap,
  UserCheck,
  Timer,
  Radio,
  AlertTriangle,
} from 'lucide-react';
import { createClient } from '@/lib/supabase-server';
import { fetchSchoolAnalytics } from '@/lib/super-admin-data';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';

export const dynamic = 'force-dynamic';

function formatMinsSecs(seconds: number | null): string {
  if (seconds === null) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function CountCard({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Bus;
  value: number;
  label: string;
}) {
  return (
    <div className="rounded-[var(--radius-card)] bg-surface p-4 shadow-[var(--shadow-card)]">
      <Icon size={17} strokeWidth={1.9} className="text-sub" />
      <p className="mt-2 text-[26px] font-bold text-ink tabular-nums">{value}</p>
      <p className="text-[12px] font-medium text-sub">{label}</p>
    </div>
  );
}

function TodayStat({ value, label, live }: { value: number; label: string; live?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-[var(--radius-card)] border border-rule bg-surface px-4 py-3">
      <span className="flex items-center gap-1.5 text-[20px] font-bold text-ink tabular-nums">
        {value}
        {live && value > 0 && <span className="h-2 w-2 rounded-full bg-green animate-pulse-dot" aria-hidden />}
      </span>
      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-sub">{label}</span>
    </div>
  );
}

function HealthRow({ value, label }: { value: number; label: string }) {
  const clear = value === 0;
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-[13px] text-ink">{label}</span>
      <span
        className={`inline-flex items-center gap-1.5 rounded-[var(--radius-chip)] px-2.5 py-1 text-[12px] font-semibold ${
          clear ? 'bg-green-bg text-green' : 'bg-amber-light text-amber-dark'
        }`}
      >
        {!clear && <AlertTriangle size={12} strokeWidth={2.2} />}
        {value}
      </span>
    </div>
  );
}

export default async function SchoolAnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Gate: only super admins get the cross-school analytics view.
  const { data: userData } = await supabase.auth.getUser();
  if (userData?.user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .single();
    if (profile?.role !== 'SUPER_ADMIN') notFound();
  } else {
    notFound();
  }

  const data = await fetchSchoolAnalytics(supabase, id);
  if (!data) notFound();

  const maxTrend = Math.max(1, ...data.trend.map((t) => Math.max(t.trips, t.boardings)));

  return (
    <div className="max-w-[1000px] mx-auto">
      <Link
        href="/dashboard"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-sub transition-colors hover:text-ink"
      >
        <ArrowLeft size={14} /> All schools
      </Link>

      <DashboardHeader
        eyebrow="School analytics"
        title={data.school.name}
        subtitle={data.school.address}
      />

      {/* Core fleet counts */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <CountCard icon={Bus} value={data.counts.buses} label="Buses" />
        <CountCard icon={RouteIcon} value={data.counts.routes} label="Routes" />
        <CountCard icon={GraduationCap} value={data.counts.students} label="Students" />
        <CountCard icon={UserCheck} value={data.counts.drivers} label="Drivers" />
      </div>

      {/* Today's activity */}
      <h2 className="mt-8 mb-3 flex items-center gap-2 font-heading text-[16px] font-bold text-ink">
        <Radio size={16} className="text-green" /> Today
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <TodayStat value={data.today.activeTrips} label="Trips live" live />
        <TodayStat value={data.today.busesBroadcasting} label="Buses on GPS" live />
        <TodayStat value={data.today.tripsToday} label="Trips today" />
        <TodayStat value={data.today.boardedToday} label="Boarded" />
        <TodayStat value={data.today.absentToday} label="Absent" />
      </div>

      {/* On-time performance */}
      <h2 className="mt-8 mb-3 flex items-center gap-2 font-heading text-[16px] font-bold text-ink">
        <Timer size={16} className="text-amber-dark" /> On-time performance
      </h2>
      <div className="rounded-[var(--radius-card)] bg-surface p-5 shadow-[var(--shadow-card)]">
        {data.onTime.winnerName ? (
          <>
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-sub">Best on-time student</p>
                <p className="mt-1 text-[20px] font-bold text-ink">{data.onTime.winnerName}</p>
                <p className="text-[13px] text-sub">
                  Ready in{' '}
                  <span className="font-semibold text-amber-dark">
                    {formatMinsSecs(data.onTime.winnerAvgBoardSeconds)}
                  </span>{' '}
                  on average after the bus reaches their stop
                </p>
              </div>
            </div>
            {data.onTime.period && (
              <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-sub">{data.onTime.period}</p>
            )}
            {data.onTime.leaderboard.length > 0 && (
              <div className="mt-4 overflow-x-auto rounded-[12px] border border-rule">
                <table className="w-full min-w-[420px] text-left text-sm">
                  <thead>
                    <tr className="bg-canvas border-b border-rule">
                      {['#', 'Student', 'Class', 'Avg board'].map((h) => (
                        <th key={h} className="whitespace-nowrap px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-sub">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.onTime.leaderboard.map((e, i) => (
                      <tr key={`${e.name}-${i}`} className={`border-b border-rule last:border-0 ${i === 0 ? 'bg-amber-light/40' : 'bg-surface'}`}>
                        <td className="px-4 py-2 text-[13px] font-bold text-sub tabular-nums">{i + 1}</td>
                        <td className="px-4 py-2 text-[13px] font-medium text-ink">{e.name}</td>
                        <td className="px-4 py-2 text-[13px] text-sub">{e.className}</td>
                        <td className="px-4 py-2 text-[13px] text-ink tabular-nums">{formatMinsSecs(e.avgBoardSeconds)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-sub">
            No on-time award computed yet for this school. It appears once a term’s pickups have been scored.
          </p>
        )}
      </div>

      {/* 7-day trend */}
      <h2 className="mt-8 mb-3 font-heading text-[16px] font-bold text-ink">Last 7 days</h2>
      <div className="rounded-[var(--radius-card)] bg-surface p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-end justify-between gap-2" style={{ height: 140 }}>
          {data.trend.map((t) => (
            <div key={t.date} className="flex flex-1 flex-col items-center gap-2">
              <div className="flex w-full items-end justify-center gap-1" style={{ height: 100 }}>
                <div
                  className="w-2.5 rounded-t bg-navy"
                  style={{ height: `${(t.trips / maxTrend) * 100}%` }}
                  title={`${t.trips} trips`}
                />
                <div
                  className="w-2.5 rounded-t bg-amber"
                  style={{ height: `${(t.boardings / maxTrend) * 100}%` }}
                  title={`${t.boardings} boardings`}
                />
              </div>
              <span className="text-[10px] text-sub">
                {new Date(t.date).toLocaleDateString('en-GB', { weekday: 'short' })}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-4 text-[12px] text-sub">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-navy" /> Trips
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-amber" /> Boardings
          </span>
        </div>
      </div>

      {/* Operational health */}
      <h2 className="mt-8 mb-3 font-heading text-[16px] font-bold text-ink">Needs attention</h2>
      <div className="divide-y divide-rule overflow-hidden rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-card)]">
        <HealthRow value={data.health.busesInMaintenance} label="Buses in maintenance" />
        <HealthRow value={data.health.driversWithoutPin} label="Drivers without a PIN set" />
        <HealthRow value={data.health.routesWithoutBus} label="Routes with no bus assigned" />
        <HealthRow value={data.health.studentsWithoutParent} label="Students with no parent linked" />
        <HealthRow value={data.health.studentsWithoutStop} label="Students on a route with no stop" />
      </div>
    </div>
  );
}
