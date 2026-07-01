'use client';

import { usePathname } from 'next/navigation';
import { SignOutButton } from './SignOutButton';

const titlesByPath: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/dashboard/buses': 'Buses',
  '/dashboard/routes': 'Routes',
  '/dashboard/students': 'Students',
  '/dashboard/users': 'Users',
  '/dashboard/settings': 'Settings',
};

function titleForPath(pathname: string): string {
  if (titlesByPath[pathname]) return titlesByPath[pathname];
  const segment = pathname.split('/').filter(Boolean)[1];
  if (!segment) return 'Dashboard';
  return segment.charAt(0).toUpperCase() + segment.slice(1);
}

export function Header({ adminName }: { adminName: string }) {
  const pathname = usePathname();

  return (
    <header className="flex h-16 items-center justify-between border-b border-navy/10 bg-white px-6">
      <h1 className="text-lg font-bold text-navy">{titleForPath(pathname)}</h1>
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-navy/70">{adminName}</span>
        <SignOutButton />
      </div>
    </header>
  );
}
