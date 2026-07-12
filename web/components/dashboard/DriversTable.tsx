'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { UserCheck, KeyRound, Bus, Pencil, PowerOff } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { createClient } from '@/lib/supabase';

export type DriverRow = {
  id: string;
  name: string;
  phone: string;
  assigned_bus_id: string | null;
  created_at: string;
  has_pin: boolean;
  photo_url: string | null;
  is_active: boolean;
};

type BusOption = {
  id: string;
  plate_number: string;
};

function PinBadge({ hasPin, driverId }: { hasPin: boolean; driverId: string }) {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSetPin() {
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      setError('PIN must be exactly 4 digits');
      return;
    }
    if (pin !== confirm) {
      setError('PINs do not match');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/set-driver-pin`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({ driverId, pin }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? 'Failed to set PIN');
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (!v) { setPin(''); setConfirm(''); setError(null); }
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className={`inline-flex items-center gap-1.5 rounded-[var(--radius-chip)] px-2.5 py-1 text-[11px] font-semibold transition-colors duration-100 ${
            hasPin
              ? 'bg-green-bg text-green hover:bg-green-bg/70'
              : 'bg-amber-light text-amber-dark hover:bg-amber-light/70'
          }`}
        >
          <KeyRound size={10} strokeWidth={2.5} />
          {hasPin ? 'PIN set' : 'Set PIN'}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-navy/40 backdrop-blur-[2px]" />
        <Dialog.Content
          aria-describedby="pin-desc"
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-float)] p-6 outline-none"
        >
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-navy-light">
            <KeyRound size={20} strokeWidth={1.75} className="text-navy" />
          </div>
          <Dialog.Title className="mb-1 text-center text-[16px] font-semibold text-ink">
            {hasPin ? 'Reset driver PIN' : 'Set driver PIN'}
          </Dialog.Title>
          <p id="pin-desc" className="mb-5 text-center text-[12px] text-sub">
            The driver uses this 4-digit PIN to log in on the kiosk phone.
          </p>

          <div className="flex flex-col gap-3">
            <div>
              <label className="block text-[12px] font-medium text-ink mb-1">New PIN</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="••••"
                className="w-full rounded-[var(--radius-btn)] border border-rule px-3 py-2.5 text-center text-[20px] tracking-[0.5em] font-mono text-ink placeholder:text-sub/50 focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-ink mb-1">Confirm PIN</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="••••"
                className="w-full rounded-[var(--radius-btn)] border border-rule px-3 py-2.5 text-center text-[20px] tracking-[0.5em] font-mono text-ink placeholder:text-sub/50 focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber"
              />
            </div>
          </div>

          {error && (
            <p className="mt-3 rounded-[var(--radius-btn)] bg-red-bg px-3 py-2 text-center text-[12px] text-red">
              {error}
            </p>
          )}

          <div className="mt-5 flex gap-3">
            <Dialog.Close asChild>
              <button
                type="button"
                disabled={isLoading}
                className="flex-1 rounded-[var(--radius-btn)] border border-rule py-2.5 text-[13px] font-medium text-ink hover:bg-canvas transition-all duration-150 disabled:opacity-50"
              >
                Cancel
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={handleSetPin}
              disabled={isLoading || pin.length !== 4 || confirm.length !== 4}
              className="flex-1 rounded-[var(--radius-btn)] bg-navy py-2.5 text-[13px] font-semibold text-white hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-150"
            >
              {isLoading ? 'Saving…' : 'Save PIN'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function BusAssign({
  driverId,
  currentBusId,
  buses,
}: {
  driverId: string;
  currentBusId: string | null;
  buses: BusOption[];
}) {
  const [value, setValue] = useState(currentBusId ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const router = useRouter();

  async function handleChange(newBusId: string) {
    setValue(newBusId);
    setIsSaving(true);
    try {
      const supabase = createClient();
      // buses.driver_id is the source of truth (profiles.assigned_bus_id mirrors
      // it via a DB trigger) — clear any bus this driver currently holds, then
      // assign the new one, matching the pattern used on the Users page.
      await supabase.from('buses').update({ driver_id: null }).eq('driver_id', driverId);
      if (newBusId) {
        await supabase.from('buses').update({ driver_id: driverId }).eq('id', newBusId);
      }
      router.refresh();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <Bus size={13} strokeWidth={1.75} className="text-sub shrink-0" />
      <select
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        disabled={isSaving}
        className="rounded-[var(--radius-btn)] border border-rule bg-surface px-2 py-1 text-[12px] text-ink focus:border-amber focus:outline-none disabled:opacity-50 max-w-[140px]"
      >
        <option value="">No bus</option>
        {buses.map((b) => (
          <option key={b.id} value={b.id}>{b.plate_number}</option>
        ))}
      </select>
    </div>
  );
}

function RetireDriverButton({ driverId, name }: { driverId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [isRetiring, setIsRetiring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleRetire() {
    setIsRetiring(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ is_active: false })
        .eq('id', driverId);
      if (updateError) { setError(updateError.message); return; }
      setOpen(false);
      router.refresh();
    } finally {
      setIsRetiring(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { setOpen(v); if (!v) setError(null); }}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-sub hover:text-red transition-colors duration-100"
        >
          <PowerOff size={13} strokeWidth={2} />
          Retire
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-navy/40 backdrop-blur-[2px]" />
        <Dialog.Content
          aria-describedby="retire-driver-desc"
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-float)] p-6 outline-none"
        >
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-red-bg">
            <PowerOff size={20} strokeWidth={1.75} className="text-red" />
          </div>
          <Dialog.Title className="mb-1.5 text-center text-[17px] font-semibold text-ink">
            Retire {name}?
          </Dialog.Title>
          <p id="retire-driver-desc" className="mb-6 text-center text-[13px] leading-relaxed text-sub">
            This driver will be hidden from the active list. Their history, trips, and attendance records are kept. You can find them under &quot;Show retired drivers&quot;.
          </p>
          {error && (
            <p className="mb-4 rounded-[var(--radius-btn)] bg-red-bg px-3 py-2.5 text-center text-[12px] text-red">{error}</p>
          )}
          <div className="flex gap-3">
            <Dialog.Close asChild>
              <button
                type="button"
                disabled={isRetiring}
                className="flex-1 rounded-[var(--radius-btn)] border border-rule py-2.5 text-[13px] font-medium text-ink hover:bg-canvas transition-all duration-150 disabled:opacity-50"
              >
                Cancel
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={handleRetire}
              disabled={isRetiring}
              className="flex-1 rounded-[var(--radius-btn)] bg-red py-2.5 text-[13px] font-semibold text-white hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 transition-all duration-150"
            >
              {isRetiring ? 'Retiring…' : 'Retire Driver'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function DriversTable({
  drivers,
  buses,
}: {
  drivers: DriverRow[];
  buses: BusOption[];
}) {
  if (drivers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[var(--radius-card)] bg-surface py-24 shadow-[var(--shadow-card)]">
        <UserCheck size={40} strokeWidth={1} className="text-sub" />
        <p className="mt-4 text-base font-semibold text-ink">No drivers yet</p>
        <p className="mt-1 text-sm text-sub">Add your first driver to get started</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] shadow-[var(--shadow-card)]">
      <table className="w-full border-collapse bg-surface">
        <thead>
          <tr className="border-b border-rule">
            <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-sub">Driver</th>
            <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-sub">Phone</th>
            <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-sub">Assigned Bus</th>
            <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-sub">PIN</th>
            <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-sub">Added</th>
            <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-sub">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-rule">
          {drivers.map((driver) => (
            <tr key={driver.id} className={`hover:bg-canvas transition-colors duration-100 ${!driver.is_active ? 'opacity-50' : ''}`}>
              <td className="px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-light overflow-hidden">
                    {driver.photo_url ? (
                      <img src={driver.photo_url} alt={driver.name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-[11px] font-semibold text-navy">
                        {driver.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}
                      </span>
                    )}
                  </div>
                  <span className="text-[13px] font-medium text-ink">{driver.name}</span>
                </div>
              </td>
              <td className="px-5 py-4">
                <span className="font-mono text-[13px] text-ink">{driver.phone}</span>
              </td>
              <td className="px-5 py-4">
                <BusAssign
                  driverId={driver.id}
                  currentBusId={driver.assigned_bus_id}
                  buses={buses}
                />
              </td>
              <td className="px-5 py-4">
                <PinBadge hasPin={driver.has_pin} driverId={driver.id} />
              </td>
              <td className="px-5 py-4">
                <span className="text-[12px] text-sub">
                  {new Date(driver.created_at).toLocaleDateString('en-GB', {
                    day: 'numeric', month: 'short', year: 'numeric',
                  })}
                </span>
              </td>
              <td className="px-5 py-4">
                <div className="flex items-center gap-4">
                  <Link
                    href={`/dashboard/drivers/${driver.id}/edit`}
                    className="inline-flex items-center gap-1.5 text-[12px] font-medium text-sub hover:text-ink transition-colors duration-100"
                  >
                    <Pencil size={13} strokeWidth={2} />
                    Edit
                  </Link>
                  {driver.is_active ? (
                    <RetireDriverButton driverId={driver.id} name={driver.name} />
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-chip)] bg-canvas px-2 py-0.5 text-[11px] font-medium text-sub">
                      Retired
                    </span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
