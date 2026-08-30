import type { SupabaseClient } from "@supabase/supabase-js";

// Server-side data helpers shared by the PWA screens. All queries run with
// the signed-in parent's session, so RLS scopes every row to their family.

export type LinkedStudent = {
  id: string;
  name: string;
  className: string;
  photoUrl: string | null;
  routeId: string | null;
  stopId: string | null;
  schoolName: string | null;
  schoolLat: number | null;
  schoolLng: number | null;
  routeName: string | null;
  pickupLat: number | null;
  pickupLng: number | null;
};

export type BundleStop = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  sequence: number;
  etaMinutes: number | null;
};

export type TrackBundle = {
  busId: string | null;
  plateNumber: string | null;
  routeName: string | null;
  routeType: "MORNING" | "AFTERNOON" | null;
  driver: { name: string | null; photoUrl: string | null; phone: string | null } | null;
  stops: BundleStop[];
  assignedStop: {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    etaMinutes: number | null;
  } | null;
  activeTrip: { id: string; busId: string; routeId: string; hasSos: boolean } | null;
  attendanceStatus: "BOARDED" | "ABSENT" | "DROPPED_OFF" | null;
};

type StudentRow = {
  id: string;
  name: string;
  class_name: string;
  photo_url: string | null;
  route_id: string | null;
  stop_id: string | null;
  is_active: boolean;
  pickup_lat: number | null;
  pickup_lng: number | null;
  schools: { name: string; latitude: number | null; longitude: number | null } | null;
  routes: { name: string } | null;
};

/**
 * Every active child linked to the signed-in parent, sorted by name so the
 * default selection is stable across loads — same query as the native
 * app's StudentContext.
 */
export async function getLinkedStudents(
  supabase: SupabaseClient,
  parentId: string,
): Promise<LinkedStudent[]> {
  const { data, error } = await supabase
    .from("student_parents")
    .select(
      "students(id, name, class_name, photo_url, route_id, stop_id, is_active, pickup_lat, pickup_lng, schools(name, latitude, longitude), routes(name))",
    )
    .eq("parent_id", parentId);

  if (error) throw new Error("Could not load your children.");

  return ((data ?? []) as unknown as Array<{ students: StudentRow | null }>)
    .map((row) => row.students)
    .filter((s): s is StudentRow => !!s && s.is_active)
    .map((s) => ({
      id: s.id,
      name: s.name,
      className: s.class_name,
      photoUrl: s.photo_url,
      routeId: s.route_id,
      stopId: s.stop_id,
      schoolName: s.schools?.name ?? null,
      schoolLat: s.schools?.latitude ?? null,
      schoolLng: s.schools?.longitude ?? null,
      routeName: s.routes?.name ?? null,
      pickupLat: s.pickup_lat,
      pickupLng: s.pickup_lng,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Bus + driver + route stops + active trip in one RPC round-trip. */
export async function getTrackBundle(
  supabase: SupabaseClient,
  studentId: string,
): Promise<TrackBundle | null> {
  const { data, error } = await supabase.rpc("get_parent_track_bundle", {
    p_student_id: studentId,
  });
  if (error || !data) return null;
  const bundle = data as TrackBundle;
  return { ...bundle, stops: bundle.stops ?? [] };
}

/** "Today" / "Yesterday" / "Mon, 3 Aug" — list-group header for feeds. */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const that = new Date(d);
  that.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - that.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
}

export function timeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function getFirstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
