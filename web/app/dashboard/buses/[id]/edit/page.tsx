'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { z } from 'zod';
import { createClient } from '@/lib/supabase';

const busFormSchema = z.object({
  plateNumber: z.string().min(1, 'Plate number is required').max(20, 'Plate number too long'),
  capacity: z.coerce
    .number()
    .int('Must be a whole number')
    .min(1, 'Minimum capacity is 1')
    .max(100, 'Maximum capacity is 100'),
  deviceId: z.string().min(1).max(100).optional().or(z.literal('')),
});

type FormErrors = Partial<Record<'plateNumber' | 'capacity' | 'deviceId', string>>;

type BusRow = {
  id: string;
  plate_number: string;
  capacity: number;
  device_id: string | null;
};

const inputClass = 'w-full rounded-[var(--radius-btn)] border border-rule px-3 py-2.5 text-sm text-ink placeholder:text-sub focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber';
const labelClass = 'block text-sm font-medium text-ink mb-1.5';

export default function EditBusPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const busId = params.id;

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [original, setOriginal] = useState<{ plateNumber: string; capacity: string; deviceId: string } | null>(null);

  const [plateNumber, setPlateNumber] = useState('');
  const [capacity, setCapacity] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function loadBus() {
      const supabase = createClient();
      const { data, error } = await supabase.from('buses').select('*').eq('id', busId).single();
      if (!isMounted) return;
      if (error || !data) { setLoadError('Bus not found.'); setIsLoading(false); return; }
      const bus = data as BusRow;
      const initial = { plateNumber: bus.plate_number, capacity: String(bus.capacity), deviceId: bus.device_id ?? '' };
      setOriginal(initial);
      setPlateNumber(initial.plateNumber);
      setCapacity(initial.capacity);
      setDeviceId(initial.deviceId);
      setIsLoading(false);
    }
    loadBus();
    return () => { isMounted = false; };
  }, [busId]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setErrors({});
    const parseResult = busFormSchema.safeParse({ plateNumber, capacity, deviceId });
    if (!parseResult.success) {
      const fieldErrors: FormErrors = {};
      for (const issue of parseResult.error.issues) {
        const field = issue.path[0] as keyof FormErrors;
        if (field && !fieldErrors[field]) fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    const changed: Record<string, unknown> = { id: busId };
    if (original) {
      if (parseResult.data.plateNumber !== original.plateNumber) changed.plateNumber = parseResult.data.plateNumber;
      if (String(parseResult.data.capacity) !== original.capacity) changed.capacity = parseResult.data.capacity;
      const newDeviceId = parseResult.data.deviceId || '';
      if (newDeviceId !== original.deviceId) changed.deviceId = newDeviceId === '' ? null : newDeviceId;
    }
    if (Object.keys(changed).length === 1) { router.push('/dashboard/buses'); return; }
    setIsSubmitting(true);
    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/manage-bus`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}`, apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
          body: JSON.stringify(changed),
        },
      );
      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        if (errorBody?.details && Array.isArray(errorBody.details)) {
          const fieldErrors: FormErrors = {};
          for (const issue of errorBody.details) {
            const field = issue.path?.[0] as keyof FormErrors;
            if (field && !fieldErrors[field]) fieldErrors[field] = issue.message;
          }
          setErrors(fieldErrors);
        } else {
          setFormError(errorBody?.error ?? 'Failed to update bus');
        }
        return;
      }
      router.push('/dashboard/buses');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-[1200px] mx-auto">
        <div className="mb-6"><h1 className="font-heading font-bold text-[28px] tracking-tight text-ink">Edit Bus</h1></div>
        <div className="mx-auto max-w-lg bg-surface shadow-[var(--shadow-card)] rounded-[var(--radius-card)] p-6">
          <p className="text-sm text-sub">Loading bus details...</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-[1200px] mx-auto">
        <div className="mb-6"><h1 className="font-heading font-bold text-[28px] tracking-tight text-ink">Edit Bus</h1></div>
        <div className="mx-auto max-w-lg bg-surface shadow-[var(--shadow-card)] rounded-[var(--radius-card)] p-6">
          <p className="text-sm text-red">{loadError}</p>
          <Link href="/dashboard/buses" className="mt-3 inline-block text-sm font-medium text-sub hover:text-ink">Back to Buses</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto">
      <div className="mb-6">
        <h1 className="font-heading font-bold text-[28px] tracking-tight text-ink">Edit Bus</h1>
        <p className="text-sm text-sub mt-1">Update bus information</p>
      </div>

      <div className="mx-auto max-w-lg bg-surface shadow-[var(--shadow-card)] rounded-[var(--radius-card)] p-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {formError && (
            <div className="rounded-[var(--radius-btn)] bg-red-bg border border-red/30 text-red text-sm px-4 py-3">{formError}</div>
          )}

          <div>
            <label className={labelClass}>Plate Number</label>
            <input type="text" value={plateNumber} onChange={(e) => setPlateNumber(e.target.value)} placeholder="e.g., LAG-234-XY" className={inputClass} />
            {errors.plateNumber && <p className="text-xs text-red mt-1">{errors.plateNumber}</p>}
          </div>

          <div>
            <label className={labelClass}>Capacity</label>
            <input type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="e.g., 30" min={1} max={100} className={inputClass} />
            {errors.capacity && <p className="text-xs text-red mt-1">{errors.capacity}</p>}
          </div>

          <div>
            <label className={labelClass}>Device ID</label>
            <input type="text" value={deviceId} onChange={(e) => setDeviceId(e.target.value)} placeholder="e.g., a1b2c3d4e5f6" className={inputClass} />
            <p className="text-xs text-sub mt-1">The Android ID of the BusBuzz tracking phone mounted in this bus.</p>
            {errors.deviceId && <p className="text-xs text-red mt-1">{errors.deviceId}</p>}
          </div>

          <div className="flex justify-end gap-3 mt-2">
            <Link href="/dashboard/buses" className="rounded-[var(--radius-btn)] border border-rule px-4 py-2.5 text-sm font-medium text-sub hover:bg-canvas transition-colors duration-150 active:scale-95">
              Cancel
            </Link>
            <button type="submit" disabled={isSubmitting} className="rounded-[var(--radius-btn)] bg-amber px-4 py-2.5 text-sm font-semibold text-navy hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 active:scale-95 transition-all duration-150">
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
