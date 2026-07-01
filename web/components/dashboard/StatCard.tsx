'use client';

import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

export function StatCard({
  label,
  value,
  icon: Icon,
  index = 0,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  index?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06, ease: 'easeOut' }}
      className="flex items-start justify-between rounded-xl border border-navy/10 bg-white p-5 shadow-sm"
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-navy/50">
          {label}
        </p>
        <p className="board-figure mt-2 text-3xl font-semibold text-navy">
          {value}
        </p>
      </div>
      <div className="rounded-lg bg-amber/15 p-2 text-amber-dark">
        <Icon size={20} strokeWidth={1.75} />
      </div>
    </motion.div>
  );
}
