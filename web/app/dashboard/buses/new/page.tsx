'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
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

const inputClass = 'w-full rounded-[var(--radius-btn)] border border-rule px-3 py-2.5 text-sm text-ink placeholder:text-sub focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber';
const labelClass = 'block text-sm font-medium text-ink mb-1.5';

export default function NewBusPage() {
  const router = useRouter();
  const [plateNumber, setPlateNumber] = useState('');
  const [capacity, setCapacity] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

    setIsSubmitting(true);
    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/manage-bus`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}`, apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
          body: JSON.stringify({ plateNumber: parseResult.data.plateNumber, capacity: parseResult.data.capacity, deviceId: parseResult.data.deviceId || undefined }),
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
          setFormError(errorBody?.error ?? 'Failed to create bus');
        }
        return;
      }

      router.push('/dashboard/buses?created=1');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="max-w-[1200px] mx-auto">
      <div className="mb-6">
        <h1 className="font-heading font-bold text-[28px] tracking-tight text-ink">Add New Bus</h1>
        <p className="text-sm text-sub mt-1">Register a new bus in your fleet</p>
      </div>

      <div className="mx-auto max-w-lg bg-surface shadow-[var(--shadow-card)] rounded-[var(--radius-card)] p-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {formError && (
            <div className="rounded-[var(--radius-btn)] bg-red-bg border border-red/30 text-red text-sm px-4 py-3">
              {formError}
            </div>
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
            <p className="text-xs text-sub mt-1">The Android ID of the BusBuzz tracking phone. You can add this later.</p>
            {errors.deviceId && <p className="text-xs text-red mt-1">{errors.deviceId}</p>}
          </div>

          <div className="flex justify-end gap-3 mt-2">
            <Link href="/dashboard/buses" className="rounded-[var(--radius-btn)] border border-rule px-4 py-2.5 text-sm font-medium text-sub hover:bg-canvas transition-colors duration-150 active:scale-95">
              Cancel
            </Link>
            <button type="submit" disabled={isSubmitting} className="rounded-[var(--radius-btn)] bg-amber px-4 py-2.5 text-sm font-semibold text-navy hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 active:scale-95 transition-all duration-150">
              {isSubmitting ? 'Adding...' : 'Add Bus'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
