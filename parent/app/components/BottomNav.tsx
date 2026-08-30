import styles from "./BottomNav.module.css";

type Tab = "track" | "history" | "alerts" | "child";

const cx = (on: boolean) => (on ? styles.on : undefined);

/**
 * The persistent parent-app tab bar. `active` highlights the current tab;
 * `childName` labels the last tab with the tracked student's first name.
 * `childId` keeps the selected child stable across tabs (?child= is read
 * by every screen). Rendered on every primary screen so navigation stays
 * put as you move between Track, History, Alerts and the child profile.
 */
export default function BottomNav({
  active,
  childName = "Child",
  childId,
}: {
  active: Tab;
  childName?: string;
  childId?: string;
}) {
  const q = childId ? `?child=${childId}` : "";
  return (
    <nav className={styles.nav} aria-label="Primary">
      <a className={cx(active === "track")} href={`/${q}`} aria-current={active === "track" ? "page" : undefined}>
        <svg className={styles.ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 20l-5.4 1.4a1 1 0 01-1.2-1.3l2.4-8A1 1 0 016 11h12a1 1 0 011 1l2.4 8a1 1 0 01-1.2 1.3L15 20" />
          <path d="M9 20V9a3 3 0 013-3v0a3 3 0 013 3v11" />
        </svg>
        Track
      </a>
      <a className={cx(active === "history")} href={`/history${q}`} aria-current={active === "history" ? "page" : undefined}>
        <svg className={styles.ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 8v4l3 2" />
          <circle cx="12" cy="12" r="9" />
        </svg>
        History
      </a>
      <a className={cx(active === "alerts")} href={`/alerts${q}`} aria-current={active === "alerts" ? "page" : undefined}>
        <svg className={styles.ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 01-3.4 0" />
        </svg>
        Alerts
      </a>
      <a className={cx(active === "child")} href={`/child${q}`} aria-current={active === "child" ? "page" : undefined}>
        <svg className={styles.ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
        </svg>
        {childName}
      </a>
    </nav>
  );
}
