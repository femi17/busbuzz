import styles from "./track.module.css";
import CountdownBoard from "./components/CountdownBoard";
import LiveMap from "./components/LiveMap";
import BottomNav from "./components/BottomNav";
import TrackLive from "./components/TrackLive";
import EmptyState from "./components/EmptyState";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLinkedStudents, getTrackBundle } from "@/lib/data";

export default async function TrackPage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string; child?: string }>;
}) {
  const { demo, child } = await searchParams;

  // Design previews (see README) — kept so the screens stay reviewable
  // without a live trip: /?demo=active and /?demo=idle.
  if (demo === "idle") return <DemoIdleTrack />;
  if (demo === "active") return <DemoActiveTrack />;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null; // proxy.ts redirects before this can render

  const [{ data: profile }, students] = await Promise.all([
    supabase
      .from("profiles")
      .select("name, onboarding_completed")
      .eq("id", user.id)
      .single(),
    getLinkedStudents(supabase, user.id),
  ]);

  // First sign-in: confirm the linked children before anything else.
  if (profile && profile.onboarding_completed === false) {
    redirect("/onboarding");
  }

  if (students.length === 0) {
    return (
      <main className="app">
        <header className={styles.greet}>
          <div>
            <h1>Welcome{profile?.name ? `, ${profile.name.split(" ")[0]}` : ""}</h1>
            <div className={styles.sub}>BusBuzz</div>
          </div>
        </header>
        <EmptyState
          title="No children linked yet"
          text="Your school links your children to your account. Ask the school admin to add them — they'll appear here right away."
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
            </svg>
          }
        />
        <BottomNav active="track" />
      </main>
    );
  }

  const selected = students.find((s) => s.id === child) ?? students[0];
  const bundle = await getTrackBundle(supabase, selected.id);

  return (
    <TrackLive
      key={selected.id}
      parentName={profile?.name ?? "there"}
      student={selected}
      students={students.map((s) => ({ id: s.id, name: s.name, photoUrl: s.photoUrl }))}
      initialBundle={bundle}
    />
  );
}

// --- Demo renders (match /design/mockups) — preview-only via ?demo= ---

const trip = {
  parentName: "Ada",
  studentName: "Chidi",
  studentInitial: "A",
  routeLabel: "ROUTE 3 MORNING",
  etaSeconds: 252, // 04:12
  stopName: "Lekki Phase 1 Gate",
  speedKmh: 32,
  bus: [3.4712, 6.4315] as [number, number],
  destination: [3.4785, 6.4402] as [number, number],
  stops: [
    { name: "School Gate", meta: "DEPARTED 7:58", state: "done" },
    { name: "Admiralty Way", meta: "7 boarded", state: "done" },
    { name: "Between stops", meta: "2.1 km to next", state: "bus" },
    { name: "Lekki Phase 1 Gate", meta: "CHIDI OKAFOR · JSS1", state: "mine" },
    { name: "Chevron Drive", meta: "ETA 8:26", state: "upcoming" },
  ] as const,
};

const idle = {
  greeting: "Good afternoon",
  nextRunTime: "3:15 PM",
  nextRunLabel: "Afternoon run home",
  nextRunStop: "School Gate",
  lastTrip: "Dropped at school 8:47 AM — on time",
  schedule: [
    { time: "7:30 AM", name: "Morning pickup", state: "done" as const },
    { time: "3:15 PM", name: "Afternoon run home", state: "next" as const },
  ],
};

function DemoActiveTrack() {
  return (
    <main className="app">
      <header className={styles.greet}>
          <div>
            <h1>Good morning, {trip.parentName}</h1>
            <div className={styles.sub}>{trip.studentName}&apos;s bus is on the way</div>
          </div>
          <div className={styles.avatar}>{trip.studentInitial}</div>
        </header>

        <CountdownBoard
          etaSeconds={trip.etaSeconds}
          stopName={trip.stopName}
          studentName={trip.studentName}
        />

        <LiveMap
          bus={trip.bus}
          destination={trip.destination}
          speedKmh={trip.speedKmh}
          updatedAt={Date.now()}
        />

        <div className={styles.linehead}>
          <h2>THE LINE · {trip.routeLabel}</h2>
          <a href="/route">All stops</a>
        </div>

        <div className={styles.spine}>
          <div className={styles.rail}>
            <div className={styles.railDone} />
          </div>

          {trip.stops.map((s, i) => (
            <RouteStop key={i} {...s} />
          ))}
        </div>

      <BottomNav active="track" childName={trip.studentName} />
    </main>
  );
}

function DemoIdleTrack() {
  return (
    <main className="app">
      <header className={styles.greet}>
        <div>
          <h1>{idle.greeting}, {trip.parentName}</h1>
          <div className={styles.sub}>No bus running right now</div>
        </div>
        <div className={styles.avatar}>{trip.studentInitial}</div>
      </header>

      <section className={styles.idle}>
        <div className={styles.idleEye}>
          <span className={styles.idleDot} />
          Next run
        </div>
        <div className={styles.idleTime}>{idle.nextRunTime}</div>
        <div className={styles.idleWhere}>
          {idle.nextRunLabel} · from <b>{idle.nextRunStop}</b>
        </div>
        <div className={styles.idleNote}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.7 21a2 2 0 01-3.4 0" />
          </svg>
          We&apos;ll ping you the moment the bus starts moving.
        </div>

        <div className={styles.recap}>
          <div className={styles.recapIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <div className={styles.recapText}>
            <b>This morning:</b> {idle.lastTrip}
          </div>
        </div>
      </section>

      <div className={styles.linehead}>
        <h2>TODAY&apos;S SCHEDULE</h2>
        <a href="/history">History</a>
      </div>

      <div className={styles.sched}>
        {idle.schedule.map((r, i) => (
          <div key={i} className={`${styles.schedRow} ${r.state === "done" ? styles.past : ""}`}>
            <span className={styles.schedTime}>{r.time}</span>
            <span className={styles.schedName}>{r.name}</span>
            {r.state === "done" ? (
              <span className={`${styles.schedTag} ${styles.schedDone}`}>done</span>
            ) : (
              <span className={`${styles.schedTag} ${styles.schedNext}`}>up next</span>
            )}
          </div>
        ))}
      </div>

      <BottomNav active="track" childName={trip.studentName} />
    </main>
  );
}

function RouteStop({
  name,
  meta,
  state,
}: {
  name: string;
  meta: string;
  state: "done" | "bus" | "mine" | "upcoming";
}) {
  const rowClass = [
    styles.stop,
    state === "done" && styles.done,
    state === "bus" && styles.busStop,
    state === "mine" && styles.mine,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rowClass}>
      <div className={styles.node}>
        {state === "bus" && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="6" width="18" height="11" rx="2" fill="#1A1712" />
            <rect x="5" y="8" width="5" height="4" fill="#F4B01A" />
            <rect x="14" y="8" width="5" height="4" fill="#F4B01A" />
            <circle cx="8" cy="18" r="2" fill="#1A1712" />
            <circle cx="16" cy="18" r="2" fill="#1A1712" />
          </svg>
        )}
      </div>
      <div className={styles.txt}>
        <span className={state === "upcoming" ? `${styles.name} ${styles.dim}` : styles.name}>
          {name}
        </span>
        <span className={styles.meta}>{meta}</span>
      </div>
      {state === "done" && <span className={`${styles.tag} ${styles.tagDone}`}>done</span>}
      {state === "bus" && <span className={`${styles.tag} ${styles.tagNow}`}>bus here</span>}
      {state === "mine" && <span className={`${styles.tag} ${styles.tagMine}`}>your stop</span>}
    </div>
  );
}
