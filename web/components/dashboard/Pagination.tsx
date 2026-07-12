import Link from 'next/link';

// Server-rendered pager. Preserves the active search query and omits `page=1`
// so the first page has a clean URL.
export function Pagination({
  page,
  totalPages,
  query,
  basePath,
}: {
  page: number;
  totalPages: number;
  query: string;
  basePath: string;
}) {
  if (totalPages <= 1) return null;

  const href = (p: number) => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (p > 1) params.set('page', String(p));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const linkClass =
    'rounded-[var(--radius-btn)] border border-rule px-3.5 py-2 text-sm font-medium text-ink hover:bg-canvas transition-colors duration-150';
  const disabledClass =
    'rounded-[var(--radius-btn)] border border-rule px-3.5 py-2 text-sm font-medium text-sub/50 cursor-not-allowed';

  return (
    <div className="flex items-center justify-between mt-4">
      {page > 1 ? (
        <Link href={href(page - 1)} className={linkClass}>
          ← Previous
        </Link>
      ) : (
        <span className={disabledClass}>← Previous</span>
      )}

      <span className="text-sm text-sub">
        Page {page} of {totalPages}
      </span>

      {page < totalPages ? (
        <Link href={href(page + 1)} className={linkClass}>
          Next →
        </Link>
      ) : (
        <span className={disabledClass}>Next →</span>
      )}
    </div>
  );
}
