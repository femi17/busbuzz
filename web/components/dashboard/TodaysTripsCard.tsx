'use client';

import { useState } from 'react';
import { Bus, ChevronDown } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { TripRow } from './TripsTable';

type StatusFilter = 'ALL' | TripRow['status'];

const FILTER_LABELS: Record<StatusFilter, string> = {
  ALL: 'All',
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

function StatusBadge({ status }: { status: TripRow['status'] }) {
  if (status === 'ACTIVE') {
    return (
      <span className="inline-flex items-center gap-1.5 bg-green-bg text-green rounded-[var(--radius-chip)] px-2.5 py-1 text-[11px] font-semibold">
        <span className="w-[5px] h-[5px] rounded-full bg-green animate-pulse-dot" aria-hidden />
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
      Done
    </span>
  );
}

export function TodaysTripsCard({ trips }: { trips: TripRow[] }) {
  const [filter, setFilter] = useState<StatusFilter>('ALL');
  const filteredTrips = filter === 'ALL' ? trips : trips.filter((trip) => trip.status === filter);

  return (
    <div className="bg-surface shadow-[var(--shadow-card)] rounded-[var(--radius-card)] p-5 flex flex-col h-[400px] hover:shadow-[var(--shadow-float)] hover:-translate-y-0.5 transition-all duration-200">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <span className="text-[14px] font-semibold text-ink">Today&apos;s Trips</span>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              className="flex items-center gap-1 bg-canvas rounded-[var(--radius-chip)] px-2.5 py-1 text-[11px] font-medium text-sub hover:text-ink transition-colors duration-100 outline-none"
            >
              {FILTER_LABELS[filter]}
              <ChevronDown size={10} strokeWidth={2} aria-hidden />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={4}
              className="z-50 min-w-[140px] bg-surface rounded-[var(--radius-btn)] shadow-[var(--shadow-float)] border border-rule py-1 outline-none"
            >
              {(Object.keys(FILTER_LABELS) as StatusFilter[]).map((status) => (
                <DropdownMenu.Item
                  key={status}
                  onSelect={() => setFilter(status)}
                  className="flex items-center px-3 py-2 text-[13px] font-medium text-ink hover:bg-canvas cursor-pointer outline-none rounded-sm mx-1"
                >
                  {FILTER_LABELS[status]}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      {/* Trip list */}
      {filteredTrips.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center">
          <Bus size={32} strokeWidth={1} className="text-sub" />
          <p className="text-[14px] font-semibold text-sub mt-3">
            {trips.length === 0 ? 'No trips today' : `No ${FILTER_LABELS[filter].toLowerCase()} trips`}
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {filteredTrips.map((trip) => (
            <div
              key={trip.id}
              className="py-3 border-b border-rule last:border-0 flex items-center gap-3"
            >
              <div className="flex-1 min-w-0">
                <p className="board-figure text-[13px] text-ink truncate">
                  {trip.bus?.plate_number ?? '—'}
                </p>
                <p className="text-[12px] text-sub truncate mt-0.5">
                  {trip.route?.name ?? '—'}
                </p>
              </div>
              <span className="board-figure text-[12px] text-sub shrink-0">
                {new Date(trip.started_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              <div className="shrink-0">
                <StatusBadge status={trip.status} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
