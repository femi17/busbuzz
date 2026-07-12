'use client';

import { PieChart, Pie, Cell } from 'recharts';

export function AttendanceDonut({
  boarded,
  absent,
}: {
  boarded: number;
  absent: number;
}) {
  const total = boarded + absent;
  const percentage = total > 0 ? Math.round((boarded / total) * 100) : 0;

  const data = [
    { name: 'Boarded', value: boarded > 0 ? boarded : 0 },
    { name: 'Absent', value: absent > 0 ? absent : 0 },
  ];

  const hasData = total > 0;

  return (
    <div className="bg-surface shadow-[var(--shadow-card)] rounded-[var(--radius-card)] p-5 hover:shadow-[var(--shadow-float)] hover:-translate-y-0.5 transition-all duration-200">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-[14px] font-semibold text-ink">Attendance</span>
        <span className="bg-canvas rounded-[var(--radius-chip)] px-2.5 py-1 text-[11px] font-medium text-sub">
          All time
        </span>
      </div>

      {!hasData ? (
        <div className="flex items-center justify-center py-8">
          <p className="text-[13px] text-sub">No attendance data</p>
        </div>
      ) : (
        <div className="flex items-center gap-6">
          {/* Donut chart */}
          <div className="relative shrink-0">
            <PieChart width={120} height={120}>
              <Pie
                data={data}
                cx={55}
                cy={55}
                innerRadius={40}
                outerRadius={55}
                dataKey="value"
                startAngle={90}
                endAngle={-270}
                strokeWidth={0}
              >
                <Cell fill="var(--color-amber)" />
                <Cell fill="var(--color-rule)" />
              </Pie>
            </PieChart>
            {/* Center label */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[20px] font-bold text-ink">{percentage}%</span>
            </div>
          </div>

          {/* Stats */}
          <div className="flex flex-col gap-3 flex-1">
            <div className="flex items-center gap-2">
              <span className="w-[10px] h-[10px] rounded-sm bg-amber shrink-0" aria-hidden />
              <span className="text-[13px] text-sub flex-1">Boarded</span>
              <span className="text-[13px] font-semibold text-ink">{boarded}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-[10px] h-[10px] rounded-sm bg-rule shrink-0" aria-hidden />
              <span className="text-[13px] text-sub flex-1">Absent</span>
              <span className="text-[13px] font-semibold text-ink">{absent}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
