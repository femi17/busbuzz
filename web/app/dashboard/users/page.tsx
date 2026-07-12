import { createClient } from '@/lib/supabase-server';
import {
  UsersContent,
  type ParentRow,
  type DriverRow,
  type BusOption,
} from '@/components/dashboard/UsersContent';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';

export default async function UsersPage() {
  const supabase = await createClient();

  const { data: parents } = await supabase
    .from('profiles')
    .select(
      'id, name, email, phone, is_active, onboarding_completed, student_parents(students(id, name))',
    )
    .eq('role', 'PARENT')
    .order('name');

  const { data: drivers } = await supabase
    .from('profiles')
    .select('id, name, phone, driver_pins(id)')
    .eq('role', 'DRIVER')
    .order('name');

  const { data: buses } = await supabase
    .from('buses')
    .select('id, plate_number, driver_id')
    .eq('status', 'ACTIVE')
    .order('plate_number');

  return (
    <div className="max-w-[1200px] mx-auto">
      <DashboardHeader title="Users" subtitle="Parents and drivers" />

      <UsersContent
        parents={(parents ?? []) as unknown as ParentRow[]}
        drivers={(drivers ?? []) as unknown as DriverRow[]}
        buses={(buses ?? []) as unknown as BusOption[]}
      />
    </div>
  );
}
