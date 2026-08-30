import ScreenHeader from "../../components/ScreenHeader";
import BottomNav from "../../components/BottomNav";
import EmptyState from "../../components/EmptyState";
import ReplayPlayer from "./ReplayPlayer";
import { createClient } from "@/lib/supabase/server";
import { getFirstName, getLinkedStudents } from "@/lib/data";

export const metadata = { title: "BusBuzz — Trip replay" };

export type ReplayData = {
  tripId: string;
  busPlateNumber: string;
  routeName: string;
  routeType: string;
  startedAt: string;
  endedAt: string | null;
  durationMs: number;
  points: Array<{ lat: number; lng: number; speed: number | null; t: number }>;
  stops: Array<{
    id: string;
    name: string;
    lat: number;
    lng: number;
    sequence: number;
    arrivedT: number | null;
  }>;
  events: Array<{
    studentId: string;
    studentName: string;
    stopId: string | null;
    status: string;
    t: number;
  }>;
};

export default async function ReplayPage({
  params,
  searchParams,
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ child?: string }>;
}) {
  const { tripId } = await params;
  const { child } = await searchParams;
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;

  const students = await getLinkedStudents(supabase, session.user.id);
  const selected = students.find((s) => s.id === child) ?? students[0];
  const firstName = selected ? getFirstName(selected.name) : "Child";
  const backHref = selected ? `/history?child=${selected.id}` : "/history";

  // get-trip-replay authorises the caller itself (parents get trips on
  // their own child's route, events filtered to their children).
  const resp = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/get-trip-replay?tripId=${encodeURIComponent(tripId)}`,
    {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      },
      cache: "no-store",
    },
  );

  if (!resp.ok) {
    return (
      <main className="app">
        <ScreenHeader title="Trip replay" href={backHref} />
        <EmptyState
          title="Replay unavailable"
          text="This trip couldn't be loaded — it may be too old or not on your child's route."
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 8v4l3 2" />
              <circle cx="12" cy="12" r="9" />
            </svg>
          }
        />
        <BottomNav active="history" childName={firstName} childId={selected?.id} />
      </main>
    );
  }

  const { data } = (await resp.json()) as { data: ReplayData };
  const myStopIds = new Set(
    students.map((s) => s.stopId).filter((id): id is string => !!id),
  );

  const runLabel = data.routeType === "AFTERNOON" ? "Afternoon" : "Morning";
  const day = new Date(data.startedAt).toLocaleDateString([], {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  return (
    <main className="app">
      <ScreenHeader
        title="Trip replay"
        kicker={`${data.routeName} · ${runLabel} · ${day}`}
        href={backHref}
      />
      <ReplayPlayer data={data} myStopIds={[...myStopIds]} />
      <BottomNav active="history" childName={firstName} childId={selected?.id} />
    </main>
  );
}
