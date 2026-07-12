import Link from 'next/link';
import { Route as RouteIcon } from 'lucide-react';
import { createClient } from '@/lib/supabase-server';
import { DeleteRouteButton } from '@/components/dashboard/DeleteRouteButton';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';

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

      {/* Count row */}
      <div className="mb-4">
        <p className="text-sm font-medium text-sub">
          {routeRows.length} {routeRows.length === 1 ? 'route' : 'routes'}
        </p>
      </div>

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
        <div className="bg-surface shadow-[var(--shadow-card)] rounded-[var(--radius-card)] overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-canvas border-b border-rule">
                {['Route Name', 'Bus', 'Students', 'Actions'].map((h) => (
                  <th key={h} className="px-5 py-3 text-[11px] font-semibold text-sub uppercase tracking-widest">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {routeRows.map((route) => {
                const bus = getBus(route.bus);
                const studentCount = getStudentCount(route.students);
                return (
                  <tr key={route.id} className="border-b border-rule last:border-0 bg-surface hover:bg-canvas/60 transition-colors duration-100">
                    <td className="px-5 py-3 text-[14px] font-medium text-ink">{route.name}</td>
                    <td className="px-5 py-3 text-[13px] text-sub">
                      {bus ? bus.plate_number : <span className="italic text-sub/60">No bus</span>}
                    </td>
                    <td className="px-5 py-3 text-[13px] text-sub">{studentCount}</td>
                    <td className="px-5 py-3">
                      <DeleteRouteButton routeId={route.id} studentCount={studentCount} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
