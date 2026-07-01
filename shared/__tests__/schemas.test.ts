import {
  userRoleSchema,
  busStatusSchema,
  tripStatusSchema,
  routeTypeSchema,
  attendanceStatusSchema,
  createSchoolSchema,
  updateSchoolSchema,
  createBusSchema,
  updateBusSchema,
  stopInputSchema,
  createRouteSchema,
  createStudentSchema,
  updateStudentSchema,
  otpRequestSchema,
  markAttendanceSchema,
  gpsUpdateSchema,
  startTripSchema,
  bulkImportStudentRowSchema,
  bulkImportStudentSchema,
  inviteParentSchema,
  geofenceCheckSchema,
  driverLoginSchema,
  endTripSchema,
  setDriverPinSchema,
  sendPushSchema,
  updatePushTokenSchema,
  sosAlertSchema,
} from '../schemas';

const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000';
const VALID_UUID_2 = '223e4567-e89b-12d3-a456-426614174001';

// ----- Enum schemas -----

describe('userRoleSchema', () => {
  test.each(['SUPER_ADMIN', 'SCHOOL_ADMIN', 'PARENT', 'DRIVER'])(
    'accepts valid role %s',
    (role) => {
      expect(userRoleSchema.safeParse(role).success).toBe(true);
    },
  );

  test('rejects invalid role string', () => {
    expect(userRoleSchema.safeParse('ADMIN').success).toBe(false);
  });

  test('rejects lowercase variant', () => {
    expect(userRoleSchema.safeParse('parent').success).toBe(false);
  });

  test('rejects non-string input', () => {
    expect(userRoleSchema.safeParse(123).success).toBe(false);
  });
});

describe('busStatusSchema', () => {
  test.each(['ACTIVE', 'MAINTENANCE', 'RETIRED'])('accepts %s', (s) => {
    expect(busStatusSchema.safeParse(s).success).toBe(true);
  });
  test('rejects unknown status', () => {
    expect(busStatusSchema.safeParse('BROKEN').success).toBe(false);
  });
});

describe('tripStatusSchema', () => {
  test.each(['ACTIVE', 'COMPLETED', 'CANCELLED'])('accepts %s', (s) => {
    expect(tripStatusSchema.safeParse(s).success).toBe(true);
  });
  test('rejects unknown status', () => {
    expect(tripStatusSchema.safeParse('PENDING').success).toBe(false);
  });
});

describe('routeTypeSchema', () => {
  test.each(['MORNING', 'AFTERNOON'])('accepts %s', (s) => {
    expect(routeTypeSchema.safeParse(s).success).toBe(true);
  });
  test('rejects unknown type', () => {
    expect(routeTypeSchema.safeParse('EVENING').success).toBe(false);
  });
});

describe('attendanceStatusSchema', () => {
  test.each(['BOARDED', 'ABSENT', 'DROPPED_OFF'])('accepts %s', (s) => {
    expect(attendanceStatusSchema.safeParse(s).success).toBe(true);
  });
  test('rejects unknown status', () => {
    expect(attendanceStatusSchema.safeParse('LATE').success).toBe(false);
  });
});

// ----- createSchoolSchema -----

describe('createSchoolSchema', () => {
  test('accepts valid input without optional logoUrl', () => {
    const result = createSchoolSchema.safeParse({
      name: 'Greenwood Academy',
      address: '1 Allen Avenue, Ikeja, Lagos',
    });
    expect(result.success).toBe(true);
  });

  test('accepts valid input with logoUrl', () => {
    const result = createSchoolSchema.safeParse({
      name: 'Greenwood Academy',
      address: '1 Allen Avenue, Ikeja, Lagos',
      logoUrl: 'https://example.com/logo.png',
    });
    expect(result.success).toBe(true);
  });

  test('rejects missing required name', () => {
    const result = createSchoolSchema.safeParse({
      address: '1 Allen Avenue',
    });
    expect(result.success).toBe(false);
  });

  test('rejects missing required address', () => {
    const result = createSchoolSchema.safeParse({ name: 'Greenwood' });
    expect(result.success).toBe(false);
  });

  test('rejects empty string name (min 1)', () => {
    const result = createSchoolSchema.safeParse({ name: '', address: 'Lagos' });
    expect(result.success).toBe(false);
  });

  test('rejects name exceeding max length 200', () => {
    const result = createSchoolSchema.safeParse({
      name: 'a'.repeat(201),
      address: 'Lagos',
    });
    expect(result.success).toBe(false);
  });

  test('rejects invalid logoUrl (not a URL)', () => {
    const result = createSchoolSchema.safeParse({
      name: 'Greenwood',
      address: 'Lagos',
      logoUrl: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  test('rejects number for name (type mismatch)', () => {
    const result = createSchoolSchema.safeParse({ name: 123, address: 'Lagos' });
    expect(result.success).toBe(false);
  });
});

describe('updateSchoolSchema', () => {
  test('accepts valid partial update with only id', () => {
    expect(updateSchoolSchema.safeParse({ id: VALID_UUID }).success).toBe(true);
  });

  test('accepts logoUrl explicitly set to null', () => {
    const result = updateSchoolSchema.safeParse({ id: VALID_UUID, logoUrl: null });
    expect(result.success).toBe(true);
  });

  test('rejects missing id', () => {
    expect(updateSchoolSchema.safeParse({ name: 'New Name' }).success).toBe(false);
  });

  test('rejects invalid uuid for id', () => {
    expect(updateSchoolSchema.safeParse({ id: 'not-a-uuid' }).success).toBe(false);
  });

  test('rejects isActive as non-boolean', () => {
    expect(
      updateSchoolSchema.safeParse({ id: VALID_UUID, isActive: 'yes' }).success,
    ).toBe(false);
  });
});

// ----- Bus schemas -----

describe('createBusSchema', () => {
  test('accepts valid minimal input', () => {
    const result = createBusSchema.safeParse({
      schoolId: VALID_UUID,
      plateNumber: 'LND-123-XY',
      capacity: 18,
    });
    expect(result.success).toBe(true);
  });

  test('accepts valid input with optional fields', () => {
    const result = createBusSchema.safeParse({
      schoolId: VALID_UUID,
      plateNumber: 'LND-123-XY',
      capacity: 18,
      deviceId: 'android-device-123',
      status: 'ACTIVE',
    });
    expect(result.success).toBe(true);
  });

  test('rejects missing schoolId', () => {
    const result = createBusSchema.safeParse({ plateNumber: 'LND-1', capacity: 10 });
    expect(result.success).toBe(false);
  });

  test('rejects invalid schoolId uuid', () => {
    const result = createBusSchema.safeParse({
      schoolId: 'bad-uuid',
      plateNumber: 'LND-1',
      capacity: 10,
    });
    expect(result.success).toBe(false);
  });

  test('rejects capacity of 0 (below min 1)', () => {
    const result = createBusSchema.safeParse({
      schoolId: VALID_UUID,
      plateNumber: 'LND-1',
      capacity: 0,
    });
    expect(result.success).toBe(false);
  });

  test('rejects capacity above max 100', () => {
    const result = createBusSchema.safeParse({
      schoolId: VALID_UUID,
      plateNumber: 'LND-1',
      capacity: 101,
    });
    expect(result.success).toBe(false);
  });

  test('rejects non-integer capacity', () => {
    const result = createBusSchema.safeParse({
      schoolId: VALID_UUID,
      plateNumber: 'LND-1',
      capacity: 18.5,
    });
    expect(result.success).toBe(false);
  });

  test('rejects capacity given as string (type mismatch)', () => {
    const result = createBusSchema.safeParse({
      schoolId: VALID_UUID,
      plateNumber: 'LND-1',
      capacity: '18',
    });
    expect(result.success).toBe(false);
  });

  test('rejects invalid bus status enum', () => {
    const result = createBusSchema.safeParse({
      schoolId: VALID_UUID,
      plateNumber: 'LND-1',
      capacity: 18,
      status: 'BROKEN',
    });
    expect(result.success).toBe(false);
  });
});

describe('updateBusSchema', () => {
  test('accepts id-only update', () => {
    expect(updateBusSchema.safeParse({ id: VALID_UUID }).success).toBe(true);
  });

  test('accepts deviceId explicitly null (unassign device)', () => {
    expect(
      updateBusSchema.safeParse({ id: VALID_UUID, deviceId: null }).success,
    ).toBe(true);
  });

  test('rejects missing id', () => {
    expect(updateBusSchema.safeParse({ capacity: 10 }).success).toBe(false);
  });
});

// ----- Stop / Route schemas -----

describe('stopInputSchema', () => {
  test('accepts valid stop', () => {
    const result = stopInputSchema.safeParse({
      name: 'Allen Avenue Junction',
      latitude: 6.6018,
      longitude: 3.3515,
      sequence: 0,
    });
    expect(result.success).toBe(true);
  });

  test('rejects latitude above 90', () => {
    const result = stopInputSchema.safeParse({
      name: 'Stop',
      latitude: 91,
      longitude: 3.3515,
      sequence: 0,
    });
    expect(result.success).toBe(false);
  });

  test('rejects latitude below -90', () => {
    const result = stopInputSchema.safeParse({
      name: 'Stop',
      latitude: -91,
      longitude: 3.3515,
      sequence: 0,
    });
    expect(result.success).toBe(false);
  });

  test('rejects longitude above 180', () => {
    const result = stopInputSchema.safeParse({
      name: 'Stop',
      latitude: 6.6,
      longitude: 181,
      sequence: 0,
    });
    expect(result.success).toBe(false);
  });

  test('rejects longitude below -180', () => {
    const result = stopInputSchema.safeParse({
      name: 'Stop',
      latitude: 6.6,
      longitude: -181,
      sequence: 0,
    });
    expect(result.success).toBe(false);
  });

  test('boundary: latitude exactly 90 is accepted', () => {
    const result = stopInputSchema.safeParse({
      name: 'Stop',
      latitude: 90,
      longitude: 0,
      sequence: 0,
    });
    expect(result.success).toBe(true);
  });

  test('boundary: longitude exactly -180 is accepted', () => {
    const result = stopInputSchema.safeParse({
      name: 'Stop',
      latitude: 0,
      longitude: -180,
      sequence: 0,
    });
    expect(result.success).toBe(true);
  });

  test('rejects negative sequence', () => {
    const result = stopInputSchema.safeParse({
      name: 'Stop',
      latitude: 6.6,
      longitude: 3.3,
      sequence: -1,
    });
    expect(result.success).toBe(false);
  });

  test('accepts optional etaMinutes', () => {
    const result = stopInputSchema.safeParse({
      name: 'Stop',
      latitude: 6.6,
      longitude: 3.3,
      sequence: 0,
      etaMinutes: 12,
    });
    expect(result.success).toBe(true);
  });
});

describe('createRouteSchema', () => {
  const validStop = {
    name: 'Stop A',
    latitude: 6.6,
    longitude: 3.3,
    sequence: 0,
  };

  test('accepts valid route with one stop', () => {
    const result = createRouteSchema.safeParse({
      schoolId: VALID_UUID,
      name: 'Morning Route A',
      type: 'MORNING',
      stops: [validStop],
    });
    expect(result.success).toBe(true);
  });

  test('accepts valid route with busId', () => {
    const result = createRouteSchema.safeParse({
      schoolId: VALID_UUID,
      busId: VALID_UUID_2,
      name: 'Morning Route A',
      type: 'MORNING',
      stops: [validStop],
    });
    expect(result.success).toBe(true);
  });

  test('rejects route with empty stops array (min 1)', () => {
    const result = createRouteSchema.safeParse({
      schoolId: VALID_UUID,
      name: 'Morning Route A',
      type: 'MORNING',
      stops: [],
    });
    expect(result.success).toBe(false);
  });

  test('rejects route with invalid nested stop', () => {
    const result = createRouteSchema.safeParse({
      schoolId: VALID_UUID,
      name: 'Morning Route A',
      type: 'MORNING',
      stops: [{ ...validStop, latitude: 999 }],
    });
    expect(result.success).toBe(false);
  });

  test('rejects invalid route type', () => {
    const result = createRouteSchema.safeParse({
      schoolId: VALID_UUID,
      name: 'Morning Route A',
      type: 'EVENING',
      stops: [validStop],
    });
    expect(result.success).toBe(false);
  });

  test('rejects missing schoolId', () => {
    const result = createRouteSchema.safeParse({
      name: 'Morning Route A',
      type: 'MORNING',
      stops: [validStop],
    });
    expect(result.success).toBe(false);
  });
});

// ----- Student schemas -----

describe('createStudentSchema', () => {
  test('accepts valid minimal student', () => {
    const result = createStudentSchema.safeParse({
      schoolId: VALID_UUID,
      name: 'Chidi Okafor',
      className: 'Primary 3',
    });
    expect(result.success).toBe(true);
  });

  test('accepts valid student with all optional fields', () => {
    const result = createStudentSchema.safeParse({
      schoolId: VALID_UUID,
      name: 'Chidi Okafor',
      className: 'Primary 3',
      photoUrl: 'https://example.com/chidi.jpg',
      medicalNotes: 'Mild peanut allergy',
      routeId: VALID_UUID_2,
      stopId: VALID_UUID_2,
    });
    expect(result.success).toBe(true);
  });

  test('rejects missing name', () => {
    const result = createStudentSchema.safeParse({
      schoolId: VALID_UUID,
      className: 'Primary 3',
    });
    expect(result.success).toBe(false);
  });

  test('rejects medicalNotes exceeding max length 2000', () => {
    const result = createStudentSchema.safeParse({
      schoolId: VALID_UUID,
      name: 'Chidi',
      className: 'Primary 3',
      medicalNotes: 'a'.repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  test('rejects invalid routeId uuid', () => {
    const result = createStudentSchema.safeParse({
      schoolId: VALID_UUID,
      name: 'Chidi',
      className: 'Primary 3',
      routeId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });
});

describe('updateStudentSchema', () => {
  test('accepts id-only update', () => {
    expect(updateStudentSchema.safeParse({ id: VALID_UUID }).success).toBe(true);
  });

  test('accepts explicit null for nullable optional fields', () => {
    const result = updateStudentSchema.safeParse({
      id: VALID_UUID,
      photoUrl: null,
      medicalNotes: null,
      routeId: null,
      stopId: null,
    });
    expect(result.success).toBe(true);
  });

  test('rejects missing id', () => {
    expect(updateStudentSchema.safeParse({ name: 'New Name' }).success).toBe(false);
  });
});

// ----- Auth -----

describe('otpRequestSchema', () => {
  test('accepts valid email', () => {
    expect(otpRequestSchema.safeParse({ email: 'parent@example.com' }).success).toBe(
      true,
    );
  });

  test('rejects invalid email format', () => {
    expect(otpRequestSchema.safeParse({ email: 'not-an-email' }).success).toBe(false);
  });

  test('rejects missing email', () => {
    expect(otpRequestSchema.safeParse({}).success).toBe(false);
  });

  test('rejects empty string email', () => {
    expect(otpRequestSchema.safeParse({ email: '' }).success).toBe(false);
  });
});

// ----- Attendance -----

describe('markAttendanceSchema', () => {
  test('accepts valid BOARDED attendance', () => {
    const result = markAttendanceSchema.safeParse({
      tripId: VALID_UUID,
      studentId: VALID_UUID_2,
      status: 'BOARDED',
    });
    expect(result.success).toBe(true);
  });

  test.each(['BOARDED', 'ABSENT', 'DROPPED_OFF'])('accepts status %s', (status) => {
    const result = markAttendanceSchema.safeParse({
      tripId: VALID_UUID,
      studentId: VALID_UUID_2,
      status,
    });
    expect(result.success).toBe(true);
  });

  test('rejects invalid status value', () => {
    const result = markAttendanceSchema.safeParse({
      tripId: VALID_UUID,
      studentId: VALID_UUID_2,
      status: 'LATE',
    });
    expect(result.success).toBe(false);
  });

  test('rejects missing tripId', () => {
    const result = markAttendanceSchema.safeParse({
      studentId: VALID_UUID_2,
      status: 'BOARDED',
    });
    expect(result.success).toBe(false);
  });

  test('rejects missing studentId', () => {
    const result = markAttendanceSchema.safeParse({
      tripId: VALID_UUID,
      status: 'BOARDED',
    });
    expect(result.success).toBe(false);
  });

  test('rejects non-uuid tripId', () => {
    const result = markAttendanceSchema.safeParse({
      tripId: 'trip-1',
      studentId: VALID_UUID_2,
      status: 'BOARDED',
    });
    expect(result.success).toBe(false);
  });
});

// ----- GPS update -----

describe('gpsUpdateSchema', () => {
  const validGps = {
    tripId: VALID_UUID,
    busId: VALID_UUID_2,
    lat: 6.5244,
    lng: 3.3792,
    speed: 35,
    timestamp: '2024-01-15T08:30:00.000Z',
    deviceId: 'android-device-abc123',
  };

  test('accepts valid GPS ping', () => {
    expect(gpsUpdateSchema.safeParse(validGps).success).toBe(true);
  });

  test('accepts speed of exactly 0 (bus stationary)', () => {
    expect(gpsUpdateSchema.safeParse({ ...validGps, speed: 0 }).success).toBe(true);
  });

  test('rejects negative speed', () => {
    expect(gpsUpdateSchema.safeParse({ ...validGps, speed: -5 }).success).toBe(false);
  });

  test('rejects latitude out of range (> 90)', () => {
    expect(gpsUpdateSchema.safeParse({ ...validGps, lat: 95 }).success).toBe(false);
  });

  test('rejects longitude out of range (< -180)', () => {
    expect(gpsUpdateSchema.safeParse({ ...validGps, lng: -200 }).success).toBe(false);
  });

  test('rejects invalid timestamp format (not ISO datetime)', () => {
    expect(
      gpsUpdateSchema.safeParse({ ...validGps, timestamp: '15-01-2024' }).success,
    ).toBe(false);
  });

  test('rejects missing deviceId', () => {
    const { deviceId, ...rest } = validGps;
    expect(gpsUpdateSchema.safeParse(rest).success).toBe(false);
  });

  test('rejects empty deviceId string', () => {
    expect(gpsUpdateSchema.safeParse({ ...validGps, deviceId: '' }).success).toBe(
      false,
    );
  });

  test('rejects missing tripId', () => {
    const { tripId, ...rest } = validGps;
    expect(gpsUpdateSchema.safeParse(rest).success).toBe(false);
  });

  test('rejects non-uuid busId', () => {
    expect(gpsUpdateSchema.safeParse({ ...validGps, busId: 'bus-1' }).success).toBe(
      false,
    );
  });

  test('rejects lat given as string (type mismatch)', () => {
    expect(gpsUpdateSchema.safeParse({ ...validGps, lat: '6.5244' }).success).toBe(
      false,
    );
  });
});

// ----- Trip schemas -----

describe('startTripSchema', () => {
  test('accepts valid input', () => {
    const result = startTripSchema.safeParse({
      busId: VALID_UUID,
      routeId: VALID_UUID_2,
    });
    expect(result.success).toBe(true);
  });

  test('rejects missing busId', () => {
    expect(startTripSchema.safeParse({ routeId: VALID_UUID_2 }).success).toBe(false);
  });

  test('rejects missing routeId', () => {
    expect(startTripSchema.safeParse({ busId: VALID_UUID }).success).toBe(false);
  });

  test('rejects non-uuid busId', () => {
    expect(
      startTripSchema.safeParse({ busId: 'bus-1', routeId: VALID_UUID_2 }).success,
    ).toBe(false);
  });
});

// ----- Bulk import student schemas -----

describe('bulkImportStudentRowSchema', () => {
  test('accepts a valid row', () => {
    const result = bulkImportStudentRowSchema.safeParse({
      name: 'Chidi Okafor',
      className: 'JSS1',
      stopName: 'Ikoyi Roundabout',
    });
    expect(result.success).toBe(true);
  });

  test('rejects missing name', () => {
    const result = bulkImportStudentRowSchema.safeParse({
      className: 'JSS1',
      stopName: 'Ikoyi Roundabout',
    });
    expect(result.success).toBe(false);
  });

  test('rejects missing className', () => {
    const result = bulkImportStudentRowSchema.safeParse({
      name: 'Chidi',
      stopName: 'Ikoyi Roundabout',
    });
    expect(result.success).toBe(false);
  });

  test('rejects missing stopName', () => {
    const result = bulkImportStudentRowSchema.safeParse({
      name: 'Chidi',
      className: 'JSS1',
    });
    expect(result.success).toBe(false);
  });

  test('rejects empty string name (min 1)', () => {
    const result = bulkImportStudentRowSchema.safeParse({
      name: '',
      className: 'JSS1',
      stopName: 'Ikoyi',
    });
    expect(result.success).toBe(false);
  });

  test('rejects name exceeding max length 200', () => {
    const result = bulkImportStudentRowSchema.safeParse({
      name: 'a'.repeat(201),
      className: 'JSS1',
      stopName: 'Ikoyi',
    });
    expect(result.success).toBe(false);
  });

  test('accepts name at exactly 200 chars (boundary)', () => {
    const result = bulkImportStudentRowSchema.safeParse({
      name: 'a'.repeat(200),
      className: 'JSS1',
      stopName: 'Ikoyi',
    });
    expect(result.success).toBe(true);
  });

  test('rejects className exceeding max length 100', () => {
    const result = bulkImportStudentRowSchema.safeParse({
      name: 'Chidi',
      className: 'a'.repeat(101),
      stopName: 'Ikoyi',
    });
    expect(result.success).toBe(false);
  });

  test('rejects stopName exceeding max length 200', () => {
    const result = bulkImportStudentRowSchema.safeParse({
      name: 'Chidi',
      className: 'JSS1',
      stopName: 'a'.repeat(201),
    });
    expect(result.success).toBe(false);
  });

  test('rejects non-string name (type mismatch)', () => {
    const result = bulkImportStudentRowSchema.safeParse({
      name: 123,
      className: 'JSS1',
      stopName: 'Ikoyi',
    });
    expect(result.success).toBe(false);
  });
});

describe('bulkImportStudentSchema', () => {
  const validRow = {
    name: 'Chidi Okafor',
    className: 'JSS1',
    stopName: 'Ikoyi Roundabout',
  };

  test('accepts a valid payload with action "bulk" and one student', () => {
    const result = bulkImportStudentSchema.safeParse({
      action: 'bulk',
      students: [validRow],
    });
    expect(result.success).toBe(true);
  });

  test('rejects missing action', () => {
    const result = bulkImportStudentSchema.safeParse({
      students: [validRow],
    });
    expect(result.success).toBe(false);
  });

  test('rejects action other than the literal "bulk"', () => {
    const result = bulkImportStudentSchema.safeParse({
      action: 'create',
      students: [validRow],
    });
    expect(result.success).toBe(false);
  });

  test('rejects empty students array (min 1)', () => {
    const result = bulkImportStudentSchema.safeParse({
      action: 'bulk',
      students: [],
    });
    expect(result.success).toBe(false);
  });

  test('rejects students array exceeding max 500', () => {
    const students = Array.from({ length: 501 }, () => validRow);
    const result = bulkImportStudentSchema.safeParse({
      action: 'bulk',
      students,
    });
    expect(result.success).toBe(false);
  });

  test('accepts students array at exactly 500 (boundary)', () => {
    const students = Array.from({ length: 500 }, () => validRow);
    const result = bulkImportStudentSchema.safeParse({
      action: 'bulk',
      students,
    });
    expect(result.success).toBe(true);
  });

  test('accepts students array at exactly 1 (boundary)', () => {
    const result = bulkImportStudentSchema.safeParse({
      action: 'bulk',
      students: [validRow],
    });
    expect(result.success).toBe(true);
  });

  test('rejects when one row in the array is invalid', () => {
    const result = bulkImportStudentSchema.safeParse({
      action: 'bulk',
      students: [validRow, { name: '', className: 'JSS1', stopName: 'Ikoyi' }],
    });
    expect(result.success).toBe(false);
  });

  test('rejects missing students field entirely', () => {
    const result = bulkImportStudentSchema.safeParse({ action: 'bulk' });
    expect(result.success).toBe(false);
  });

  test('rejects students given as a non-array', () => {
    const result = bulkImportStudentSchema.safeParse({
      action: 'bulk',
      students: validRow,
    });
    expect(result.success).toBe(false);
  });
});

// ----- Invite parent schema -----

describe('inviteParentSchema', () => {
  test('accepts a valid payload without optional parentName', () => {
    const result = inviteParentSchema.safeParse({
      action: 'invite-parent',
      studentId: VALID_UUID,
      parentEmail: 'parent@example.com',
    });
    expect(result.success).toBe(true);
  });

  test('accepts a valid payload with parentName', () => {
    const result = inviteParentSchema.safeParse({
      action: 'invite-parent',
      studentId: VALID_UUID,
      parentEmail: 'parent@example.com',
      parentName: 'Mrs. Okafor',
    });
    expect(result.success).toBe(true);
  });

  test('rejects missing action', () => {
    const result = inviteParentSchema.safeParse({
      studentId: VALID_UUID,
      parentEmail: 'parent@example.com',
    });
    expect(result.success).toBe(false);
  });

  test('rejects action other than the literal "invite-parent"', () => {
    const result = inviteParentSchema.safeParse({
      action: 'bulk',
      studentId: VALID_UUID,
      parentEmail: 'parent@example.com',
    });
    expect(result.success).toBe(false);
  });

  test('rejects missing studentId', () => {
    const result = inviteParentSchema.safeParse({
      action: 'invite-parent',
      parentEmail: 'parent@example.com',
    });
    expect(result.success).toBe(false);
  });

  test('rejects non-uuid studentId', () => {
    const result = inviteParentSchema.safeParse({
      action: 'invite-parent',
      studentId: 'not-a-uuid',
      parentEmail: 'parent@example.com',
    });
    expect(result.success).toBe(false);
  });

  test('rejects missing parentEmail', () => {
    const result = inviteParentSchema.safeParse({
      action: 'invite-parent',
      studentId: VALID_UUID,
    });
    expect(result.success).toBe(false);
  });

  test('rejects invalid parentEmail format', () => {
    const result = inviteParentSchema.safeParse({
      action: 'invite-parent',
      studentId: VALID_UUID,
      parentEmail: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });

  test('rejects empty string parentEmail', () => {
    const result = inviteParentSchema.safeParse({
      action: 'invite-parent',
      studentId: VALID_UUID,
      parentEmail: '',
    });
    expect(result.success).toBe(false);
  });

  test('rejects empty string parentName (min 1) when provided', () => {
    const result = inviteParentSchema.safeParse({
      action: 'invite-parent',
      studentId: VALID_UUID,
      parentEmail: 'parent@example.com',
      parentName: '',
    });
    expect(result.success).toBe(false);
  });

  test('rejects parentName exceeding max length 200', () => {
    const result = inviteParentSchema.safeParse({
      action: 'invite-parent',
      studentId: VALID_UUID,
      parentEmail: 'parent@example.com',
      parentName: 'a'.repeat(201),
    });
    expect(result.success).toBe(false);
  });

  test('accepts parentName at exactly 200 chars (boundary)', () => {
    const result = inviteParentSchema.safeParse({
      action: 'invite-parent',
      studentId: VALID_UUID,
      parentEmail: 'parent@example.com',
      parentName: 'a'.repeat(200),
    });
    expect(result.success).toBe(true);
  });
});

// ----- Geofence check schema -----

describe('geofenceCheckSchema', () => {
  const validGeofence = {
    tripId: VALID_UUID,
    routeId: VALID_UUID_2,
    lat: 6.5244,
    lng: 3.3792,
  };

  test('accepts a valid geofence check payload', () => {
    expect(geofenceCheckSchema.safeParse(validGeofence).success).toBe(true);
  });

  test('rejects missing tripId', () => {
    const { tripId, ...rest } = validGeofence;
    expect(geofenceCheckSchema.safeParse(rest).success).toBe(false);
  });

  test('rejects missing routeId', () => {
    const { routeId, ...rest } = validGeofence;
    expect(geofenceCheckSchema.safeParse(rest).success).toBe(false);
  });

  test('rejects missing lat', () => {
    const { lat, ...rest } = validGeofence;
    expect(geofenceCheckSchema.safeParse(rest).success).toBe(false);
  });

  test('rejects missing lng', () => {
    const { lng, ...rest } = validGeofence;
    expect(geofenceCheckSchema.safeParse(rest).success).toBe(false);
  });

  test('rejects non-uuid tripId', () => {
    expect(
      geofenceCheckSchema.safeParse({ ...validGeofence, tripId: 'trip-1' }).success,
    ).toBe(false);
  });

  test('rejects non-uuid routeId', () => {
    expect(
      geofenceCheckSchema.safeParse({ ...validGeofence, routeId: 'route-1' }).success,
    ).toBe(false);
  });

  test('boundary: latitude exactly 90 is accepted', () => {
    expect(
      geofenceCheckSchema.safeParse({ ...validGeofence, lat: 90 }).success,
    ).toBe(true);
  });

  test('boundary: latitude exactly -90 is accepted', () => {
    expect(
      geofenceCheckSchema.safeParse({ ...validGeofence, lat: -90 }).success,
    ).toBe(true);
  });

  test('rejects latitude above 90', () => {
    expect(
      geofenceCheckSchema.safeParse({ ...validGeofence, lat: 90.0001 }).success,
    ).toBe(false);
  });

  test('rejects latitude below -90', () => {
    expect(
      geofenceCheckSchema.safeParse({ ...validGeofence, lat: -90.0001 }).success,
    ).toBe(false);
  });

  test('boundary: longitude exactly 180 is accepted', () => {
    expect(
      geofenceCheckSchema.safeParse({ ...validGeofence, lng: 180 }).success,
    ).toBe(true);
  });

  test('boundary: longitude exactly -180 is accepted', () => {
    expect(
      geofenceCheckSchema.safeParse({ ...validGeofence, lng: -180 }).success,
    ).toBe(true);
  });

  test('rejects longitude above 180', () => {
    expect(
      geofenceCheckSchema.safeParse({ ...validGeofence, lng: 180.0001 }).success,
    ).toBe(false);
  });

  test('rejects longitude below -180', () => {
    expect(
      geofenceCheckSchema.safeParse({ ...validGeofence, lng: -180.0001 }).success,
    ).toBe(false);
  });

  test('rejects lat given as string (type mismatch)', () => {
    expect(
      geofenceCheckSchema.safeParse({ ...validGeofence, lat: '6.5244' }).success,
    ).toBe(false);
  });

  test('rejects lng given as string (type mismatch)', () => {
    expect(
      geofenceCheckSchema.safeParse({ ...validGeofence, lng: '3.3792' }).success,
    ).toBe(false);
  });

  test('rejects extra unexpected fields gracefully (still validates known fields correctly) -- missing tripId still rejected even with extra noise field', () => {
    const result = geofenceCheckSchema.safeParse({
      routeId: VALID_UUID_2,
      lat: 6.5244,
      lng: 3.3792,
      busId: VALID_UUID, // not part of this schema
    });
    expect(result.success).toBe(false);
  });

  test('produces a readable issue path for invalid lng', () => {
    const result = geofenceCheckSchema.safeParse({ ...validGeofence, lng: 999 });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('lng');
    }
  });
});

// ----- Driver PIN authentication schemas -----

describe('driverLoginSchema', () => {
  const validLogin = {
    phone: '+2348012345678',
    pin: '1234',
  };

  test('accepts valid phone + 4-digit pin', () => {
    expect(driverLoginSchema.safeParse(validLogin).success).toBe(true);
  });

  test('rejects missing phone', () => {
    const { phone, ...rest } = validLogin;
    expect(driverLoginSchema.safeParse(rest).success).toBe(false);
  });

  test('rejects missing pin', () => {
    const { pin, ...rest } = validLogin;
    expect(driverLoginSchema.safeParse(rest).success).toBe(false);
  });

  test('rejects empty string phone (below min length 1)', () => {
    expect(
      driverLoginSchema.safeParse({ ...validLogin, phone: '' }).success,
    ).toBe(false);
  });

  test('boundary: phone at exactly 1 char is accepted', () => {
    expect(
      driverLoginSchema.safeParse({ ...validLogin, phone: '1' }).success,
    ).toBe(true);
  });

  test('boundary: phone at exactly 30 chars is accepted', () => {
    expect(
      driverLoginSchema.safeParse({ ...validLogin, phone: '1'.repeat(30) })
        .success,
    ).toBe(true);
  });

  test('rejects phone exceeding max length 30', () => {
    expect(
      driverLoginSchema.safeParse({ ...validLogin, phone: '1'.repeat(31) })
        .success,
    ).toBe(false);
  });

  test('rejects pin with 3 digits (too short)', () => {
    expect(
      driverLoginSchema.safeParse({ ...validLogin, pin: '123' }).success,
    ).toBe(false);
  });

  test('rejects pin with 5 digits (too long)', () => {
    expect(
      driverLoginSchema.safeParse({ ...validLogin, pin: '12345' }).success,
    ).toBe(false);
  });

  test('rejects non-numeric pin characters (e.g. "12ab")', () => {
    expect(
      driverLoginSchema.safeParse({ ...validLogin, pin: '12ab' }).success,
    ).toBe(false);
  });

  test('rejects pin with a decimal point ("12.4")', () => {
    expect(
      driverLoginSchema.safeParse({ ...validLogin, pin: '12.4' }).success,
    ).toBe(false);
  });

  test('rejects pin with leading/trailing whitespace (" 1234")', () => {
    expect(
      driverLoginSchema.safeParse({ ...validLogin, pin: ' 1234' }).success,
    ).toBe(false);
  });

  test('rejects pin given as a number (type mismatch)', () => {
    expect(
      driverLoginSchema.safeParse({ ...validLogin, pin: 1234 }).success,
    ).toBe(false);
  });

  test('rejects phone given as a number (type mismatch)', () => {
    expect(
      driverLoginSchema.safeParse({ ...validLogin, phone: 2348012345678 })
        .success,
    ).toBe(false);
  });

  test('accepts a 4-digit pin with leading zero ("0000")', () => {
    expect(
      driverLoginSchema.safeParse({ ...validLogin, pin: '0000' }).success,
    ).toBe(true);
  });

  test('produces a readable issue path for invalid pin', () => {
    const result = driverLoginSchema.safeParse({ ...validLogin, pin: 'abcd' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('pin');
    }
  });
});

describe('endTripSchema', () => {
  test('accepts a valid tripId', () => {
    expect(endTripSchema.safeParse({ tripId: VALID_UUID }).success).toBe(true);
  });

  test('rejects missing tripId', () => {
    expect(endTripSchema.safeParse({}).success).toBe(false);
  });

  test('rejects non-uuid tripId', () => {
    expect(
      endTripSchema.safeParse({ tripId: 'trip-1' }).success,
    ).toBe(false);
  });

  test('rejects empty string tripId', () => {
    expect(endTripSchema.safeParse({ tripId: '' }).success).toBe(false);
  });

  test('rejects tripId given as a number (type mismatch)', () => {
    expect(
      endTripSchema.safeParse({ tripId: 123 }).success,
    ).toBe(false);
  });

  test('rejects extra unexpected fields not causing false positives (still requires valid tripId)', () => {
    const result = endTripSchema.safeParse({
      tripId: 'not-a-uuid',
      busId: VALID_UUID,
    });
    expect(result.success).toBe(false);
  });
});

describe('setDriverPinSchema', () => {
  const validSetPin = {
    driverId: VALID_UUID,
    pin: '5678',
  };

  test('accepts valid driverId + 4-digit pin', () => {
    expect(setDriverPinSchema.safeParse(validSetPin).success).toBe(true);
  });

  test('rejects missing driverId', () => {
    const { driverId, ...rest } = validSetPin;
    expect(setDriverPinSchema.safeParse(rest).success).toBe(false);
  });

  test('rejects missing pin', () => {
    const { pin, ...rest } = validSetPin;
    expect(setDriverPinSchema.safeParse(rest).success).toBe(false);
  });

  test('rejects non-uuid driverId', () => {
    expect(
      setDriverPinSchema.safeParse({ ...validSetPin, driverId: 'driver-1' })
        .success,
    ).toBe(false);
  });

  test('rejects pin with 3 digits (too short)', () => {
    expect(
      setDriverPinSchema.safeParse({ ...validSetPin, pin: '567' }).success,
    ).toBe(false);
  });

  test('rejects pin with 5 digits (too long)', () => {
    expect(
      setDriverPinSchema.safeParse({ ...validSetPin, pin: '56789' }).success,
    ).toBe(false);
  });

  test('rejects non-numeric pin characters (e.g. "12ab")', () => {
    expect(
      setDriverPinSchema.safeParse({ ...validSetPin, pin: '12ab' }).success,
    ).toBe(false);
  });

  test('rejects pin given as a number (type mismatch)', () => {
    expect(
      setDriverPinSchema.safeParse({ ...validSetPin, pin: 5678 }).success,
    ).toBe(false);
  });

  test('produces a readable issue path for invalid driverId', () => {
    const result = setDriverPinSchema.safeParse({
      ...validSetPin,
      driverId: 'bad-uuid',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('driverId');
    }
  });
});

// ----- Push notification schemas -----

describe('sendPushSchema', () => {
  const validPayload = {
    userIds: [VALID_UUID, VALID_UUID_2],
    title: 'Bus approaching',
    body: 'Your child\'s bus is 2 minutes away from the stop.',
  };

  test('accepts valid input without optional data field', () => {
    expect(sendPushSchema.safeParse(validPayload).success).toBe(true);
  });

  test('accepts valid input with optional data field', () => {
    const result = sendPushSchema.safeParse({
      ...validPayload,
      data: { tripId: VALID_UUID, type: 'GEOFENCE_APPROACH' },
    });
    expect(result.success).toBe(true);
  });

  test('accepts empty userIds array', () => {
    const result = sendPushSchema.safeParse({ ...validPayload, userIds: [] });
    expect(result.success).toBe(true);
  });

  test('rejects invalid uuid in userIds', () => {
    const result = sendPushSchema.safeParse({
      ...validPayload,
      userIds: [VALID_UUID, 'not-a-uuid'],
    });
    expect(result.success).toBe(false);
  });

  test('rejects userIds given as a non-array', () => {
    const result = sendPushSchema.safeParse({
      ...validPayload,
      userIds: VALID_UUID,
    });
    expect(result.success).toBe(false);
  });

  test('rejects missing userIds', () => {
    const { userIds, ...rest } = validPayload;
    expect(sendPushSchema.safeParse(rest).success).toBe(false);
  });

  test('rejects userIds array exceeding max 1000', () => {
    const userIds = Array.from({ length: 1001 }, () => VALID_UUID);
    const result = sendPushSchema.safeParse({ ...validPayload, userIds });
    expect(result.success).toBe(false);
  });

  test('accepts userIds array at exactly 1000 (boundary)', () => {
    const userIds = Array.from({ length: 1000 }, () => VALID_UUID);
    const result = sendPushSchema.safeParse({ ...validPayload, userIds });
    expect(result.success).toBe(true);
  });

  test('rejects missing title', () => {
    const { title, ...rest } = validPayload;
    expect(sendPushSchema.safeParse(rest).success).toBe(false);
  });

  test('rejects empty string title (min 1)', () => {
    const result = sendPushSchema.safeParse({ ...validPayload, title: '' });
    expect(result.success).toBe(false);
  });

  test('rejects title exceeding max length 200', () => {
    const result = sendPushSchema.safeParse({
      ...validPayload,
      title: 'a'.repeat(201),
    });
    expect(result.success).toBe(false);
  });

  test('accepts title at exactly 200 chars (boundary)', () => {
    const result = sendPushSchema.safeParse({
      ...validPayload,
      title: 'a'.repeat(200),
    });
    expect(result.success).toBe(true);
  });

  test('rejects missing body', () => {
    const { body, ...rest } = validPayload;
    expect(sendPushSchema.safeParse(rest).success).toBe(false);
  });

  test('rejects empty string body (min 1)', () => {
    const result = sendPushSchema.safeParse({ ...validPayload, body: '' });
    expect(result.success).toBe(false);
  });

  test('rejects body exceeding max length 1000', () => {
    const result = sendPushSchema.safeParse({
      ...validPayload,
      body: 'a'.repeat(1001),
    });
    expect(result.success).toBe(false);
  });

  test('accepts body at exactly 1000 chars (boundary)', () => {
    const result = sendPushSchema.safeParse({
      ...validPayload,
      body: 'a'.repeat(1000),
    });
    expect(result.success).toBe(true);
  });

  test('rejects title given as a number (type mismatch)', () => {
    const result = sendPushSchema.safeParse({ ...validPayload, title: 123 });
    expect(result.success).toBe(false);
  });

  test('rejects body given as a number (type mismatch)', () => {
    const result = sendPushSchema.safeParse({ ...validPayload, body: 456 });
    expect(result.success).toBe(false);
  });

  test('rejects data field given as a non-object (e.g. array)', () => {
    const result = sendPushSchema.safeParse({
      ...validPayload,
      data: ['not', 'an', 'object'],
    });
    expect(result.success).toBe(false);
  });

  test('accepts data field as an empty object', () => {
    const result = sendPushSchema.safeParse({ ...validPayload, data: {} });
    expect(result.success).toBe(true);
  });

  test('produces a readable issue path for invalid userIds entry', () => {
    const result = sendPushSchema.safeParse({
      ...validPayload,
      userIds: ['bad-uuid'],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths.some((p) => p.startsWith('userIds'))).toBe(true);
    }
  });
});

describe('updatePushTokenSchema', () => {
  test('accepts a valid Expo push token', () => {
    const result = updatePushTokenSchema.safeParse({
      expoPushToken: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
    });
    expect(result.success).toBe(true);
  });

  test('rejects missing expoPushToken', () => {
    expect(updatePushTokenSchema.safeParse({}).success).toBe(false);
  });

  test('rejects empty string expoPushToken (min 1)', () => {
    expect(
      updatePushTokenSchema.safeParse({ expoPushToken: '' }).success,
    ).toBe(false);
  });

  test('rejects expoPushToken exceeding max length 200', () => {
    const result = updatePushTokenSchema.safeParse({
      expoPushToken: 'a'.repeat(201),
    });
    expect(result.success).toBe(false);
  });

  test('accepts expoPushToken at exactly 200 chars (boundary)', () => {
    const result = updatePushTokenSchema.safeParse({
      expoPushToken: 'a'.repeat(200),
    });
    expect(result.success).toBe(true);
  });

  test('accepts expoPushToken at exactly 1 char (boundary)', () => {
    const result = updatePushTokenSchema.safeParse({ expoPushToken: 'a' });
    expect(result.success).toBe(true);
  });

  test('rejects expoPushToken given as a number (type mismatch)', () => {
    const result = updatePushTokenSchema.safeParse({ expoPushToken: 12345 });
    expect(result.success).toBe(false);
  });

  test('rejects null expoPushToken', () => {
    const result = updatePushTokenSchema.safeParse({ expoPushToken: null });
    expect(result.success).toBe(false);
  });

  test('produces a readable issue path for missing expoPushToken', () => {
    const result = updatePushTokenSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('expoPushToken');
    }
  });
});

// ----- SOS alert schema -----

describe('sosAlertSchema', () => {
  test('accepts a valid busId', () => {
    expect(sosAlertSchema.safeParse({ busId: VALID_UUID }).success).toBe(true);
  });

  test('rejects missing busId', () => {
    expect(sosAlertSchema.safeParse({}).success).toBe(false);
  });

  test('rejects non-uuid busId', () => {
    expect(sosAlertSchema.safeParse({ busId: 'bus-1' }).success).toBe(false);
  });

  test('rejects empty string busId', () => {
    expect(sosAlertSchema.safeParse({ busId: '' }).success).toBe(false);
  });

  test('rejects busId given as a number (type mismatch)', () => {
    expect(sosAlertSchema.safeParse({ busId: 123 }).success).toBe(false);
  });

  test('rejects null busId', () => {
    expect(sosAlertSchema.safeParse({ busId: null }).success).toBe(false);
  });

  test('rejects extra unexpected fields not causing false positives (still requires valid busId)', () => {
    const result = sosAlertSchema.safeParse({
      busId: 'not-a-uuid',
      tripId: VALID_UUID,
    });
    expect(result.success).toBe(false);
  });

  test('accepts payload with extra unexpected fields when busId itself is valid (Zod default non-strict mode)', () => {
    const result = sosAlertSchema.safeParse({
      busId: VALID_UUID,
      extra: 'ignored',
    });
    expect(result.success).toBe(true);
  });

  test('produces a readable issue path for invalid busId', () => {
    const result = sosAlertSchema.safeParse({ busId: 'bad-uuid' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('busId');
    }
  });
});

// ----- Error message readability (spec: "missing required field returns 400 with a readable error") -----

describe('error message readability', () => {
  test('createSchoolSchema produces issues array describing the missing field', () => {
    const result = createSchoolSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('name');
      expect(paths).toContain('address');
    }
  });

  test('gpsUpdateSchema produces issue path for invalid lat', () => {
    const result = gpsUpdateSchema.safeParse({
      tripId: VALID_UUID,
      busId: VALID_UUID_2,
      lat: 999,
      lng: 3.3792,
      speed: 10,
      timestamp: '2024-01-15T08:30:00.000Z',
      deviceId: 'device-1',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('lat');
    }
  });
});
