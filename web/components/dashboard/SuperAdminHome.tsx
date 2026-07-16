import Link from 'next/link';
import { Bus, Route as RouteIcon, GraduationCap, UserCheck, Timer, ChevronRight, School } from 'lucide-react';
import type { SchoolOverviewRow } from '@/lib/super-admin-data';

function formatMinsSecs(seconds: number | null): string {
  if (seconds === null) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function Stat({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Bus;
  value: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={15} strokeWidth={1.9} className="shrink-0 text-sub" />
      <span className="text-[15px] font-bold text-ink tabular-nums">{value}</span>
      <span className="text-[12px] text-sub">{label}</span>
    </div>
  );
}

export function SuperAdminHome({
  schools,
  totals,
}: {
  schools: SchoolOverviewRow[];
  totals: { schools: number; buses: number; students: number; activeTrips: number };
}) {
  return (
    <div className="flex flex-col gap-5">
      {/* Platform totals */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-[var(--radius-card)] bg-surface p-4 shadow-[var(--shadow-card)]">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-sub">Schools</p>
          <p className="mt-1 text-[26px] font-bold text-ink tabular-nums">{totals.schools}</p>
        </div>
        <div className="rounded-[var(--radius-card)] bg-surface p-4 shadow-[var(--shadow-card)]">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-sub">Buses</p>
          <p className="mt-1 text-[26px] font-bold text-ink tabular-nums">{totals.buses}</p>
        </div>
        <div className="rounded-[var(--radius-card)] bg-surface p-4 shadow-[var(--shadow-card)]">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-sub">Students</p>
          <p className="mt-1 text-[26px] font-bold text-ink tabular-nums">{totals.students}</p>
        </div>
        <div className="rounded-[var(--radius-card)] bg-surface p-4 shadow-[var(--shadow-card)]">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-sub">Trips live</p>
          <p className="mt-1 flex items-center gap-2 text-[26px] font-bold text-ink tabular-nums">
            {totals.activeTrips}
            {totals.activeTrips > 0 && (
              <span className="h-2 w-2 rounded-full bg-green animate-pulse-dot" aria-hidden />
            )}
          </p>
        </div>
      </div>

      {/* Schools list */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-[17px] font-bold text-ink">Schools</h2>
          <Link
            href="/dashboard/schools/new"
            className="rounded-[var(--radius-btn)] bg-amber px-3.5 py-2 text-[13px] font-semibold text-navy transition-all duration-150 hover:brightness-110 active:scale-95"
          >
            + Onboard School
          </Link>
        </div>

        {schools.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-[var(--radius-card)] bg-surface py-16 shadow-[var(--shadow-card)]">
            <School size={40} strokeWidth={1} className="text-sub" />
            <p className="mt-4 text-base font-semibold text-ink">No schools yet</p>
            <p className="mt-1 text-sm text-sub">Onboard your first school to get started</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {schools.map((s) => (
              <Link
                key={s.id}
                href={`/dashboard/schools/${s.id}`}
                className="group flex items-center gap-4 rounded-[var(--radius-card)] bg-surface p-4 shadow-[var(--shadow-card)] transition-all duration-150 hover:-translate-y-0.5 hover:shadow-[var(--shadow-float)]"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-navy">
                  <School size={18} className="text-amber" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[15px] font-semibold text-ink">{s.name}</p>
                    {!s.isActive && (
                      <span className="shrink-0 rounded-[var(--radius-chip)] bg-canvas px-2 py-0.5 text-[10px] font-semibold text-sub">
                        Inactive
                      </span>
                    )}
                    {s.activeTrips > 0 && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-chip)] bg-green-bg px-2 py-0.5 text-[10px] font-semibold text-green">
                        <span className="h-1.5 w-1.5 rounded-full bg-green animate-pulse-dot" aria-hidden />
                        {s.activeTrips} live
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                    <Stat icon={Bus} value={s.buses} label="buses" />
                    <Stat icon={RouteIcon} value={s.routes} label="routes" />
                    <Stat icon={GraduationCap} value={s.students} label="students" />
                    <Stat icon={UserCheck} value={s.drivers} label="drivers" />
                  </div>

                  <div className="mt-2 flex items-center gap-1.5 text-[12px]">
                    <Timer size={13} strokeWidth={1.9} className="text-amber-dark" />
                    <span className="text-sub">Best on-time:</span>
                    {s.bestOnTime ? (
                      <span className="font-medium text-ink">
                        {s.bestOnTime.name}
                        <span className="text-sub"> · {formatMinsSecs(s.bestOnTime.avgBoardSeconds)} avg</span>
                      </span>
                    ) : (
                      <span className="italic text-sub/70">not computed yet</span>
                    )}
                  </div>
                </div>

                <ChevronRight size={18} className="shrink-0 text-sub transition-transform duration-150 group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
