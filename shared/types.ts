// ============================================================
// BusBuzz shared types — single source of truth
// Never redefine these in web/, mobile/, or supabase/functions/
// ============================================================

// ----- Enum types (mirror PostgreSQL enums) -----

export type UserRole = 'SUPER_ADMIN' | 'SCHOOL_ADMIN' | 'PARENT' | 'DRIVER';
export type BusStatus = 'ACTIVE' | 'MAINTENANCE' | 'RETIRED';
export type TripStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
export type RouteType = 'MORNING' | 'AFTERNOON' | 'BOTH';
export type AttendanceStatus = 'BOARDED' | 'ABSENT' | 'DROPPED_OFF';

// ----- Entity interfaces -----

export interface Profile {
  id: string;
  name: string;
  role: UserRole;
  schoolId?: string;
  phone?: string;
  expoPushToken?: string;
  onboardingCompleted?: boolean;
  email?: string;
  isActive?: boolean;
}

export interface School {
  id: string;
  name: string;
  address: string;
  logoUrl?: string;
  isActive: boolean;
  latitude?: number | null;   // geocoded from address via Google Geocoding API
  longitude?: number | null;  // geocoded from address via Google Geocoding API
}

export interface Bus {
  id: string;
  schoolId: string;
  plateNumber: string;
  capacity: number;
  deviceId?: string;
  driverId?: string;
  status: BusStatus;
}

export interface Route {
  id: string;
  schoolId: string;
  busId: string;
  name: string;
  type: RouteType;
  stops: Stop[];
}

export interface Stop {
  id: string;
  routeId: string;
  name: string;
  latitude: number;
  longitude: number;
  sequence: number;
  etaMinutes?: number;
}

export interface Student {
  id: string;
  schoolId: string;
  name: string;
  className: string;
  photoUrl?: string;
  routeId?: string;
  stopId?: string;
}

export interface Trip {
  id: string;
  busId: string;
  routeId: string;
  driverId?: string;
  status: TripStatus;
  startedAt: string;
  endedAt?: string;
}

export interface TripLocation {
  tripId: string;
  latitude: number;
  longitude: number;
  speed?: number;
  recordedAt: string;
}

export interface Attendance {
  tripId: string;
  studentId: string;
  status: AttendanceStatus;
  markedAt: string;
}

// ----- Realtime payload -----

export interface LocationBroadcast {
  lat: number;
  lng: number;
  speed: number;
  timestamp: string;
  busId: string;
}

// ----- API envelope -----

export interface ApiResponse<T> {
  data: T;
  message: string;
  error?: string;
}

// ----- Geofence triggers -----

export interface TripStopTrigger {
  id: string;
  tripId: string;
  stopId: string;
  triggeredAt: string;
}

export interface GeofenceCheckResult {
  triggeredStopIds: string[];
  pendingNotifications: Array<{
    stopId: string;
    stopName: string;
    parentIds: string[];
  }>;
}

// ----- Driver PIN authentication -----

export interface DriverPin {
  id: string;
  driverId: string;
  createdAt: string;
  // pin_hash is never exposed to clients
}

export interface DriverLoginAttempt {
  id: string;
  phone: string;
  attemptedAt: string;
  success: boolean;
}

export interface DriverLoginResponse {
  accessToken: string;
  refreshToken: string;
  profile: {
    id: string;
    name: string;
    role: 'DRIVER';
    schoolId: string;
    phone: string;
  };
}

export interface StartTripResponse {
  id: string;
  busId: string;
  routeId: string;
  driverId: string;
  status: 'ACTIVE';
  startedAt: string;
  route: {
    id: string;
    name: string;
    type: RouteType;
    stops: Stop[];
  };
  students: Array<{
    id: string;
    name: string;
    className: string;
    photoUrl: string | null;
    stopId: string | null;
  }>;
}

// ----- Push notification results -----

export interface SendPushResult {
  sent: number;
  failed: number;
}

// ----- In-app notification history -----

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

// ----- SOS alert -----

export interface SosAlertResponse {
  sent: boolean;
}

// ----- School onboarding -----

export interface OnboardSchoolResponse {
  school: {
    id: string;
    name: string;
    address: string;
    logoUrl: string | null;
    isActive: boolean;
  };
  admin: {
    id: string;
    name: string;
    email: string;
    role: 'SCHOOL_ADMIN';
    schoolId: string;
  };
}

// ----- Reports module -----

export interface TripReportRow {
  id: string;
  date: string;
  busPlateNumber: string;
  routeName: string;
  routeType: RouteType;
  studentCount: number;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
  status: TripStatus;
}

export interface AttendanceReportRow {
  studentId: string;
  studentName: string;
  className: string;
  totalTrips: number;
  boardedCount: number;
  absentCount: number;
  attendancePercentage: number;
  // Average seconds between the bus reaching the student's stop and the
  // driver marking them BOARDED — the punctuality signal behind the award.
  // null when no boarding this range had a matching stop-arrival timestamp.
  avgBoardSeconds: number | null;
  // How many boardings could be timed (had a stop-arrival trigger). The
  // average is only meaningful above a small sample.
  timedBoardings: number;
}

export interface ReportSummary {
  totalTrips: number;
  onTimePercentage: number;
  totalStudentsTransported: number;
  mostActiveRoute: { id: string; name: string; tripCount: number } | null;
}

// ----- Trip replay (reports → "Replay" on a past trip) -----

export interface TripReplayPoint {
  lat: number;
  lng: number;
  speed: number | null;
  // Milliseconds since trip start — the shared clock the player scrubs on.
  t: number;
  recordedAt: string;
}

export interface TripReplayStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  sequence: number;
  // When the bus first geofenced this stop, in ms since trip start (null if never reached).
  arrivedT: number | null;
}

export interface TripReplayEvent {
  studentId: string;
  studentName: string;
  stopId: string | null;
  status: AttendanceStatus;
  // Milliseconds since trip start when the driver marked this student.
  t: number;
  markedAt: string;
}

export interface TripReplayData {
  tripId: string;
  busPlateNumber: string;
  routeName: string;
  routeType: RouteType;
  startedAt: string;
  endedAt: string | null;
  durationMs: number;
  points: TripReplayPoint[];
  stops: TripReplayStop[];
  events: TripReplayEvent[];
}

// ----- Most on-time student (semester award) -----

export interface OnTimeLeaderboardEntry {
  studentId: string;
  studentName: string;
  className: string;
  // Average boarding readiness in seconds (lower = more on-time).
  avgBoardSeconds: number;
  timedBoardings: number;
  boardedCount: number;
  absentCount: number;
}

export interface SemesterAward {
  id: string;
  schoolId: string;
  label: string;
  periodStart: string;
  periodEnd: string;
  winnerStudentId: string | null;
  winnerName: string | null;
  winnerAvgBoardSeconds: number | null;
  winnerTimedBoardings: number;
  leaderboard: OnTimeLeaderboardEntry[];
  emailSent: boolean;
  emailTo: string | null;
  computedAt: string;
}

export interface ComputeAwardResponse {
  award: SemesterAward;
}
