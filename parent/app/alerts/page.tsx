import screen from "../components/screen.module.css";
import styles from "./alerts.module.css";
import ScreenHeader from "../components/ScreenHeader";
import BottomNav from "../components/BottomNav";
import EmptyState from "../components/EmptyState";
import { createClient } from "@/lib/supabase/server";
import { dayLabel, getFirstName, getLinkedStudents, timeOfDay } from "@/lib/data";

export const metadata = { title: "BusBuzz — Alerts" };

type Kind = "boarded" | "approach" | "dropped" | "sos";
type Alert = { kind: Kind; title: string; text: string; time: string; unread?: boolean };

// Best-effort mapping from send-push's data.type to a feed icon.
function kindOf(type: unknown, title: string): Kind {
  const t = `${type ?? ""} ${title}`.toLowerCase();
  if (t.includes("sos") || t.includes("delay") || t.includes("breakdown")) return "sos";
  if (t.includes("board")) return "boarded";
  if (t.includes("drop")) return "dropped";
  return "approach";
}

const icon: Record<Kind, React.ReactNode> = {
  boarded: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  ),
  approach: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6" width="18" height="11" rx="2" />
      <path d="M8 17v2M16 17v2M3 11h18" />
    </svg>
  ),
  dropped: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18M5 21V10l7-5 7 5v11M9 21v-5h6v5" />
    </svg>
  ),
  sos: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
    </svg>
  ),
};

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>;
}) {
  const { demo } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const students = await getLinkedStudents(supabase, user.id);
  const firstName = students[0] ? getFirstName(students[0].name) : "Child";

  let groups: Array<{ day: string; items: Alert[] }> = [];

  if (demo !== "empty") {
    const { data: rows } = await supabase
      .from("notifications")
      .select("id, title, body, data, read_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    for (const n of rows ?? []) {
      const day = dayLabel(n.created_at);
      const item: Alert = {
        kind: kindOf((n.data as { type?: string } | null)?.type, n.title),
        title: n.title,
        text: n.body,
        time: timeOfDay(n.created_at),
        unread: n.read_at == null,
      };
      const group = groups.find((g) => g.day === day);
      if (group) group.items.push(item);
      else groups.push({ day, items: [item] });
    }

    // Everything is now seen — mark it read so the unread dots show once.
    const unreadIds = (rows ?? []).filter((n) => n.read_at == null).map((n) => n.id);
    if (unreadIds.length > 0) {
      await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .in("id", unreadIds);
    }
  }

  if (demo === "empty") groups = [];

  return (
    <main className="app">
      <ScreenHeader title="Alerts" kicker="Boarding · arrivals · delays" />

      {groups.length === 0 && (
        <EmptyState
          title="Nothing yet"
          text="Boarding, arrival and delay alerts land here the moment they happen."
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.7 21a2 2 0 01-3.4 0" />
            </svg>
          }
        />
      )}

      {groups.map((g) => (
        <section key={g.day}>
          <div className={screen.sectionLabel}>{g.day}</div>
          {g.items.map((a, i) => (
            <div key={i} className={a.kind === "sos" ? `${styles.item} ${styles.sosRow}` : styles.item}>
              <div className={`${styles.dot} ${styles[a.kind]}`}>{icon[a.kind]}</div>
              <div className={styles.body}>
                <div className={styles.head}>
                  <div className={styles.title}>{a.title}</div>
                  <div className={styles.time}>{a.time}</div>
                </div>
                <div className={styles.text}>{a.text}</div>
              </div>
              {a.unread && <span className={styles.unread} />}
            </div>
          ))}
        </section>
      ))}

      <BottomNav active="alerts" childName={firstName} />
    </main>
  );
}
