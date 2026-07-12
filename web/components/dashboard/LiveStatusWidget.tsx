'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';

export function LiveStatusWidget() {
  const [activeCount, setActiveCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchCount() {
      const supabase = createClient();
      const { count } = await supabase
        .from('trips')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'ACTIVE');
      if (!cancelled) setActiveCount(count ?? 0);
    }
    fetchCount();
    const interval = setInterval(fetchCount, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const isLive = (activeCount ?? 0) > 0;

  return (
    <div className="rounded-[var(--radius-btn)] bg-black/30 border border-white/[0.08] px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span
          className={`w-[6px] h-[6px] rounded-full shrink-0 ${
            isLive ? 'bg-amber animate-pulse-dot' : 'bg-white/25'
          }`}
          aria-hidden
        />
        <span
          className={`font-mono text-[10px] font-semibold uppercase tracking-[0.16em] ${
            isLive ? 'text-amber' : 'text-white/35'
          }`}
        >
          Live
        </span>
      </div>
      {activeCount === null ? (
        <p className="text-[12px] text-white/40 mt-1">Loading…</p>
      ) : activeCount === 0 ? (
        <p className="text-[12px] text-white/40 mt-1">No trips running</p>
      ) : (
        <p className="board-figure text-[13px] text-white mt-1">
          {activeCount} {activeCount === 1 ? 'bus' : 'buses'} on route
        </p>
      )}
    </div>
  );
}
