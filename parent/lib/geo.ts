// Trimmed copy of shared/geo.ts (haversine + ETA only). parent/ builds
// standalone on Vercel with its own root, so it can't import ../shared
// directly — keep these two in sync with shared/geo.ts if they change.

const EARTH_RADIUS_M = 6_371_000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance between two points, in metres. */
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

/** Seconds to cover the distance at the given speed; Infinity when speed is 0. */
export function estimateETA(distanceMetres: number, speedKmh: number): number {
  if (speedKmh <= 0) return Infinity;
  return distanceMetres / (speedKmh / 3.6);
}
