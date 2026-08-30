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
        await createClient().auth.signOut();
        router.replace("/login");
        router.refresh();
      }}
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
