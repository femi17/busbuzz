'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GraduationCap, PowerOff } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { createClient } from '@/lib/supabase';

export function RetireStudentButton({ studentId, studentName }: { studentId: string; studentName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isRetiring, setIsRetiring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRetire() {
    setIsRetiring(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/manage-student`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({ id: studentId, isActive: false }),
        },
      );

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        setError(errorBody?.error ?? 'Failed to retire student. Please try again.');
        return;
      }

      setOpen(false);
      router.refresh();
    } finally {
      setIsRetiring(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { setOpen(v); if (!v) setError(null); }}>
      <Dialog.Trigger asChild>
        <button type="button" className="inline-flex items-center gap-1.5 text-[12px] font-medium text-sub hover:text-red transition-colors duration-100">
          <PowerOff size={13} strokeWidth={2} />
          Retire
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-navy/40 backdrop-blur-[2px]" />
        <Dialog.Content
          aria-describedby="retire-student-desc"
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-float)] p-6 outline-none"
        >
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-red-bg">
            <GraduationCap size={22} strokeWidth={1.75} className="text-red" />
          </div>

          <Dialog.Title className="mb-1.5 text-center text-[17px] font-semibold text-ink">
            Retire {studentName}?
          </Dialog.Title>

          <p id="retire-student-desc" className="mb-6 text-center text-[13px] leading-relaxed text-sub">
            This student will be marked as inactive. Their trip history and attendance records are preserved. You can reactivate them at any time.
          </p>

          {error && (
            <p className="mb-4 rounded-[var(--radius-btn)] bg-red-bg px-3 py-2.5 text-center text-[12px] font-medium text-red">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <Dialog.Close asChild>
              <button
                type="button"
                disabled={isRetiring}
                className="flex-1 rounded-[var(--radius-btn)] border border-rule py-2.5 text-[13px] font-medium text-ink hover:bg-canvas transition-all duration-150 disabled:opacity-50"
              >
                Cancel
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={handleRetire}
              disabled={isRetiring}
              className="flex-1 rounded-[var(--radius-btn)] bg-red py-2.5 text-[13px] font-semibold text-white transition-all duration-150 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRetiring ? 'Retiring…' : 'Retire Student'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
