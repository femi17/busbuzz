'use client';

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { CountUp } from './CountUp';

type SubDot = 'green' | 'amber' | 'red' | null;

const dotColors: Record<NonNullable<SubDot>, string> = {
  green: 'bg-green',
  amber: 'bg-amber',
  red: 'bg-red',
};

export function StatCard({
  label,
  value,
  icon,
  index = 0,
  sub,
  subDot,
  valueColor,
}: {
  label: string;
  value: number | string;
  icon: ReactNode;
  index?: number;
  sub?: string;
  subDot?: SubDot;
  valueColor?: string;
}) {
  const numericValue = typeof value === 'number' ? value : null;
  const stringValue = typeof value === 'string' ? value : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06, ease: 'easeOut' }}
      className="bg-surface border border-rule/70 shadow-[var(--shadow-card)] rounded-[var(--radius-card)] p-5 hover:shadow-[var(--shadow-float)] hover:-translate-y-0.5 transition-all duration-200"
    >
      <div className="flex items-center justify-between mb-4">
        <p className="font-mono text-[10px] font-semibold text-sub uppercase tracking-[0.14em]">{label}</p>
        <div className="rounded-[10px] bg-night p-2 text-amber">
          {icon}
        </div>
      </div>

      <p className={`board-figure text-[34px] font-semibold leading-none ${valueColor ?? 'text-ink'}`}>
        {numericValue !== null ? (
          <CountUp value={numericValue} duration={800} />
        ) : (
          stringValue
        )}
      </p>

      {sub && (
        <div className="flex items-center gap-1.5 mt-2">
          {subDot && (
            <span
              className={`w-[6px] h-[6px] rounded-full shrink-0 ${dotColors[subDot]}`}
              aria-hidden
            />
          )}
          <p className="text-[12px] text-sub">{sub}</p>
        </div>
      )}
    </motion.div>
  );
}
