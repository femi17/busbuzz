// Move the demo fleet by driving the REAL BusBuzz pipeline — so the admin Live
// Map and parent notifications behave exactly as they would in production.
//
//   node --env-file=.env.local scripts/demo-simulate.mjs            # one full run
//   node --env-file=.env.local scripts/demo-simulate.mjs --loop     # keep looping
//   node --env-file=.env.local scripts/demo-simulate.mjs --bus=1    # single bus
//   node --env-file=.env.local scripts/demo-simulate.mjs --speed=2  # 2x faster
//
// For each bus it mints a real DRIVER session (the same generateLink+verifyOtp
// dance driver-login does internally), calls start-trip, streams gps-update
// along the route's stops, then end-trip. The geofence folded into gps-update
// fires the "approaching"/"arrived" pushes to parents automatically.
//
// Ctrl+C cleanly ends any trips in progress so no bus is left "active".

import { createClient } from '@supabase/supabase-js';
import { ROUTES, routeId, busId, env } from './demo-config.mjs';

const { url, serviceKey, anonKey } = env();
const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Flags ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const LOOP = args.includes('--loop');
const SPEED = Number((args.find((a) => a.startsWith('--speed=')) || '').split('=')[1]) || 1;
const ONLY_BUS = Number((args.find((a) => a.startsWith('--bus=')) || '').split('=')[1]) || 0;

// gps-update enforces a 3000ms minimum between pings for a trip; stay above it.
const TICK_MS = 3300;
// Distance covered per ping. Larger = faster route completion (and bigger
// marker hops). --speed scales it so a demo can be sped up on the fly.
const STEP_METERS = 220 * SPEED;

let stopping = false;
const active = new Map(); // tripId -> { token, name }

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function haversine(a, b) {
  const R = 6_371_000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

async function callFn(name, token, body) {
  let res;
  try {
    res = await fetch(`${url}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { status: 0, json: { error: String(err) } };
  }
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

// Mint a real driver access token the same way driver-login does: admin
// generateLink (magiclink) -> verifyOtp with the hashed token.
async function mintDriverToken(email) {
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkErr || !link?.properties?.hashed_token) {
    throw new Error(`generateLink failed for ${email}: ${linkErr?.message ?? 'no token'}`);
  }
  const userClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: v, error: otpErr } = await userClient.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: 'magiclink',
  });
  if (otpErr || !v?.session?.access_token) {
    throw new Error(`verifyOtp failed for ${email}: ${otpErr?.message ?? 'no session'}`);
  }
  return v.session.access_token;
}

async function endActiveTripForBus(route, token) {
  const { data } = await admin
    .from('trips')
    .select('id')
    .eq('bus_id', busId(route.index))
    .eq('status', 'ACTIVE')
    .limit(1)
    .maybeSingle();
  if (data?.id) await callFn('end-trip', token, { tripId: data.id });
}

async function startTrip(route, token) {
  let res = await callFn('start-trip', token, {
    busId: busId(route.index),
    routeId: routeId(route.index),
    direction: 'MORNING',
  });
  // Stale ACTIVE trip from a previous run — clear it and retry once.
  if (res.status === 409) {
    await endActiveTripForBus(route, token);
    res = await callFn('start-trip', token, {
      busId: busId(route.index),
      routeId: routeId(route.index),
      direction: 'MORNING',
    });
  }
  if (res.status !== 201 || !res.json?.data) {
    console.error(`✗ [${route.name}] start-trip failed (${res.status}):`, res.json?.error ?? res.json);
    return null;
  }
  const trip = res.json.data;
  return { id: trip.id, stops: trip.route?.stops ?? [] };
}

async function ping(route, token, tripId, point) {
  const speed = 8 + Math.random() * 4; // plausible 8–12 m/s regardless of compression
  const res = await callFn('gps-update', token, {
    tripId,
    busId: busId(route.index),
    lat: point.lat,
    lng: point.lng,
    speed,
    timestamp: new Date().toISOString(),
    deviceId: route.bus.deviceId,
  });
  // 429 = "too soon since last ping" — harmless, just skip.
  if (res.status !== 200 && res.status !== 429) {
    console.error(`  ✗ [${route.name}] gps-update ${res.status}:`, res.json?.error ?? res.json);
  }
}

async function driveRoute(route, token, trip) {
  const pts = [...trip.stops]
    .sort((a, b) => a.sequence - b.sequence)
    .map((s) => ({ lat: s.latitude, lng: s.longitude, name: s.name }));
  if (pts.length === 0) return;

  await ping(route, token, trip.id, pts[0]);
  await sleep(TICK_MS);

  for (let i = 1; i < pts.length && !stopping; i++) {
    const A = pts[i - 1];
    const B = pts[i];
    const n = Math.max(1, Math.ceil(haversine(A, B) / STEP_METERS));
    for (let k = 1; k <= n && !stopping; k++) {
      const t = k / n;
      await ping(route, token, trip.id, {
        lat: A.lat + (B.lat - A.lat) * t,
        lng: A.lng + (B.lng - A.lng) * t,
      });
      if (k === n) console.log(`  [${route.name}] reached ${B.name}`);
      await sleep(TICK_MS);
    }
  }
}

async function runBus(route) {
  const token = await mintDriverToken(route.driver.email);
  do {
    const trip = await startTrip(route, token);
    if (!trip) return;
    active.set(trip.id, { token, name: route.name });
    console.log(`▶ [${route.name}] trip started`);
    await driveRoute(route, token, trip);
    await callFn('end-trip', token, { tripId: trip.id });
    active.delete(trip.id);
    console.log(`■ [${route.name}] trip ended`);
    if (LOOP && !stopping) await sleep(4000);
  } while (LOOP && !stopping);
}

async function cleanup() {
  if (stopping) return;
  stopping = true;
  console.log('\nStopping — ending active trips…');
  await Promise.all(
    [...active.entries()].map(([tripId, { token }]) =>
      callFn('end-trip', token, { tripId }),
    ),
  );
  process.exit(0);
}
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

async function main() {
  const routes = ONLY_BUS ? ROUTES.filter((r) => r.index === ONLY_BUS) : ROUTES;
  if (routes.length === 0) {
    console.error(`No route with index ${ONLY_BUS} (valid: 1–${ROUTES.length}).`);
    process.exit(1);
  }
  console.log(
    `Simulating ${routes.length} bus(es)  ` +
      `[tick ${TICK_MS}ms, step ${STEP_METERS}m${LOOP ? ', looping' : ''}]\n`,
  );
  await Promise.all(routes.map(runBus));
  console.log('\nAll trips complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
