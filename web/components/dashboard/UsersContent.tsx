'use client';

import { Fragment, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Bus, GraduationCap, ChevronDown, Search } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { RevokeParentButton } from './RevokeParentButton';

export type ParentRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  onboarding_completed: boolean;
  student_parents: Array<{
    students:
      | { id: string; name: string }
      | { id: string; name: string }[]
      | null;
  }>;
};

export type DriverRow = {
  id: string;
  name: string;
  phone: string | null;
  driver_pins: { id: string } | null;
};

export type BusOption = {
  id: string;
  plate_number: string;
  driver_id: string | null;
};

type UsersContentProps = {
  parents: ParentRow[];
  drivers: DriverRow[];
  buses: BusOption[];
};

function getStudentNames(row: ParentRow): string[] {
  return row.student_parents.flatMap((sp) => {
    if (!sp.students) return [];
    if (Array.isArray(sp.students)) return sp.students.map((s) => s.name);
    return [sp.students.name];
  });
}

function ParentStatusBadge({ is_active, onboarding_completed }: { is_active: boolean; onboarding_completed: boolean }) {
  if (!is_active) return <span className="inline-flex rounded-[var(--radius-chip)] px-2.5 py-1 text-xs font-semibold bg-canvas text-sub">Inactive</span>;
  if (onboarding_completed) return <span className="inline-flex rounded-[var(--radius-chip)] px-2.5 py-1 text-xs font-semibold bg-green-bg text-green">Active</span>;
  return <span className="inline-flex rounded-[var(--radius-chip)] px-2.5 py-1 text-xs font-semibold bg-amber-light text-amber-dark">Pending</span>;
}

function PinStatusBadge({ hasPin }: { hasPin: boolean }) {
  return (
    <span className={`inline-flex rounded-[var(--radius-chip)] px-2.5 py-1 text-xs font-semibold ${hasPin ? 'bg-green-bg text-green' : 'bg-canvas text-sub'}`}>
      {hasPin ? 'Set' : 'Not Set'}
    </span>
  );
}

const modalInputClass = 'w-full rounded-[var(--radius-btn)] border border-rule px-3 py-2.5 text-sm text-ink placeholder:text-sub focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber';
const modalLabelClass = 'mb-1.5 block text-sm font-medium text-ink';

function AddDriverModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/create-driver`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}`, apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
        body: JSON.stringify({ name, phone }),
      });
      if (!response.ok) { const errorBody = await response.json().catch(() => null); setError(errorBody?.error ?? 'Failed to add driver'); return; }
      onSuccess();
    } finally { setIsLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md bg-surface rounded-[var(--radius-card)] p-6 shadow-[var(--shadow-float)]">
        <h2 className="font-heading font-bold text-[18px] tracking-tight text-ink">Add Driver</h2>
        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
          {error && <div className="rounded-[var(--radius-btn)] bg-red-bg border border-red/30 text-red text-sm px-4 py-3">{error}</div>}
          <div>
            <label className={modalLabelClass}>Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g., Emeka Nwosu" className={modalInputClass} />
          </div>
          <div>
            <label className={modalLabelClass}>Phone</label>
            <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} required placeholder="e.g., 08012345678" className={modalInputClass} />
          </div>
          <div className="mt-2 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="rounded-[var(--radius-btn)] border border-rule px-4 py-2.5 text-sm font-medium text-sub hover:bg-canvas transition-colors duration-150 active:scale-95">Cancel</button>
            <button type="submit" disabled={isLoading} className="rounded-[var(--radius-btn)] bg-amber px-4 py-2.5 text-sm font-semibold text-navy hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 active:scale-95 transition-all duration-150">
              {isLoading ? 'Adding...' : 'Add Driver'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SetPinModal({ driverId, driverName, onClose, onSuccess }: { driverId: string; driverName: string; onClose: () => void; onSuccess: () => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!/^\d{4}$/.test(pin)) { setError('PIN must be exactly 4 digits'); return; }
    setIsLoading(true);
    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/set-driver-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}`, apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
        body: JSON.stringify({ driverId, pin }),
      });
      if (!response.ok) { const errorBody = await response.json().catch(() => null); setError(errorBody?.error ?? 'Failed to set PIN'); return; }
      onSuccess();
    } finally { setIsLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md bg-surface rounded-[var(--radius-card)] p-6 shadow-[var(--shadow-float)]">
        <h2 className="font-heading font-bold text-[18px] tracking-tight text-ink">Set PIN for {driverName}</h2>
        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
          {error && <div className="rounded-[var(--radius-btn)] bg-red-bg border border-red/30 text-red text-sm px-4 py-3">{error}</div>}
          <div>
            <label className={modalLabelClass}>4-Digit PIN</label>
            <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} required maxLength={4} pattern="[0-9]{4}" inputMode="numeric" placeholder="••••" className={modalInputClass} />
          </div>
          <div className="mt-2 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="rounded-[var(--radius-btn)] border border-rule px-4 py-2.5 text-sm font-medium text-sub hover:bg-canvas transition-colors duration-150 active:scale-95">Cancel</button>
            <button type="submit" disabled={isLoading} className="rounded-[var(--radius-btn)] bg-amber px-4 py-2.5 text-sm font-semibold text-navy hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 active:scale-95 transition-all duration-150">
              {isLoading ? 'Setting...' : 'Set PIN'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ReassignModal({ driverId, driverName, buses, currentBusId, onClose, onSuccess }: { driverId: string; driverName: string; buses: BusOption[]; currentBusId: string | null; onClose: () => void; onSuccess: () => void }) {
  const [selectedBusId, setSelectedBusId] = useState(currentBusId ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleConfirm() {
    setError(null);
    setIsLoading(true);
    try {
      const supabase = createClient();
      const { error: clearError } = await supabase.from('buses').update({ driver_id: null }).eq('driver_id', driverId);
      if (clearError) { setError(clearError.message); return; }
      if (selectedBusId) {
        const { error: assignError } = await supabase.from('buses').update({ driver_id: driverId }).eq('id', selectedBusId);
        if (assignError) { setError(assignError.message); return; }
      }
      onSuccess();
    } finally { setIsLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md bg-surface rounded-[var(--radius-card)] p-6 shadow-[var(--shadow-float)]">
        <h2 className="font-heading font-bold text-[18px] tracking-tight text-ink">Reassign Bus for {driverName}</h2>
        <div className="mt-5 flex flex-col gap-4">
          {error && <div className="rounded-[var(--radius-btn)] bg-red-bg border border-red/30 text-red text-sm px-4 py-3">{error}</div>}
          <div>
            <label className={modalLabelClass}>Assigned Bus</label>
            <select value={selectedBusId} onChange={(e) => setSelectedBusId(e.target.value)} className={modalInputClass}>
              <option value="">Unassigned</option>
              {buses.map((bus) => <option key={bus.id} value={bus.id}>{bus.plate_number}</option>)}
            </select>
          </div>
          <div className="mt-2 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="rounded-[var(--radius-btn)] border border-rule px-4 py-2.5 text-sm font-medium text-sub hover:bg-canvas transition-colors duration-150 active:scale-95">Cancel</button>
            <button type="button" onClick={handleConfirm} disabled={isLoading} className="rounded-[var(--radius-btn)] bg-amber px-4 py-2.5 text-sm font-semibold text-navy hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 active:scale-95 transition-all duration-150">
              {isLoading ? 'Saving...' : 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function UsersContent({ parents, drivers, buses }: UsersContentProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'parents' | 'drivers'>('parents');
  const [expandedParentId, setExpandedParentId] = useState<string | null>(null);
  const [showAddDriverModal, setShowAddDriverModal] = useState(false);
  const [setPinTarget, setSetPinTarget] = useState<{ id: string; name: string } | null>(null);
  const [reassignTarget, setReassignTarget] = useState<{ id: string; name: string } | null>(null);
  const [parentQuery, setParentQuery] = useState('');
  const [driverQuery, setDriverQuery] = useState('');

  function getAssignedBus(driverId: string): BusOption | null {
    return buses.find((bus) => bus.driver_id === driverId) ?? null;
  }

  const filteredParents = useMemo(() => {
    const q = parentQuery.trim().toLowerCase();
    if (!q) return parents;
    return parents.filter((p) =>
      `${p.name} ${p.email ?? ''} ${p.phone ?? ''}`.toLowerCase().includes(q),
    );
  }, [parents, parentQuery]);

  const filteredDrivers = useMemo(() => {
    const q = driverQuery.trim().toLowerCase();
    if (!q) return drivers;
    return drivers.filter((d) =>
      `${d.name} ${d.phone ?? ''} ${getAssignedBus(d.id)?.plate_number ?? ''}`
        .toLowerCase()
        .includes(q),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drivers, driverQuery, buses]);

  const tableHeaderClass = 'bg-canvas px-5 py-3 text-[11px] font-semibold text-sub uppercase tracking-widest';
  const searchInputClass =
    'w-full max-w-sm rounded-[var(--radius-btn)] border border-rule bg-surface pl-9 pr-3 py-2.5 text-sm text-ink placeholder:text-sub focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber';

  return (
    <div className="flex flex-col gap-4">
      {/* Tab bar */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('parents')}
          className={`rounded-[var(--radius-btn)] px-4 py-2.5 text-sm font-semibold transition-colors duration-150 ${activeTab === 'parents' ? 'bg-navy text-white' : 'border border-rule bg-surface text-ink hover:bg-canvas'}`}
        >
          Parents
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('drivers')}
          className={`rounded-[var(--radius-btn)] px-4 py-2.5 text-sm font-semibold transition-colors duration-150 ${activeTab === 'drivers' ? 'bg-navy text-white' : 'border border-rule bg-surface text-ink hover:bg-canvas'}`}
        >
          Drivers
        </button>
      </div>

      {/* Parents Tab */}
      {activeTab === 'parents' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="relative w-full max-w-sm">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sub" />
              <input
                type="text"
                value={parentQuery}
                onChange={(e) => setParentQuery(e.target.value)}
                placeholder="Search parents by name, email, or phone…"
                className={searchInputClass}
              />
            </div>
            <p className="shrink-0 text-sm font-medium text-sub">
              {filteredParents.length} {filteredParents.length === 1 ? 'parent' : 'parents'}
            </p>
          </div>

          <div className="bg-surface shadow-[var(--shadow-card)] rounded-[var(--radius-card)] overflow-hidden">
            {parents.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-5 py-16 text-center">
                <p className="text-sm text-sub">No parents have been invited yet. Go to Students to invite parents for each student.</p>
              </div>
            ) : filteredParents.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-5 py-16 text-center">
                <p className="text-sm text-sub">No parents match “{parentQuery}”.</p>
              </div>
            ) : (
              <div className="overflow-auto max-h-[60vh]">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-canvas border-b border-rule">
                    {['Name', 'Email', 'Phone', 'Children', 'Status', 'Actions'].map((h) => (
                      <th key={h} className={tableHeaderClass}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredParents.map((parent) => {
                    const studentNames = getStudentNames(parent);
                    const isExpanded = expandedParentId === parent.id;
                    return (
                      <Fragment key={parent.id}>
                        <tr className="group border-b border-rule last:border-0 bg-surface hover:bg-canvas/60 transition-colors duration-100">
                          <td className="px-5 py-3 text-[14px] font-medium text-ink">{parent.name}</td>
                          <td className="px-5 py-3 board-figure text-[13px] text-sub">{parent.email ?? '--'}</td>
                          <td className="px-5 py-3 board-figure text-[13px] text-sub">{parent.phone ?? '--'}</td>
                          <td className="px-5 py-3 board-figure text-[13px] text-sub">{parent.student_parents.length}</td>
                          <td className="px-5 py-3"><ParentStatusBadge is_active={parent.is_active} onboarding_completed={parent.onboarding_completed} /></td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-4">
                              <button
                                type="button"
                                onClick={() => setExpandedParentId(isExpanded ? null : parent.id)}
                                aria-expanded={isExpanded}
                                className="inline-flex items-center gap-1.5 text-[12px] font-medium text-sub hover:text-ink transition-colors duration-100"
                              >
                                <GraduationCap size={13} strokeWidth={2} />
                                {isExpanded ? 'Hide' : 'Children'}
                                <ChevronDown size={12} strokeWidth={2.5} className={`transition-transform duration-150 ${isExpanded ? 'rotate-180' : ''}`} />
                              </button>
                              {parent.is_active && <RevokeParentButton parentId={parent.id} parentName={parent.name} />}
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="border-b border-rule last:border-0 bg-canvas/40">
                            <td colSpan={6} className="px-5 py-3">
                              {studentNames.length === 0 ? (
                                <span className="text-sm italic text-sub">No linked children</span>
                              ) : (
                                <ul className="flex flex-wrap gap-2">
                                  {studentNames.map((sName, i) => (
                                    <li key={i} className="rounded-[var(--radius-chip)] bg-navy-light px-3 py-1 text-xs font-medium text-navy">{sName}</li>
                                  ))}
                                </ul>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Drivers Tab */}
      {activeTab === 'drivers' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="relative w-full max-w-sm">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sub" />
              <input
                type="text"
                value={driverQuery}
                onChange={(e) => setDriverQuery(e.target.value)}
                placeholder="Search drivers by name, phone, or bus…"
                className={searchInputClass}
              />
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <p className="text-sm font-medium text-sub">{filteredDrivers.length} {filteredDrivers.length === 1 ? 'driver' : 'drivers'}</p>
              <button type="button" onClick={() => setShowAddDriverModal(true)} className="rounded-[var(--radius-btn)] bg-amber px-4 py-2.5 text-sm font-semibold text-navy hover:brightness-110 active:scale-95 transition-all duration-150">
                + Add Driver
              </button>
            </div>
          </div>

          <div className="bg-surface shadow-[var(--shadow-card)] rounded-[var(--radius-card)] overflow-hidden">
            {drivers.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-5 py-16 text-center">
                <p className="text-sm text-sub">No drivers added yet. Add your first driver to get started.</p>
                <button type="button" onClick={() => setShowAddDriverModal(true)} className="rounded-[var(--radius-btn)] bg-amber px-4 py-2.5 text-sm font-semibold text-navy hover:brightness-110 active:scale-95 transition-all duration-150">
                  + Add Driver
                </button>
              </div>
            ) : filteredDrivers.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-5 py-16 text-center">
                <p className="text-sm text-sub">No drivers match “{driverQuery}”.</p>
              </div>
            ) : (
              <div className="overflow-auto max-h-[60vh]">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-canvas border-b border-rule">
                    {['Name', 'Phone', 'Assigned Bus', 'PIN Status', 'Actions'].map((h) => (
                      <th key={h} className={tableHeaderClass}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredDrivers.map((driver) => {
                    const assignedBus = getAssignedBus(driver.id);
                    return (
                      <tr key={driver.id} className="group border-b border-rule last:border-0 bg-surface hover:bg-canvas/60 transition-colors duration-100">
                        <td className="px-5 py-3 text-[14px] font-medium text-ink">{driver.name}</td>
                        <td className="px-5 py-3 board-figure text-[13px] text-sub">{driver.phone ?? '--'}</td>
                        <td className="px-5 py-3">
                          {assignedBus ? (
                            <span className="board-figure text-[13px] text-ink">{assignedBus.plate_number}</span>
                          ) : (
                            <span className="italic text-sub text-sm">Unassigned</span>
                          )}
                        </td>
                        <td className="px-5 py-3"><PinStatusBadge hasPin={driver.driver_pins !== null} /></td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-4">
                            <button
                              type="button"
                              onClick={() => setSetPinTarget({ id: driver.id, name: driver.name })}
                              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-sub hover:text-ink transition-colors duration-100"
                            >
                              <KeyRound size={13} strokeWidth={2} />
                              {driver.driver_pins !== null ? 'Change PIN' : 'Set PIN'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setReassignTarget({ id: driver.id, name: driver.name })}
                              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-sub hover:text-ink transition-colors duration-100"
                            >
                              <Bus size={13} strokeWidth={2} />
                              Reassign
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </div>
      )}

      {showAddDriverModal && <AddDriverModal onClose={() => setShowAddDriverModal(false)} onSuccess={() => { setShowAddDriverModal(false); router.refresh(); }} />}
      {setPinTarget && <SetPinModal driverId={setPinTarget.id} driverName={setPinTarget.name} onClose={() => setSetPinTarget(null)} onSuccess={() => { setSetPinTarget(null); router.refresh(); }} />}
      {reassignTarget && <ReassignModal driverId={reassignTarget.id} driverName={reassignTarget.name} buses={buses} currentBusId={getAssignedBus(reassignTarget.id)?.id ?? null} onClose={() => setReassignTarget(null)} onSuccess={() => { setReassignTarget(null); router.refresh(); }} />}
    </div>
  );
}
