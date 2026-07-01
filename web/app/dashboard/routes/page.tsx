import Link from 'next/link';
import { createClient } from '@/lib/supabase-server';
import { DeleteRouteButton } from '@/components/dashboard/DeleteRouteButton';

type StopRow = {
  id: string;
};

type RouteRow = {
  id: string;
  name: string;
  type: 'MORNING' | 'AFTERNOON';
  bus_id: string | null;
  stops: StopRow[];
  bus: { plate_number: string } | { plate_number: string }[] | null;
  students: { count: number }[];
};

function getStudentCount(students: RouteRow['students']): number {
  return Array.isArray(students) ? students[0]?.count ?? 0 : 0;
}

function getBus(
  bus: RouteRow['bus'],
): { plate_number: string } | null {
  if (!bus) return null;
  return Array.isArray(bus) ? bus[0] ?? null : bus;
}

function RoutesTable({ routes }: { routes: RouteRow[] }) {
  return (
    <div className="rounded-xl border border-navy/10 bg-white shadow-sm">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-navy/10 text-navy/50">
            <th className="px-5 py-3 font-medium">Route Name</th>
            <th className="px-5 py-3 font-medium">Bus</th>
            <th className="px-5 py-3 font-medium">Stops</th>
            <th className="px-5 py-3 font-medium">Students</th>
            <th className="px-5 py-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {routes.map((route) => {
            const bus = getBus(route.bus);
            const studentCount = getStudentCount(route.students);
            return (
              <tr
                key={route.id}
                className="border-b border-navy/5 last:border-0"
              >
                <td className="px-5 py-3 font-medium text-navy">
                  {route.name}
                </td>
                <td className="px-5 py-3 text-navy/80">
                  {bus ? (
                    bus.plate_number
                  ) : (
                    <span className="italic text-navy/40">
                      No bus assigned
                    </span>
                  )}
                </td>
                <td className="px-5 py-3 text-navy/80">
                  {route.stops?.length ?? 0}
                </td>
                <td className="px-5 py-3 text-navy/80">{studentCount}</td>
                <td className="px-5 py-3">
                  <DeleteRouteButton
                    routeId={route.id}
                    studentCount={studentCount}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
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
    .select('*, stops(id), bus:buses(plate_number), students(count)')
    .order('type')
    .order('name');

  const routeRows = (routes ?? []) as unknown as RouteRow[];
  const morningRoutes = routeRows.filter((r) => r.type === 'MORNING');
  const afternoonRoutes = routeRows.filter((r) => r.type === 'AFTERNOON');

  return (
    <div className="flex flex-col gap-4">
      {created === '1' && (
        <div className="rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3">
          Route added successfully.
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-navy/60">
          {routeRows.length} {routeRows.length === 1 ? 'route' : 'routes'}
        </p>
        <Link
          href="/dashboard/routes/new"
          className="rounded-lg bg-amber px-4 py-2.5 text-sm font-semibold text-navy"
        >
          + Add Route
        </Link>
      </div>

      {routeRows.length === 0 ? (
        <div className="rounded-xl border border-navy/10 bg-white shadow-sm">
          <div className="flex flex-col items-center gap-3 px-5 py-16 text-center">
            <p className="text-sm text-navy/50">
              No routes created yet. Add your first route to get started.
            </p>
            <Link
              href="/dashboard/routes/new"
              className="rounded-lg bg-amber px-4 py-2.5 text-sm font-semibold text-navy"
            >
              + Add Route
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {morningRoutes.length > 0 && (
            <div className="flex flex-col gap-3">
              <h2 className="text-base font-semibold text-navy">
                Morning Routes
              </h2>
              <RoutesTable routes={morningRoutes} />
            </div>
          )}

          {afternoonRoutes.length > 0 && (
            <div className="flex flex-col gap-3">
              <h2 className="text-base font-semibold text-navy">
                Afternoon Routes
              </h2>
              <RoutesTable routes={afternoonRoutes} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
