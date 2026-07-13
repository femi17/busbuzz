import { createClient } from 'npm:@supabase/supabase-js@2';

// Helpers inlined (haversine + validation) so this function has no
// cross-directory imports — the deploy bundler only ships this file.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, content-type, x-client-info, apikey',
};

const GEOFENCE_RADIUS_M = 300;
// Bus is "arriving" (loud alarm) once this close to a stop.
const ARRIVAL_RADIUS_M = 150;
// "~5 minutes away" heads-up: fire when the bus is within 5 min by current
// speed, or — when speed is unknown/zero — within this fallback distance.
const APPROACH_ETA_SECONDS = 5 * 60;
const APPROACH_FALLBACK_M = 1200;
const EARTH_RADIUS_M = 6_371_000;

async function pushToParents(
  supabaseUrl: string,
  serviceRoleKey: string,
  parentIds: string[],
  payload: { title: string; body: string; data: Record<string, unknown>; channelId: string },
): Promise<void> {
  if (parentIds.length === 0) return;
  const internalSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET');
  if (!internalSecret) return;
  try {
    await fetch(`${supabaseUrl}/functions/v1/send-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        'X-Internal-Secret': internalSecret,
      },
      body: JSON.stringify({ userIds: parentIds, ...payload }),
    });
  } catch (err) {
    console.error('[gps-update] send-push failed:', err);
  }
}

// Parents of active students whose pickup stop is `stopId` on this route.
async function parentsAtStop(
  service: ReturnType<typeof createClient>,
  routeId: string,
  stopId: string,
): Promise<string[]> {
  const { data: rows } = await service
    .from('students')
    .select('student_parents(parent_id)')
    .eq('stop_id', stopId)
    .eq('route_id', routeId)
    .eq('is_active', true);
  const ids = new Set<string>();
  for (const row of (rows ?? []) as Array<{
    student_parents: Array<{ parent_id: string }> | { parent_id: string } | null;
  }>) {
    const sp = row.student_parents;
    if (Array.isArray(sp)) {
      for (const e of sp) if (e?.parent_id) ids.add(e.parent_id);
    } else if (sp?.parent_id) {
      ids.add(sp.parent_id);
    }
  }
  return Array.from(ids);
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type GpsBody = {
  tripId: string;
  busId: string;
  lat: number;
  lng: number;
  speed: number;
  timestamp: string;
  deviceId: string;
};

function validate(body: unknown): GpsBody | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (
    typeof b.tripId !== 'string' ||
    typeof b.busId !== 'string' ||
    typeof b.lat !== 'number' ||
    typeof b.lng !== 'number' ||
    typeof b.speed !== 'number' ||
    typeof b.timestamp !== 'string' ||
    typeof b.deviceId !== 'string'
  ) {
    return null;
  }
  if (b.lat < -90 || b.lat > 90 || b.lng < -180 || b.lng > 180 || b.speed < 0) {
    return null;
  }
  return b as GpsBody;
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Publish a single broadcast over the Realtime REST endpoint. Cheaper and
// simpler than opening/closing a channel on every 10s ping.
async function broadcast(
  supabaseUrl: string,
  serviceKey: string,
  busId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        // private: true so this lands on the authorized private channel only —
        // anon clients can neither publish nor subscribe (spoofing blocked).
        messages: [{ topic: `bus:${busId}`, event: 'location_update', payload, private: true }],
      }),
    });
  } catch (err) {
    console.error('[gps-update] Realtime broadcast failed:', err);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed', statusCode: 405 }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Missing Authorization header', statusCode: 401 }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse({ error: 'Invalid or expired session', statusCode: 401 }, 401);
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single();

  if (profileError || !profile || profile.role !== 'DRIVER') {
    return jsonResponse({ error: 'Forbidden: DRIVER role required', statusCode: 403 }, 403);
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body', statusCode: 400 }, 400);
  }

  const validated = validate(rawBody);
  if (!validated) {
    return jsonResponse({ error: 'Validation error', statusCode: 400 }, 400);
  }

  const service = createClient(supabaseUrl, serviceRoleKey);

  // Device + trip authorisation
  const { data: bus, error: busError } = await service
    .from('buses')
    .select('id, device_id')
    .eq('id', validated.busId)
    .single();
  if (busError || !bus) {
    return jsonResponse({ error: 'Bus not found', statusCode: 404 }, 404);
  }
  if (bus.device_id !== validated.deviceId) {
    return jsonResponse({ error: 'Device not authorised for this bus', statusCode: 401 }, 401);
  }

  const { data: trip, error: tripError } = await service
    .from('trips')
    .select('id, bus_id, route_id, status')
    .eq('id', validated.tripId)
    .single();
  if (tripError || !trip) {
    return jsonResponse({ error: 'Trip not found', statusCode: 400 }, 400);
  }
  if (trip.status !== 'ACTIVE') {
    return jsonResponse({ error: 'Trip is not active', statusCode: 400 }, 400);
  }
  if (trip.bus_id !== validated.busId) {
    return jsonResponse({ error: 'Trip does not belong to this bus', statusCode: 400 }, 400);
  }

  // Store the breadcrumb
  const { error: insertError } = await service.from('trip_locations').insert({
    trip_id: validated.tripId,
    latitude: validated.lat,
    longitude: validated.lng,
    speed: validated.speed,
    recorded_at: validated.timestamp,
  });
  if (insertError) {
    return jsonResponse({ error: 'Failed to store location', statusCode: 500 }, 500);
  }

  // Live position to subscribers
  await broadcast(supabaseUrl, serviceRoleKey, validated.busId, {
    lat: validated.lat,
    lng: validated.lng,
    speed: validated.speed,
    timestamp: validated.timestamp,
    busId: validated.busId,
  });

  // Geofence — folded in so this stays a single function invocation per ping.
  // Each stop fires up to two notifications to that stop's parents:
  //   1. APPROACH — bus ~5 min away → heads-up on 'trip-updates'
  //   2. ARRIVE   — bus at the stop  → loud 'arrival-alarm'
  // When a stop's ARRIVE fires, the NEXT stop's parents get a "you're next" ping.
  const triggeredStopIds: string[] = [];
  try {
    const { data: stopsData } = await service
      .from('stops')
      .select('id, name, latitude, longitude, sequence')
      .eq('route_id', trip.route_id)
      .order('sequence');
    const stops = (stopsData ?? []) as Array<{
      id: string; name: string; latitude: number; longitude: number; sequence: number;
    }>;

    if (stops.length > 0) {
      const [{ data: arriveRows }, { data: approachRows }] = await Promise.all([
        service.from('trip_stop_triggers').select('stop_id').eq('trip_id', validated.tripId),
        service.from('trip_stop_approaches').select('stop_id').eq('trip_id', validated.tripId),
      ]);
      const arrived = new Set((arriveRows ?? []).map((r: { stop_id: string }) => r.stop_id));
      const approached = new Set((approachRows ?? []).map((r: { stop_id: string }) => r.stop_id));

      for (let i = 0; i < stops.length; i++) {
        const stop = stops[i];
        const dist = haversineMeters(validated.lat, validated.lng, stop.latitude, stop.longitude);
        // ETA at current speed (m/s); speed comes in m/s from expo-location.
        const etaSeconds = validated.speed > 0.5 ? dist / validated.speed : Infinity;

        // ── Stage 1: approaching (~5 min away) ──
        const isApproaching =
          dist <= GEOFENCE_RADIUS_M ? false // already handled by arrival, skip approach
          : etaSeconds <= APPROACH_ETA_SECONDS || dist <= APPROACH_FALLBACK_M;
        if (!approached.has(stop.id) && !arrived.has(stop.id) && isApproaching) {
          const { error } = await service
            .from('trip_stop_approaches')
            .upsert({ trip_id: validated.tripId, stop_id: stop.id }, { onConflict: 'trip_id,stop_id' });
          if (!error) {
            approached.add(stop.id);
            const parents = await parentsAtStop(service, trip.route_id, stop.id);
            await pushToParents(supabaseUrl, serviceRoleKey, parents, {
              title: '🚌 Bus is about 5 minutes away',
              body: `Your bus is approaching ${stop.name} — start getting ready.`,
              data: { type: 'approach', tripId: validated.tripId, stopId: stop.id, stopName: stop.name },
              channelId: 'trip-updates',
            });
          }
        }

        // ── Stage 2: arriving (at the stop) ──
        if (!arrived.has(stop.id) && dist <= ARRIVAL_RADIUS_M) {
          const { error } = await service
            .from('trip_stop_triggers')
            .upsert(
              { trip_id: validated.tripId, stop_id: stop.id, triggered_at: new Date().toISOString() },
              { onConflict: 'trip_id,stop_id' },
            );
          if (!error) {
            arrived.add(stop.id);
            triggeredStopIds.push(stop.id);

            const parents = await parentsAtStop(service, trip.route_id, stop.id);
            await pushToParents(supabaseUrl, serviceRoleKey, parents, {
              title: '🚌 Your bus has arrived!',
              body: `The bus is at ${stop.name} — head out to meet it now.`,
              data: { type: 'arrival', tripId: validated.tripId, stopId: stop.id, stopName: stop.name },
              // Loud alarm: long vibration, breaks through DND/Focus.
              channelId: 'arrival-alarm',
            });

            // "You're next" — parents at the following stop in sequence.
            const nextStop = stops[i + 1];
            if (nextStop) {
              const nextParents = await parentsAtStop(service, trip.route_id, nextStop.id);
              await pushToParents(supabaseUrl, serviceRoleKey, nextParents, {
                title: '📍 Your stop is next',
                body: `The bus just left ${stop.name} — ${nextStop.name} is the next stop.`,
                data: { type: 'next-stop', tripId: validated.tripId, stopId: nextStop.id, stopName: nextStop.name },
                channelId: 'trip-updates',
              });
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('[gps-update] geofence check failed:', err);
  }

  return jsonResponse(
    { data: { stored: true, triggeredStops: triggeredStopIds }, message: 'Location recorded' },
    200,
  );
});
