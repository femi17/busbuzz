'use client';

import { motion } from 'framer-motion';

export type TripRow = {
  id: string;
  started_at: string;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  bus: { plate_number: string } | null;
  route: { name: string } | null;
};

function StatusBadge({ status }: { status: TripRow['status'] }) {
  if (status === 'ACTIVE') {
    return (
      <span className="inline-flex items-center gap-1.5 bg-green-bg text-green rounded-[var(--radius-chip)] px-2.5 py-1 text-[11px] font-semibold">
        <span className="w-[5px] h-[5px] rounded-full bg-green" aria-hidden />
        Active
      </span>
    );
  }
  if (status === 'CANCELLED') {
    return (
      <span className="inline-flex items-center gap-1.5 bg-red-bg text-red rounded-[var(--radius-chip)] px-2.5 py-1 text-[11px] font-semibold">
        <span className="w-[5px] h-[5px] rounded-full bg-red" aria-hidden />
        Cancelled
      </span>
    );
  }
  return (
    <span className="inline-flex items-center bg-canvas text-sub rounded-[var(--radius-chip)] px-2.5 py-1 text-[11px] font-semibold">
      Completed
    </span>
  );
}

export function TripsTable({ trips }: { trips: TripRow[] }) {
  if (trips.length === 0) {
    return (
      <div className="px-5 py-10 text-center text-[13px] text-sub">
        No trips running today. Trips will appear here automatically when
        drivers start their routes.
      </div>
    );
  }

  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="bg-canvas border-b border-rule">
          <th className="px-5 py-3 text-[11px] font-semibold text-sub uppercase tracking-widest">Bus</th>
          <th className="px-5 py-3 text-[11px] font-semibold text-sub uppercase tracking-widest">Route</th>
          <th className="px-5 py-3 text-[11px] font-semibold text-sub uppercase tracking-widest">Departed</th>
          <th className="px-5 py-3 text-[11px] font-semibold text-sub uppercase tracking-widest">Status</th>
        </tr>
      </thead>
      <tbody>
        {trips.map((trip, index) => (
          <motion.tr
            key={trip.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: index * 0.04 }}
            className="group border-b border-rule last:border-0 bg-surface hover:bg-canvas/60 transition-colors duration-100"
          >
            <td className="board-figure px-5 py-3 text-[13px] text-sub">
              {trip.bus?.plate_number ?? '—'}
            </td>
            <td className="px-5 py-3 text-[14px] text-ink">
              {trip.route?.name ?? '—'}
            </td>
            <td className="board-figure px-5 py-3 text-[13px] text-sub">
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
