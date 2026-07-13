'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Send } from 'lucide-react';
import { createClient } from '@/lib/supabase';

function firstDayOfMonth(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// Super-admin-only: computes (and emails) a school's on-time award for a term.
// Schools no longer see or trigger this — it lives here on the analytics page.
export function ComputeAwardPanel({ schoolId }: { schoolId: string }) {
  const router = useRouter();
  const [label, setLabel] = useState('');
  const [startDate, setStartDate] = useState(firstDayOfMonth());
  const [endDate, setEndDate] = useState(today());
  const [isComputing, setIsComputing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleCompute() {
    setError(null);
    setMessage(null);
    if (!label.trim()) {
      setError('Give the term a name, e.g. “First Term 2025/26”.');
      return;
    }
    if (!startDate || !endDate || startDate > endDate) {
      setError('Pick a valid date range.');
      return;
    }
    setIsComputing(true);
    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/compute-ontime-award`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({
            schoolId,
            startDate,
            endDate,
            label: label.trim(),
          }),
        },
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? 'Failed to compute award');
        return;
      }
      setMessage(body?.message ?? 'Award computed and emailed to the school.');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to compute award');
    } finally {
      setIsComputing(false);
    }
  }

  const inputClass =
    'rounded-[var(--radius-btn)] border border-rule bg-surface px-3 py-2 text-sm text-ink placeholder:text-sub focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber';

  return (
    <div className="mt-4 rounded-[12px] border border-rule bg-canvas/40 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-sub">
        Recompute award
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-3">
        <div className="min-w-[180px] flex-1">
          <label className="mb-1 block text-[11px] font-medium text-sub">Term name</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="First Term 2025/26"
            className={`w-full ${inputClass}`}
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-sub">From</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-sub">To</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
        </div>
        <button
          type="button"
          onClick={handleCompute}
          disabled={isComputing}
          className="inline-flex items-center gap-2 rounded-[var(--radius-btn)] bg-amber px-4 py-2 text-sm font-semibold text-navy hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 active:scale-95 transition-all duration-150"
        >
          <Send size={14} />
          {isComputing ? 'Computing…' : 'Compute & email'}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red">{error}</p>}
      {message && <p className="mt-2 text-xs text-green">{message}</p>}
    </div>
  );
}
