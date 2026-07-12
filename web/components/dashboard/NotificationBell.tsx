'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, TriangleAlert, X, Trash2, CheckCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase';

const REFRESH_MS = 15_000;

type NotificationRow = {
  id: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

function isSos(n: NotificationRow): boolean {
  return n.data?.type === 'sos';
}

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function NotificationBell() {
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from('notifications')
        .select('id, title, body, data, read_at, created_at')
        .order('created_at', { ascending: false })
        .limit(20);
      setItems((data ?? []) as NotificationRow[]);
    } catch {
      // keep last good list
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, REFRESH_MS);
    const onVisible = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [load]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const unread = items.filter((n) => !n.read_at);
  const unreadCount = unread.length;
  const hasUnreadSos = unread.some(isSos);

  async function markOneRead(id: string) {
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: n.read_at ?? now } : n)));
    try {
      const supabase = createClient();
      await supabase.from('notifications').update({ read_at: now }).eq('id', id).is('read_at', null);
    } catch {
      // next poll restores true state on failure
    }
  }

  async function markAllRead() {
    if (unreadCount === 0) return;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    try {
      const supabase = createClient();
      await supabase.from('notifications').update({ read_at: now }).is('read_at', null);
    } catch {
      // next poll restores true state on failure
    }
  }

  async function deleteOne(id: string) {
    const prior = items;
    setItems((prev) => prev.filter((n) => n.id !== id));
    try {
      const supabase = createClient();
      const { error } = await supabase.from('notifications').delete().eq('id', id);
      if (error) setItems(prior);
    } catch {
      setItems(prior);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`relative transition-colors duration-100 ${hasUnreadSos ? 'text-red' : 'text-sub hover:text-ink'}`}
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
      >
        <Bell size={20} className={hasUnreadSos ? 'animate-pulse' : ''} />
        {unreadCount > 0 && (
          <span
            className={`absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white ${hasUnreadSos ? 'bg-red' : 'bg-amber !text-navy'}`}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-[360px] overflow-hidden rounded-[16px] border border-rule bg-surface shadow-[var(--shadow-float)]">
          <div className="flex items-center justify-between border-b border-rule px-4 py-3">
            <p className="font-heading text-[15px] font-bold tracking-tight text-ink">Notifications</p>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="inline-flex items-center gap-1 rounded-[var(--radius-chip)] px-2 py-1 text-[11px] font-semibold text-sub hover:bg-canvas hover:text-ink"
                >
                  <CheckCheck size={13} />
                  Mark all read
                </button>
              )}
              <button type="button" onClick={() => setOpen(false)} className="rounded-full p-1 text-sub hover:bg-canvas hover:text-ink" aria-label="Close">
                <X size={15} />
              </button>
            </div>
          </div>

          <div className="max-h-[380px] overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Bell size={26} strokeWidth={1.4} className="mx-auto text-sub/60" />
                <p className="mt-2 text-[13px] text-sub">No notifications yet</p>
                <p className="mt-0.5 text-[11px] text-sub/70">SOS alerts and trip updates will appear here.</p>
              </div>
            ) : (
              <ul>
                {items.map((n) => {
                  const sos = isSos(n);
                  const unreadRow = !n.read_at;
                  return (
                    <li
                      key={n.id}
                      className={`group flex gap-3 border-b border-rule/70 px-4 py-3 last:border-0 ${unreadRow ? 'bg-amber-light/25' : ''}`}
                    >
                      <button
                        type="button"
                        onClick={() => unreadRow && markOneRead(n.id)}
                        disabled={!unreadRow}
                        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${sos ? 'bg-red/15 text-red' : 'bg-night text-amber'} ${unreadRow ? 'cursor-pointer' : 'cursor-default'}`}
                        aria-label={unreadRow ? 'Mark as read' : undefined}
                        title={unreadRow ? 'Mark as read' : undefined}
                      >
                        {sos ? <TriangleAlert size={14} /> : <Bell size={13} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => unreadRow && markOneRead(n.id)}
                        className="min-w-0 flex-1 text-left"
                        disabled={!unreadRow}
                      >
                        <div className="flex items-center gap-2">
                          <p className={`truncate text-[13px] font-semibold ${sos ? 'text-red' : 'text-ink'}`}>{n.title}</p>
                          {sos && <span className="shrink-0 rounded-[var(--radius-chip)] bg-red/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-red">SOS</span>}
                          {unreadRow && <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber" />}
                        </div>
                        <p className="mt-0.5 text-[12px] leading-snug text-sub">{n.body}</p>
                        <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-sub/70">{timeAgo(n.created_at)}</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteOne(n.id)}
                        className="self-start rounded-full p-1.5 text-sub/50 opacity-0 transition-opacity hover:bg-red-bg hover:text-red group-hover:opacity-100"
                        aria-label="Delete notification"
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <Link
            href="/dashboard/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-rule px-4 py-2.5 text-center text-[12.5px] font-semibold text-navy hover:bg-canvas"
          >
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
