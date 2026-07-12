'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bus, PowerOff } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { createClient } from '@/lib/supabase';

export function RetireBusButton({
  busId,
  plateNumber,
  onRetired,
}: {
  busId: string;
  plateNumber?: string;
  onRetired?: () => void;
}) {
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
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/manage-bus`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({ id: busId }),
        },
      );

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        setError(errorBody?.error ?? 'Failed to retire bus. Please try again.');
        return;
      }

      setOpen(false);
      onRetired?.();
      router.refresh();
    } finally {
      setIsRetiring(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { setOpen(v); if (!v) setError(null); }}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-sub hover:text-red transition-colors duration-100"
        >
          <PowerOff size={13} strokeWidth={2} />
          Retire
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        {/* Overlay */}
        <Dialog.Overlay className="fixed inset-0 z-50 bg-navy/40 backdrop-blur-[2px]" />

        {/* Dialog panel */}
        <Dialog.Content
          aria-describedby="retire-desc"
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-float)] p-6 outline-none"
        >
          {/* Bus icon in red tinted circle */}
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-red-bg">
            <Bus size={22} strokeWidth={1.75} className="text-red" />
          </div>

          {/* Title */}
          <Dialog.Title className="mb-1.5 text-center text-[17px] font-semibold text-ink">
            Retire{' '}
            {plateNumber ? (
              <span className="font-mono text-[16px] rounded-md bg-navy px-2 py-0.5 text-amber">
                {plateNumber}
              </span>
            ) : (
              'this bus'
            )}
            ?
          </Dialog.Title>

          {/* Description */}
          <p id="retire-desc" className="mb-6 text-center text-[13px] leading-relaxed text-sub">
            This bus will be marked as retired and taken off all active routes.
            Any drivers and students assigned to it will need to be reassigned manually.
          </p>

          {/* Error */}
          {error && (
            <p className="mb-4 rounded-[var(--radius-btn)] bg-red-bg px-3 py-2.5 text-center text-[12px] font-medium text-red">
              {error}
            </p>
          )}

          {/* Actions */}
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
              {isRetiring ? 'Retiring…' : 'Retire Bus'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
