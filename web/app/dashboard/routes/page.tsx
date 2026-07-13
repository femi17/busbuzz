import Link from 'next/link';
import { Route as RouteIcon } from 'lucide-react';
import { createClient } from '@/lib/supabase-server';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { RoutesTable } from '@/components/dashboard/RoutesTable';

type RouteRow = {
  id: string;
  name: string;
  bus: { plate_number: string } | { plate_number: string }[] | null;
  students: { count: number }[];
};

function getBus(bus: RouteRow['bus']): { plate_number: string } | null {
  if (!bus) return null;
  return Array.isArray(bus) ? bus[0] ?? null : bus;
}

function getStudentCount(students: RouteRow['students']): number {
  return Array.isArray(students) ? students[0]?.count ?? 0 : 0;
}

export default async function RoutesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { created } = await searchParams;
  const supabase = await createClient();

  const { data: routes } = await supabase
    .from('routes')
    .select('*, bus:buses(plate_number), students(count)')
    .order('name');

  const routeRows = (routes ?? []) as unknown as RouteRow[];

  return (
    <div className="max-w-[1200px] mx-auto">
      {created === '1' && (
        <div className="mb-4 rounded-[var(--radius-btn)] bg-green-bg border border-green/20 text-green text-sm px-4 py-3">
          Route added successfully.
        </div>
      )}

      <DashboardHeader
        title="Routes"
        subtitle="Bus routes and student assignments"
        actions={
          <Link
            href="/dashboard/routes/new"
            className="bg-amber text-navy rounded-[var(--radius-btn)] px-4 py-2.5 text-sm font-semibold hover:brightness-110 active:scale-95 transition-all duration-150"
          >
            + Add Route
          </Link>
        }
      />

      {routeRows.length === 0 ? (
        <div className="bg-surface shadow-[var(--shadow-card)] rounded-[var(--radius-card)] overflow-hidden">
          <div className="flex flex-col items-center justify-center py-16">
            <RouteIcon size={40} strokeWidth={1} className="text-sub" />
            <p className="font-semibold text-base text-ink mt-4">No routes yet</p>
            <p className="text-sm text-sub mt-1">Add your first route to get started</p>
            <Link
              href="/dashboard/routes/new"
              className="mt-6 bg-amber text-navy rounded-[var(--radius-btn)] px-4 py-2.5 text-sm font-semibold hover:brightness-110 active:scale-95 transition-all duration-150"
            >
              + Add Route
            </Link>
          </div>
        </div>
      ) : (
        <RoutesTable
          routes={routeRows.map((route) => ({
            id: route.id,
            name: route.name,
            busPlate: getBus(route.bus)?.plate_number ?? null,
            studentCount: getStudentCount(route.students),
          }))}
        />
      )}
    </div>
  );
}
