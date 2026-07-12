'use client';

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
} from 'recharts';
import { CountUp } from './CountUp';

type WeekDay = {
  day: string;
  count: number;
};

export function TripActivityChart({
  data,
  weekTotal,
}: {
  data: WeekDay[];
  weekTotal: number;
}) {
  return (
    <div className="bg-surface shadow-[var(--shadow-card)] rounded-[var(--radius-card)] p-5 hover:shadow-[var(--shadow-float)] hover:-translate-y-0.5 transition-all duration-200">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[14px] font-semibold text-ink">Trip Activity</span>
        <span className="bg-canvas rounded-[var(--radius-chip)] px-2.5 py-1 text-[11px] font-medium text-sub">
          7 days
        </span>
      </div>

      {/* Big number */}
      <p className="text-[40px] font-bold text-ink leading-none">
        <CountUp value={weekTotal} duration={800} />
      </p>
      <p className="text-[12px] text-sub mt-1">trips this week</p>

      {/* Bar chart */}
      <div className="mt-4">
        <ResponsiveContainer width="100%" height={100}>
          <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <XAxis
              dataKey="day"
              tick={{ fontSize: 10, fill: 'var(--color-sub)', fontFamily: 'var(--font-dm-sans)' }}
              axisLine={false}
              tickLine={false}
            />
            <Bar
              dataKey="count"
              fill="var(--color-amber)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
