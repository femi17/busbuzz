// Tests for createDriverSchema and CreateDriverInput (shared/schemas.ts)
// Added in the Users/Settings/Reports feature (2026-07-02).
//
// Coverage targets from spec "Definition of done":
//   - All Edge Function inputs validated with Zod before any DB operation
//   - Missing required field returns 400 with a readable error
//   - Invalid types (e.g. string where number expected) return 400
//   - Input validation: createDriverSchema enforces name min/max and phone min/max

import { createDriverSchema } from '../schemas';
import type { CreateDriverInput } from '../schemas';

const VALID_INPUT = {
  name: 'Emeka Nwosu',
  phone: '08012345678',
};

// ============================================================
// Happy paths
// ============================================================

describe('createDriverSchema — happy path', () => {
  test('accepts valid name and phone', () => {
    const result = createDriverSchema.safeParse(VALID_INPUT);
    expect(result.success).toBe(true);
  });

  test('returns correctly shaped data on success', () => {
    const result = createDriverSchema.safeParse(VALID_INPUT);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe(VALID_INPUT.name);
      // phone is normalized to +234XXXXXXXXXX so driver-login's exact-match
      // lookup can't be broken by inconsistent input formatting
      expect(result.data.phone).toBe('+2348012345678');
    }
  });

  test('accepts name at exactly 1 character (min boundary)', () => {
    const result = createDriverSchema.safeParse({ ...VALID_INPUT, name: 'A' });
    expect(result.success).toBe(true);
  });

  test('accepts name at exactly 200 characters (max boundary)', () => {
    const result = createDriverSchema.safeParse({
      ...VALID_INPUT,
      name: 'a'.repeat(200),
    });
    expect(result.success).toBe(true);
  });

  test('accepts phone at exactly 1 character (min boundary)', () => {
    const result = createDriverSchema.safeParse({ ...VALID_INPUT, phone: '0' });
    expect(result.success).toBe(true);
  });

  test('accepts phone at exactly 30 characters (max boundary)', () => {
    const result = createDriverSchema.safeParse({
      ...VALID_INPUT,
      phone: '1'.repeat(30),
    });
    expect(result.success).toBe(true);
  });

  test('accepts international phone format', () => {
    const result = createDriverSchema.safeParse({
      ...VALID_INPUT,
      phone: '+2348012345678',
    });
    expect(result.success).toBe(true);
  });

  test('accepts name with special characters (full Nigerian name)', () => {
    const result = createDriverSchema.safeParse({
      ...VALID_INPUT,
      name: "Chukwuemeka O'Brien-Nwosu",
    });
    expect(result.success).toBe(true);
  });
});

// ============================================================
// Missing required fields
// ============================================================

describe('createDriverSchema — missing required fields', () => {
  test('rejects when name is missing', () => {
    const { name, ...rest } = VALID_INPUT;
    const result = createDriverSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  test('rejects when phone is missing', () => {
    const { phone, ...rest } = VALID_INPUT;
    const result = createDriverSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  test('rejects an entirely empty object', () => {
    const result = createDriverSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ============================================================
// Empty string inputs
// ============================================================

describe('createDriverSchema — empty string inputs', () => {
  test('rejects empty string name (min 1)', () => {
    const result = createDriverSchema.safeParse({ ...VALID_INPUT, name: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === 'name');
      expect(issue).toBeDefined();
    }
  });

  test('rejects empty string phone (min 1)', () => {
    const result = createDriverSchema.safeParse({ ...VALID_INPUT, phone: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === 'phone');
      expect(issue).toBeDefined();
    }
  });
});

// ============================================================
// Max-length boundaries
// ============================================================

describe('createDriverSchema — max-length boundaries', () => {
  test('rejects name at 201 characters (above max 200)', () => {
    const result = createDriverSchema.safeParse({
      ...VALID_INPUT,
      name: 'a'.repeat(201),
    });
    expect(result.success).toBe(false);
  });

  test('rejects phone at 31 characters (above max 30)', () => {
    const result = createDriverSchema.safeParse({
      ...VALID_INPUT,
      phone: '1'.repeat(31),
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// Type mismatches
// ============================================================

describe('createDriverSchema — type mismatches', () => {
  test('rejects name given as a number', () => {
    const result = createDriverSchema.safeParse({ ...VALID_INPUT, name: 42 });
    expect(result.success).toBe(false);
  });

  test('rejects phone given as a number', () => {
    const result = createDriverSchema.safeParse({
      ...VALID_INPUT,
      phone: 8012345678,
    });
    expect(result.success).toBe(false);
  });

  test('rejects name given as null', () => {
    const result = createDriverSchema.safeParse({ ...VALID_INPUT, name: null });
    expect(result.success).toBe(false);
  });

  test('rejects phone given as null', () => {
    const result = createDriverSchema.safeParse({ ...VALID_INPUT, phone: null });
    expect(result.success).toBe(false);
  });

  test('rejects name given as an array', () => {
    const result = createDriverSchema.safeParse({
      ...VALID_INPUT,
      name: ['Emeka'],
    });
    expect(result.success).toBe(false);
  });

  test('rejects name given as boolean', () => {
    const result = createDriverSchema.safeParse({ ...VALID_INPUT, name: true });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// Multiple errors simultaneously
// ============================================================

describe('createDriverSchema — multiple simultaneous errors', () => {
  test('produces multiple issue paths when both fields are invalid', () => {
    const result = createDriverSchema.safeParse({ name: '', phone: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0] as string);
      expect(paths).toContain('name');
      expect(paths).toContain('phone');
    }
  });

  test('produces two issues when entirely empty object is given', () => {
    const result = createDriverSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThanOrEqual(2);
    }
  });
});

// ============================================================
// Zod issues array structure (drives HTTP 400 detail responses)
// ============================================================

describe('createDriverSchema — Zod issues array structure', () => {
  test('failure result has a non-empty issues array', () => {
    const result = createDriverSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(Array.isArray(result.error.issues)).toBe(true);
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  test('each issue has a path array and a message string', () => {
    const result = createDriverSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      for (const issue of result.error.issues) {
        expect(Array.isArray(issue.path)).toBe(true);
        expect(typeof issue.message).toBe('string');
        expect(issue.message.length).toBeGreaterThan(0);
      }
    }
  });

  test('issue path correctly points to name field on name validation failure', () => {
    const result = createDriverSchema.safeParse({ name: '', phone: '0800' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('name');
    }
  });

  test('issue path correctly points to phone field on phone validation failure', () => {
    const result = createDriverSchema.safeParse({
      name: 'Emeka',
      phone: '1'.repeat(31),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('phone');
    }
  });
});

// ============================================================
// CreateDriverInput type structural check
// ============================================================

describe('CreateDriverInput type structure', () => {
  test('a correctly shaped object satisfies the CreateDriverInput type', () => {
    const input: CreateDriverInput = {
      name: 'Emeka Nwosu',
      phone: '08012345678',
    };
    // Verify runtime shape matches expected values
    expect(input.name).toBe('Emeka Nwosu');
    expect(input.phone).toBe('08012345678');
  });

  test('inferred type matches schema shape at runtime', () => {
    const result = createDriverSchema.safeParse(VALID_INPUT);
    expect(result.success).toBe(true);
    if (result.success) {
      // Verify the inferred type has exactly these two fields
      const data: CreateDriverInput = result.data;
      expect(typeof data.name).toBe('string');
      expect(typeof data.phone).toBe('string');
    }
  });
});
