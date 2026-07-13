'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Search } from 'lucide-react';

// Shared search + vertical-scroll wrapper for the dashboard's data tables.
// The caller owns the row markup; this owns the filter box, the client-side
// text filter, and the capped-height scroll container with a sticky header.
//
// Sticky header: the caller's <thead> row cells must carry a background
// (bg-canvas) so rows don't show through while scrolling — see how the tables
// set `sticky top-0 z-10` on their <thead>.
export function TableShell<T>({
  rows,
  searchText,
  placeholder = 'Search…',
  maxHeightClass = 'max-h-[60vh]',
  countNoun,
  children,
  emptyFiltered,
}: {
  rows: T[];
  // Concatenated searchable text for one row (already lowercased or not —
  // matching is case-insensitive either way).
  searchText: (row: T) => string;
  placeholder?: string;
  maxHeightClass?: string;
  // e.g. "driver" → "3 drivers" / "1 driver" shown beside the search box.
  countNoun?: string;
  children: (filtered: T[]) => ReactNode;
  emptyFiltered?: ReactNode;
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => searchText(row).toLowerCase().includes(q));
  }, [rows, query, searchText]);

  const count = filtered.length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sub"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="w-full rounded-[var(--radius-btn)] border border-rule bg-surface pl-9 pr-3 py-2.5 text-sm text-ink placeholder:text-sub focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber"
          />
        </div>
        {countNoun && (
          <span className="shrink-0 text-[13px] font-medium text-sub">
            {count} {count === 1 ? countNoun : `${countNoun}s`}
          </span>
        )}
      </div>

      <div
        className={`overflow-auto rounded-[var(--radius-card)] shadow-[var(--shadow-card)] ${maxHeightClass}`}
      >
        {count === 0
          ? emptyFiltered ?? (
              <p className="px-5 py-10 text-center text-sm text-sub">
                No matches for “{query}”.
              </p>
            )
          : children(filtered)}
      </div>
    </div>
  );
}
