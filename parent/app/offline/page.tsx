export const metadata = { title: "BusBuzz — Offline" };

/**
 * Served by sw.js when a navigation fails with no network. Static and
 * data-free on purpose (it's excluded from the auth gate in proxy.ts so
 * the service worker can cache a real 200, not a login redirect).
 */
export default function OfflinePage() {
  return (
    <main className="app" style={{ textAlign: "center", paddingTop: 80 }}>
      <div
        style={{
          width: 72,
          height: 72,
          margin: "0 auto 18px",
          borderRadius: 22,
          background: "#1A1712",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#F4B01A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M1 1l22 22" />
          <path d="M16.7 11.6A6.5 6.5 0 0119 16.5" />
          <path d="M5 12.5a10 10 0 0111.4-1.9" />
          <path d="M8.5 16a5 5 0 017 0" />
          <circle cx="12" cy="20" r="1" fill="#F4B01A" stroke="none" />
        </svg>
      </div>
      <h1 style={{ fontFamily: "var(--display)", fontSize: 22, fontWeight: 800, letterSpacing: "-0.01em" }}>
        You&apos;re offline
      </h1>
      <p style={{ fontSize: 14, color: "var(--muted)", marginTop: 8, lineHeight: 1.5 }}>
        The bus keeps being tracked — reconnect to catch up.
      </p>
      <a
        href="/"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          height: 48,
          padding: "0 26px",
          marginTop: 22,
          borderRadius: 14,
          background: "#F4B01A",
          color: "#1A1712",
          fontFamily: "var(--display)",
          fontWeight: 700,
          fontSize: 15,
          textDecoration: "none",
        }}
      >
        Try again
      </a>
    </main>
  );
}
