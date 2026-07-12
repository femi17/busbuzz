'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  MapPin,
  Bus,
  Route as RouteIcon,
  GraduationCap,
  Users,
  FileText,
  Settings,
  School,
  ChevronRight,
  UserCheck,
  type LucideIcon,
} from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { LiveStatusWidget } from './LiveStatusWidget';
import { createClient } from '@/lib/supabase';

type NavItem = {
  label: string;
  href: string | null;
  icon: LucideIcon;
};

export function Sidebar({
  schoolName,
  adminName,
  userRole,
}: {
  schoolName: string;
  adminName: string;
  userRole: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const navItems: NavItem[] = [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    ...(userRole === 'SUPER_ADMIN'
      ? [{ label: 'Schools', href: '/dashboard/schools', icon: School }]
      : []),
    { label: 'Drivers', href: '/dashboard/drivers', icon: UserCheck },
    { label: 'Buses', href: '/dashboard/buses', icon: Bus },
    { label: 'Routes', href: '/dashboard/routes', icon: RouteIcon },
    { label: 'Students', href: '/dashboard/students', icon: GraduationCap },
    { label: 'Live Map', href: '/dashboard/live', icon: MapPin },
    { label: 'Users', href: '/dashboard/users', icon: Users },
    { label: 'Reports', href: '/dashboard/reports', icon: FileText },
    { label: 'Settings', href: '/dashboard/settings', icon: Settings },
  ];

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const initials = adminName
    .split(' ')
    .map((n) => n[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');

  return (
    <aside className="hidden lg:flex fixed left-0 top-0 h-screen w-[220px] flex-col bg-night border-r border-white/[0.06] z-40">
      {/* danfo livery rail */}
      <div className="h-1 hazard-stripe shrink-0" />

      {/* Logo area */}
      <div className="px-4 pt-5 pb-5 border-b border-white/[0.07]">
        <div className="flex items-center gap-2.5">
          <span className="flex items-center justify-center w-7 h-7 rounded-full bg-amber text-night shrink-0 shadow-[0_0_0_1px_rgba(255,201,0,0.35)]">
            <Bus size={15} strokeWidth={2.4} />
          </span>
          <span className="font-mono font-semibold tracking-tight text-[17px] text-white">
            Bus<span className="text-amber">Buzz</span>
          </span>
        </div>
        <p className="font-mono text-[10px] font-semibold text-white/35 uppercase tracking-[0.16em] mt-2.5 truncate">
          {schoolName}
        </p>
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto py-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href !== null &&
            (pathname === item.href ||
              (item.href !== '/dashboard' && pathname.startsWith(item.href)));

          if (item.href === null) {
            return (
              <div
                key={item.label}
                className="flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-btn)] mx-2 opacity-30 cursor-not-allowed"
                title={`${item.label} (coming soon)`}
              >
                <Icon size={17} strokeWidth={1.75} className="text-white/60" />
                <span className="text-[13px] font-medium text-white/60 truncate">
                  {item.label}
                </span>
              </div>
            );
          }

          return (
            <Link
              key={item.label}
              href={item.href}
              className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-btn)] mx-2 mb-0.5 transition-colors duration-150 ${
                isActive
                  ? 'bg-white/[0.07] text-white'
                  : 'text-white/50 hover:text-white/85 hover:bg-white/[0.04]'
              }`}
            >
              {/* route-stop marker for the active screen */}
              <span
                className={`absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full transition-opacity duration-150 ${
                  isActive ? 'bg-amber opacity-100' : 'opacity-0'
                }`}
                aria-hidden
              />
              <Icon
                size={17}
                strokeWidth={1.75}
                className={isActive ? 'text-amber' : 'text-white/45 group-hover:text-white/70'}
              />
              <span className="text-[13px] font-medium truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Live status widget */}
      <div className="mx-3 mb-3">
        <LiveStatusWidget />
      </div>

      {/* User section */}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="px-4 py-4 border-t border-white/[0.07] flex items-center gap-3 w-full text-left hover:bg-white/[0.04] transition-colors duration-150 focus:outline-none focus-visible:bg-white/[0.06]"
          >
            <div className="w-8 h-8 rounded-full bg-amber flex items-center justify-center shrink-0">
              <span className="text-[12px] font-bold text-night leading-none">
                {initials || 'A'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-white truncate">{adminName}</p>
              <p className="font-mono text-[10px] text-white/35 uppercase tracking-[0.12em] mt-0.5">
                {userRole === 'SUPER_ADMIN' ? 'Super admin' : 'Admin'}
              </p>
            </div>
            <ChevronRight size={14} className="text-white/35 shrink-0" />
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            side="top"
            align="start"
            sideOffset={4}
            className="z-50 min-w-[180px] bg-night-2 rounded-[var(--radius-btn)] shadow-[0_16px_40px_-12px_rgba(0,0,0,0.7)] border border-white/10 py-1 outline-none"
          >
            <DropdownMenu.Item asChild>
              <Link
                href="/dashboard/settings"
                className="flex items-center px-3 py-2 text-[13px] font-medium text-white/80 hover:bg-white/[0.06] hover:text-white cursor-pointer outline-none rounded-sm mx-1"
              >
                Settings
              </Link>
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="h-px bg-white/10 my-1" />
            <DropdownMenu.Item asChild>
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full flex items-center px-3 py-2 text-[13px] font-medium text-[#F87171] hover:bg-white/[0.06] cursor-pointer outline-none rounded-sm mx-1"
              >
                Sign out
              </button>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </aside>
  );
}
