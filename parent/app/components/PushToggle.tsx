"use client";

import { useEffect, useState } from "react";
import styles from "../track.module.css";
import { createClient } from "@/lib/supabase/client";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const arr = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

type PushState =
  | "checking"
  | "unsupported" // browser can't push (or iOS Safari not installed to home screen)
  | "denied" // permission permanently blocked
  | "off"
  | "on"
  | "busy";

/**
 * "Get bus alerts on this device" card. Renders only while there's
 * something for the parent to do — once subscribed (or where push simply
 * can't work) it disappears. The subscription is stored per browser in
 * web_push_subscriptions; send-push delivers to every device row a parent
 * has, native and web alike.
 */
export default function PushToggle() {
  const [state, setState] = useState<PushState>("checking");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window) ||
        !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      ) {
        if (!cancelled) setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setState("denied");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!cancelled) setState(sub ? "on" : "off");
      } catch {
        if (!cancelled) setState("unsupported");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    setState("busy");
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
        ),
      });

      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error("incomplete subscription");
      }

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("no session");

      // endpoint is unique — resubscribing on the same browser updates the
      // existing row instead of piling up duplicates.
      const { error: dbError } = await supabase.from("web_push_subscriptions").upsert(
        {
          profile_id: user.id,
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
        },
        { onConflict: "endpoint" },
      );
      if (dbError) throw dbError;

      setState("on");
    } catch {
      setError("Couldn't turn on alerts. Try again.");
      setState("off");
    }
  }

  if (state === "checking" || state === "unsupported" || state === "on") return null;

  if (state === "denied") {
    return (
      <div className={styles.pushCard}>
        <div className={styles.pushText}>
          Notifications are blocked for this site — enable them in your browser
          settings to get boarding and arrival alerts.
        </div>
      </div>
    );
  }

  return (
    <div className={styles.pushCard}>
      <div className={styles.pushText}>
        <b>Get bus alerts on this device</b>
        {error ? ` — ${error}` : " — boarding, arrival and delay pings, even when the app is closed."}
      </div>
      <button
        type="button"
        className={styles.pushBtn}
        onClick={enable}
        disabled={state === "busy"}
      >
        {state === "busy" ? "Turning on…" : "Turn on"}
      </button>
    </div>
  );
}
