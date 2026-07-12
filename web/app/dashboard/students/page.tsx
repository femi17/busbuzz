import Link from 'next/link';
import { createClient } from '@/lib/supabase-server';
import { StudentTable, type StudentRow } from '@/components/dashboard/StudentTable';
import { StudentsSearch } from '@/components/dashboard/StudentsSearch';
import { Pagination } from '@/components/dashboard/Pagination';
import { GraduationCap, Map } from 'lucide-react';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';

const PAGE_SIZE = 25;

type StudentQueryRow = {
  id: string;
  name: string;
  class_name: string;
  trip_type: string;
  is_active: boolean;
  photo_url: string | null;
  route: { name: string } | { name: string }[] | null;
  student_parents: { count: number }[];
};

function getRoute(route: StudentQueryRow['route']): { name: string } | null {
  if (!route) return null;
  return Array.isArray(route) ? route[0] ?? null : route;
}

function getParentCount(studentParents: StudentQueryRow['student_parents']): number {
  return Array.isArray(studentParents) ? studentParents[0]?.count ?? 0 : 0;
}

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const created = params.created;
  const imported = params.imported;
  const q = typeof params.q === 'string' ? params.q.trim() : '';
  const page = Math.max(
    1,
    parseInt(typeof params.page === 'string' ? params.page : '1', 10) || 1,
  );
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();

  // Server-side pagination + search: only PAGE_SIZE rows leave the DB per view,
  // and the count comes back with the same query so the total is exact.
  let query = supabase
    .from('students')
    .select('*, route:routes(name), student_parents(count)', { count: 'exact' })
    .order('name')
    .range(from, to);
  if (q) query = query.ilike('name', `%${q}%`);

  const { data: students, count } = await query;
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const studentRows = (students ?? []) as unknown as StudentQueryRow[];
  const mappedRows: StudentRow[] = studentRows.map((row) => {
    const route = getRoute(row.route);
    return {
      id: row.id,
      name: row.name,
      className: row.class_name,
      routeName: route?.name ?? null,
      tripType: row.trip_type ?? 'BOTH',
      parentCount: getParentCount(row.student_parents),
      isActive: row.is_active,
      photoUrl: row.photo_url ?? null,
    };
  });

  const hasStudents = total > 0;

  return (
    <div className="max-w-[1200px] mx-auto">
      {created === '1' && (
        <div className="mb-4 rounded-[var(--radius-btn)] bg-green-bg border border-green/20 text-green text-sm px-4 py-3">
          Student added successfully.
        </div>
      )}
      {imported === '1' && (
        <div className="mb-4 rounded-[var(--radius-btn)] bg-green-bg border border-green/20 text-green text-sm px-4 py-3">
          Students imported successfully.
        </div>
      )}

      <DashboardHeader
        title="Students"
        subtitle="Enrolled students and route assignments"
        actions={
          <>
            <Link
              href="/dashboard/students/map"
              className="flex items-center gap-1.5 border border-rule text-ink rounded-[var(--radius-btn)] px-4 py-2.5 text-sm font-medium hover:bg-canvas transition-colors duration-150 active:scale-95"
            >
              <Map size={14} />
              Map Students
            </Link>
            <Link
              href="/dashboard/students/import"
              className="border border-rule text-ink rounded-[var(--radius-btn)] px-4 py-2.5 text-sm font-medium hover:bg-canvas transition-colors duration-150 active:scale-95"
            >
              Bulk Import
            </Link>
            <Link
              href="/dashboard/students/new"
              className="bg-amber text-navy rounded-[var(--radius-btn)] px-4 py-2.5 text-sm font-semibold hover:brightness-110 active:scale-95 transition-all duration-150"
            >
              + Add Student
            </Link>
          </>
        }
      />

      {/* Count row */}
      <div className="mb-4">
        <p className="text-sm font-medium text-sub">
          {total} {total === 1 ? 'student' : 'students'}
          {q ? <span className="text-sub"> matching “{q}”</span> : null}
        </p>
      </div>

      {/* Search always available so it works across the whole set, not a page */}
      <div className="mb-4">
        <StudentsSearch initialQuery={q} />
      </div>

      {mappedRows.length === 0 ? (
        <div className="bg-surface shadow-[var(--shadow-card)] rounded-[var(--radius-card)] overflow-hidden">
          <div className="flex flex-col items-center justify-center py-16">
            <GraduationCap size={40} strokeWidth={1} className="text-sub" />
            {q ? (
              <>
                <p className="font-semibold text-base text-ink mt-4">No matches</p>
                <p className="text-sm text-sub mt-1">No students match “{q}”.</p>
              </>
            ) : (
              <>
                <p className="font-semibold text-base text-ink mt-4">No students yet</p>
                <p className="text-sm text-sub mt-1">Add your first student to get started</p>
                <Link
                  href="/dashboard/students/new"
                  className="mt-6 bg-amber text-navy rounded-[var(--radius-btn)] px-4 py-2.5 text-sm font-semibold hover:brightness-110 active:scale-95 transition-all duration-150"
                >
                  + Add Student
                </Link>
              </>
            )}
          </div>
        </div>
      ) : (
        <>
          <StudentTable students={mappedRows} />
          {hasStudents && (
            <Pagination page={page} totalPages={totalPages} query={q} basePath="/dashboard/students" />
          )}
        </>
      )}
    </div>
  );
}
