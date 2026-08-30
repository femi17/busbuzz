"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./onboarding.module.css";
import { createClient } from "@/lib/supabase/client";

export default function ConfirmChildren({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error();

      const resp = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/complete-onboarding`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
        },
      );
      if (!resp.ok) throw new Error();

      router.replace("/");
      router.refresh();
    } catch {
      setError("Couldn't finish setup. Please try again.");
      setBusy(false);
    }
  }

  return (
    <>
      {error && <p className={styles.error}>{error}</p>}
      <button type="button" className={styles.cta} onClick={confirm} disabled={busy || disabled}>
        {busy ? "Setting up…" : "Yes, that's my family — let's go"}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </button>
    </>
  );
}
