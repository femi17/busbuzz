import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Archive, Bus, GraduationCap, MapPin, UserX } from 'lucide-react';
import { createClient } from '@/lib/supabase-server';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';

export const dynamic = 'force-dynamic';

type PlatformAnalytics = {
  totals: {
    trips: number;
    distanceM: number;
    boarded: number;
    absent: number;
    dropped: number;
    firstTripAt: string | null;
  };
  daily: { date: string; trips: number; boarded: number; distanceM: number }[];
  perSchool: {
    schoolId: string | null;
    name: string;
    trips: number;
    distanceM: number;
    boarded: number;
    lastTripAt: string;
  }[];
};

function formatKm(meters: number): string {
  const km = meters / 1000;
  if (km >= 100) return `${Math.round(km).toLocaleString()} km`;
  return `${km.toFixed(1)} km`;
}

function Tile({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Bus;
  value: string;
  label: string;
}) {
  return (
    <div className="rounded-[var(--radius-card)] bg-surface p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2">
        <Icon size={14} strokeWidth={1.9} className="text-sub" />
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-sub">{label}</p>
      </div>
      <p className="mt-1.5 text-[26px] font-bold text-ink tabular-nums">{value}</p>
    </div>
  );
}

export default async function AnalyticsPage() {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) notFound();
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single();
  if (profile?.role !== 'SUPER_ADMIN') notFound();

  const { data, error } = await supabase.rpc('get_platform_analytics');
  if (error || !data) notFound();
  const analytics = data as PlatformAnalytics;

  const since = analytics.totals.firstTripAt
    ? new Date(analytics.totals.firstTripAt).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  const maxTrend = Math.max(1, ...analytics.daily.map((d) => Math.max(d.trips, d.boarded)));

  return (
    <div className="max-w-[1000px] mx-auto">
      <DashboardHeader
        eyebrow="Platform analytics"
        title="Every journey, archived"
        subtitle={
          since
            ? `Permanent per-trip record across all schools since ${since}`
            : 'Permanent per-trip record across all schools'
        }
      />

      {/* Archive totals */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile icon={Archive} value={analytics.totals.trips.toLocaleString()} label="Journeys archived" />
        <Tile icon={MapPin} value={formatKm(analytics.totals.distanceM)} label="Distance tracked" />
        <Tile icon={GraduationCap} value={analytics.totals.boarded.toLocaleString()} label="Boardings" />
        <Tile icon={UserX} value={analytics.totals.absent.toLocaleString()} label="Absences" />
      </div>

      {/* 14-day trend */}
      <h2 className="mt-8 mb-3 font-heading text-[16px] font-bold text-ink">Last 14 days</h2>
      <div className="rounded-[var(--radius-card)] bg-surface p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-end justify-between gap-1.5" style={{ height: 140 }}>
          {analytics.daily.map((d) => (
            <div key={d.date} className="flex flex-1 flex-col items-center gap-2">
              <div className="flex w-full items-end justify-center gap-0.5" style={{ height: 100 }}>
                <div
                  className="w-2 rounded-t bg-navy"
                  style={{ height: `${(d.trips / maxTrend) * 100}%` }}
                  title={`${d.trips} trips`}
                />
                <div
                  className="w-2 rounded-t bg-amber"
                  style={{ height: `${(d.boarded / maxTrend) * 100}%` }}
                  title={`${d.boarded} boardings`}
                />
              </div>
              <span className="text-[9px] text-sub">
                {new Date(d.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'numeric' })}
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

      {/* Per-school breakdown */}
      <h2 className="mt-8 mb-3 font-heading text-[16px] font-bold text-ink">By school</h2>
      <div className="overflow-hidden rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-card)]">
        {analytics.perSchool.length === 0 ? (
          <p className="p-6 text-sm text-sub">
            No archived journeys yet. Summaries are written nightly as trips complete.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="bg-canvas border-b border-rule">
                  {['School', 'Trips', 'Distance', 'Boardings', 'Last trip'].map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap px-5 py-3 text-[11px] font-semibold uppercase tracking-widest text-sub"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {analytics.perSchool.map((s) => (
                  <tr key={s.schoolId ?? s.name} className="border-b border-rule last:border-0">
                    <td className="px-5 py-3 text-[14px] font-medium text-ink">
                      {s.schoolId ? (
                        <Link href={`/dashboard/schools/${s.schoolId}`} className="hover:text-amber-dark transition-colors">
                          {s.name}
                        </Link>
                      ) : (
                        s.name
                      )}
                    </td>
                    <td className="px-5 py-3 text-[14px] text-ink tabular-nums">{s.trips.toLocaleString()}</td>
                    <td className="px-5 py-3 text-[14px] text-ink tabular-nums">{formatKm(s.distanceM)}</td>
                    <td className="px-5 py-3 text-[14px] text-ink tabular-nums">{s.boarded.toLocaleString()}</td>
                    <td className="board-figure px-5 py-3 text-[13px] text-sub">
                      {new Date(s.lastTripAt).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-4 text-[12px] text-sub">
        Built from the trip archive: each completed trip&apos;s distance, route path, stop arrival
        times and attendance are preserved permanently, independent of raw GPS retention.
      </p>
    </div>
  );
}
