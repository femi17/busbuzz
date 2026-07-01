import { createClient } from 'npm:@supabase/supabase-js@2';
import { gpsUpdateSchema } from '../../../shared/schemas.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, content-type, x-client-info, apikey',
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed', statusCode: 405 }, 405);
  }

  // 1-2. Auth header check
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse(
      { error: 'Missing Authorization header', statusCode: 401 },
      401,
    );
  }

  // 3. Anon-key client with user's JWT
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: { headers: { Authorization: authHeader } },
    },
  );

  // 4. Verify user
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse(
      { error: 'Invalid or expired session', statusCode: 401 },
      401,
    );
  }

  // 5. Verify DRIVER role
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, school_id')
    .eq('id', userData.user.id)
    .single();

  if (profileError || !profile || profile.role !== 'DRIVER') {
    return jsonResponse(
      { error: 'Forbidden: DRIVER role required', statusCode: 403 },
      403,
    );
  }

  // 6. Parse JSON body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body', statusCode: 400 }, 400);
  }

  // 7. Validate with Zod
  const parseResult = gpsUpdateSchema.safeParse(body);
  if (!parseResult.success) {
    return jsonResponse(
      {
        error: 'Validation error',
        statusCode: 400,
        details: parseResult.error.issues,
      },
      400,
    );
  }

  const validated = parseResult.data;

  // 8. Service-role client for privileged DB ops
  const serviceSupabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // 9. Device check
  const { data: bus, error: busError } = await serviceSupabase
    .from('buses')
    .select('id, device_id')
    .eq('id', validated.busId)
    .single();

  if (busError || !bus) {
    return jsonResponse({ error: 'Bus not found', statusCode: 404 }, 404);
  }

  if (bus.device_id !== validated.deviceId) {
    return jsonResponse(
      { error: 'Device not authorised for this bus', statusCode: 401 },
      401,
    );
  }

  // 10. Trip check
  const { data: trip, error: tripError } = await serviceSupabase
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
    return jsonResponse(
      { error: 'Trip does not belong to this bus', statusCode: 400 },
      400,
    );
  }

  // 11. Insert trip_location
  const { error: insertError } = await serviceSupabase
    .from('trip_locations')
    .insert({
      trip_id: validated.tripId,
      latitude: validated.lat,
      longitude: validated.lng,
      speed: validated.speed,
      recorded_at: validated.timestamp,
    });

  if (insertError) {
    return jsonResponse(
      { error: 'Failed to store location', statusCode: 500 },
      500,
    );
  }

  // 12. Realtime broadcast
  try {
    const channel = serviceSupabase.channel(`bus:${validated.busId}`);
    await channel.send({
      type: 'broadcast',
      event: 'location_update',
      payload: {
        lat: validated.lat,
        lng: validated.lng,
        speed: validated.speed,
        timestamp: validated.timestamp,
        busId: validated.busId,
      },
    });
    await serviceSupabase.removeChannel(channel);
  } catch (err) {
    console.error('[gps-update] Realtime broadcast failed:', err);
  }

  // 13. Geofence check via HTTP fetch (non-fatal on failure)
  let triggeredStops: string[] = [];
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const internalSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET')!;
    const geofenceResp = await fetch(
      `${supabaseUrl}/functions/v1/geofence-check`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey,
          'X-Internal-Secret': internalSecret,
        },
        body: JSON.stringify({
          tripId: validated.tripId,
          routeId: trip.route_id,
          lat: validated.lat,
          lng: validated.lng,
        }),
      },
    );

    if (geofenceResp.ok) {
      const geofenceBody = await geofenceResp.json();
      triggeredStops = geofenceBody.data?.triggeredStopIds ?? [];
    } else {
      console.error(
        `[gps-update] geofence-check returned ${geofenceResp.status}: ${await geofenceResp.text()}`,
      );
    }
  } catch (err) {
    console.error('[gps-update] geofence-check call failed:', err);
  }

  // 14. Return success
  return jsonResponse(
    { data: { stored: true, triggeredStops }, message: 'Location recorded' },
    200,
  );
});
