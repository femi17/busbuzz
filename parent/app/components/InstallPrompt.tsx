"use client";

import { useEffect, useState } from "react";

/**
 * iOS "Add to Home Screen" nudge. iOS only delivers Web Push to PWAs that
 * have been installed to the home screen, and Safari can't auto-prompt — so
 * we show a clear instruction card, but only on iOS and only when the app
 * isn't already running standalone.
 */
export default function InstallPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) &&
      !(window as unknown as { MSStream?: unknown }).MSStream;
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setShow(isIOS && !isStandalone);
  }, []);

  if (!show) return null;

  return (
    <div
      style={{
        marginTop: "auto",
        background: "#fff",
        border: "1.5px dashed var(--danfo)",
        borderRadius: 18,
        padding: 16,
        display: "flex",
        alignItems: "center",
        gap: 14,
      }}
    >
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: 12,
          background: "rgba(244,176,26,.16)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#D9930A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="2" width="14" height="20" rx="3" />
          <path d="M12 18h.01" />
        </svg>
      </div>
      <div>
        <div style={{ fontFamily: "var(--display)", fontSize: 14, fontWeight: 700, color: "var(--asphalt)" }}>
          Add BusBuzz to your Home Screen
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2, lineHeight: 1.4 }}>
          Tap <b style={{ color: "var(--danfo-deep)" }}>Share ↑</b> then{" "}
          <b style={{ color: "var(--danfo-deep)" }}>Add to Home Screen</b> to get arrival alerts on iPhone.
        </div>
      </div>
    </div>
  );
}
