import styles from "./screen.module.css";

/**
 * Neutral empty state shared by History / Alerts (and any future list screen)
 * for the common "nothing here yet" case — a school that just onboarded, or a
 * parent opening the app before the first trip has ever run.
 */
export default function EmptyState({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyIcon}>{icon}</div>
      <div className={styles.emptyTitle}>{title}</div>
      <p className={styles.emptyText}>{text}</p>
    </div>
  );
}
