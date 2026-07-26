// Snaps the driver's "road ahead" line (bus -> current stop -> remaining
// stops) to actual streets via Mapbox's Directions API, instead of the
// straight-line waypoint connector AttendanceScreen used to draw directly.
// A straight line visibly cut through blocks whenever the real road curved
// or simply didn't run in a direct line between two points.
import type { LatLng } from './AttendanceMap';

const DIRECTIONS_URL = 'https://api.mapbox.com/directions/v5/mapbox/driving';

// Mapbox's driving profile accepts at most 25 coordinates per request —
// comfortably more than a school run's stop count ever reaches.
const MAX_WAYPOINTS = 25;

// Fetches a road-snapped path through the given waypoints, in order. Returns
// null on any failure (no token, bad response, fewer than 2 usable points)
// so the caller can fall back to the straight-line connector rather than
// showing nothing.
export async function fetchRoadRoute(
  waypoints: LatLng[],
  accessToken: string,
): Promise<LatLng[] | null> {
  if (waypoints.length < 2 || !accessToken) return null;

  const points = waypoints.slice(0, MAX_WAYPOINTS);
  const coordString = points.map((p) => `${p.lng},${p.lat}`).join(';');
  const url =
    `${DIRECTIONS_URL}/${coordString}` +
    `?geometries=geojson&overview=full&access_token=${accessToken}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;

    const body = await res.json();
    const coords: Array<[number, number]> | undefined = body?.routes?.[0]?.geometry?.coordinates;
    if (!coords || coords.length < 2) return null;

    return coords.map(([lng, lat]) => ({ lat, lng }));
  } catch {
    return null;
  }
}
