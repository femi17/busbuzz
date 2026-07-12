'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { ParentInviteForm } from '@/components/dashboard/ParentInviteForm';

export function AddParentButton({ studentId, studentName }: { studentId: string; studentName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button type="button" className="inline-flex items-center gap-1.5 text-[12px] font-medium text-sub hover:text-ink transition-colors duration-100">
          <UserPlus size={13} strokeWidth={2} />
          Add Parent
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-navy/40 backdrop-blur-[2px]" />
        <Dialog.Content
          aria-describedby="add-parent-desc"
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-float)] p-6 outline-none"
        >
          <Dialog.Title className="mb-1 text-[17px] font-semibold text-ink">
            Add parent to {studentName}
          </Dialog.Title>
          <p id="add-parent-desc" className="mb-5 text-[13px] leading-relaxed text-sub">
            Search for a parent already using BusBuzz, or invite a new one by email.
          </p>

          <ParentInviteForm studentId={studentId} onInvited={() => router.refresh()} />

          <div className="mt-5 flex justify-end">
            <Dialog.Close asChild>
              <button type="button" className="rounded-[var(--radius-btn)] border border-rule px-4 py-2 text-[13px] font-medium text-ink hover:bg-canvas transition-colors duration-150">
                Done
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
