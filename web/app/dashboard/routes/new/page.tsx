'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';

type BusOption = {
  id: string;
  plate_number: string;
};

const inputClass =
  'w-full rounded-[var(--radius-btn)] border border-rule px-3 py-2.5 text-sm text-ink placeholder:text-sub focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber';
const labelClass = 'block text-sm font-medium text-ink mb-1.5';

export default function NewRoutePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [busId, setBusId] = useState('');
  const [buses, setBuses] = useState<BusOption[]>([]);
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    createClient()
      .from('buses')
      .select('id, plate_number')
      .eq('status', 'ACTIVE')
      .order('plate_number')
      .then(({ data }) => setBuses((data ?? []) as BusOption[]));
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setNameError(null);
    setFormError(null);

    if (!name.trim()) {
      setNameError('Route name is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/manage-route`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({
            name: name.trim(),
            type: 'BOTH',
            busId: busId || undefined,
            stops: [],
          }),
        },
      );

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        setFormError(errorBody?.error ?? 'Failed to create route');
        return;
      }

      router.push('/dashboard/routes?created=1');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="max-w-[480px] mx-auto">
      <div className="mb-6">
        <h1 className="font-heading font-bold text-[28px] tracking-tight text-ink">Add New Route</h1>
        <p className="text-sm text-sub mt-1">Name the route and assign a bus</p>
      </div>

      <div className="bg-surface shadow-[var(--shadow-card)] rounded-[var(--radius-card)] p-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {formError && (
            <div className="rounded-[var(--radius-btn)] bg-red-bg border border-red/30 text-red text-sm px-4 py-3">
              {formError}
            </div>
          )}

          <div>
            <label className={labelClass}>Route Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Lekki Phase 1 Route"
              className={inputClass}
              autoFocus
            />
            {nameError && <p className="text-xs text-red mt-1">{nameError}</p>}
          </div>

          <div>
            <label className={labelClass}>Bus</label>
            <select
              value={busId}
              onChange={(e) => setBusId(e.target.value)}
              className={inputClass}
            >
              <option value="">No bus assigned</option>
              {buses.map((bus) => (
                <option key={bus.id} value={bus.id}>
                  {bus.plate_number}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <Link
              href="/dashboard/routes"
              className="rounded-[var(--radius-btn)] border border-rule px-4 py-2.5 text-sm font-medium text-sub hover:bg-canvas transition-colors duration-150 active:scale-95"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-[var(--radius-btn)] bg-amber px-4 py-2.5 text-sm font-semibold text-navy hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 active:scale-95 transition-all duration-150"
            >
              {isSubmitting ? 'Creating…' : 'Create Route'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
