'use client';

import Link from 'next/link';

const dotPalette = ['#FFC900', '#3B82F6', '#8B5CF6', '#EC4899'];

type RouteItem = {
  id: string;
  name: string;
  type: 'MORNING' | 'AFTERNOON';
  busPlateNumber: string | null;
  studentCount: number;
};

export function RoutesCard({ routes }: { routes: RouteItem[] }) {
  return (
    <div className="bg-surface shadow-[var(--shadow-card)] rounded-[var(--radius-card)] p-5 hover:shadow-[var(--shadow-float)] hover:-translate-y-0.5 transition-all duration-200">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-[14px] font-semibold text-ink">Routes</span>
        <Link
          href="/dashboard/routes/new"
          className="text-[13px] font-medium text-amber hover:text-amber-dark transition-colors duration-100"
        >
          + New
        </Link>
      </div>

      {routes.length === 0 ? (
        <div className="py-6 flex items-center justify-center">
          <p className="text-[13px] text-sub">No routes yet</p>
        </div>
      ) : (
        <div>
          {routes.map((route, index) => (
            <div
              key={route.id}
              className="py-2.5 border-b border-rule last:border-0 flex items-center gap-3"
            >
              <span
                className="w-[10px] h-[10px] rounded-full shrink-0"
                style={{ backgroundColor: dotPalette[index % dotPalette.length] }}
                aria-hidden
              />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-ink truncate">{route.name}</p>
                <p className="board-figure text-[11px] text-sub mt-0.5">
                  {route.busPlateNumber ?? (
                    <span className="italic">No bus</span>
                  )}
                </p>
              </div>
              <span className="rounded-[var(--radius-chip)] bg-canvas px-2 text-[11px] font-medium text-sub shrink-0">
                {route.studentCount}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
