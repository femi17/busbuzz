import screen from "../components/screen.module.css";
import styles from "./history.module.css";
import ScreenHeader from "../components/ScreenHeader";
import BottomNav from "../components/BottomNav";
import EmptyState from "../components/EmptyState";
import { createClient } from "@/lib/supabase/server";
import { dayLabel, getFirstName, getLinkedStudents, timeOfDay } from "@/lib/data";

export const metadata = { title: "BusBuzz — History" };

type Run = "morning" | "afternoon";
type Status = "completed" | "boarded" | "absent" | "none";

const label: Record<Status, string> = {
  completed: "Completed",
  boarded: "Boarded",
  absent: "Absent",
  none: "No record",
};
// Reuse the mockup's badge palettes: green for a completed ride, red for
// absent, muted for anything in between.
const badgeClass: Record<Status, string> = {
  completed: "onTime",
  boarded: "late",
  absent: "absent",
  none: "late",
};

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string; child?: string }>;
}) {
  const { demo, child } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const students = await getLinkedStudents(supabase, user.id);
  const student = students.find((s) => s.id === child) ?? students[0];
  const firstName = student ? getFirstName(student.name) : "Child";

  let groups: Array<{
    day: string;
    trips: Array<{ id: string; run: Run; route: string; text: string; status: Status }>;
  }> = [];

  if (student?.routeId && demo !== "empty") {
    const monthAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const { data: trips } = await supabase
      .from("trips")
      .select("id, direction, started_at, routes(name)")
      .eq("route_id", student.routeId)
      .eq("status", "COMPLETED")
      .gte("started_at", monthAgo.toISOString())
      .order("started_at", { ascending: false })
      .limit(40);

    const tripRows = (trips ?? []) as unknown as Array<{
      id: string;
      direction: string | null;
      started_at: string;
      routes: { name: string } | null;
    }>;

    const attendanceByTrip = new Map<string, { status: string; marked_at: string }>();
    if (tripRows.length > 0) {
      const { data: att } = await supabase
        .from("attendance")
        .select("trip_id, status, marked_at")
        .eq("student_id", student.id)
        .in("trip_id", tripRows.map((t) => t.id));
      for (const a of att ?? []) {
        attendanceByTrip.set(a.trip_id, { status: a.status, marked_at: a.marked_at });
      }
    }

    for (const t of tripRows) {
      const run: Run =
        t.direction === "AFTERNOON" ||
        (t.direction == null && new Date(t.started_at).getHours() >= 12)
          ? "afternoon"
          : "morning";
      const att = attendanceByTrip.get(t.id);

      const status: Status = !att
        ? "none"
        : att.status === "ABSENT"
          ? "absent"
          : att.status === "DROPPED_OFF"
            ? "completed"
            : "boarded";

      const text =
        status === "absent"
          ? "Marked absent — didn't ride"
          : status === "none"
            ? "No attendance recorded"
            : status === "completed"
              ? run === "morning"
                ? `Dropped at school ${timeOfDay(att!.marked_at)}`
                : `Dropped at home ${timeOfDay(att!.marked_at)}`
              : `Boarded ${timeOfDay(att!.marked_at)}`;

      const day = dayLabel(t.started_at);
      const routeName = `${t.routes?.name ?? student.routeName ?? "Route"} · ${
        run === "morning" ? "Morning" : "Afternoon"
      }`;

      const group = groups.find((g) => g.day === day);
      const row = { id: t.id, run, route: routeName, text, status };
      if (group) group.trips.push(row);
      else groups.push({ day, trips: [row] });
    }
  }

  if (demo === "empty") groups = [];

  return (
    <main className="app">
      <ScreenHeader
        title="Trip history"
        kicker={student ? `${firstName}${student.routeName ? ` · ${student.routeName}` : ""}` : "History"}
      />

      {groups.length === 0 && (
        <EmptyState
          title="No trips yet"
          text="Once the bus completes its first run, every boarding and drop-off shows up here."
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 8v4l3 2" />
              <circle cx="12" cy="12" r="9" />
            </svg>
          }
        />
      )}

      {groups.map((g) => (
        <section key={g.day}>
          <div className={screen.sectionLabel}>{g.day}</div>
          {g.trips.map((t, i) => (
            // Each run links to its journey replay (map + scrubbable timeline).
            <a key={i} href={`/history/${t.id}?child=${student!.id}`} className={`${styles.trip} ${styles.tripLink}`}>
              <div className={`${styles.icon} ${styles[t.run]}`}>
                {t.run === "morning" ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />
                  </svg>
                )}
              </div>
              <div className={styles.body}>
                <div className={styles.route}>{t.route}</div>
                <div className={styles.times}>
                  <span>{t.text}</span>
                </div>
              </div>
              <span className={`${styles.badge} ${styles[badgeClass[t.status]]}`}>
                {label[t.status]}
              </span>
            </a>
          ))}
        </section>
      ))}

      <BottomNav active="history" childName={firstName} childId={student?.id} />
    </main>
  );
}
