// ============================================================
// BusBuzz geospatial utilities
// All distance and ETA calculations go here.
// ============================================================

const EARTH_RADIUS_M = 6_371_000; // Earth's mean radius in metres

/**
 * Convert degrees to radians.
 */
function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Calculate the great-circle distance between two points using the
 * Haversine formula.
 *
 * @param lat1 - Latitude of point 1 in decimal degrees
 * @param lon1 - Longitude of point 1 in decimal degrees
 * @param lat2 - Latitude of point 2 in decimal degrees
 * @param lon2 - Longitude of point 2 in decimal degrees
 * @returns Distance in metres
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_M * c;
}

/**
 * Check whether a point is within a given radius of a target point.
 *
 * @param pointLat - Latitude of the point to test (decimal degrees)
 * @param pointLng - Longitude of the point to test (decimal degrees)
 * @param targetLat - Latitude of the target/centre point (decimal degrees)
 * @param targetLng - Longitude of the target/centre point (decimal degrees)
 * @param radiusMetres - Radius in metres
 * @returns true if the point is within the radius (inclusive)
 */
export function isWithinRadius(
  pointLat: number,
  pointLng: number,
  targetLat: number,
  targetLng: number,
  radiusMetres: number,
): boolean {
  return haversineDistance(pointLat, pointLng, targetLat, targetLng) <= radiusMetres;
}

/**
 * Initial bearing from point 1 to point 2, in degrees clockwise from north
 * (0–360). Used to judge whether a vehicle is heading toward a stop.
 */
export function bearingDegrees(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const φ1 = toRadians(lat1);
  const φ2 = toRadians(lat2);
  const Δλ = toRadians(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

/**
 * Smallest absolute difference between two bearings, in degrees (0–180).
 */
export function bearingDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Estimate time of arrival given distance remaining and current speed.
 *
 * @param distanceMetres - Remaining distance in metres
 * @param speedKmh - Current speed in kilometres per hour
 * @returns Estimated time in seconds. Returns Infinity if speed is 0.
 */
export function estimateETA(
  distanceMetres: number,
  speedKmh: number,
): number {
  if (speedKmh <= 0) {
    return Infinity;
  }
  const speedMs = speedKmh / 3.6; // convert km/h to m/s
  return distanceMetres / speedMs;
}
