import styles from "./screen.module.css";

/**
 * Back-arrow + title header shared by the secondary screens. `href` defaults
 * to the Track hero so the back affordance always returns somewhere sensible.
 */
export default function ScreenHeader({
  title,
  kicker,
  href = "/",
}: {
  title: string;
  kicker?: string;
  href?: string;
}) {
  return (
    <header className={styles.top}>
      <a className={styles.back} href={href} aria-label="Back">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </a>
      <div className={styles.titles}>
        {kicker && <div className={styles.kicker}>{kicker}</div>}
        <h1>{title}</h1>
      </div>
    </header>
  );
}
