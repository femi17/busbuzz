import Link from 'next/link';
import { School, MoreHorizontal } from 'lucide-react';
import { createClient } from '@/lib/supabase-server';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { Pagination } from '@/components/dashboard/Pagination';

const PAGE_SIZE = 25;

type SchoolRow = {
  id: string;
  name: string;
  address: string;
  logo_url: string | null;
  is_active: boolean;
  created_at: string;
};

type AdminRow = {
  id: string;
  name: string;
  school_id: string;
};

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span className={`inline-flex rounded-[var(--radius-chip)] px-2.5 py-1 text-xs font-semibold ${
      isActive ? 'bg-green-bg text-green' : 'bg-canvas text-sub'
    }`}>
      {isActive ? 'Active' : 'Inactive'}
    </span>
  );
}

export default async function SchoolsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { created, page: pageParam } = await searchParams;
  const supabase = await createClient();

  const page = Math.max(1, parseInt(typeof pageParam === 'string' ? pageParam : '1', 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // Server-side pagination: only PAGE_SIZE rows leave the DB per view, with
  // the exact total riding along on the same query.
  const { data: schools, count } = await supabase
    .from('schools')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  const schoolRows = (schools ?? []) as unknown as SchoolRow[];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Only the admins of the schools on this page — not every admin in the DB.
  const pageSchoolIds = schoolRows.map((s) => s.id);
  const { data: admins } = pageSchoolIds.length
    ? await supabase
        .from('profiles')
        .select('id, name, school_id')
        .eq('role', 'SCHOOL_ADMIN')
        .in('school_id', pageSchoolIds)
    : { data: [] };

  const adminRows = (admins ?? []) as unknown as AdminRow[];

  const adminMap = new Map<string, { id: string; name: string }>();
  for (const admin of adminRows) {
    if (admin.school_id && !adminMap.has(admin.school_id)) {
      adminMap.set(admin.school_id, { id: admin.id, name: admin.name });
    }
  }

  return (
    <div className="max-w-[1200px] mx-auto">
      {created === '1' && (
        <div className="mb-4 rounded-[var(--radius-btn)] bg-green-bg border border-green/20 text-green text-sm px-4 py-3">
          School onboarded successfully.
        </div>
      )}

      <DashboardHeader
        title="Schools"
        subtitle="Onboarded schools"
        actions={
          <Link
            href="/dashboard/schools/new"
            className="bg-amber text-navy rounded-[var(--radius-btn)] px-4 py-2.5 text-sm font-semibold hover:brightness-110 active:scale-95 transition-all duration-150"
          >
            + Onboard School
          </Link>
        }
      />

      {/* Count row */}
      <div className="mb-4">
        <p className="text-sm font-medium text-sub">
          {total} {total === 1 ? 'school' : 'schools'}
          {totalPages > 1 ? ` · page ${page} of ${totalPages}` : ''}
        </p>
      </div>

      {/* Table card */}
      <div className="bg-surface shadow-[var(--shadow-card)] rounded-[var(--radius-card)] overflow-hidden">
        {schoolRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <School size={40} strokeWidth={1} className="text-sub" />
            <p className="font-semibold text-base text-ink mt-4">No schools yet</p>
            <p className="text-sm text-sub mt-1">Onboard your first school to get started</p>
            <Link
              href="/dashboard/schools/new"
              className="mt-6 bg-amber text-navy rounded-[var(--radius-btn)] px-4 py-2.5 text-sm font-semibold hover:brightness-110 active:scale-95 transition-all duration-150"
            >
              + Onboard School
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="bg-canvas border-b border-rule">
                <th className="px-5 py-3 text-[11px] font-semibold text-sub uppercase tracking-widest">School Name</th>
                <th className="px-5 py-3 text-[11px] font-semibold text-sub uppercase tracking-widest">Address</th>
                <th className="px-5 py-3 text-[11px] font-semibold text-sub uppercase tracking-widest">Status</th>
                <th className="px-5 py-3 text-[11px] font-semibold text-sub uppercase tracking-widest">Admin</th>
                <th className="px-5 py-3 text-[11px] font-semibold text-sub uppercase tracking-widest">Created</th>
                <th className="px-5 py-3 text-[11px] font-semibold text-sub uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody>
              {schoolRows.map((school) => {
                const admin = adminMap.get(school.id) ?? null;
                return (
                  <tr key={school.id} className="group border-b border-rule last:border-0 bg-surface hover:bg-canvas/60 transition-colors duration-100">
                    <td className="px-5 py-3 text-[14px] text-ink font-medium">{school.name}</td>
                    <td className="px-5 py-3 text-[14px] text-ink">{school.address}</td>
                    <td className="px-5 py-3"><StatusBadge isActive={school.is_active} /></td>
                    <td className="px-5 py-3 text-[14px] text-ink">
                      {admin ? admin.name : <span className="italic text-sub/60">No admin</span>}
                    </td>
                    <td className="board-figure px-5 py-3 text-[13px] text-sub">
                      {new Date(school.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-100">
                        <button type="button" className="text-sub hover:text-ink transition-colors duration-100" aria-label="More options">
                          <MoreHorizontal size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <Pagination page={page} totalPages={totalPages} query="" basePath="/dashboard/schools" />
    </div>
  );
}
