"use client";

import { useEffect } from "react";

/** Registers the push service worker once, on the client. */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => {
        // Registration failures shouldn't break the app — push is additive.
      });
  }, []);

  return null;
}
