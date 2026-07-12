// Simulate a driver's GPS along a route, from the school to each student's
// pickup point — for testing the parent app's live tracking without driving.
//
// It replays exactly what the driver app + gps-update do: it broadcasts
// `location_update` on the `bus:{busId}` Realtime channel (which the parent app
// subscribes to) and records trip_locations breadcrumbs. An ACTIVE trip is
// created so the parent app subscribes, then completed on exit.
//
// Usage (from repo root):
//   SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/simulate-driver.mjs
//   SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/simulate-driver.mjs --route <routeId> --step 1500 --keep
//
// Flags:
//   --route <id>  route to run (default: Bucknor)
//   --step <ms>   delay between GPS pings (default 1500)
//   --seg <n>     interpolation points per leg (default 22)
//   --loop        repeat the path until Ctrl+C
//   --keep        leave the trip ACTIVE on exit (default: mark COMPLETED)

import { createClient } from '@supabase/supabase-js';

const URL =
  process.env.SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  'https://nmgvnoudmxrzqthnfxkk.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error(
    'Missing SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Get it from Supabase → Project Settings → API → service_role, then:\n' +
      '  SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/simulate-driver.mjs',
  );
  process.exit(1);
}

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const ROUTE_ID = arg('--route', '4311071a-f351-4955-916a-5404269b0e8f'); // Bucknor
const STEP_MS = Number(arg('--step', '1500'));
const SEG_STEPS = Number(arg('--seg', '22'));
const LOOP = process.argv.includes('--loop');
const KEEP = process.argv.includes('--keep');

const sb = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function haversine(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

async function loadRoute() {
  const { data: route, error: rErr } = await sb
    .from('routes')
    .select('id, name, bus_id')
    .eq('id', ROUTE_ID)
    .single();
  if (rErr || !route) throw new Error(`Route not found: ${rErr?.message}`);
  if (!route.bus_id) throw new Error('Route has no bus assigned.');

  const { data: bus } = await sb
    .from('buses')
    .select('id, plate_number, device_id, school_id')
    .eq('id', route.bus_id)
    .single();
  if (!bus) throw new Error('Bus not found for route.');

  const { data: school } = await sb
    .from('schools')
    .select('name, latitude, longitude')
    .eq('id', bus.school_id)
    .single();

  const { data: students } = await sb
    .from('students')
    .select('name, pickup_lat, pickup_lng')
    .eq('route_id', route.id)
    .eq('is_active', true)
    .not('pickup_lat', 'is', null)
    .not('pickup_lng', 'is', null);

  return { route, bus, school, students: students ?? [] };
}

async function ensureTrip(bus, routeId) {
  const { data: existing } = await sb
    .from('trips')
    .select('id')
    .eq('bus_id', bus.id)
    .eq('status', 'ACTIVE')
    .maybeSingle();
  if (existing) return { id: existing.id, created: false };

  const { data: driver } = await sb
    .from('buses')
    .select('driver_id')
    .eq('id', bus.id)
    .single();

  const { data: trip, error } = await sb
    .from('trips')
    .insert({
      bus_id: bus.id,
      route_id: routeId,
      driver_id: driver?.driver_id ?? null,
      status: 'ACTIVE',
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error) throw new Error(`Could not create trip: ${error.message}`);
  return { id: trip.id, created: true };
}

async function broadcastPoint(busId, tripId, lat, lng, speed) {
  const timestamp = new Date().toISOString();
  // Publish on the private bus channel via the REST endpoint (the service key
  // is authorised). Matches what the deployed gps-update does.
  await fetch(`${URL}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({
      messages: [
        { topic: `bus:${busId}`, event: 'location_update', payload: { lat, lng, speed, timestamp, busId }, private: true },
      ],
    }),
  });
  await sb.from('trip_locations').insert({
    trip_id: tripId,
    latitude: lat,
    longitude: lng,
    speed,
    recorded_at: timestamp,
  });
}

async function main() {
  const { route, bus, school, students } = await loadRoute();

  const start =
    school?.latitude != null && school?.longitude != null
      ? { name: `${school.name} (school)`, lat: school.latitude, lng: school.longitude }
      : null;

  // North-to-south by latitude makes a sensible pickup order from the school.
  const stops = students
    .map((s) => ({ name: s.name, lat: s.pickup_lat, lng: s.pickup_lng }))
    .sort((a, b) => b.lat - a.lat);

  const waypoints = [start, ...stops].filter(Boolean);
  if (waypoints.length < 2) {
    throw new Error('Need at least a school location + one student pickup with coordinates.');
  }

  const trip = await ensureTrip(bus, route.id);

  console.log(`Route:  ${route.name}  ·  Bus ${bus.plate_number}`);
  console.log(`Trip:   ${trip.id} ${trip.created ? '(created)' : '(reused existing active trip)'}`);
  console.log('Path:   ' + waypoints.map((w) => w.name).join('  →  '));
  console.log('Open the parent app on a student on this route to watch.\n');

  let stop = false;
  const cleanup = async () => {
    if (stop) return;
    stop = true;
    if (!KEEP) {
      await sb
        .from('trips')
        .update({ status: 'COMPLETED', ended_at: new Date().toISOString() })
        .eq('id', trip.id);
      console.log('\nTrip marked COMPLETED.');
    } else {
      console.log('\nTrip left ACTIVE (--keep).');
    }
    await sb.removeAllChannels();
    process.exit(0);
  };
  process.on('SIGINT', cleanup);

  do {
    for (let i = 0; i < waypoints.length - 1; i++) {
      const a = waypoints[i];
      const b = waypoints[i + 1];
      console.log(`→ heading to ${b.name}`);
      for (let s = 1; s <= SEG_STEPS; s++) {
        if (stop) return;
        const t = s / SEG_STEPS;
        const lat = a.lat + (b.lat - a.lat) * t;
        const lng = a.lng + (b.lng - a.lng) * t;
        const segMeters = haversine(a, b) / SEG_STEPS;
        const speed = Math.round((segMeters / (STEP_MS / 1000)) * 3.6); // km/h
        await broadcastPoint(bus.id, trip.id, lat, lng, speed);
        await sleep(STEP_MS);
      }
      console.log(`   arrived at ${b.name}`);
      await sleep(STEP_MS * 2);
    }
  } while (LOOP && !stop);

  await cleanup();
}

main().catch(async (err) => {
  console.error('Simulation failed:', err.message);
  await sb.removeAllChannels().catch(() => {});
  process.exit(1);
});
