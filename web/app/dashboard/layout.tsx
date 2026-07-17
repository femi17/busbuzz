import { createClient } from '@/lib/supabase-server';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { WhatsAppButton } from '@/components/dashboard/WhatsAppButton';

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  let adminName = 'School Admin';
  let schoolName = 'BusBuzz';
  let schoolLogoUrl: string | null = null;
  let userRole: string = 'SCHOOL_ADMIN';

  if (userData.user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('name, role, school:schools(name, logo_url)')
      .eq('id', userData.user.id)
      .single();

    if (profile) {
      adminName = profile.name ?? adminName;
      userRole = profile.role ?? userRole;
      const schoolField = profile.school as unknown;
      const school = Array.isArray(schoolField)
        ? (schoolField[0] as { name: string; logo_url: string | null } | undefined)
        : (schoolField as { name: string; logo_url: string | null } | null);
      if (school?.name) schoolName = school.name;
      schoolLogoUrl = school?.logo_url ?? null;
    }
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-canvas">
      <Sidebar schoolName={schoolName} schoolLogoUrl={schoolLogoUrl} adminName={adminName} userRole={userRole} />
      <main className="ml-0 lg:ml-[220px] flex-1 overflow-y-auto min-h-screen bg-canvas p-4 pt-[70px] lg:p-6 lg:pt-6">
        {children}
      </main>
      <WhatsAppButton />
    </div>
  );
}
