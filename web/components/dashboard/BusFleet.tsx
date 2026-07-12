'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bus, Pencil, Users, Cpu, AlertCircle } from 'lucide-react';
import { RetireBusButton } from './RetireBusButton';

export type BusRow = {
  id: string;
  plate_number: string;
  capacity: number;
  device_id: string | null;
  status: 'ACTIVE' | 'MAINTENANCE' | 'RETIRED';
};

type StatusFilter = 'ALL' | BusRow['status'];

const STATUS_CONFIG: Record<
  BusRow['status'],
  { label: string; dotClass: string; badgeClass: string }
> = {
  ACTIVE: {
    label: 'Active',
    dotClass: 'bg-green animate-pulse-dot',
    badgeClass: 'bg-green-bg text-green',
  },
  MAINTENANCE: {
    label: 'Maintenance',
    dotClass: 'bg-amber-dark',
    badgeClass: 'bg-amber-light text-amber-dark',
  },
  RETIRED: {
    label: 'Retired',
    dotClass: 'bg-sub/50',
    badgeClass: 'bg-canvas text-sub',
  },
};

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'ACTIVE', label: 'Active' },
  { key: 'MAINTENANCE', label: 'Maintenance' },
  { key: 'RETIRED', label: 'Retired' },
];

function StatusBadge({ status }: { status: BusRow['status'] }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[var(--radius-chip)] px-2.5 py-1 text-[11px] font-semibold ${cfg.badgeClass}`}
    >
      <span className={`h-[5px] w-[5px] shrink-0 rounded-full ${cfg.dotClass}`} aria-hidden />
      {cfg.label}
    </span>
  );
}

function BusCard({ bus }: { bus: BusRow }) {
  const isRetired = bus.status === 'RETIRED';

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-[var(--radius-card)] shadow-[var(--shadow-card)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-float)] ${
        isRetired ? 'opacity-55' : ''
      }`}
    >
      {/* ── Plate header ── */}
      <div className="relative bg-navy px-5 pb-5 pt-4">
        {/* Status badge — top right */}
        <div className="mb-4 flex justify-end">
          <StatusBadge status={bus.status} />
        </div>

        {/* Plate label */}
        <p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-white/35">
          Plate Number
        </p>

        {/* Plate number — the hero */}
        <p className="board-figure text-[26px] font-bold leading-none tracking-wider text-amber">
          {bus.plate_number}
        </p>
      </div>

      {/* ── Metadata body ── */}
      <div className="flex flex-1 flex-col gap-0 divide-y divide-rule bg-surface">
        {/* Capacity row */}
        <div className="flex items-center gap-3 px-5 py-3.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-canvas">
            <Users size={13} strokeWidth={1.75} className="text-sub" />
          </span>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-sub">Capacity</p>
            <p className="mt-0.5 text-[13px] font-semibold text-ink">{bus.capacity} seats</p>
          </div>
        </div>

        {/* Device row */}
        <div className="flex items-center gap-3 px-5 py-3.5">
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
              bus.device_id ? 'bg-green-bg' : 'bg-amber-light'
            }`}
          >
            {bus.device_id ? (
              <Cpu size={13} strokeWidth={1.75} className="text-green" />
            ) : (
              <AlertCircle size={13} strokeWidth={1.75} className="text-amber-dark" />
            )}
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-sub">Device</p>
            {bus.device_id ? (
              <p className="board-figure mt-0.5 truncate text-[12px] font-medium text-ink">
                {bus.device_id}
              </p>
            ) : (
              <p className="mt-0.5 text-[12px] italic text-sub/70">Not paired</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Actions footer ── */}
      <div className="flex items-center justify-between border-t border-rule bg-surface px-5 py-3">
        <Link
          href={`/dashboard/buses/${bus.id}/edit`}
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-sub transition-colors duration-100 hover:text-ink"
        >
          <Pencil size={13} strokeWidth={2} />
          Edit
        </Link>
        {!isRetired && <RetireBusButton busId={bus.id} plateNumber={bus.plate_number} />}
      </div>
    </div>
  );
}

export function BusFleet({ buses }: { buses: BusRow[] }) {
  const [filter, setFilter] = useState<StatusFilter>('ALL');

  const counts: Record<StatusFilter, number> = {
    ALL: buses.length,
    ACTIVE: buses.filter((b) => b.status === 'ACTIVE').length,
    MAINTENANCE: buses.filter((b) => b.status === 'MAINTENANCE').length,
    RETIRED: buses.filter((b) => b.status === 'RETIRED').length,
  };

  const filtered = filter === 'ALL' ? buses : buses.filter((b) => b.status === filter);
  const activeLabel = FILTERS.find((f) => f.key === filter)?.label ?? '';

  if (buses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[var(--radius-card)] bg-surface py-24 shadow-[var(--shadow-card)]">
        <Bus size={40} strokeWidth={1} className="text-sub" />
        <p className="mt-4 text-base font-semibold text-ink">No buses yet</p>
        <p className="mt-1 text-sm text-sub">Add your first bus to get started</p>
        <Link
          href="/dashboard/buses/new"
          className="mt-6 rounded-[var(--radius-btn)] bg-amber px-4 py-2.5 text-sm font-semibold text-navy transition-all duration-150 hover:brightness-110 active:scale-95"
        >
          + Add Bus
        </Link>
      </div>
    );
  }

  return (
    <>
      {/* Filter bar */}
      <div className="mb-6 flex items-center gap-2">
        {FILTERS.map(({ key, label }) => {
          const active = filter === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`inline-flex items-center gap-2 rounded-[var(--radius-chip)] px-3.5 py-1.5 text-[12px] font-semibold transition-all duration-150 ${
                active
                  ? 'bg-navy text-white shadow-sm'
                  : 'border border-rule bg-surface text-sub hover:text-ink'
              }`}
            >
              {label}
              <span
                className={`tabular-nums text-[11px] font-bold ${active ? 'text-amber' : 'text-sub'}`}
              >
                {counts[key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Card grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[var(--radius-card)] bg-surface py-16 shadow-[var(--shadow-card)]">
          <Bus size={32} strokeWidth={1} className="text-sub" />
          <p className="mt-3 text-[14px] font-semibold text-sub">
            No {activeLabel.toLowerCase()} buses
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((bus) => (
            <BusCard key={bus.id} bus={bus} />
          ))}
        </div>
      )}
    </>
  );
}
