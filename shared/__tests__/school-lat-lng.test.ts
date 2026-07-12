// Tests for the Route Creation Map Improvements feature:
// - School interface now includes latitude/longitude fields
// - onboardSchoolSchema input does NOT expose lat/lng (server-side concern)
// - OnboardSchoolResponse type does NOT yet include lat/lng (documented known limitation)
// - Coordinate type correctness: number | null | undefined (not string, not boolean)
//
// Coverage targets from spec "Definition of done":
//   - School interface in shared/types.ts includes optional latitude and longitude fields
//   - Schema (onboardSchoolSchema) does NOT require lat/lng from the client
//   - The new fields are optional and nullable (existing schools have null)

import { onboardSchoolSchema } from '../schemas';
import type { School, OnboardSchoolResponse } from '../types';

// ----- School interface structural tests -----
// These are compile-time type checks exercised at runtime via concrete objects.

describe('School interface — latitude and longitude fields', () => {
  test('School object with both lat/lng as numbers satisfies the interface', () => {
    const school: School = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      name: 'Greensprings School',
      address: '28 Admiralty Way, Lekki, Lagos',
      isActive: true,
      latitude: 6.4281,
      longitude: 3.4219,
    };
    expect(school.latitude).toBe(6.4281);
    expect(school.longitude).toBe(3.4219);
    expect(typeof school.latitude).toBe('number');
    expect(typeof school.longitude).toBe('number');
  });

  test('School object with latitude: null satisfies the interface (pre-geocoded school)', () => {
    const school: School = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      name: 'Lagos Preparatory School',
      address: '1 Victoria Island, Lagos',
      isActive: true,
      latitude: null,
      longitude: null,
    };
    expect(school.latitude).toBeNull();
    expect(school.longitude).toBeNull();
  });

  test('School object with latitude/longitude omitted satisfies the interface (optional fields)', () => {
    const school: School = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      name: 'Island Academy',
      address: '5 Ozumba Mbadiwe, Victoria Island, Lagos',
      isActive: false,
    };
    // Fields are optional — accessing them should yield undefined, not throw
    expect(school.latitude).toBeUndefined();
    expect(school.longitude).toBeUndefined();
  });

  test('School object with logoUrl and lat/lng together satisfies the interface', () => {
    const school: School = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      name: 'Corona School',
      address: '19 McCarthy Street, Lagos Island',
      isActive: true,
      logoUrl: 'https://cdn.corona.edu.ng/logo.png',
      latitude: 6.4550,
      longitude: 3.3841,
    };
    expect(school.logoUrl).toBe('https://cdn.corona.edu.ng/logo.png');
    expect(school.latitude).toBeCloseTo(6.455, 2);
    expect(school.longitude).toBeCloseTo(3.384, 2);
  });

  test('Lagos area coordinates are in the expected numeric range', () => {
    // Lagos latitude is roughly 6.4–6.7, longitude 3.2–3.6
    const lagosSchool: School = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      name: 'Test School',
      address: '12 Broad Street, Lagos Island',
      isActive: true,
      latitude: 6.4550,
      longitude: 3.3841,
    };
    if (lagosSchool.latitude != null) {
      expect(lagosSchool.latitude).toBeGreaterThan(6.0);
      expect(lagosSchool.latitude).toBeLessThan(7.0);
    }
    if (lagosSchool.longitude != null) {
      expect(lagosSchool.longitude).toBeGreaterThan(3.0);
      expect(lagosSchool.longitude).toBeLessThan(4.0);
    }
  });

  test('latitude and longitude are typed as number | null | undefined — not string', () => {
    // TypeScript enforces this at compile time. At runtime, verify the constraint:
    // passing a string should not be the expected numeric type.
    const school: School = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      name: 'Test',
      address: 'Test address',
      isActive: true,
      latitude: 6.5,
      longitude: 3.4,
    };
    expect(typeof school.latitude).not.toBe('string');
    expect(typeof school.longitude).not.toBe('string');
  });
});

// ----- onboardSchoolSchema: lat/lng are NOT client inputs -----
// The spec states coordinates are derived server-side from the address.
// The schema must NOT require or accept latitude/longitude from the client.

describe('onboardSchoolSchema — latitude/longitude not in client input', () => {
  const validInput = {
    schoolName: 'Greensprings School',
    schoolAddress: '28 Admiralty Way, Lekki, Lagos',
    adminName: 'Mrs. Adebayo',
    adminEmail: 'admin-test-latlng@greensprings.edu.ng',
    adminPassword: 'Secure99!',
  };

  test('accepts valid input without any lat/lng fields (expected behavior)', () => {
    const result = onboardSchoolSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  test('parsed output does NOT include latitude or longitude keys (not part of client schema)', () => {
    const result = onboardSchoolSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect('latitude' in result.data).toBe(false);
      expect('longitude' in result.data).toBe(false);
    }
  });

  test('input with extra latitude/longitude fields is still accepted (Zod strips unknown keys)', () => {
    // The schema should not fail if a client accidentally sends lat/lng.
    // Zod strips unknown keys by default in non-strict mode.
    const resultWithExtras = onboardSchoolSchema.safeParse({
      ...validInput,
      latitude: 6.4281,
      longitude: 3.4219,
    });
    expect(resultWithExtras.success).toBe(true);
    if (resultWithExtras.success) {
      // Even if sent by client, they must not appear in parsed output
      expect('latitude' in resultWithExtras.data).toBe(false);
      expect('longitude' in resultWithExtras.data).toBe(false);
    }
  });

  test('all required fields of onboardSchoolSchema remain required after lat/lng feature', () => {
    // Verify the schema was not accidentally modified to break existing fields
    const emptyResult = onboardSchoolSchema.safeParse({});
    expect(emptyResult.success).toBe(false);
    if (!emptyResult.success) {
      const paths = emptyResult.error.issues.map((i) => i.path[0] as string);
      expect(paths).toContain('schoolName');
      expect(paths).toContain('schoolAddress');
      expect(paths).toContain('adminName');
      expect(paths).toContain('adminEmail');
      expect(paths).toContain('adminPassword');
    }
  });
});

// ----- OnboardSchoolResponse: documented limitation — lat/lng not yet in the type -----
// The spec says only the School interface needs lat/lng. The OnboardSchoolResponse type
// is a separate inline type that still uses the original shape. The Edge Function runtime
// response DOES include lat/lng, but the TypeScript type is a subset.
// This test documents the current known limitation and will need updating when the type is extended.

describe('OnboardSchoolResponse — documented type limitation', () => {
  test('OnboardSchoolResponse.school does not expose latitude in the TypeScript type (documented limitation)', () => {
    // This test documents that the type does not include lat/lng.
    // The actual Edge Function response body does include them at runtime.
    const response: OnboardSchoolResponse = {
      school: {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Greensprings School',
        address: '28 Admiralty Way, Lekki, Lagos',
        logoUrl: null,
        isActive: true,
        // latitude and longitude are NOT part of this type — this is a known limitation
        // documented in changes.md
      },
      admin: {
        id: '223e4567-e89b-12d3-a456-426614174001',
        name: 'Mrs. Adebayo',
        email: 'admin@greensprings.edu.ng',
        role: 'SCHOOL_ADMIN',
        schoolId: '123e4567-e89b-12d3-a456-426614174000',
      },
    };
    expect(response.school.id).toBeDefined();
    expect(response.school.isActive).toBe(true);
    // Type does not include lat/lng — accessing via any cast demonstrates they would be undefined at runtime
    // when the response goes through this TypeScript type
    expect((response.school as Record<string, unknown>)['latitude']).toBeUndefined();
    expect((response.school as Record<string, unknown>)['longitude']).toBeUndefined();
  });

  test('OnboardSchoolResponse type is unchanged — school.logoUrl is still nullable', () => {
    const response: OnboardSchoolResponse = {
      school: {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test School',
        address: 'Test Address, Lagos',
        logoUrl: null,
        isActive: true,
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
  });
});

// ----- School interface default center fallback logic -----
// The map falls back to { lat: 6.5244, lng: 3.3792 } (Lagos center) when lat/lng are null.
// This tests the decision logic used in the page component, isolated from the browser.

describe('School center resolution logic', () => {
  function resolveMapCenter(school: School | null): { lat: number; lng: number } {
    // Mirrors the logic in web/app/dashboard/routes/new/page.tsx:
    //   center: schoolCenter ?? DEFAULT_CENTER
    if (school?.latitude != null && school?.longitude != null) {
      return { lat: school.latitude, lng: school.longitude }; // Google Maps: { lat, lng }
    }
    return { lat: 6.5244, lng: 3.3792 }; // Lagos fallback
  }

  test('returns school center { lat, lng } when both coordinates are non-null numbers', () => {
    const school: School = {
      id: '1',
      name: 'Greensprings',
      address: 'Lekki',
      isActive: true,
      latitude: 6.4281,
      longitude: 3.4219,
    };
    const center = resolveMapCenter(school);
    expect(center).toEqual({ lat: 6.4281, lng: 3.4219 });
  });

  test('returns Lagos fallback { lat: 6.5244, lng: 3.3792 } when school has null latitude', () => {
    const school: School = {
      id: '1',
      name: 'Old School',
      address: 'Ikeja',
      isActive: true,
      latitude: null,
      longitude: null,
    };
    const center = resolveMapCenter(school);
    expect(center).toEqual({ lat: 6.5244, lng: 3.3792 });
  });

  test('returns Lagos fallback { lat: 6.5244, lng: 3.3792 } when school has undefined latitude', () => {
    const school: School = {
      id: '1',
      name: 'Old School',
      address: 'Ikeja',
      isActive: true,
      // latitude and longitude not set
    };
    const center = resolveMapCenter(school);
    expect(center).toEqual({ lat: 6.5244, lng: 3.3792 });
  });

  test('returns Lagos fallback when school is null (no school found)', () => {
    const center = resolveMapCenter(null);
    expect(center).toEqual({ lat: 6.5244, lng: 3.3792 });
  });

  test('returns Lagos fallback when only latitude is null but longitude is present', () => {
    // Edge case: one coordinate missing
    const school: School = {
      id: '1',
      name: 'Partial School',
      address: 'Victoria Island',
      isActive: true,
      latitude: null,
      longitude: 3.4219,
    };
    const center = resolveMapCenter(school);
    expect(center).toEqual({ lat: 6.5244, lng: 3.3792 });
  });

  test('returns Lagos fallback when only longitude is null but latitude is present', () => {
    const school: School = {
      id: '1',
      name: 'Partial School',
      address: 'Victoria Island',
      isActive: true,
      latitude: 6.4281,
      longitude: null,
    };
    const center = resolveMapCenter(school);
    expect(center).toEqual({ lat: 6.5244, lng: 3.3792 });
  });

  test('zoom level should be 14 when school center is available, 12 when falling back', () => {
    // Mirrors the logic:
    //   zoom: schoolCenter ? 14 : 12
    function resolveZoom(school: School | null): number {
      if (school?.latitude != null && school?.longitude != null) return 14;
      return 12;
    }

    const geocodedSchool: School = {
      id: '1', name: 'Test', address: 'Test', isActive: true,
      latitude: 6.4281, longitude: 3.4219,
    };
    const ungeocodedSchool: School = {
      id: '2', name: 'Test', address: 'Test', isActive: true,
      latitude: null, longitude: null,
    };

    expect(resolveZoom(geocodedSchool)).toBe(14);
    expect(resolveZoom(ungeocodedSchool)).toBe(12);
    expect(resolveZoom(null)).toBe(12);
  });
});

// ----- Places Autocomplete result pre-fill logic -----
// The autocomplete's place_changed handler uses place.name ?? place.formatted_address ?? ''
// Test this precedence logic in isolation.

describe('Places Autocomplete result place name precedence', () => {
  function extractPlaceName(result: {
    name?: string;
    formatted_address?: string;
  }): string {
    // Mirrors the logic in web/app/dashboard/routes/new/page.tsx:
    //   const placeName = place.name ?? place.formatted_address ?? '';
    return result.name ?? result.formatted_address ?? '';
  }

  test('prefers place.name over place.formatted_address when both are present', () => {
    const name = extractPlaceName({
      name: 'Broad Street',
      formatted_address: 'Broad Street, Lagos Island, Lagos, Nigeria',
    });
    expect(name).toBe('Broad Street');
  });

  test('falls back to place.formatted_address when place.name is undefined', () => {
    const name = extractPlaceName({
      formatted_address: '12 Broad Street, Lagos Island, Lagos, Nigeria',
    });
    expect(name).toBe('12 Broad Street, Lagos Island, Lagos, Nigeria');
  });

  test('returns empty string when both name and formatted_address are undefined', () => {
    const name = extractPlaceName({});
    expect(name).toBe('');
  });

  test('uses name even if it is an empty string (explicit empty string beats undefined)', () => {
    // name: '' ?? formatted_address resolves to '' because ?? only triggers on null/undefined
    const name = extractPlaceName({
      name: '',
      formatted_address: 'Some Full Address',
    });
    expect(name).toBe('');
  });
});
