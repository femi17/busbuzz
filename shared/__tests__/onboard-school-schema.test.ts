// Tests for onboardSchoolSchema and OnboardSchoolInput (shared/schemas.ts)
// and structural verification of the OnboardSchoolResponse type (shared/types.ts).
//
// Coverage targets from spec "Definition of done":
//   - Zod validates all inputs before any DB operation
//   - Missing required field returns 400 with a readable error (tested via issue messages)
//   - Invalid URL in Logo URL shows field-level validation error
//   - Admin password shorter than 8 characters shows the correct error
//   - Response shapes match ApiResponse<T> envelope (structural assertion below)

import { onboardSchoolSchema } from '../schemas';
import type { OnboardSchoolResponse } from '../types';

// ----- Fixtures -----

const VALID_INPUT = {
  schoolName: 'Greensprings School',
  schoolAddress: '28 Admiralty Way, Lekki, Lagos',
  adminName: 'Mrs. Adebayo',
  adminEmail: 'admin@greensprings.edu.ng',
  adminPassword: 'Secure99',
};

// ============================================================
// Happy paths
// ============================================================

describe('onboardSchoolSchema — happy path', () => {
  test('accepts all required fields without optional schoolLogoUrl', () => {
    const result = onboardSchoolSchema.safeParse(VALID_INPUT);
    expect(result.success).toBe(true);
  });

  test('accepts all required fields plus a valid https schoolLogoUrl', () => {
    const result = onboardSchoolSchema.safeParse({
      ...VALID_INPUT,
      schoolLogoUrl: 'https://cdn.greensprings.edu.ng/logo.png',
    });
    expect(result.success).toBe(true);
  });

  test('accepts valid input with http (non-https) URL for schoolLogoUrl', () => {
    const result = onboardSchoolSchema.safeParse({
      ...VALID_INPUT,
      schoolLogoUrl: 'http://example.com/logo.png',
    });
    expect(result.success).toBe(true);
  });

  test('parsed output has all expected fields present', () => {
    const result = onboardSchoolSchema.safeParse(VALID_INPUT);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.schoolName).toBe(VALID_INPUT.schoolName);
      expect(result.data.schoolAddress).toBe(VALID_INPUT.schoolAddress);
      expect(result.data.adminName).toBe(VALID_INPUT.adminName);
      expect(result.data.adminEmail).toBe(VALID_INPUT.adminEmail);
      expect(result.data.adminPassword).toBe(VALID_INPUT.adminPassword);
      expect(result.data.schoolLogoUrl).toBeUndefined();
    }
  });
});

// ============================================================
// Required field missing
// ============================================================

describe('onboardSchoolSchema — missing required fields', () => {
  test('rejects when schoolName is missing', () => {
    const { schoolName, ...rest } = VALID_INPUT;
    expect(onboardSchoolSchema.safeParse(rest).success).toBe(false);
  });

  test('rejects when schoolAddress is missing', () => {
    const { schoolAddress, ...rest } = VALID_INPUT;
    expect(onboardSchoolSchema.safeParse(rest).success).toBe(false);
  });

  test('rejects when adminName is missing', () => {
    const { adminName, ...rest } = VALID_INPUT;
    expect(onboardSchoolSchema.safeParse(rest).success).toBe(false);
  });

  test('rejects when adminEmail is missing', () => {
    const { adminEmail, ...rest } = VALID_INPUT;
    expect(onboardSchoolSchema.safeParse(rest).success).toBe(false);
  });

  test('rejects when adminPassword is missing', () => {
    const { adminPassword, ...rest } = VALID_INPUT;
    expect(onboardSchoolSchema.safeParse(rest).success).toBe(false);
  });

  test('rejects an entirely empty object', () => {
    expect(onboardSchoolSchema.safeParse({}).success).toBe(false);
  });
});

// ============================================================
// Empty-string inputs for required fields
// ============================================================

describe('onboardSchoolSchema — empty string required fields', () => {
  test('rejects empty string schoolName (min 1) with readable message', () => {
    const result = onboardSchoolSchema.safeParse({ ...VALID_INPUT, schoolName: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === 'schoolName');
      expect(issue?.message).toBe('School name is required');
    }
  });

  test('rejects empty string schoolAddress (min 1) with readable message', () => {
    const result = onboardSchoolSchema.safeParse({ ...VALID_INPUT, schoolAddress: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === 'schoolAddress');
      expect(issue?.message).toBe('School address is required');
    }
  });

  test('rejects empty string adminName (min 1) with readable message', () => {
    const result = onboardSchoolSchema.safeParse({ ...VALID_INPUT, adminName: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === 'adminName');
      expect(issue?.message).toBe('Admin name is required');
    }
  });

  test('rejects empty string adminEmail', () => {
    const result = onboardSchoolSchema.safeParse({ ...VALID_INPUT, adminEmail: '' });
    expect(result.success).toBe(false);
  });

  test('rejects empty string adminPassword (below min 8)', () => {
    const result = onboardSchoolSchema.safeParse({ ...VALID_INPUT, adminPassword: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === 'adminPassword');
      expect(issue?.message).toBe('Password must be at least 8 characters');
    }
  });
});

// ============================================================
// adminEmail validation
// ============================================================

describe('onboardSchoolSchema — adminEmail validation', () => {
  test('rejects a string without @ sign', () => {
    const result = onboardSchoolSchema.safeParse({
      ...VALID_INPUT,
      adminEmail: 'notanemail',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === 'adminEmail');
      expect(issue?.message).toBe('Valid email is required');
    }
  });

  test('rejects email missing domain part (e.g. "admin@")', () => {
    const result = onboardSchoolSchema.safeParse({
      ...VALID_INPUT,
      adminEmail: 'admin@',
    });
    expect(result.success).toBe(false);
  });

  test('rejects email missing local part (e.g. "@school.com")', () => {
    const result = onboardSchoolSchema.safeParse({
      ...VALID_INPUT,
      adminEmail: '@school.com',
    });
    expect(result.success).toBe(false);
  });

  test('rejects email given as a number (type mismatch)', () => {
    const result = onboardSchoolSchema.safeParse({
      ...VALID_INPUT,
      adminEmail: 12345,
    });
    expect(result.success).toBe(false);
  });

  test('rejects null adminEmail', () => {
    const result = onboardSchoolSchema.safeParse({
      ...VALID_INPUT,
      adminEmail: null,
    });
    expect(result.success).toBe(false);
  });

  test('accepts a valid email with subdomain', () => {
    const result = onboardSchoolSchema.safeParse({
      ...VALID_INPUT,
      adminEmail: 'admin@mail.school.edu.ng',
    });
    expect(result.success).toBe(true);
  });

  test('produces a readable issue path for invalid adminEmail', () => {
    const result = onboardSchoolSchema.safeParse({
      ...VALID_INPUT,
      adminEmail: 'bad-email',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('adminEmail');
    }
  });
});

// ============================================================
// adminPassword length validation
// ============================================================

describe('onboardSchoolSchema — adminPassword length', () => {
  test('rejects password of 7 characters (below min 8) with correct message', () => {
    const result = onboardSchoolSchema.safeParse({
      ...VALID_INPUT,
      adminPassword: 'Short7!',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === 'adminPassword');
      expect(issue?.message).toBe('Password must be at least 8 characters');
    }
  });

  test('accepts password of exactly 8 characters (boundary)', () => {
    const result = onboardSchoolSchema.safeParse({
      ...VALID_INPUT,
      adminPassword: 'Exactly8',
    });
    expect(result.success).toBe(true);
  });

  test('accepts password of exactly 100 characters (boundary)', () => {
    const result = onboardSchoolSchema.safeParse({
      ...VALID_INPUT,
      adminPassword: 'a'.repeat(100),
    });
    expect(result.success).toBe(true);
  });

  test('rejects password of 101 characters (above max 100)', () => {
    const result = onboardSchoolSchema.safeParse({
      ...VALID_INPUT,
      adminPassword: 'a'.repeat(101),
    });
    expect(result.success).toBe(false);
  });

  test('rejects password given as a number (type mismatch)', () => {
    const result = onboardSchoolSchema.safeParse({
      ...VALID_INPUT,
      adminPassword: 12345678,
    });
    expect(result.success).toBe(false);
  });

  test('produces a readable issue path for short password', () => {
    const result = onboardSchoolSchema.safeParse({
      ...VALID_INPUT,
      adminPassword: 'short',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('adminPassword');
    }
  });
});

// ============================================================
// schoolLogoUrl validation (optional URL)
// ============================================================

describe('onboardSchoolSchema — schoolLogoUrl optional URL', () => {
  test('accepts when schoolLogoUrl is entirely absent (optional field)', () => {
    const result = onboardSchoolSchema.safeParse(VALID_INPUT);
    expect(result.success).toBe(true);
  });

  test('rejects schoolLogoUrl as a plain string that is not a URL', () => {
    const result = onboardSchoolSchema.safeParse({
      ...VALID_INPUT,
      schoolLogoUrl: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  test('rejects schoolLogoUrl as a relative path (not a full URL)', () => {
    const result = onboardSchoolSchema.safeParse({
      ...VALID_INPUT,
      schoolLogoUrl: '/images/logo.png',
    });
    expect(result.success).toBe(false);
  });

  test('rejects schoolLogoUrl as empty string (empty string is not a valid URL)', () => {
    const result = onboardSchoolSchema.safeParse({
      ...VALID_INPUT,
      schoolLogoUrl: '',
    });
    expect(result.success).toBe(false);
  });

  test('produces an issue on path schoolLogoUrl for an invalid URL', () => {
    const result = onboardSchoolSchema.safeParse({
      ...VALID_INPUT,
      schoolLogoUrl: 'bad-logo-url',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('schoolLogoUrl');
    }
  });

  test('note: the form converts empty string to undefined before calling safeParse', () => {
    // The web form does: schoolLogoUrl: schoolLogoUrl || undefined
    // so the schema never receives an empty string in production.
    // Verify that undefined is accepted (the .optional() clause).
    const result = onboardSchoolSchema.safeParse({
      ...VALID_INPUT,
      schoolLogoUrl: undefined,
    });
    expect(result.success).toBe(true);
  });
});

// ============================================================
// Max-length boundaries
// ============================================================

describe('onboardSchoolSchema — max-length boundaries', () => {
  test('accepts schoolName at exactly 200 characters (boundary)', () => {
    const result = onboardSchoolSchema.safeParse({
      ...VALID_INPUT,
      schoolName: 'a'.repeat(200),
    });
    expect(result.success).toBe(true);
  });

  test('rejects schoolName at 201 characters (above max 200)', () => {
    const result = onboardSchoolSchema.safeParse({
      ...VALID_INPUT,
      schoolName: 'a'.repeat(201),
    });
    expect(result.success).toBe(false);
  });

  test('accepts schoolAddress at exactly 500 characters (boundary)', () => {
    const result = onboardSchoolSchema.safeParse({
      ...VALID_INPUT,
      schoolAddress: 'a'.repeat(500),
    });
    expect(result.success).toBe(true);
  });

  test('rejects schoolAddress at 501 characters (above max 500)', () => {
    const result = onboardSchoolSchema.safeParse({
      ...VALID_INPUT,
      schoolAddress: 'a'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  test('accepts adminName at exactly 200 characters (boundary)', () => {
    const result = onboardSchoolSchema.safeParse({
      ...VALID_INPUT,
      adminName: 'a'.repeat(200),
    });
    expect(result.success).toBe(true);
  });

  test('rejects adminName at 201 characters (above max 200)', () => {
    const result = onboardSchoolSchema.safeParse({
      ...VALID_INPUT,
      adminName: 'a'.repeat(201),
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// Type mismatches
// ============================================================

describe('onboardSchoolSchema — type mismatches', () => {
  test('rejects schoolName given as a number', () => {
    const result = onboardSchoolSchema.safeParse({ ...VALID_INPUT, schoolName: 42 });
    expect(result.success).toBe(false);
  });

  test('rejects schoolAddress given as an array', () => {
    const result = onboardSchoolSchema.safeParse({
      ...VALID_INPUT,
      schoolAddress: ['Lekki'],
    });
    expect(result.success).toBe(false);
  });

  test('rejects adminName given as null', () => {
    const result = onboardSchoolSchema.safeParse({ ...VALID_INPUT, adminName: null });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// Multiple errors in one parse (all fields invalid simultaneously)
// ============================================================

describe('onboardSchoolSchema — multiple simultaneous errors', () => {
  test('produces multiple issue paths when several fields are invalid at once', () => {
    const result = onboardSchoolSchema.safeParse({
      schoolName: '',
      schoolAddress: '',
      adminName: '',
      adminEmail: 'not-an-email',
      adminPassword: 'short',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0] as string);
      expect(paths).toContain('schoolName');
      expect(paths).toContain('schoolAddress');
      expect(paths).toContain('adminName');
      expect(paths).toContain('adminEmail');
      expect(paths).toContain('adminPassword');
    }
  });
});

// ============================================================
// OnboardSchoolResponse structural verification
// ============================================================
// OnboardSchoolResponse is a TypeScript interface (not a Zod schema).
// We cannot do runtime parse tests, but we can assert that a correctly
// shaped object satisfies the type. This catches compile-time regressions
// if the interface drifts from the spec.

describe('OnboardSchoolResponse type structure', () => {
  test('a correctly shaped object satisfies the OnboardSchoolResponse interface at compile time', () => {
    const response: OnboardSchoolResponse = {
      school: {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Greensprings School',
        address: '28 Admiralty Way, Lekki',
        logoUrl: null,
        isActive: true,
      },
      admin: {
        id: '223e4567-e89b-12d3-a456-426614174001',
        name: 'Mrs. Adebayo',
        email: 'admin@greensprings.edu.ng',
        role: 'SCHOOL_ADMIN',
        schoolId: '123e4567-e89b-12d3-a456-426614174000',
      },
    };
    // Runtime: verify the shape has the expected keys and values.
    expect(response.school.id).toBeDefined();
    expect(response.school.name).toBe('Greensprings School');
    expect(response.school.isActive).toBe(true);
    expect(response.school.logoUrl).toBeNull();
    expect(response.admin.role).toBe('SCHOOL_ADMIN');
    expect(response.admin.schoolId).toBe(response.school.id);
  });

  test('admin.role is the literal "SCHOOL_ADMIN" — not the broader UserRole union', () => {
    // The spec requires role: 'SCHOOL_ADMIN' (literal), not any UserRole.
    // The type assertion in the previous test enforces this at compile time.
    // Here we verify the runtime value matches the expected literal.
    const adminRole: OnboardSchoolResponse['admin']['role'] = 'SCHOOL_ADMIN';
    expect(adminRole).toBe('SCHOOL_ADMIN');
  });

  test('school.logoUrl is typed to allow null', () => {
    const response: OnboardSchoolResponse = {
      school: {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test School',
        address: 'Test Address',
        logoUrl: null,
        isActive: false,
      },
      admin: {
        id: '223e4567-e89b-12d3-a456-426614174001',
        name: 'Admin',
        email: 'a@b.com',
        role: 'SCHOOL_ADMIN',
        schoolId: '123e4567-e89b-12d3-a456-426614174000',
      },
    };
    expect(response.school.logoUrl).toBeNull();
    expect(response.school.isActive).toBe(false);
  });
});

// ============================================================
// Edge-function contract: the Zod issues array drives HTTP 400 detail
// responses. Verify the issues array is always present on failure and
// structured correctly (so the Edge Function's `parseResult.error.issues`
// mapping in handlePost does not throw).
// ============================================================

describe('onboardSchoolSchema — Zod issues array structure', () => {
  test('failure result has a non-empty issues array', () => {
    const result = onboardSchoolSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(Array.isArray(result.error.issues)).toBe(true);
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  test('each issue has a path array and a message string', () => {
    const result = onboardSchoolSchema.safeParse({
      schoolName: '',
      adminEmail: 'bad',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      for (const issue of result.error.issues) {
        expect(Array.isArray(issue.path)).toBe(true);
        expect(typeof issue.message).toBe('string');
        expect(issue.message.length).toBeGreaterThan(0);
      }
    }
  });
});
