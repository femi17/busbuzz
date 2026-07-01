// ============================================================
// BusBuzz shared types — single source of truth
// Never redefine these in web/, mobile/, or supabase/functions/
// ============================================================

// ----- Enum types (mirror PostgreSQL enums) -----

export type UserRole = 'SUPER_ADMIN' | 'SCHOOL_ADMIN' | 'PARENT' | 'DRIVER';
export type BusStatus = 'ACTIVE' | 'MAINTENANCE' | 'RETIRED';
export type TripStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
export type RouteType = 'MORNING' | 'AFTERNOON';
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
}

export interface School {
  id: string;
  name: string;
  address: string;
  logoUrl?: string;
  isActive: boolean;
}

export interface Bus {
  id: string;
  schoolId: string;
  plateNumber: string;
  capacity: number;
  deviceId?: string;
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

// ----- SOS alert -----

export interface SosAlertResponse {
  sent: boolean;
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
}

export interface ReportSummary {
  totalTrips: number;
  onTimePercentage: number;
  totalStudentsTransported: number;
  mostActiveRoute: { id: string; name: string; tripCount: number } | null;
}
