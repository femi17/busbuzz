import Link from 'next/link';
import { createClient } from '@/lib/supabase-server';
import { getFirstName } from '../../../shared/name';
import { fetchDashboardData } from '@/lib/dashboard-data';
import { LiveDashboardGrid } from '@/components/dashboard/LiveDashboardGrid';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';

// Live dashboard: never serve cached counts. Without this Next's Data Cache can
// hand back a stale count for some tables (e.g. buses/students showing 0 while
// routes/trips are current) on repeat renders.
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default async function DashboardHomePage() {
  const supabase = await createClient();

  // First paint is server-rendered; LiveDashboardGrid keeps it fresh by polling.
  const [initialData, { data: userData }] = await Promise.all([
    fetchDashboardData(supabase),
    supabase.auth.getUser(),
  ]);

  let adminName = 'Admin';
  let schoolAddress: string | null = null;
  let schoolLat: number | null = null;
  let schoolLng: number | null = null;
  if (userData?.user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('name, school:schools(address, latitude, longitude)')
      .eq('id', userData.user.id)
      .single();
    if (profile?.name) adminName = getFirstName(profile.name) || adminName;

    const schoolField = profile?.school as unknown;
    const school = Array.isArray(schoolField)
      ? (schoolField[0] as { address: string; latitude: number | null; longitude: number | null } | undefined)
      : (schoolField as { address: string; latitude: number | null; longitude: number | null } | null);
    if (school) {
      schoolAddress = school.address ?? null;
      schoolLat = school.latitude ?? null;
      schoolLng = school.longitude ?? null;
    }
  }

  const greeting = getGreeting();
  const dateLabel = formatDate();

  return (
    <div className="max-w-[1200px] mx-auto">
      <DashboardHeader
        eyebrow={dateLabel}
        title={`${greeting}, ${adminName}`}
        actions={
          <>
            <Link
              href="/dashboard/students/new"
              className="border border-rule text-ink rounded-[var(--radius-btn)] px-4 py-2.5 text-sm font-medium hover:bg-canvas transition-all duration-150 active:scale-95"
            >
              Add Student
            </Link>
            <Link
              href="/dashboard/routes/new"
              className="bg-amber text-navy rounded-[var(--radius-btn)] px-4 py-2.5 text-sm font-semibold hover:brightness-110 transition-all duration-150 active:scale-95"
            >
              New Route
            </Link>
          </>
        }
      />

      <LiveDashboardGrid
        initial={initialData}
        schoolLat={schoolLat}
        schoolLng={schoolLng}
        schoolAddress={schoolAddress}
      />
    </div>
  );
}
