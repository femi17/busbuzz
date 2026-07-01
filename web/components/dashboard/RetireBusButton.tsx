'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

export function RetireBusButton({
  busId,
  onRetired,
}: {
  busId: string;
  onRetired?: () => void;
}) {
  const router = useRouter();
  const [isRetiring, setIsRetiring] = useState(false);

  async function handleRetire() {
    const confirmed = window.confirm(
      'Are you sure you want to retire this bus? This action cannot be undone.',
    );
    if (!confirmed) return;

    setIsRetiring(true);
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
        alert(errorBody?.error ?? 'Failed to retire bus');
        return;
      }

      onRetired?.();
      router.refresh();
    } finally {
      setIsRetiring(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleRetire}
      disabled={isRetiring}
      className="text-sm font-medium text-red-500 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isRetiring ? 'Retiring...' : 'Retire'}
    </button>
  );
}
