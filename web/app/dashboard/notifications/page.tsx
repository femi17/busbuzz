'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, TriangleAlert, Trash2, CheckCheck, Check } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';

const PAGE_SIZE = 50;

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

function formatFull(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

type Filter = 'all' | 'unread';

export default function NotificationsPage() {
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from('notifications')
        .select('id, title, body, data, read_at, created_at')
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);
      setItems((data ?? []) as NotificationRow[]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = items.filter((n) => (filter === 'unread' ? !n.read_at : true));
  const unreadCount = items.filter((n) => !n.read_at).length;

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    setSelected((prev) => {
      const allSelected = visible.length > 0 && visible.every((n) => prev.has(n.id));
      if (allSelected) return new Set();
      return new Set(visible.map((n) => n.id));
    });
  }

  async function markOneRead(id: string) {
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: n.read_at ?? now } : n)));
    const supabase = createClient();
    await supabase.from('notifications').update({ read_at: now }).eq('id', id).is('read_at', null);
  }

  async function markAllRead() {
    if (unreadCount === 0) return;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    const supabase = createClient();
    await supabase.from('notifications').update({ read_at: now }).is('read_at', null);
  }

  async function deleteOne(id: string) {
    const prior = items;
    setItems((prev) => prev.filter((n) => n.id !== id));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    const supabase = createClient();
    const { error } = await supabase.from('notifications').delete().eq('id', id);
    if (error) setItems(prior);
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    const prior = items;
    setItems((prev) => prev.filter((n) => !selected.has(n.id)));
    setSelected(new Set());
    const supabase = createClient();
    const { error } = await supabase.from('notifications').delete().in('id', ids);
    if (error) setItems(prior);
  }

  async function clearAllRead() {
    const readIds = items.filter((n) => n.read_at).map((n) => n.id);
    if (readIds.length === 0) return;
    const prior = items;
    setItems((prev) => prev.filter((n) => !n.read_at));
    const supabase = createClient();
    const { error } = await supabase.from('notifications').delete().in('id', readIds);
    if (error) setItems(prior);
  }

  const allVisibleSelected = visible.length > 0 && visible.every((n) => selected.has(n.id));

  return (
    <div className="max-w-[900px] mx-auto">
      <DashboardHeader
        title="Notifications"
        subtitle="SOS alerts, trip updates, and absence notices for your school"
      />

      {/* Filter tabs + bulk actions */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`rounded-[var(--radius-btn)] px-3.5 py-2 text-[13px] font-semibold transition-colors duration-150 ${filter === 'all' ? 'bg-navy text-white' : 'border border-rule bg-surface text-ink hover:bg-canvas'}`}
          >
            All {items.length > 0 && <span className="opacity-70">({items.length})</span>}
          </button>
          <button
            type="button"
            onClick={() => setFilter('unread')}
            className={`rounded-[var(--radius-btn)] px-3.5 py-2 text-[13px] font-semibold transition-colors duration-150 ${filter === 'unread' ? 'bg-navy text-white' : 'border border-rule bg-surface text-ink hover:bg-canvas'}`}
          >
            Unread {unreadCount > 0 && <span className="opacity-70">({unreadCount})</span>}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {selected.size > 0 ? (
            <button
              type="button"
              onClick={deleteSelected}
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-btn)] border border-red/30 bg-red-bg px-3.5 py-2 text-[13px] font-semibold text-red hover:brightness-105"
            >
              <Trash2 size={14} />
              Delete {selected.size} selected
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={markAllRead}
                disabled={unreadCount === 0}
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-btn)] border border-rule px-3.5 py-2 text-[13px] font-medium text-ink hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CheckCheck size={14} />
                Mark all read
              </button>
              <button
                type="button"
                onClick={clearAllRead}
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-btn)] border border-rule px-3.5 py-2 text-[13px] font-medium text-sub hover:bg-canvas hover:text-ink"
              >
                <Trash2 size={14} />
                Clear read
              </button>
            </>
          )}
        </div>
      </div>

      <div className="bg-surface shadow-[var(--shadow-card)] rounded-[var(--radius-card)] overflow-hidden">
        {isLoading ? (
          <div className="px-5 py-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="my-1.5 h-14 animate-pulse rounded bg-rule" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-16 text-center">
            <Bell size={32} strokeWidth={1.4} className="text-sub/50" />
            <p className="font-semibold text-ink">
              {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
            </p>
            <p className="text-sm text-sub">
              SOS alerts, trip updates, and absence notices will appear here.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-rule px-5 py-2.5">
              <button
                type="button"
                onClick={toggleSelectAllVisible}
                className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${allVisibleSelected ? 'border-navy bg-navy' : 'border-rule bg-surface'}`}
                aria-label="Select all"
              >
                {allVisibleSelected && <Check size={11} className="text-white" />}
              </button>
              <span className="text-[12px] font-medium text-sub">
                {selected.size > 0 ? `${selected.size} selected` : 'Select all'}
              </span>
            </div>
            <ul>
              {visible.map((n) => {
                const sos = isSos(n);
                const unreadRow = !n.read_at;
                const isChecked = selected.has(n.id);
                return (
                  <li
                    key={n.id}
                    className={`group flex items-start gap-3 border-b border-rule/70 px-5 py-4 last:border-0 transition-colors ${unreadRow ? 'bg-amber-light/20' : ''}`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSelect(n.id)}
                      className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${isChecked ? 'border-navy bg-navy' : 'border-rule bg-surface'}`}
                      aria-label="Select notification"
                    >
                      {isChecked && <Check size={11} className="text-white" />}
                    </button>

                    <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${sos ? 'bg-red/15 text-red' : 'bg-night text-amber'}`}>
                      {sos ? <TriangleAlert size={15} /> : <Bell size={14} />}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className={`text-[14px] font-semibold ${sos ? 'text-red' : 'text-ink'}`}>{n.title}</p>
                        {sos && <span className="shrink-0 rounded-[var(--radius-chip)] bg-red/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-red">SOS</span>}
                        {unreadRow && <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber" />}
                      </div>
                      <p className="mt-1 text-[13px] leading-relaxed text-sub">{n.body}</p>
                      <p className="mt-1.5 font-mono text-[11px] uppercase tracking-wide text-sub/70">
                        {formatFull(n.created_at)}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      {unreadRow && (
                        <button
                          type="button"
                          onClick={() => markOneRead(n.id)}
                          className="rounded-full p-1.5 text-sub hover:bg-canvas hover:text-ink"
                          aria-label="Mark as read"
                          title="Mark as read"
                        >
                          <Check size={15} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => deleteOne(n.id)}
                        className="rounded-full p-1.5 text-sub hover:bg-red-bg hover:text-red"
                        aria-label="Delete notification"
                        title="Delete"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
