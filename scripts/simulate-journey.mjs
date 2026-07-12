import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL;
const DRIVER_JWT = process.env.SIMULATION_DRIVER_JWT;

if (!SUPABASE_URL || !DRIVER_JWT) {
  console.error('ERROR: SUPABASE_URL and SIMULATION_DRIVER_JWT must be set in .env');
  process.exit(1);
}

const BUS_ID = 'bbbbbbbb-0000-0000-0000-000000000010';
const ROUTE_ID = 'bbbbbbbb-0000-0000-0000-000000000020';
const STUDENT_ID = 'bbbbbbbb-0000-0000-0000-000000000040';
const DEVICE_ID = 'SIM_DEVICE_EJIGBO';
const PING_INTERVAL_MS = 4000; // 4 seconds between GPS pings

const STOPS = [
  { lat: 6.4598557, lng: 3.3362686, name: 'School Gate' },
  { lat: 6.4720,    lng: 3.3235,    name: 'Mushin Market' },
  { lat: 6.4865,    lng: 3.3105,    name: 'Idi-Araba' },
  { lat: 6.5010,    lng: 3.2995,    name: 'Isolo Junction' },
  { lat: 6.5105,    lng: 3.2935,    name: 'Ejigbo Road' },
  { lat: 6.518898,  lng: 3.2882858, name: 'Parent Home — Ejigbo' },
];

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000; // meters
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const baseUrl = `${SUPABASE_URL}/functions/v1`;
const headers = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer ' + DRIVER_JWT,
};

async function callFunction(name, body) {
  console.log(`Calling ${name}...`);
  const response = await fetch(`${baseUrl}/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const json = await response.json();
  return { response, json };
}

function generateWaypoints() {
  const waypoints = [];

  // First waypoint is stop 1 itself with speed 0
  waypoints.push({ lat: STOPS[0].lat, lng: STOPS[0].lng, speed: 0 });

  // 5 segments between 6 stops, 10 interpolated points each
  for (let seg = 0; seg < STOPS.length - 1; seg++) {
    const start = STOPS[seg];
    const end = STOPS[seg + 1];
    for (let step = 1; step <= 10; step++) {
      const t = step / 10;
      const lat = start.lat + t * (end.lat - start.lat);
      const lng = start.lng + t * (end.lng - start.lng);
      waypoints.push({ lat, lng, speed: 0 }); // speed filled below
    }
  }

  // Calculate speeds
  for (let i = 1; i < waypoints.length; i++) {
    const prev = waypoints[i - 1];
    const curr = waypoints[i];
    const distanceM = haversine(prev.lat, prev.lng, curr.lat, curr.lng);
    const speedMs = distanceM / (PING_INTERVAL_MS / 1000);
    waypoints[i].speed = speedMs * 3.6; // convert m/s to km/h
  }

  return waypoints;
}

async function main() {
  const waypoints = generateWaypoints();
  console.log(`Generated ${waypoints.length} waypoints`);

  // Step A — Start trip
  const { response: startResponse, json: startJson } = await callFunction('start-trip', {
    busId: BUS_ID,
    routeId: ROUTE_ID,
  });

  if (!startResponse.ok) {
    console.error(`ERROR: start-trip returned ${startResponse.status}: ${JSON.stringify(startJson)}`);
    process.exit(1);
  }

  const tripId = startJson.data.id;
  console.log(`Trip started: ${tripId}`);

  // Step B — Mark BOARDED
  const { response: boardedResponse } = await callFunction('mark-attendance', {
    tripId,
    studentId: STUDENT_ID,
    status: 'BOARDED',
  });

  if (!boardedResponse.ok) {
    const text = await boardedResponse.text().catch(() => '');
    console.warn(`WARNING: mark-attendance (BOARDED) returned ${boardedResponse.status}: ${text}`);
  } else {
    console.log('Marked Chidi as BOARDED — push notification sent');
  }

  // Step C — GPS ping loop
  for (let i = 0; i < waypoints.length; i++) {
    const waypoint = waypoints[i];
    const { response: gpsResponse } = await callFunction('gps-update', {
      tripId,
      busId: BUS_ID,
      lat: waypoint.lat,
      lng: waypoint.lng,
      speed: waypoint.speed,
      timestamp: new Date().toISOString(),
      deviceId: DEVICE_ID,
    });

    if (!gpsResponse.ok) {
      const text = await gpsResponse.text().catch(() => '');
      console.warn(`WARNING: gps-update returned ${gpsResponse.status}: ${text}`);
    }

    console.log(`[${i + 1}/51] Ping at ${waypoint.lat.toFixed(6)}, ${waypoint.lng.toFixed(6)} — speed: ${waypoint.speed.toFixed(1)} km/h`);

    // Wait between pings, but not after the last one
    if (i < waypoints.length - 1) {
      await new Promise((r) => setTimeout(r, PING_INTERVAL_MS));
    }
  }

  // Step D — Mark DROPPED_OFF
  const { response: droppedResponse } = await callFunction('mark-attendance', {
    tripId,
    studentId: STUDENT_ID,
    status: 'DROPPED_OFF',
  });

  if (!droppedResponse.ok) {
    const text = await droppedResponse.text().catch(() => '');
    console.warn(`WARNING: mark-attendance (DROPPED_OFF) returned ${droppedResponse.status}: ${text}`);
  } else {
    console.log('Marked Chidi as DROPPED_OFF — push notification sent');
  }

  // Step E — End trip
  const { response: endResponse } = await callFunction('end-trip', { tripId });

  if (!endResponse.ok) {
    const text = await endResponse.text().catch(() => '');
    console.warn(`WARNING: end-trip returned ${endResponse.status}: ${text}`);
  }

  console.log('Trip ended. Simulation complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
