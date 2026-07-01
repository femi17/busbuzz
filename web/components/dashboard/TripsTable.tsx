'use client';

import { motion } from 'framer-motion';
import { CircleDot, CircleCheck, CircleX } from 'lucide-react';

export type TripRow = {
  id: string;
  started_at: string;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  bus: { plate_number: string } | null;
  route: { name: string } | null;
};

const statusConfig = {
  ACTIVE: { className: 'bg-amber/20 text-amber-dark', icon: CircleDot },
  COMPLETED: { className: 'bg-route/10 text-route', icon: CircleCheck },
  CANCELLED: { className: 'bg-stop/10 text-stop', icon: CircleX },
} as const;

function StatusBadge({ status }: { status: TripRow['status'] }) {
  const { className, icon: Icon } = statusConfig[status];

  return (
    <span
      className={`board-figure inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold uppercase ${className}`}
    >
      <Icon size={12} strokeWidth={2.5} />
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

export function TripsTable({ trips }: { trips: TripRow[] }) {
  if (trips.length === 0) {
    return (
      <div className="px-5 py-10 text-center text-sm text-navy/50">
        No trips running today. Trips will appear here automatically when
        drivers start their routes.
      </div>
    );
  }

  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b border-navy/10 text-xs uppercase tracking-wide text-navy/40">
          <th className="px-5 py-3 font-semibold">Bus</th>
          <th className="px-5 py-3 font-semibold">Route</th>
          <th className="px-5 py-3 font-semibold">Departed</th>
          <th className="px-5 py-3 font-semibold">Status</th>
        </tr>
      </thead>
      <tbody>
        {trips.map((trip, index) => (
          <motion.tr
            key={trip.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: index * 0.04 }}
            className="border-b border-navy/5 last:border-0"
          >
            <td className="board-figure px-5 py-3 font-semibold text-navy">
              {trip.bus?.plate_number ?? '—'}
            </td>
            <td className="px-5 py-3 text-navy/80">
              {trip.route?.name ?? '—'}
            </td>
            <td className="board-figure px-5 py-3 text-navy/80">
              {new Date(trip.started_at).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </td>
            <td className="px-5 py-3">
              <StatusBadge status={trip.status} />
            </td>
          </motion.tr>
        ))}
      </tbody>
    </table>
  );
}
