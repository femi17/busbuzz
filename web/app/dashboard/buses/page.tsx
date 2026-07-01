import Link from 'next/link';
import { createClient } from '@/lib/supabase-server';
import { RetireBusButton } from '@/components/dashboard/RetireBusButton';

type BusRow = {
  id: string;
  plate_number: string;
  capacity: number;
  device_id: string | null;
  status: 'ACTIVE' | 'MAINTENANCE' | 'RETIRED';
};

function StatusBadge({ status }: { status: BusRow['status'] }) {
  const styles: Record<BusRow['status'], string> = {
    ACTIVE: 'bg-green-50 text-green-700',
    MAINTENANCE: 'bg-amber/15 text-amber-dark',
    RETIRED: 'bg-gray-100 text-gray-500',
  };

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${styles[status]}`}
    >
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

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

  return (
    <div className="flex flex-col gap-4">
      {created === '1' && (
        <div className="rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3">
          Bus added successfully.
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-navy/60">
          {busRows.length} {busRows.length === 1 ? 'bus' : 'buses'}
        </p>
        <Link
          href="/dashboard/buses/new"
          className="rounded-lg bg-amber px-4 py-2.5 text-sm font-semibold text-navy"
        >
          + Add Bus
        </Link>
      </div>

      <div className="rounded-xl border border-navy/10 bg-white shadow-sm">
        {busRows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-5 py-16 text-center">
            <p className="text-sm text-navy/50">
              No buses added yet. Add your first bus to get started.
            </p>
            <Link
              href="/dashboard/buses/new"
              className="rounded-lg bg-amber px-4 py-2.5 text-sm font-semibold text-navy"
            >
              + Add Bus
            </Link>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-navy/10 text-navy/50">
                <th className="px-5 py-3 font-medium">Plate Number</th>
                <th className="px-5 py-3 font-medium">Capacity</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Device ID</th>
                <th className="px-5 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {busRows.map((bus) => (
                <tr key={bus.id} className="border-b border-navy/5 last:border-0">
                  <td className="px-5 py-3 font-medium text-navy">
                    {bus.plate_number}
                  </td>
                  <td className="px-5 py-3 text-navy/80">{bus.capacity}</td>
                  <td className="px-5 py-3">
                    <StatusBadge status={bus.status} />
                  </td>
                  <td className="px-5 py-3 text-navy/80">
                    {bus.device_id ? (
                      bus.device_id
                    ) : (
                      <span className="italic text-navy/40">Not configured</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/dashboard/buses/${bus.id}/edit`}
                        className="text-sm font-medium text-navy/60 hover:text-navy"
                      >
                        Edit
                      </Link>
                      {bus.status !== 'RETIRED' && (
                        <RetireBusButton busId={bus.id} />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
