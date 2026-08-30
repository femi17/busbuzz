import styles from "./route.module.css";
import ScreenHeader from "../components/ScreenHeader";
import BottomNav from "../components/BottomNav";
import EmptyState from "../components/EmptyState";
import { createClient } from "@/lib/supabase/server";
import { getFirstName, getLinkedStudents, getTrackBundle, timeOfDay } from "@/lib/data";
import { haversineDistance } from "@/lib/geo";

export const metadata = { title: "BusBuzz — Route" };

const APPROACH_RADIUS_M = 300;

type StopState = "done" | "here" | "mine" | "upcoming";

export default async function RoutePage({
  searchParams,
}: {
  searchParams: Promise<{ child?: string }>;
}) {
  const { child } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const students = await getLinkedStudents(supabase, user.id);
  const student = students.find((s) => s.id === child) ?? students[0];
  const bundle = student ? await getTrackBundle(supabase, student.id) : null;
  const stops = bundle?.stops ?? [];
  const firstName = student ? getFirstName(student.name) : "Child";

  if (!student || stops.length === 0) {
    return (
      <main className="app">
        <ScreenHeader title="All stops" kicker={bundle?.routeName ?? "Route"} />
        <EmptyState
          title="No route yet"
          text="Once the school assigns a route with stops, the full line shows up here."
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19c4 0 4-14 8-14s4 14 8 14" />
            </svg>
          }
        />
        <BottomNav active="track" childName={firstName} childId={student?.id} />
      </main>
    );
  }

  // Live overlay: with an active trip, work out which stops the bus has
  // already passed (same GPS-proximity rule as the Track screen) and how
  // many students are currently on board.
  const reached: Record<string, string> = {};
  let hereStopId: string | null = null;
  let onBoard: number | null = null;
  let tripStartedAt: string | null = null;

  if (bundle?.activeTrip) {
    const [{ data: tripRow }, { data: points }, { count }] = await Promise.all([
      supabase.from("trips").select("started_at").eq("id", bundle.activeTrip.id).single(),
      supabase
        .from("trip_locations")
        .select("latitude, longitude, recorded_at")
        .eq("trip_id", bundle.activeTrip.id)
        .order("recorded_at"),
      supabase
        .from("attendance")
        .select("id", { count: "exact", head: true })
        .eq("trip_id", bundle.activeTrip.id)
        .eq("status", "BOARDED"),
    ]);

    tripStartedAt = tripRow?.started_at ?? null;
    onBoard = count ?? null;

    for (const stop of stops) {
      for (const p of points ?? []) {
        if (
          haversineDistance(p.latitude, p.longitude, stop.latitude, stop.longitude) <
          APPROACH_RADIUS_M
        ) {
          reached[stop.id] = p.recorded_at;
          break;
        }
      }
    }

    const last = (points ?? [])[Math.max(0, (points ?? []).length - 1)];
    if (last) {
      const unreached = stops.filter((s) => !reached[s.id]);
      let best: (typeof stops)[number] | null = null;
      let bestD = Infinity;
      for (const s of unreached) {
        const d = haversineDistance(last.latitude, last.longitude, s.latitude, s.longitude);
        if (d < bestD) {
          best = s;
          bestD = d;
        }
      }
      hereStopId = best?.id ?? null;
    }
  }

  // Scheduled clock time for a stop: trip start + the stop's eta_minutes.
  function scheduledEta(etaMinutes: number | null): string | null {
    if (etaMinutes == null) return null;
    if (!tripStartedAt) return `~${etaMinutes} min from start`;
    const t = new Date(new Date(tripStartedAt).getTime() + etaMinutes * 60_000);
    return `ETA ${t.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }

  const rows = stops.map((s, i) => {
    const state: StopState =
      s.id === student.stopId
        ? "mine"
        : reached[s.id]
          ? "done"
          : s.id === hereStopId
            ? "here"
            : "upcoming";
    const meta =
      state === "mine"
        ? `${student.name} · ${student.className}`
        : reached[s.id]
          ? `Passed ${timeOfDay(reached[s.id])}`
          : state === "here"
            ? "Bus heading here"
            : scheduledEta(s.etaMinutes) ?? `Stop ${i + 1}`;
    return { seq: i + 1, name: s.name, meta, state };
  });

  const total = rows.length;
  const done = rows.filter((r) => reached[stops[r.seq - 1].id]).length;
  const hereIdx = rows.findIndex((r) => r.state === "here");
  const progress = total > 1 ? ((hereIdx >= 0 ? hereIdx : done) / (total - 1)) * 100 : 0;

  const lastStop = stops[stops.length - 1];
  const finalEta = bundle?.activeTrip
    ? scheduledEta(lastStop?.etaMinutes ?? null)?.replace("ETA ", "") ?? "—"
    : "—";

  const kicker = [bundle?.routeName, bundle?.routeType?.toLowerCase()]
    .filter(Boolean)
    .join(" · ");

  return (
    <main className="app">
      <ScreenHeader title="All stops" kicker={kicker || "Route"} />

      <div className={styles.summary}>
        <div className={styles.stat}>
          <div className={styles.num}>{done}/{total}</div>
          <div className={styles.lbl}>Stops done</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.num}>{finalEta}</div>
          <div className={styles.lbl}>Final ETA</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.num}>{onBoard ?? "—"}</div>
          <div className={styles.lbl}>On board</div>
        </div>
      </div>

      <div className={styles.line}>
        <div className={styles.rail}>
          <div className={styles.railDone} style={{ height: `${progress}%` }} />
        </div>
        {rows.map((s) => (
          <RouteStop key={s.seq} {...s} />
        ))}
      </div>

      <BottomNav active="track" childName={firstName} childId={student?.id} />
    </main>
  );
}

function RouteStop({
  seq,
  name,
  meta,
  state,
}: {
  seq: number;
  name: string;
  meta: string;
  state: StopState;
}) {
  const cls = [
    styles.stop,
    state === "done" && styles.done,
    state === "here" && styles.here,
    state === "mine" && styles.mine,
    state === "upcoming" && styles.upcoming,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cls}>
      <div className={styles.node}>
        {state === "here" && (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="6" width="18" height="11" rx="2" fill="#1A1712" />
            <rect x="5" y="8" width="5" height="4" fill="#F4B01A" />
            <rect x="14" y="8" width="5" height="4" fill="#F4B01A" />
            <circle cx="8" cy="18" r="2" fill="#1A1712" />
            <circle cx="16" cy="18" r="2" fill="#1A1712" />
          </svg>
        )}
      </div>
      <div className={styles.body}>
        <div className={styles.name}>{name}</div>
        <div className={styles.meta}>{meta}</div>
      </div>
      {state === "here" ? (
        <span className={`${styles.tag} ${styles.tagNow}`}>bus here</span>
      ) : state === "mine" ? (
        <span className={`${styles.tag} ${styles.tagMine}`}>your stop</span>
      ) : (
        <span className={styles.seq}>{String(seq).padStart(2, "0")}</span>
      )}
    </div>
  );
}
