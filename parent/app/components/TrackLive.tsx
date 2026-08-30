"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import styles from "../track.module.css";
import CountdownBoard from "./CountdownBoard";
import LiveMap from "./LiveMap";
import BottomNav from "./BottomNav";
import { createClient } from "@/lib/supabase/client";
import { estimateETA, haversineDistance } from "@/lib/geo";
import {
  getFirstName,
  getInitials,
  type LinkedStudent,
  type TrackBundle,
} from "@/lib/data";

const APPROACH_RADIUS_M = 300;
const POLL_INTERVAL_MS = 30000;
const MAX_BREADCRUMB_POINTS = 500;
// ETA fallback while the bus reports ~zero speed (red light, pause at a
// stop) so the countdown doesn't blank out — typical Lagos street speed.
const FALLBACK_SPEED_KMH = 20;
const MOVING_SPEED_KMH = 5;

type TripInfo = { id: string; busId: string; routeId: string; hasSos: boolean };
type AttendanceStatus = "BOARDED" | "ABSENT" | "DROPPED_OFF" | null;

type IdleInfo = {
  morningDone: boolean;
  afternoonDone: boolean;
  lastRun: {
    direction: "MORNING" | "AFTERNOON";
    attendance: AttendanceStatus;
    markedAt: string | null;
  } | null;
  typicalStart: { MORNING: string | null; AFTERNOON: string | null };
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function timeLabel(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function TrackLive({
  parentName,
  student,
  students,
  initialBundle,
}: {
  parentName: string;
  student: LinkedStudent;
  students: Array<{ id: string; name: string }>;
  initialBundle: TrackBundle | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const bundle = initialBundle;

  const [trip, setTrip] = useState<TripInfo | null>(bundle?.activeTrip ?? null);
  const [attendance, setAttendance] = useState<AttendanceStatus>(
    bundle?.attendanceStatus ?? null,
  );
  const [busPos, setBusPos] = useState<{ lat: number; lng: number } | null>(null);
  const [busSpeedKmh, setBusSpeedKmh] = useState<number | null>(null);
  const [busUpdatedAt, setBusUpdatedAt] = useState<number | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<Array<[number, number]>>([]);
  const [reachedStops, setReachedStops] = useState<Record<string, string>>({});
  const [idleInfo, setIdleInfo] = useState<IdleInfo | null>(null);

  const currentTripIdRef = useRef<string | null>(bundle?.activeTrip?.id ?? null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const stops = useMemo(() => bundle?.stops ?? [], [bundle]);
  const stopsRef = useRef(stops);
  stopsRef.current = stops;

  const loadIdleInfo = useCallback(async () => {
    if (!student.routeId) {
      setIdleInfo({
        morningDone: false,
        afternoonDone: false,
        lastRun: null,
        typicalStart: { MORNING: null, AFTERNOON: null },
      });
      return;
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 3600 * 1000);

    const { data: recent } = await supabase
      .from("trips")
      .select("id, direction, started_at")
      .eq("route_id", student.routeId)
      .eq("status", "COMPLETED")
      .gte("started_at", twoWeeksAgo.toISOString())
      .order("started_at", { ascending: false })
      .limit(30);

    const rows = (recent ?? []).map((t) => ({
      id: t.id as string,
      startedAt: t.started_at as string,
      direction: (t.direction === "MORNING" || t.direction === "AFTERNOON"
        ? t.direction
        : new Date(t.started_at).getHours() < 12
          ? "MORNING"
          : "AFTERNOON") as "MORNING" | "AFTERNOON",
    }));

    const todayRows = rows.filter((t) => new Date(t.startedAt) >= todayStart);
    const lastToday = todayRows[0] ?? null;

    let lastRun: IdleInfo["lastRun"] = null;
    if (lastToday) {
      const { data: att } = await supabase
        .from("attendance")
        .select("status, marked_at")
        .eq("trip_id", lastToday.id)
        .eq("student_id", student.id)
        .maybeSingle();
      lastRun = {
        direction: lastToday.direction,
        attendance: (att?.status as AttendanceStatus) ?? null,
        markedAt: att?.marked_at ?? null,
      };
    }

    setIdleInfo({
      morningDone: todayRows.some((t) => t.direction === "MORNING"),
      afternoonDone: todayRows.some((t) => t.direction === "AFTERNOON"),
      lastRun,
      typicalStart: {
        MORNING: rows.find((t) => t.direction === "MORNING")?.startedAt ?? null,
        AFTERNOON: rows.find((t) => t.direction === "AFTERNOON")?.startedAt ?? null,
      },
    });
  }, [supabase, student.routeId, student.id]);

  useEffect(() => {
    let mounted = true;

    function clearTripState() {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      currentTripIdRef.current = null;
      setTrip(null);
      setAttendance(null);
      setBusPos(null);
      setBusSpeedKmh(null);
      setBusUpdatedAt(null);
      setBreadcrumb([]);
      setReachedStops({});
    }

    // Rebuild the trail + reached-stop log from trip_locations. Seeds a
    // freshly opened trip and catches up after the tab was hidden —
    // broadcasts aren't queued while the socket is disconnected.
    async function resyncTripHistory(tripId: string) {
      const { data: rows } = await supabase
        .from("trip_locations")
        .select("latitude, longitude, recorded_at")
        .eq("trip_id", tripId)
        .order("recorded_at");
      if (!mounted || !rows) return;

      setBreadcrumb(
        rows.slice(-MAX_BREADCRUMB_POINTS).map((p) => [p.longitude, p.latitude]),
      );
      const last = rows[rows.length - 1];
      if (last) {
        setBusPos({ lat: last.latitude, lng: last.longitude });
        setBusUpdatedAt(new Date(last.recorded_at).getTime());
      }

      const reached: Record<string, string> = {};
      for (const stop of stopsRef.current) {
        for (const p of rows) {
          if (
            haversineDistance(p.latitude, p.longitude, stop.latitude, stop.longitude) <
            APPROACH_RADIUS_M
          ) {
            reached[stop.id] = p.recorded_at;
            break;
          }
        }
      }
      // Live broadcasts win — their timestamps are more precise.
      setReachedStops((prev) => ({ ...reached, ...prev }));
    }

    async function subscribeToTrip(loadedTrip: TripInfo) {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      // Private channel — Realtime Authorization limits bus:{busId} to this
      // bus's parents/driver/admins; the parent's session token authorizes.
      await supabase.realtime.setAuth();
      const channel = supabase.channel(`bus:${loadedTrip.busId}`, {
        config: { private: true },
      });
      channelRef.current = channel;

      channel
        .on("broadcast", { event: "location_update" }, (msg) => {
          if (!mounted) return;
          const p = msg.payload as { lat: number; lng: number; speed: number };
          setBusPos({ lat: p.lat, lng: p.lng });
          setBusSpeedKmh(p.speed);
          setBusUpdatedAt(Date.now());
          setBreadcrumb((prev) => {
            const next: Array<[number, number]> = [...prev, [p.lng, p.lat]];
            return next.length > MAX_BREADCRUMB_POINTS
              ? next.slice(-MAX_BREADCRUMB_POINTS)
              : next;
          });

          for (const stop of stopsRef.current) {
            if (
              haversineDistance(p.lat, p.lng, stop.latitude, stop.longitude) <
              APPROACH_RADIUS_M
            ) {
              setReachedStops((prev) =>
                prev[stop.id] ? prev : { ...prev, [stop.id]: new Date().toISOString() },
              );
            }
          }
        })
        .on("broadcast", { event: "student_boarded" }, (msg) => {
          const p = msg.payload as { studentId: string };
          if (mounted && p.studentId === student.id) setAttendance("BOARDED");
        })
        .on("broadcast", { event: "student_dropped" }, (msg) => {
          const p = msg.payload as { studentId: string };
          if (mounted && p.studentId === student.id) setAttendance("DROPPED_OFF");
        })
        .on("broadcast", { event: "trip_ended" }, (msg) => {
          const p = msg.payload as { tripId: string };
          if (mounted && p.tripId === currentTripIdRef.current) {
            clearTripState();
            loadIdleInfo();
          }
        })
        .subscribe();
    }

    async function checkForActiveTrip() {
      if (!student.routeId) return;

      const { data: tripData } = await supabase
        .from("trips")
        .select("id, bus_id, route_id, status, has_sos")
        .eq("route_id", student.routeId)
        .eq("status", "ACTIVE")
        .maybeSingle();
      if (!mounted) return;

      if (!tripData) {
        if (currentTripIdRef.current) clearTripState();
        setTrip(null);
        loadIdleInfo();
        return;
      }

      const loaded: TripInfo = {
        id: tripData.id,
        busId: tripData.bus_id,
        routeId: tripData.route_id,
        hasSos: tripData.has_sos ?? false,
      };
      setTrip(loaded);

      if (currentTripIdRef.current !== loaded.id) {
        currentTripIdRef.current = loaded.id;
        setBreadcrumb([]);
        setReachedStops({});
        await resyncTripHistory(loaded.id);
        if (!mounted) return;
        await subscribeToTrip(loaded);
      }

      const { data: att } = await supabase
        .from("attendance")
        .select("status")
        .eq("trip_id", loaded.id)
        .eq("student_id", student.id)
        .maybeSingle();
      if (mounted && att) setAttendance(att.status as AttendanceStatus);
    }

    // The server already told us about an active trip — subscribe straight
    // away rather than waiting for the first poll to rediscover it.
    if (bundle?.activeTrip) {
      currentTripIdRef.current = bundle.activeTrip.id;
      resyncTripHistory(bundle.activeTrip.id);
      subscribeToTrip(bundle.activeTrip);
    } else {
      currentTripIdRef.current = null;
      loadIdleInfo();
    }

    const pollId = setInterval(checkForActiveTrip, POLL_INTERVAL_MS);

    // Catch up the moment the tab becomes visible again — the socket drops
    // in background tabs and broadcasts sent meanwhile are gone for good.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      checkForActiveTrip();
      if (currentTripIdRef.current) resyncTripHistory(currentTripIdRef.current);
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      mounted = false;
      clearInterval(pollId);
      document.removeEventListener("visibilitychange", onVisible);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
    // Everything is keyed to the student; a child switch remounts via key=.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student.id]);

  // ── Derived tracking state ──────────────────────────────────────────

  // Countdown target: the child's stop until they board; once boarded on a
  // school-bound run, the school — that's the arrival the parent awaits.
  const target =
    attendance === "BOARDED" &&
    bundle?.routeType !== "AFTERNOON" &&
    student.schoolLat != null &&
    student.schoolLng != null
      ? {
          name: student.schoolName ?? "school",
          latitude: student.schoolLat,
          longitude: student.schoolLng,
        }
      : bundle?.assignedStop ?? null;

  const distanceToTarget =
    target && busPos
      ? haversineDistance(busPos.lat, busPos.lng, target.latitude, target.longitude)
      : null;

  const etaSeconds =
    distanceToTarget != null
      ? estimateETA(
          distanceToTarget,
          busSpeedKmh != null && busSpeedKmh > MOVING_SPEED_KMH
            ? busSpeedKmh
            : FALLBACK_SPEED_KMH,
        )
      : null;

  const firstName = getFirstName(student.name);
  const reachedCount = stops.filter((s) => reachedStops[s.id]).length;

  // Which stop the bus is heading to: nearest unreached to its position.
  const nextStopId = useMemo(() => {
    const unreached = stops.filter((s) => !reachedStops[s.id]);
    if (unreached.length === 0) return null;
    if (!busPos) return unreached[0].id;
    let best = unreached[0];
    let bestD = haversineDistance(busPos.lat, busPos.lng, best.latitude, best.longitude);
    for (const s of unreached.slice(1)) {
      const d = haversineDistance(busPos.lat, busPos.lng, s.latitude, s.longitude);
      if (d < bestD) {
        best = s;
        bestD = d;
      }
    }
    return best.id;
  }, [stops, reachedStops, busPos]);

  const subLine = trip
    ? attendance === "BOARDED"
      ? `${firstName} is on the bus`
      : attendance === "DROPPED_OFF"
        ? bundle?.routeType === "AFTERNOON"
          ? `${firstName} is home`
          : `${firstName} was dropped at school`
        : `${firstName}'s bus is on the way`
    : "No bus running right now";

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <main className="app">
      <header className={styles.greet}>
        <div>
          <h1>
            {greeting()}, {getFirstName(parentName)}
          </h1>
          <div className={styles.sub}>{subLine}</div>
        </div>
        <ChildAvatar student={student} students={students} />
      </header>

      {trip?.hasSos && (
        <div className={styles.recap}>
          <div className={styles.recapIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 9v4M12 17h.01" />
            </svg>
          </div>
          <div className={styles.recapText}>
            <b>Heads up:</b> the driver reported a problem on this trip. The school has
            been notified.
          </div>
        </div>
      )}

      {trip ? (
        <ActiveView
          etaSeconds={etaSeconds}
          target={target}
          firstName={firstName}
          student={student}
          bundle={bundle}
          busPos={busPos}
          busSpeedKmh={busSpeedKmh}
          busUpdatedAt={busUpdatedAt}
          breadcrumb={breadcrumb}
          reachedStops={reachedStops}
          reachedCount={reachedCount}
          nextStopId={nextStopId}
        />
      ) : (
        <IdleView firstName={firstName} student={student} bundle={bundle} idle={idleInfo} />
      )}

      <BottomNav active="track" childName={firstName} />
    </main>
  );
}

function ChildAvatar({
  student,
  students,
}: {
  student: LinkedStudent;
  students: Array<{ id: string; name: string }>;
}) {
  // The child's actual photo when the school uploaded one (photo_url is a
  // long-lived signed URL — the photos bucket is private), else initials.
  const face = student.photoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={student.photoUrl} alt={student.name} />
  ) : (
    getInitials(student.name)[0]
  );

  // With several children the avatar cycles to the next one; the server
  // page reads ?child= and re-renders the whole tracker for that child.
  if (students.length > 1) {
    const idx = students.findIndex((s) => s.id === student.id);
    const next = students[(idx + 1) % students.length];
    return (
      <a
        className={styles.avatar}
        href={`/?child=${next.id}`}
        aria-label={`Switch to ${next.name}`}
        title={`Switch to ${next.name}`}
      >
        {face}
      </a>
    );
  }
  return <div className={styles.avatar}>{face}</div>;
}

function ActiveView({
  etaSeconds,
  target,
  firstName,
  student,
  bundle,
  busPos,
  busSpeedKmh,
  busUpdatedAt,
  breadcrumb,
  reachedStops,
  reachedCount,
  nextStopId,
}: {
  etaSeconds: number | null;
  target: { name: string; latitude: number; longitude: number } | null;
  firstName: string;
  student: LinkedStudent;
  bundle: TrackBundle | null;
  busPos: { lat: number; lng: number } | null;
  busSpeedKmh: number | null;
  busUpdatedAt: number | null;
  breadcrumb: Array<[number, number]>;
  reachedStops: Record<string, string>;
  reachedCount: number;
  nextStopId: string | null;
}) {
  const stops = bundle?.stops ?? [];
  const routeLabel = [bundle?.routeName, bundle?.routeType]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();

  return (
    <>
      {etaSeconds != null && Number.isFinite(etaSeconds) && target ? (
        <CountdownBoard
          etaSeconds={Math.round(etaSeconds)}
          stopName={target.name}
          studentName={firstName}
        />
      ) : (
        <section className={styles.board} aria-live="polite">
          <div className={styles.eyebrow}>
            <span className={styles.livedot} />
            TRIP STARTED
          </div>
          <div className={styles.time}>
            --:--
            <small>min</small>
          </div>
          <div className={styles.where}>waiting for the first GPS ping…</div>
        </section>
      )}

      <LiveMap
        bus={busPos ? [busPos.lng, busPos.lat] : null}
        destination={target ? [target.longitude, target.latitude] : null}
        speedKmh={busSpeedKmh}
        breadcrumb={breadcrumb}
        updatedAt={busUpdatedAt}
      />

      <div className={styles.linehead}>
        <h2>THE LINE{routeLabel ? ` · ${routeLabel}` : ""}</h2>
        <a href="/route">All stops</a>
      </div>

      <div className={styles.spine}>
        <div className={styles.rail}>
          <div
            className={styles.railDone}
            style={{
              height: `${stops.length > 1 ? (reachedCount / stops.length) * 100 : 0}%`,
            }}
          />
        </div>

        {stops.map((s) => {
          const reachedAt = reachedStops[s.id];
          const isMine = s.id === student.stopId;
          const isNext = s.id === nextStopId;
          const state = isMine ? "mine" : reachedAt ? "done" : isNext ? "bus" : "upcoming";
          const meta = reachedAt
            ? `PASSED ${timeLabel(reachedAt)}`
            : isMine
              ? `${student.name.toUpperCase()} · ${student.className}`
              : isNext
                ? "heading here now"
                : s.etaMinutes != null
                  ? `ETA ~${s.etaMinutes} min from start`
                  : "upcoming";
          return <RouteStop key={s.id} name={s.name} meta={meta} state={state} />;
        })}
      </div>
    </>
  );
}

function IdleView({
  firstName,
  student,
  bundle,
  idle,
}: {
  firstName: string;
  student: LinkedStudent;
  bundle: TrackBundle | null;
  idle: IdleInfo | null;
}) {
  const hasBus = !!bundle?.plateNumber || !!student.routeId;

  // Which run comes next: the morning one until it's done, then the
  // afternoon one; after both, tomorrow morning.
  const nextRun = !idle
    ? null
    : !idle.morningDone
      ? ({ direction: "MORNING", label: "Morning pickup", tomorrow: false } as const)
      : !idle.afternoonDone
        ? ({ direction: "AFTERNOON", label: "Afternoon run home", tomorrow: false } as const)
        : ({ direction: "MORNING", label: "Morning pickup", tomorrow: true } as const);

  const nextRunTime = nextRun ? timeLabel(idle!.typicalStart[nextRun.direction]) : "—";

  const recapText = idle?.lastRun
    ? idle.lastRun.attendance === "ABSENT"
      ? `${firstName} was marked absent for the ${idle.lastRun.direction.toLowerCase()} run.`
      : idle.lastRun.attendance === "DROPPED_OFF"
        ? idle.lastRun.direction === "MORNING"
          ? `Dropped at school ${timeLabel(idle.lastRun.markedAt)}`
          : `Dropped at home ${timeLabel(idle.lastRun.markedAt)}`
        : idle.lastRun.attendance === "BOARDED"
          ? `Boarded ${timeLabel(idle.lastRun.markedAt)}`
          : "Run completed"
    : null;

  return (
    <>
      <section className={styles.idle}>
        {hasBus ? (
          <>
            <div className={styles.idleEye}>
              <span className={styles.idleDot} />
              Next run
            </div>
            <div className={styles.idleTime}>{nextRunTime}</div>
            <div className={styles.idleWhere}>
              {nextRun ? nextRun.label : "Loading…"}
              {nextRun?.tomorrow ? " · tomorrow" : ""}
              {bundle?.assignedStop ? (
                <>
                  {" "}
                  · from <b>{bundle.assignedStop.name}</b>
                </>
              ) : null}
            </div>
            <div className={styles.idleNote}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.7 21a2 2 0 01-3.4 0" />
              </svg>
              We&apos;ll ping you the moment the bus starts moving.
            </div>
          </>
        ) : (
          <>
            <div className={styles.idleEye}>
              <span className={styles.idleDot} />
              Not set up yet
            </div>
            <div className={styles.idleWhere}>
              {firstName} doesn&apos;t have a bus route assigned yet. Ask the school to
              assign one — tracking starts automatically after that.
            </div>
          </>
        )}

        {recapText && (
          <div className={styles.recap}>
            <div className={styles.recapIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <div className={styles.recapText}>
              <b>{idle!.lastRun!.direction === "MORNING" ? "This morning:" : "This afternoon:"}</b>{" "}
              {recapText}
            </div>
          </div>
        )}
      </section>

      {hasBus && idle && (
        <>
          <div className={styles.linehead}>
            <h2>TODAY&apos;S SCHEDULE</h2>
            <a href="/history">History</a>
          </div>

          <div className={styles.sched}>
            <ScheduleRow
              time={timeLabel(idle.typicalStart.MORNING)}
              name="Morning pickup"
              done={idle.morningDone}
              next={!idle.morningDone}
            />
            <ScheduleRow
              time={timeLabel(idle.typicalStart.AFTERNOON)}
              name="Afternoon run home"
              done={idle.afternoonDone}
              next={idle.morningDone && !idle.afternoonDone}
            />
          </div>
        </>
      )}
    </>
  );
}

function ScheduleRow({
  time,
  name,
  done,
  next,
}: {
  time: string;
  name: string;
  done: boolean;
  next: boolean;
}) {
  return (
    <div className={`${styles.schedRow} ${done ? styles.past : ""}`}>
      <span className={styles.schedTime}>{time}</span>
      <span className={styles.schedName}>{name}</span>
      {done ? (
        <span className={`${styles.schedTag} ${styles.schedDone}`}>done</span>
      ) : next ? (
        <span className={`${styles.schedTag} ${styles.schedNext}`}>up next</span>
      ) : null}
    </div>
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
