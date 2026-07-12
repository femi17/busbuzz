'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase';

export function DeleteRouteButton({
  routeId,
  studentCount,
}: {
  routeId: string;
  studentCount: number;
}) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  const isDisabled = studentCount > 0 || isDeleting;

  async function handleDelete() {
    const confirmed = window.confirm(
      'Are you sure you want to delete this route and all its stops? This action cannot be undone.',
    );
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/manage-route`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({ id: routeId }),
        },
      );

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        alert(errorBody?.error ?? 'Failed to delete route');
        return;
      }

      router.refresh();
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isDisabled}
      title={
        studentCount > 0
          ? 'Unassign all students before deleting'
          : undefined
      }
      className="inline-flex items-center gap-1.5 text-[12px] font-medium text-sub hover:text-red transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <Trash2 size={13} strokeWidth={2} />
      {isDeleting ? 'Deleting…' : 'Delete'}
    </button>
  );
}
