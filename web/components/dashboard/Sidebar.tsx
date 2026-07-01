'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  MapPin,
  Bus,
  Route as RouteIcon,
  GraduationCap,
  Users,
  FileText,
  Settings,
  type LucideIcon,
} from 'lucide-react';

type NavItem = {
  label: string;
  href: string | null;
  icon: LucideIcon;
};

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Live Map', href: '/dashboard/live', icon: MapPin },
  { label: 'Buses', href: '/dashboard/buses', icon: Bus },
  { label: 'Routes', href: '/dashboard/routes', icon: RouteIcon },
  { label: 'Students', href: '/dashboard/students', icon: GraduationCap },
  { label: 'Users', href: '/dashboard/users', icon: Users },
  { label: 'Reports', href: '/dashboard/reports', icon: FileText },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings },
];

export function Sidebar({ schoolName }: { schoolName: string }) {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-20 shrink-0 flex-col bg-navy text-white lg:w-64">
      <div className="flex h-16 items-center justify-center gap-2 border-b border-white/10 px-2 lg:justify-start lg:px-6">
        <span className="h-2 w-2 shrink-0 rounded-full bg-amber" aria-hidden />
        <span className="hidden font-display text-lg font-bold tracking-tight lg:inline">
          {schoolName}
        </span>
        <span className="font-display text-lg font-bold tracking-tight lg:hidden">
          {schoolName.charAt(0).toUpperCase() || 'B'}
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-2 py-4 lg:px-3">
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
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-white/40"
                title={`${item.label} (coming soon)`}
              >
                <Icon size={20} strokeWidth={1.75} />
                <span className="hidden truncate text-sm font-medium lg:inline">
                  {item.label}
                </span>
              </div>
            );
          }

          return (
            <Link
              key={item.label}
              href={item.href}
              className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-white/10 text-white'
                  : 'text-white/70 hover:bg-white/5 hover:text-white'
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="sidebar-active-indicator"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-amber"
                />
              )}
              <Icon size={20} strokeWidth={1.75} />
              <span className="hidden truncate lg:inline">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
