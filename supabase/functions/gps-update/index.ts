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
const EARTH_RADIUS_M = 6_371_000;

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

  // Geofence — folded in so this stays a single function invocation per ping
  // (was a second HTTP hop to geofence-check on every ping). send-push is only
  // called on an actual crossing, which is rare.
  const triggeredStopIds: string[] = [];
  try {
    const { data: stops } = await service
      .from('stops')
      .select('id, name, latitude, longitude, sequence')
      .eq('route_id', trip.route_id)
      .order('sequence');

    if (stops && stops.length > 0) {
      const { data: triggeredRows } = await service
        .from('trip_stop_triggers')
        .select('stop_id')
        .eq('trip_id', validated.tripId);
      const triggered = new Set((triggeredRows ?? []).map((r: { stop_id: string }) => r.stop_id));

      for (const stop of stops as Array<{ id: string; name: string; latitude: number; longitude: number }>) {
        if (triggered.has(stop.id)) continue;
        const dist = haversineMeters(validated.lat, validated.lng, stop.latitude, stop.longitude);
        if (dist > GEOFENCE_RADIUS_M) continue;

        const { error: upsertError } = await service
          .from('trip_stop_triggers')
          .upsert(
            { trip_id: validated.tripId, stop_id: stop.id, triggered_at: new Date().toISOString() },
            { onConflict: 'trip_id,stop_id' },
          );
        if (upsertError) continue;
        triggeredStopIds.push(stop.id);

        const { data: parentRows } = await service
          .from('students')
          .select('student_parents(parent_id)')
          .eq('stop_id', stop.id)
          .eq('route_id', trip.route_id)
          .eq('is_active', true);

        const parentIdSet = new Set<string>();
        for (const row of (parentRows ?? []) as Array<{
          student_parents: Array<{ parent_id: string }> | { parent_id: string } | null;
        }>) {
          const sp = row.student_parents;
          if (Array.isArray(sp)) {
            for (const e of sp) if (e?.parent_id) parentIdSet.add(e.parent_id);
          } else if (sp?.parent_id) {
            parentIdSet.add(sp.parent_id);
          }
        }
        const parentIds = Array.from(parentIdSet);

        if (parentIds.length > 0) {
          const internalSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET');
          if (internalSecret) {
            try {
              await fetch(`${supabaseUrl}/functions/v1/send-push`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${serviceRoleKey}`,
                  apikey: serviceRoleKey,
                  'X-Internal-Secret': internalSecret,
                },
                body: JSON.stringify({
                  userIds: parentIds,
                  title: '🚌 Bus arriving!',
                  body: `The bus is arriving at ${stop.name} — time to head out!`,
                  data: { type: 'geofence', tripId: validated.tripId, stopId: stop.id, stopName: stop.name },
                  // Alarm-like: long vibration, breaks through DND/Focus.
                  channelId: 'arrival-alarm',
                }),
              });
            } catch (err) {
              console.error('[gps-update] send-push failed:', err);
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
