import Link from 'next/link';
import { createClient } from '@/lib/supabase-server';
import { StudentTable, type StudentRow } from '@/components/dashboard/StudentTable';

type StudentQueryRow = {
  id: string;
  name: string;
  class_name: string;
  is_active: boolean;
  route: { name: string; type: string } | { name: string; type: string }[] | null;
  stop: { name: string } | { name: string }[] | null;
  student_parents: { count: number }[];
};

function getRoute(
  route: StudentQueryRow['route'],
): { name: string; type: string } | null {
  if (!route) return null;
  return Array.isArray(route) ? route[0] ?? null : route;
}

function getStop(stop: StudentQueryRow['stop']): { name: string } | null {
  if (!stop) return null;
  return Array.isArray(stop) ? stop[0] ?? null : stop;
}

function getParentCount(
  studentParents: StudentQueryRow['student_parents'],
): number {
  return Array.isArray(studentParents) ? studentParents[0]?.count ?? 0 : 0;
}

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { created, imported } = await searchParams;
  const supabase = await createClient();

  const { data: students } = await supabase
    .from('students')
    .select(
      '*, route:routes(name, type), stop:stops(name), student_parents(count)',
    )
    .order('name');

  const studentRows = (students ?? []) as unknown as StudentQueryRow[];

  const mappedRows: StudentRow[] = studentRows.map((row) => {
    const route = getRoute(row.route);
    const stop = getStop(row.stop);
    return {
      id: row.id,
      name: row.name,
      className: row.class_name,
      routeName: route?.name ?? null,
      routeType: route?.type ?? null,
      stopName: stop?.name ?? null,
      parentCount: getParentCount(row.student_parents),
      isActive: row.is_active,
    };
  });

  return (
    <div className="flex flex-col gap-4">
      {created === '1' && (
        <div className="rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3">
          Student added successfully.
        </div>
      )}
      {imported === '1' && (
        <div className="rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3">
          Students imported successfully.
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-navy/60">
          {mappedRows.length} {mappedRows.length === 1 ? 'student' : 'students'}
        </p>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/students/import"
            className="rounded-lg border border-navy/20 px-4 py-2.5 text-sm font-semibold text-navy"
          >
            Bulk Import
          </Link>
          <Link
            href="/dashboard/students/new"
            className="rounded-lg bg-amber px-4 py-2.5 text-sm font-semibold text-navy"
          >
            + Add Student
          </Link>
        </div>
      </div>

      {mappedRows.length === 0 ? (
        <div className="rounded-xl border border-navy/10 bg-white shadow-sm">
          <div className="flex flex-col items-center gap-3 px-5 py-16 text-center">
            <p className="text-sm text-navy/50">
              No students added yet. Add your first student to get started.
            </p>
            <Link
              href="/dashboard/students/new"
              className="rounded-lg bg-amber px-4 py-2.5 text-sm font-semibold text-navy"
            >
              + Add Student
            </Link>
          </div>
        </div>
      ) : (
        <StudentTable students={mappedRows} />
      )}
    </div>
  );
}
