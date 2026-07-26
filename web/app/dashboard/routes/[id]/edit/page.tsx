'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';

type BusOption = {
  id: string;
  plate_number: string;
};

type RouteRow = {
  id: string;
  name: string;
  type: 'MORNING' | 'AFTERNOON' | 'BOTH';
  bus_id: string | null;
};

const inputClass =
  'w-full rounded-[var(--radius-btn)] border border-rule px-3 py-2.5 text-sm text-ink placeholder:text-sub focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber';
const labelClass = 'block text-sm font-medium text-ink mb-1.5';

export default function EditRoutePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const routeId = params.id;

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [original, setOriginal] = useState<{ name: string; type: string; busId: string } | null>(null);

  const [name, setName] = useState('');
  const [type, setType] = useState<'MORNING' | 'AFTERNOON' | 'BOTH'>('BOTH');
  const [busId, setBusId] = useState('');
  const [buses, setBuses] = useState<BusOption[]>([]);
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      const supabase = createClient();
      const [{ data: route, error }, { data: busData }] = await Promise.all([
        supabase.from('routes').select('id, name, type, bus_id').eq('id', routeId).single(),
        supabase.from('buses').select('id, plate_number').eq('status', 'ACTIVE').order('plate_number'),
      ]);
      if (!isMounted) return;
      if (error || !route) {
        setLoadError('Route not found.');
        setIsLoading(false);
        return;
      }
      const r = route as RouteRow;
      const initial = { name: r.name, type: r.type, busId: r.bus_id ?? '' };
      setOriginal(initial);
      setName(initial.name);
      setType(initial.type as 'MORNING' | 'AFTERNOON' | 'BOTH');
      setBusId(initial.busId);
      setBuses((busData ?? []) as BusOption[]);
      setIsLoading(false);
    }
    load();
    return () => { isMounted = false; };
  }, [routeId]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setNameError(null);
    setFormError(null);

    if (!name.trim()) {
      setNameError('Route name is required');
      return;
    }

    const changed: Record<string, unknown> = { id: routeId };
    if (original) {
      if (name.trim() !== original.name) changed.name = name.trim();
      if (type !== original.type) changed.type = type;
      if (busId !== original.busId) changed.busId = busId || null;
    }
    if (Object.keys(changed).length === 1) { router.push('/dashboard/routes'); return; }

    setIsSubmitting(true);
    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/manage-route`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify(changed),
        },
      );

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        setFormError(errorBody?.error ?? 'Failed to update route');
        return;
      }

      router.push('/dashboard/routes');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-[480px] mx-auto">
        <div className="mb-6"><h1 className="font-heading font-bold text-[28px] tracking-tight text-ink">Edit Route</h1></div>
        <div className="bg-surface shadow-[var(--shadow-card)] rounded-[var(--radius-card)] p-6">
          <p className="text-sm text-sub">Loading route details...</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-[480px] mx-auto">
        <div className="mb-6"><h1 className="font-heading font-bold text-[28px] tracking-tight text-ink">Edit Route</h1></div>
        <div className="bg-surface shadow-[var(--shadow-card)] rounded-[var(--radius-card)] p-6">
          <p className="text-sm text-red">{loadError}</p>
          <Link href="/dashboard/routes" className="mt-3 inline-block text-sm font-medium text-sub hover:text-ink">Back to Routes</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[480px] mx-auto">
      <div className="mb-6">
        <h1 className="font-heading font-bold text-[28px] tracking-tight text-ink">Edit Route</h1>
        <p className="text-sm text-sub mt-1">Update route name, run, and bus assignment</p>
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
            <label className={labelClass}>Run</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as 'MORNING' | 'AFTERNOON' | 'BOTH')}
              className={inputClass}
            >
              <option value="BOTH">Morning &amp; Afternoon</option>
              <option value="MORNING">Morning only</option>
              <option value="AFTERNOON">Afternoon only</option>
            </select>
            <p className="text-[11px] text-sub mt-1">
              Morning &amp; Afternoon is one route that runs both legs, driven by a single saved
              stop order (the afternoon leg reverses it automatically). Pick Morning only or
              Afternoon only for a route dedicated to a single leg.
            </p>
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
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
