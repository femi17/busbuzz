'use client';

import type { ReactNode } from 'react';
import { NotificationBell } from './NotificationBell';

// Single source of truth for every dashboard page's header row: title size,
// subtitle style, action-button placement, and the notification bell are all
// identical across pages because they all go through this component instead
// of each page hand-rolling its own <h1>/<p>/button markup.
export function DashboardHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  noMargin,
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  // Pages that supply their own outer spacing/container (e.g. a bordered bar,
  // or a parent using gap-* between children) pass this to skip the default
  // mb-6 so spacing isn't doubled up.
  noMargin?: boolean;
}) {
  return (
    <div className={`flex items-start justify-between gap-4 ${noMargin ? '' : 'mb-6'}`}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="font-mono text-[10px] font-semibold text-sub uppercase tracking-[0.16em]">
            {eyebrow}
          </p>
        )}
        <h1
          className={`font-heading font-bold text-[28px] tracking-tight text-ink ${eyebrow ? 'mt-1' : ''}`}
        >
          {title}
        </h1>
        {subtitle && <p className="text-sm text-sub mt-1">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {actions}
        <NotificationBell />
      </div>
    </div>
  );
}
