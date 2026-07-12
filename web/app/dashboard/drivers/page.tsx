import Link from 'next/link';
import { createClient } from '@/lib/supabase-server';
import { DriversTable, type DriverRow } from '@/components/dashboard/DriversTable';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';

type DriverQueryRow = {
  id: string;
  name: string;
  phone: string;
  assigned_bus_id: string | null;
  created_at: string;
  photo_url: string | null;
  is_active: boolean;
};

type BusQueryRow = {
  id: string;
  plate_number: string;
};

export default async function DriversPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { created, updated, showRetired } = await searchParams;
  const includeRetired = showRetired === '1';
  const supabase = await createClient();

  const driversQuery = supabase
    .from('profiles')
    .select('id, name, phone, assigned_bus_id, created_at, photo_url, is_active')
    .eq('role', 'DRIVER')
    .order('created_at', { ascending: false });

  if (!includeRetired) driversQuery.eq('is_active', true);

  const [{ data: drivers }, { data: buses }, { data: pins }] = await Promise.all([
    driversQuery,
    supabase
      .from('buses')
      .select('id, plate_number')
      .eq('status', 'ACTIVE')
      .order('plate_number'),
    supabase
      .from('driver_pins')
      .select('driver_id'),
  ]);

  const pinSet = new Set((pins ?? []).map((p) => p.driver_id));
  const allRows = (drivers ?? []) as unknown as DriverQueryRow[];
  const retiredCount = allRows.filter((r) => !r.is_active).length;

  const driverRows: DriverRow[] = allRows.map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    assigned_bus_id: row.assigned_bus_id,
    created_at: row.created_at,
    has_pin: pinSet.has(row.id),
    photo_url: row.photo_url ?? null,
    is_active: row.is_active,
  }));

  const busOptions = (buses ?? []) as unknown as BusQueryRow[];
  const activeCount = driverRows.filter((d) => d.is_active).length;

  return (
    <div className="max-w-[1200px] mx-auto">
      {created === '1' && (
        <div className="mb-4 rounded-[var(--radius-btn)] bg-green-bg border border-green/20 text-green text-sm px-4 py-3">
          Driver added successfully.
        </div>
      )}
      {updated === '1' && (
        <div className="mb-4 rounded-[var(--radius-btn)] bg-green-bg border border-green/20 text-green text-sm px-4 py-3">
          Driver updated successfully.
        </div>
      )}

      <DashboardHeader
        title="Drivers"
        subtitle={
          activeCount > 0
            ? `${activeCount} active driver${activeCount !== 1 ? 's' : ''} · ${driverRows.filter((d) => d.has_pin && d.is_active).length} with PIN set`
            : 'Manage drivers and their kiosk login credentials'
        }
        actions={
          <>
            {retiredCount > 0 && (
              <Link
                href={includeRetired ? '/dashboard/drivers' : '/dashboard/drivers?showRetired=1'}
                className="text-sm font-medium text-sub hover:text-ink transition-colors duration-150"
              >
                {includeRetired ? 'Hide retired' : `Show ${retiredCount} retired`}
              </Link>
            )}
            <Link
              href="/dashboard/drivers/new"
              className="bg-amber text-navy rounded-[var(--radius-btn)] px-4 py-2.5 text-sm font-semibold hover:brightness-110 active:scale-95 transition-all duration-150"
            >
              + Add Driver
            </Link>
          </>
        }
      />

      <DriversTable drivers={driverRows} buses={busOptions} />
    </div>
  );
}
