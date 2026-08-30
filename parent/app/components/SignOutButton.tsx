"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./screen.module.css";
import { createClient } from "@/lib/supabase/client";

export default function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      className={styles.signOut}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const supabase = createClient();
        // Drop this browser's push subscription before the session goes away
        // — otherwise the next account signing in on this device would keep
        // receiving the previous parent's alerts.
        try {
          const reg = await navigator.serviceWorker?.ready;
          const sub = await reg?.pushManager.getSubscription();
          if (sub) {
            await supabase
              .from("web_push_subscriptions")
              .delete()
              .eq("endpoint", sub.endpoint);
            await sub.unsubscribe();
          }
        } catch {
          // Push cleanup is best-effort; never block sign-out on it.
        }
        await supabase.auth.signOut();
        router.replace("/login");
        router.refresh();
      }}
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
