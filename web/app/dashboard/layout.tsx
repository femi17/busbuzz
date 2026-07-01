import { createClient } from '@/lib/supabase-server';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { Header } from '@/components/dashboard/Header';

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  let adminName = 'School Admin';
  let schoolName = 'BusBuzz';

  if (userData.user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('name, school:schools(name)')
      .eq('id', userData.user.id)
      .single();

    if (profile) {
      adminName = profile.name ?? adminName;
      const schoolField = profile.school as unknown;
      const school = Array.isArray(schoolField)
        ? (schoolField[0] as { name: string } | undefined)
        : (schoolField as { name: string } | null);
      if (school?.name) schoolName = school.name;
    }
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-white">
      <Sidebar schoolName={schoolName} />
      <div className="flex flex-1 flex-col overflow-y-auto">
        <Header adminName={adminName} />
        <main className="flex-1 bg-paper p-6">{children}</main>
      </div>
    </div>
  );
}
