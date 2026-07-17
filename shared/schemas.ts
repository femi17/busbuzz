import { z } from 'zod';

// ============================================================
// BusBuzz Zod validation schemas
// All Edge Function and form inputs must be validated through
// these schemas before any DB operation.
// ============================================================

// ----- Reusable primitives -----

const uuidSchema = z.string().uuid();
const latitudeSchema = z.number().min(-90).max(90);
const longitudeSchema = z.number().min(-180).max(180);

// Nigerian phone numbers must be stored in a single canonical form
// (+234XXXXXXXXXX) everywhere — driver-login looks up profiles by exact
// string match, so any inconsistency between where a phone is written
// (web admin form, mobile app) and where it's read locks the driver out
// with a misleading "Invalid credentials" error even with the right PIN.
export function normalizePhone(raw: string): string {
  const digitsOnly = raw.replace(/\D/g, '');
  if (digitsOnly.startsWith('234')) {
    return `+${digitsOnly}`;
  }
  return `+234${digitsOnly.replace(/^0+/, '')}`;
}

const phoneSchema = z.string().min(1).max(30).transform(normalizePhone);

// ----- Enum schemas (mirror shared/types.ts) -----

export const userRoleSchema = z.enum([
  'SUPER_ADMIN',
  'SCHOOL_ADMIN',
  'PARENT',
  'DRIVER',
]);

export const busStatusSchema = z.enum(['ACTIVE', 'MAINTENANCE', 'RETIRED']);

export const tripStatusSchema = z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED']);

export const routeTypeSchema = z.enum(['MORNING', 'AFTERNOON', 'BOTH']);

export const attendanceStatusSchema = z.enum([
  'BOARDED',
  'ABSENT',
  'DROPPED_OFF',
]);

// ----- School schemas -----

export const createSchoolSchema = z.object({
  name: z.string().min(1).max(200),
  address: z.string().min(1).max(500),
  logoUrl: z.string().url().optional(),
});

export const updateSchoolSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1).max(200).optional(),
  address: z.string().min(1).max(500).optional(),
  logoUrl: z.string().url().nullable().optional(),
  isActive: z.boolean().optional(),
});

export const onboardSchoolSchema = z.object({
  schoolName: z.string().min(1, 'School name is required').max(200),
  schoolAddress: z.string().min(1, 'School address is required').max(500),
  schoolLogoUrl: z.string().url().optional(),
  adminName: z.string().min(1, 'Admin name is required').max(200),
  adminEmail: z.string().email('Valid email is required'),
  adminPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(100),
});

export type OnboardSchoolInput = z.infer<typeof onboardSchoolSchema>;

// ----- Bus schemas -----

export const createBusSchema = z.object({
  schoolId: uuidSchema,
  plateNumber: z.string().min(1).max(20),
  capacity: z.number().int().min(1).max(100),
  deviceId: z.string().min(1).max(100).optional(),
  status: busStatusSchema.optional(),
});

export const updateBusSchema = z.object({
  id: uuidSchema,
  plateNumber: z.string().min(1).max(20).optional(),
  capacity: z.number().int().min(1).max(100).optional(),
  deviceId: z.string().min(1).max(100).nullable().optional(),
  status: busStatusSchema.optional(),
});

// ----- Route schemas (with nested stops) -----

export const stopInputSchema = z.object({
  name: z.string().min(1).max(200),
  latitude: latitudeSchema,
  longitude: longitudeSchema,
  sequence: z.number().int().min(0),
  etaMinutes: z.number().int().min(0).optional(),
});

export const createRouteSchema = z.object({
  schoolId: uuidSchema,
  busId: uuidSchema.optional(),
  name: z.string().min(1).max(200),
  type: routeTypeSchema,
  stops: z.array(stopInputSchema),
});

// ----- Student schemas -----

export const createStudentSchema = z.object({
  schoolId: uuidSchema,
  name: z.string().min(1).max(200),
  className: z.string().min(1).max(100),
  photoUrl: z.string().url().optional(),
  medicalNotes: z.string().max(2000).optional(),
  routeId: uuidSchema.optional(),
  stopId: uuidSchema.optional(),
  // Which leg(s) of a BOTH route this student actually rides — irrelevant
  // (and ignored) on a dedicated MORNING/AFTERNOON route, where every rider
  // is on that route's one leg regardless of this value.
  tripType: z.enum(['MORNING', 'AFTERNOON', 'BOTH']).optional(),
  pickupAddress: z.string().max(500).optional(),
  // Trusted coordinates from a Google Places selection on the client — when
  // present, the server uses these directly instead of re-geocoding the
  // address itself.
  pickupLat: latitudeSchema.optional(),
  pickupLng: longitudeSchema.optional(),
});

export const updateStudentSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1).max(200).optional(),
  className: z.string().min(1).max(100).optional(),
  photoUrl: z.string().url().nullable().optional(),
  medicalNotes: z.string().max(2000).nullable().optional(),
  routeId: uuidSchema.nullable().optional(),
  stopId: uuidSchema.nullable().optional(),
  isActive: z.boolean().optional(),
});

// ----- Auth schemas -----

export const otpRequestSchema = z.object({
  email: z.string().email(),
});

// ----- Attendance schema -----

export const markAttendanceSchema = z.object({
  tripId: uuidSchema,
  studentId: uuidSchema,
  status: attendanceStatusSchema,
});

// ----- GPS update schema -----

export const gpsUpdateSchema = z.object({
  tripId: uuidSchema,
  busId: uuidSchema,
  lat: latitudeSchema,
  lng: longitudeSchema,
  speed: z.number().min(0),
  timestamp: z.string().datetime(),
  deviceId: z.string().min(1),
});

// ----- Trip schemas -----

export const startTripSchema = z.object({
  busId: uuidSchema,
  routeId: uuidSchema,
});

// ----- Bulk import student schema -----

export const bulkImportStudentRowSchema = z.object({
  name: z.string().min(1).max(200),
  className: z.string().min(1).max(100),
  pickupAddress: z.string().max(500).optional(),
  routeName: z.string().min(1).max(200),
});

export const bulkImportStudentSchema = z.object({
  action: z.literal('bulk'),
  students: z.array(bulkImportStudentRowSchema).min(1).max(500),
});

// ----- Invite parent schema -----

export const inviteParentSchema = z.object({
  action: z.literal('invite-parent'),
  studentId: z.string().uuid(),
  parentEmail: z.string().email(),
  parentName: z.string().min(1).max(200).optional(),
});

// ----- Geofence check schema -----

export const geofenceCheckSchema = z.object({
  tripId: uuidSchema,
  routeId: uuidSchema,
  lat: latitudeSchema,
  lng: longitudeSchema,
});

export type GeofenceCheckInput = z.infer<typeof geofenceCheckSchema>;

// ----- Driver PIN authentication schemas -----

export const driverLoginSchema = z.object({
  phone: phoneSchema,
  pin: z.string().length(4).regex(/^\d{4}$/, 'PIN must be exactly 4 digits'),
});

export const endTripSchema = z.object({
  tripId: uuidSchema,
});

export const setDriverPinSchema = z.object({
  driverId: uuidSchema,
  pin: z.string().length(4).regex(/^\d{4}$/, 'PIN must be exactly 4 digits'),
});

export type DriverLoginInput = z.infer<typeof driverLoginSchema>;
export type EndTripInput = z.infer<typeof endTripSchema>;
export type SetDriverPinInput = z.infer<typeof setDriverPinSchema>;

// ----- Inferred types (for use in Edge Functions and forms) -----

export type CreateSchoolInput = z.infer<typeof createSchoolSchema>;
export type UpdateSchoolInput = z.infer<typeof updateSchoolSchema>;
export type CreateBusInput = z.infer<typeof createBusSchema>;
export type UpdateBusInput = z.infer<typeof updateBusSchema>;
export type StopInput = z.infer<typeof stopInputSchema>;
export type CreateRouteInput = z.infer<typeof createRouteSchema>;
export type CreateStudentInput = z.infer<typeof createStudentSchema>;
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;
export type OtpRequestInput = z.infer<typeof otpRequestSchema>;
export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>;
export type GpsUpdateInput = z.infer<typeof gpsUpdateSchema>;
export type StartTripInput = z.infer<typeof startTripSchema>;
export type BulkImportStudentRow = z.infer<typeof bulkImportStudentRowSchema>;
export type BulkImportStudentInput = z.infer<typeof bulkImportStudentSchema>;
export type InviteParentInput = z.infer<typeof inviteParentSchema>;

// ----- Push notification schemas -----

export const sendPushSchema = z.object({
  userIds: z.array(z.string().uuid()).max(1000),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(1000),
  data: z.record(z.unknown()).optional(),
});

export const updatePushTokenSchema = z.object({
  expoPushToken: z.string().min(1).max(200),
});

export type SendPushInput = z.infer<typeof sendPushSchema>;
export type UpdatePushTokenInput = z.infer<typeof updatePushTokenSchema>;

// ----- Parent-corrected pickup location schema -----

export const updatePickupLocationSchema = z.object({
  studentId: uuidSchema,
  lat: latitudeSchema,
  lng: longitudeSchema,
});

export type UpdatePickupLocationInput = z.infer<typeof updatePickupLocationSchema>;

// ----- SOS alert schema -----

export const sosAlertSchema = z.object({
  busId: z.string().uuid(),
});

export type SosAlertInput = z.infer<typeof sosAlertSchema>;

// ----- Driver creation schema -----

export const createDriverSchema = z.object({
  name: z.string().min(1).max(200),
  phone: phoneSchema,
});

export type CreateDriverInput = z.infer<typeof createDriverSchema>;

// ----- Reports schema -----

export const getReportsQuerySchema = z.object({
  type: z.enum(['trips', 'attendance', 'summary']),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format'),
});

export type GetReportsQueryInput = z.infer<typeof getReportsQuerySchema>;
