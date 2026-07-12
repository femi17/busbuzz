'use client';

import { useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

// Debounced search that drives the URL (?q=), so filtering happens server-side
// across the whole roster rather than only the rows on the current page.
export function StudentsSearch({ initialQuery }: { initialQuery: string }) {
  const [value, setValue] = useState(initialQuery);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function update(next: string) {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      const trimmed = next.trim();
      if (trimmed) params.set('q', trimmed);
      else params.delete('q');
      params.delete('page'); // any new search returns to the first page
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    }, 350);
  }

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => update(e.target.value)}
      placeholder="Search by name…"
      className="w-full max-w-sm rounded-[var(--radius-btn)] border border-rule px-3 py-2.5 text-sm text-ink placeholder:text-sub focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber"
    />
  );
}
