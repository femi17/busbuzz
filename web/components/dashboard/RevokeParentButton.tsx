'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ban } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { createClient } from '@/lib/supabase';

export function RevokeParentButton({
  parentId,
  parentName,
}: {
  parentId: string;
  parentName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRevoke() {
    setIsRevoking(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ is_active: false })
        .eq('id', parentId);

      if (updateError) {
        setError(updateError.message ?? 'Failed to revoke access. Please try again.');
        return;
      }

      setOpen(false);
      router.refresh();
    } finally {
      setIsRevoking(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { setOpen(v); if (!v) setError(null); }}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-sub hover:text-red transition-colors duration-100"
        >
          <Ban size={13} strokeWidth={2} />
          Revoke
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-navy/40 backdrop-blur-[2px]" />
        <Dialog.Content
          aria-describedby="revoke-parent-desc"
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-float)] p-6 outline-none"
        >
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-red-bg">
            <Ban size={22} strokeWidth={1.75} className="text-red" />
          </div>

          <Dialog.Title className="mb-1.5 text-center text-[17px] font-semibold text-ink">
            Revoke access for {parentName}?
          </Dialog.Title>

          <p id="revoke-parent-desc" className="mb-6 text-center text-[13px] leading-relaxed text-sub">
            They will be signed out and can no longer track their child&apos;s bus. Their account and history are kept — you can restore access later by re-inviting them.
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
                disabled={isRevoking}
                className="flex-1 rounded-[var(--radius-btn)] border border-rule py-2.5 text-[13px] font-medium text-ink hover:bg-canvas transition-all duration-150 disabled:opacity-50"
              >
                Cancel
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={handleRevoke}
              disabled={isRevoking}
              className="flex-1 rounded-[var(--radius-btn)] bg-red py-2.5 text-[13px] font-semibold text-white transition-all duration-150 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRevoking ? 'Revoking…' : 'Revoke Access'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
