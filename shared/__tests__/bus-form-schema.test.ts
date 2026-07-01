// Tests the UI-only `busFormSchema` defined inline in:
//   web/app/dashboard/buses/new/page.tsx
//   web/app/dashboard/buses/[id]/edit/page.tsx
//
// IMPORTANT: web/ has no test runner installed (no jest/vitest/testing-library
// in web/package.json as of this feature). This schema is NOT exported from
// either page file (it's a local const), so it cannot be imported directly.
// Per spec section "Bus form page (create)", the schema is defined verbatim as:
//
//   const busFormSchema = z.object({
//     plateNumber: z.string().min(1, "Plate number is required").max(20, "Plate number too long"),
//     capacity: z.coerce.number().int("Must be a whole number").min(1, "Minimum capacity is 1").max(100, "Maximum capacity is 100"),
//     deviceId: z.string().min(1).max(100).optional().or(z.literal("")),
//   });
//
// We confirmed (via Read) that both web/app/dashboard/buses/new/page.tsx and
// web/app/dashboard/buses/[id]/edit/page.tsx contain this EXACT schema
// (same field names, same validators, same messages). This test file
// reproduces that literal here to exercise the validation logic in isolation,
// using shared/'s existing Jest setup (the only test runner available in this
// repo). If the schema in either page file is ever edited without updating
// this copy, this test will silently drift — see .pipeline/test-results.md
// "Coverage gaps" for this caveat.
import { z } from 'zod';

const busFormSchema = z.object({
  plateNumber: z
    .string()
    .min(1, 'Plate number is required')
    .max(20, 'Plate number too long'),
  capacity: z.coerce
    .number()
    .int('Must be a whole number')
    .min(1, 'Minimum capacity is 1')
    .max(100, 'Maximum capacity is 100'),
  deviceId: z.string().min(1).max(100).optional().or(z.literal('')),
});

describe('busFormSchema (web create/edit bus form, local copy)', () => {
  test('accepts valid input with all fields', () => {
    const result = busFormSchema.safeParse({
      plateNumber: 'LAG-234-XY',
      capacity: '30',
      deviceId: 'a1b2c3d4e5f6',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.capacity).toBe(30); // coerced to number
    }
  });

  test('accepts valid input with deviceId omitted', () => {
    const result = busFormSchema.safeParse({
      plateNumber: 'LAG-234-XY',
      capacity: '30',
    });
    expect(result.success).toBe(true);
  });

  test('accepts deviceId as empty string (form default state)', () => {
    const result = busFormSchema.safeParse({
      plateNumber: 'LAG-234-XY',
      capacity: '30',
      deviceId: '',
    });
    expect(result.success).toBe(true);
  });

  test('rejects empty plate number with readable message', () => {
    const result = busFormSchema.safeParse({
      plateNumber: '',
      capacity: '30',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === 'plateNumber');
      expect(issue?.message).toBe('Plate number is required');
    }
  });

  test('rejects plate number exceeding 20 chars with readable message', () => {
    const result = busFormSchema.safeParse({
      plateNumber: 'A'.repeat(21),
      capacity: '30',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === 'plateNumber');
      expect(issue?.message).toBe('Plate number too long');
    }
  });

  test('accepts plate number at exactly 20 chars (boundary)', () => {
    const result = busFormSchema.safeParse({
      plateNumber: 'A'.repeat(20),
      capacity: '30',
    });
    expect(result.success).toBe(true);
  });

  test('rejects capacity of 0 with readable message (below min 1)', () => {
    const result = busFormSchema.safeParse({
      plateNumber: 'LAG-1',
      capacity: '0',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === 'capacity');
      expect(issue?.message).toBe('Minimum capacity is 1');
    }
  });

  test('rejects capacity of 101 with readable message (above max 100)', () => {
    const result = busFormSchema.safeParse({
      plateNumber: 'LAG-1',
      capacity: '101',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === 'capacity');
      expect(issue?.message).toBe('Maximum capacity is 100');
    }
  });

  test('accepts capacity boundary values 1 and 100', () => {
    expect(
      busFormSchema.safeParse({ plateNumber: 'LAG-1', capacity: '1' }).success,
    ).toBe(true);
    expect(
      busFormSchema.safeParse({ plateNumber: 'LAG-1', capacity: '100' }).success,
    ).toBe(true);
  });

  test('rejects non-integer capacity (decimal) with readable message', () => {
    const result = busFormSchema.safeParse({
      plateNumber: 'LAG-1',
      capacity: '30.5',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === 'capacity');
      expect(issue?.message).toBe('Must be a whole number');
    }
  });

  test('rejects non-numeric capacity string', () => {
    const result = busFormSchema.safeParse({
      plateNumber: 'LAG-1',
      capacity: 'thirty',
    });
    expect(result.success).toBe(false);
  });

  test('rejects missing capacity entirely', () => {
    const result = busFormSchema.safeParse({
      plateNumber: 'LAG-1',
    });
    expect(result.success).toBe(false);
  });

  test('rejects deviceId exceeding 100 chars', () => {
    const result = busFormSchema.safeParse({
      plateNumber: 'LAG-1',
      capacity: '30',
      deviceId: 'a'.repeat(101),
    });
    expect(result.success).toBe(false);
  });

  test('accepts deviceId at exactly 100 chars (boundary)', () => {
    const result = busFormSchema.safeParse({
      plateNumber: 'LAG-1',
      capacity: '30',
      deviceId: 'a'.repeat(100),
    });
    expect(result.success).toBe(true);
  });

  test('coerces numeric-looking capacity string from <input type="number">', () => {
    // HTML number inputs produce string values in React state before
    // this schema's z.coerce.number() runs.
    const result = busFormSchema.safeParse({
      plateNumber: 'LAG-1',
      capacity: '42',
      deviceId: '',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(typeof result.data.capacity).toBe('number');
    }
  });
});
