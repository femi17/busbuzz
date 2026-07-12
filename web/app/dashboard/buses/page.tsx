import Link from 'next/link';
import { createClient } from '@/lib/supabase-server';
import { BusFleet } from '@/components/dashboard/BusFleet';
import type { BusRow } from '@/components/dashboard/BusFleet';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';

export default async function BusesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { created } = await searchParams;
  const supabase = await createClient();

  const { data: buses } = await supabase
    .from('buses')
    .select('*')
    .order('created_at', { ascending: false });

  const busRows = (buses ?? []) as unknown as BusRow[];

  const activeCount = busRows.filter((b) => b.status === 'ACTIVE').length;
  const maintenanceCount = busRows.filter((b) => b.status === 'MAINTENANCE').length;
  const retiredCount = busRows.filter((b) => b.status === 'RETIRED').length;

  const fleetSummary = [
    activeCount > 0 && `${activeCount} active`,
    maintenanceCount > 0 && `${maintenanceCount} in maintenance`,
    retiredCount > 0 && `${retiredCount} retired`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="max-w-[1200px] mx-auto">
      {created === '1' && (
        <div className="mb-4 rounded-[var(--radius-btn)] bg-green-bg border border-green/20 text-green text-sm px-4 py-3">
          Bus added successfully.
        </div>
      )}

      <DashboardHeader
        title="Buses"
        subtitle={fleetSummary || 'Manage your school bus fleet'}
        actions={
          <Link
            href="/dashboard/buses/new"
            className="bg-amber text-navy rounded-[var(--radius-btn)] px-4 py-2.5 text-sm font-semibold hover:brightness-110 active:scale-95 transition-all duration-150"
          >
            + Add Bus
          </Link>
        }
      />

      <BusFleet buses={busRows} />
    </div>
  );
}
