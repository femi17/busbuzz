// Tests for createRouteSchema / stopInputSchema / routeTypeSchema, used by:
//   - supabase/functions/manage-route/index.ts (server-side validation, full
//     schema including schoolId, injected from the authenticated profile)
//   - web/app/dashboard/routes/new/page.tsx (client-side validation via
//     `createRouteSchema.omit({ schoolId: true })`)
//
// Unlike the bus form schema (which is a local, unexported const in the page
// file and had to be duplicated for testing — see bus-form-schema.test.ts),
// `createRouteSchema` and `stopInputSchema` ARE exported from shared/schemas.ts
// and can be imported directly. This test exercises the real schema, including
// `.omit({ schoolId: true })`, exactly as the client page uses it.
import { createRouteSchema, stopInputSchema, routeTypeSchema } from '../schemas';

const VALID_SCHOOL_ID = '123e4567-e89b-12d3-a456-426614174000';
const VALID_BUS_ID = '223e4567-e89b-12d3-a456-426614174001';

const validStop = {
  name: 'Ikoyi Club Gate',
  latitude: 6.4521,
  longitude: 3.4339,
  sequence: 0,
};

describe('routeTypeSchema', () => {
  test.each(['MORNING', 'AFTERNOON'])('accepts valid type %s', (type) => {
    expect(routeTypeSchema.safeParse(type).success).toBe(true);
  });

  test('rejects invalid type string', () => {
    expect(routeTypeSchema.safeParse('EVENING').success).toBe(false);
  });

  test('rejects lowercase variant', () => {
    expect(routeTypeSchema.safeParse('morning').success).toBe(false);
  });
});

describe('stopInputSchema', () => {
  test('accepts a minimal valid stop', () => {
    const result = stopInputSchema.safeParse(validStop);
    expect(result.success).toBe(true);
  });

  test('accepts a stop with etaMinutes', () => {
    const result = stopInputSchema.safeParse({ ...validStop, etaMinutes: 12 });
    expect(result.success).toBe(true);
  });

  test('rejects empty name', () => {
    const result = stopInputSchema.safeParse({ ...validStop, name: '' });
    expect(result.success).toBe(false);
  });

  test('rejects name exceeding 200 chars', () => {
    const result = stopInputSchema.safeParse({
      ...validStop,
      name: 'A'.repeat(201),
    });
    expect(result.success).toBe(false);
  });

  test('accepts name at exactly 200 chars (boundary)', () => {
    const result = stopInputSchema.safeParse({
      ...validStop,
      name: 'A'.repeat(200),
    });
    expect(result.success).toBe(true);
  });

  test.each([-91, 91, 90.0001, -90.0001])(
    'rejects out-of-range latitude %s',
    (latitude) => {
      const result = stopInputSchema.safeParse({ ...validStop, latitude });
      expect(result.success).toBe(false);
    },
  );

  test.each([-90, 90, 0])('accepts boundary/valid latitude %s', (latitude) => {
    const result = stopInputSchema.safeParse({ ...validStop, latitude });
    expect(result.success).toBe(true);
  });

  test.each([-181, 181, 180.0001, -180.0001])(
    'rejects out-of-range longitude %s',
    (longitude) => {
      const result = stopInputSchema.safeParse({ ...validStop, longitude });
      expect(result.success).toBe(false);
    },
  );

  test.each([-180, 180, 0])('accepts boundary/valid longitude %s', (longitude) => {
    const result = stopInputSchema.safeParse({ ...validStop, longitude });
    expect(result.success).toBe(true);
  });

  test('rejects negative sequence', () => {
    const result = stopInputSchema.safeParse({ ...validStop, sequence: -1 });
    expect(result.success).toBe(false);
  });

  test('accepts sequence of 0 (boundary)', () => {
    const result = stopInputSchema.safeParse({ ...validStop, sequence: 0 });
    expect(result.success).toBe(true);
  });

  test('rejects non-integer sequence', () => {
    const result = stopInputSchema.safeParse({ ...validStop, sequence: 1.5 });
    expect(result.success).toBe(false);
  });

  test('rejects negative etaMinutes', () => {
    const result = stopInputSchema.safeParse({ ...validStop, etaMinutes: -1 });
    expect(result.success).toBe(false);
  });

  test('rejects non-integer etaMinutes', () => {
    const result = stopInputSchema.safeParse({ ...validStop, etaMinutes: 3.5 });
    expect(result.success).toBe(false);
  });

  test('rejects missing latitude', () => {
    const { latitude, ...rest } = validStop;
    const result = stopInputSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

describe('createRouteSchema (server-side, full schema with schoolId)', () => {
  test('accepts a valid route with one stop and no bus', () => {
    const result = createRouteSchema.safeParse({
      schoolId: VALID_SCHOOL_ID,
      name: 'Ikoyi Morning Route',
      type: 'MORNING',
      stops: [validStop],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.busId).toBeUndefined();
    }
  });

  test('accepts a valid route with a bus and multiple stops', () => {
    const result = createRouteSchema.safeParse({
      schoolId: VALID_SCHOOL_ID,
      busId: VALID_BUS_ID,
      name: 'Ikoyi Morning Route',
      type: 'MORNING',
      stops: [
        { ...validStop, sequence: 0 },
        { ...validStop, name: 'Falomo Bridge', sequence: 1 },
        { ...validStop, name: 'Lekki Phase 1', sequence: 2 },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stops).toHaveLength(3);
    }
  });

  test('rejects route with zero stops ("at least one stop is required")', () => {
    const result = createRouteSchema.safeParse({
      schoolId: VALID_SCHOOL_ID,
      name: 'Empty Route',
      type: 'MORNING',
      stops: [],
    });
    expect(result.success).toBe(false);
  });

  test('rejects missing schoolId', () => {
    const result = createRouteSchema.safeParse({
      name: 'Ikoyi Morning Route',
      type: 'MORNING',
      stops: [validStop],
    });
    expect(result.success).toBe(false);
  });

  test('rejects invalid schoolId (not a uuid)', () => {
    const result = createRouteSchema.safeParse({
      schoolId: 'not-a-uuid',
      name: 'Ikoyi Morning Route',
      type: 'MORNING',
      stops: [validStop],
    });
    expect(result.success).toBe(false);
  });

  test('rejects invalid busId (not a uuid) when provided', () => {
    const result = createRouteSchema.safeParse({
      schoolId: VALID_SCHOOL_ID,
      busId: 'not-a-uuid',
      name: 'Ikoyi Morning Route',
      type: 'MORNING',
      stops: [validStop],
    });
    expect(result.success).toBe(false);
  });

  test('rejects empty route name', () => {
    const result = createRouteSchema.safeParse({
      schoolId: VALID_SCHOOL_ID,
      name: '',
      type: 'MORNING',
      stops: [validStop],
    });
    expect(result.success).toBe(false);
  });

  test('rejects route name exceeding 200 chars', () => {
    const result = createRouteSchema.safeParse({
      schoolId: VALID_SCHOOL_ID,
      name: 'A'.repeat(201),
      type: 'MORNING',
      stops: [validStop],
    });
    expect(result.success).toBe(false);
  });

  test('rejects invalid type', () => {
    const result = createRouteSchema.safeParse({
      schoolId: VALID_SCHOOL_ID,
      name: 'Ikoyi Morning Route',
      type: 'EVENING',
      stops: [validStop],
    });
    expect(result.success).toBe(false);
  });

  test('rejects a route whose nested stop is invalid (propagates nested error)', () => {
    const result = createRouteSchema.safeParse({
      schoolId: VALID_SCHOOL_ID,
      name: 'Ikoyi Morning Route',
      type: 'MORNING',
      stops: [{ ...validStop, latitude: 200 }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) =>
        i.path.join('.').startsWith('stops.0.latitude'),
      );
      expect(issue).toBeDefined();
    }
  });
});

describe('createRouteSchema.omit({ schoolId: true }) (client-side form schema, as used in routes/new/page.tsx)', () => {
  const clientSchema = createRouteSchema.omit({ schoolId: true });

  test('accepts valid form payload without schoolId', () => {
    const result = clientSchema.safeParse({
      name: 'Ikoyi Morning Route',
      type: 'MORNING',
      busId: undefined,
      stops: [validStop],
    });
    expect(result.success).toBe(true);
  });

  test('does NOT require schoolId (omitted field)', () => {
    const result = clientSchema.safeParse({
      name: 'Ikoyi Morning Route',
      type: 'MORNING',
      stops: [validStop],
    });
    expect(result.success).toBe(true);
  });

  test('still rejects zero stops client-side (matches spec: "At least one stop is required")', () => {
    const result = clientSchema.safeParse({
      name: 'Ikoyi Morning Route',
      type: 'MORNING',
      stops: [],
    });
    expect(result.success).toBe(false);
  });

  test('still rejects empty name client-side', () => {
    const result = clientSchema.safeParse({
      name: '',
      type: 'MORNING',
      stops: [validStop],
    });
    expect(result.success).toBe(false);
  });

  test('ignores a schoolId field if accidentally passed (omitted key is stripped, not validated)', () => {
    // z.object().omit() removes the key from the shape entirely; zod's default
    // (non-strict) object parsing will simply not validate or require it.
    const result = clientSchema.safeParse({
      schoolId: 'not-a-uuid-but-irrelevant',
      name: 'Ikoyi Morning Route',
      type: 'MORNING',
      stops: [validStop],
    });
    expect(result.success).toBe(true);
  });
});
