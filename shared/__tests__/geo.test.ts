import { haversineDistance, isWithinRadius, estimateETA } from '../geo';

describe('haversineDistance', () => {
  test('distance between identical points is 0', () => {
    expect(haversineDistance(6.5244, 3.3792, 6.5244, 3.3792)).toBeCloseTo(0, 6);
  });

  test('known distance: Lagos (Ikeja) to Abuja landmark ~ 524km (sanity, large scale)', () => {
    // Lagos Ikeja: 6.6018, 3.3515  Abuja: 9.0765, 7.3986
    const d = haversineDistance(6.6018, 3.3515, 9.0765, 7.3986);
    // Independently computed great-circle distance is approximately 524 km (523,865 m)
    expect(d).toBeGreaterThan(510_000);
    expect(d).toBeLessThan(535_000);
  });

  test('known distance: 1 degree of latitude is approximately 111.19 km', () => {
    const d = haversineDistance(0, 0, 1, 0);
    expect(d).toBeGreaterThan(110_500);
    expect(d).toBeLessThan(111_500);
  });

  test('known distance: short distance between two close points in Lagos (~157m)', () => {
    // Two points roughly 150-160m apart computed independently via online haversine calculator
    const d = haversineDistance(6.5244, 3.3792, 6.5258, 3.3792);
    expect(d).toBeGreaterThan(140);
    expect(d).toBeLessThan(170);
  });

  test('distance is symmetric: d(A,B) === d(B,A)', () => {
    const d1 = haversineDistance(6.5244, 3.3792, 6.6018, 3.3515);
    const d2 = haversineDistance(6.6018, 3.3515, 6.5244, 3.3792);
    expect(d1).toBeCloseTo(d2, 9);
  });

  test('distance across the antimeridian (lon 179 to -179) is small, not ~358 degrees worth', () => {
    const d = haversineDistance(0, 179, 0, -179);
    // 2 degrees of longitude at equator ~ 222 km, NOT ~39,800km
    expect(d).toBeGreaterThan(200_000);
    expect(d).toBeLessThan(240_000);
  });

  test('distance between north and south pole is approximately half Earth circumference (~20015km)', () => {
    const d = haversineDistance(90, 0, -90, 0);
    expect(d).toBeGreaterThan(19_900_000);
    expect(d).toBeLessThan(20_100_000);
  });

  test('negative coordinates work correctly (southern/western hemisphere)', () => {
    const d = haversineDistance(-6.5244, -3.3792, -6.5244, -3.3792);
    expect(d).toBeCloseTo(0, 6);
  });
});

describe('isWithinRadius', () => {
  test('returns true when point is exactly at target (distance 0)', () => {
    expect(isWithinRadius(6.5244, 3.3792, 6.5244, 3.3792, 0)).toBe(true);
  });

  test('returns true when distance is well within radius', () => {
    // ~157m apart, radius 300m (BusBuzz geofence default)
    expect(isWithinRadius(6.5244, 3.3792, 6.5258, 3.3792, 300)).toBe(true);
  });

  test('returns false when distance exceeds radius', () => {
    // ~157m apart, radius 50m
    expect(isWithinRadius(6.5244, 3.3792, 6.5258, 3.3792, 50)).toBe(false);
  });

  test('boundary: distance exactly equal to radius is inclusive (true)', () => {
    // Construct two points whose distance we compute first, then use that exact value as the radius
    const lat1 = 6.5244;
    const lon1 = 3.3792;
    const lat2 = 6.53;
    const lon2 = 3.38;
    const exactDistance = haversineDistance(lat1, lon1, lat2, lon2);
    expect(isWithinRadius(lat1, lon1, lat2, lon2, exactDistance)).toBe(true);
  });

  test('boundary: distance just 1m over the radius returns false', () => {
    const lat1 = 6.5244;
    const lon1 = 3.3792;
    const lat2 = 6.53;
    const lon2 = 3.38;
    const exactDistance = haversineDistance(lat1, lon1, lat2, lon2);
    expect(isWithinRadius(lat1, lon1, lat2, lon2, exactDistance - 1)).toBe(false);
  });

  test('returns false for radius of 0 when points are not identical', () => {
    expect(isWithinRadius(6.5244, 3.3792, 6.5258, 3.3792, 0)).toBe(false);
  });

  test('geofence use case: 300m default radius (EXPO_PUBLIC_GEOFENCE_RADIUS_M)', () => {
    // A stop 250m away should trigger approach alert
    // 1 degree latitude ~ 111,190m, so 250m ~ 0.002248 degrees
    const stopLat = 6.5244;
    const stopLng = 3.3792;
    const busLat = stopLat + 0.00225; // approx 250m north
    expect(isWithinRadius(busLat, stopLng, stopLat, stopLng, 300)).toBe(true);
  });
});

describe('estimateETA', () => {
  test('returns Infinity when speed is exactly 0', () => {
    expect(estimateETA(1000, 0)).toBe(Infinity);
  });

  test('returns Infinity when speed is negative', () => {
    expect(estimateETA(1000, -10)).toBe(Infinity);
  });

  test('returns 0 seconds when distance is 0 and speed is positive', () => {
    expect(estimateETA(0, 40)).toBe(0);
  });

  test('known calculation: 1000m at 36 km/h (10 m/s) takes 100 seconds', () => {
    expect(estimateETA(1000, 36)).toBeCloseTo(100, 6);
  });

  test('known calculation: 5000m at 50 km/h takes 360 seconds', () => {
    // 50km/h = 13.888...m/s -> 5000 / 13.8889 = 360s
    expect(estimateETA(5000, 50)).toBeCloseTo(360, 1);
  });

  test('higher speed yields shorter ETA for same distance', () => {
    const etaSlow = estimateETA(1000, 20);
    const etaFast = estimateETA(1000, 80);
    expect(etaFast).toBeLessThan(etaSlow);
  });

  test('negative distance with positive speed returns a negative ETA (documents current behaviour, not validated by the function)', () => {
    // estimateETA does not validate distanceMetres >= 0 — this test documents that
    // pure-function design choice rather than asserting it is "correct" domain behaviour.
    expect(estimateETA(-100, 36)).toBeLessThan(0);
  });
});
