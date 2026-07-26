import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'zod';

// Inlined (was ../../../shared/schemas.ts) so the deploy bundler ships one file.
const endTripSchema = z.object({
  tripId: z.string().uuid(),
});

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

  // Auth header check
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse(
      { error: 'Missing Authorization header', statusCode: 401 },
      401,
    );
  }

  // Anon-key client with user's JWT
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: { headers: { Authorization: authHeader } },
    },
  );

  // Verify user
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse(
      { error: 'Invalid or expired session', statusCode: 401 },
      401,
    );
  }

  // Verify DRIVER role
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single();

  if (profileError || !profile || profile.role !== 'DRIVER') {
    return jsonResponse(
      { error: 'Forbidden: DRIVER role required', statusCode: 403 },
      403,
    );
  }

  // Parse JSON body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body', statusCode: 400 }, 400);
  }

  // Validate with Zod
  const parseResult = endTripSchema.safeParse(body);
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

  // Service-role client
  const serviceSupabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Load the trip
  const { data: trip, error: tripError } = await serviceSupabase
    .from('trips')
    .select('id, bus_id, route_id, driver_id, status')
    .eq('id', validated.tripId)
    .single();

  if (tripError || !trip) {
    return jsonResponse({ error: 'Trip not found', statusCode: 404 }, 404);
  }

  // Verify ownership
  if (trip.driver_id !== userData.user.id) {
    return jsonResponse(
      { error: 'You can only end your own trips', statusCode: 403 },
      403,
    );
  }

  // Verify trip is active
  if (trip.status !== 'ACTIVE') {
    return jsonResponse({ error: 'Trip is not active', statusCode: 400 }, 400);
  }

  // Update trip
  const { error: updateError } = await serviceSupabase
    .from('trips')
    .update({ status: 'COMPLETED', ended_at: new Date().toISOString() })
    .eq('id', validated.tripId);

  if (updateError) {
    return jsonResponse(
      { error: 'Failed to update trip', statusCode: 500 },
      500,
    );
  }

  // Broadcast trip_ended on the private bus channel (non-fatal on failure)
  try {
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    await fetch(`${Deno.env.get('SUPABASE_URL')}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        messages: [
          {
            topic: `bus:${trip.bus_id}`,
            event: 'trip_ended',
            payload: { tripId: validated.tripId },
            private: true,
          },
        ],
      }),
    });
  } catch (err) {
    console.error('[end-trip] Realtime broadcast failed:', err);
  }

  // Also push it — same reasoning as start-trip's push: Realtime only
  // reaches an app that's already connected, so a parent with the app
  // closed or backgrounded otherwise gets no confirmation the run finished.
  try {
    const { data: studentRows } = await serviceSupabase
      .from('students')
      .select('student_parents(parent_id)')
      .eq('route_id', trip.route_id)
      .eq('is_active', true);

    const parentIds = new Set<string>();
    for (const row of (studentRows ?? []) as Array<{
      student_parents: Array<{ parent_id: string }> | { parent_id: string } | null;
    }>) {
      const sp = row.student_parents;
      if (Array.isArray(sp)) {
        for (const e of sp) if (e?.parent_id) parentIds.add(e.parent_id);
      } else if (sp?.parent_id) {
        parentIds.add(sp.parent_id);
      }
    }

    if (parentIds.size > 0) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const internalSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET')!;

      const pushResp = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey,
          'X-Internal-Secret': internalSecret,
        },
        body: JSON.stringify({
          userIds: Array.from(parentIds),
          title: 'Run complete',
          body: "Today's run has ended.",
          data: { type: 'trip-ended', tripId: validated.tripId, busId: trip.bus_id },
          channelId: 'trip-updates',
        }),
      });
      if (!pushResp.ok) {
        console.error(`[end-trip] trip-ended send-push returned ${pushResp.status}`);
      }
    }
  } catch (err) {
    console.error('[end-trip] trip-ended push failed:', err);
  }

  return jsonResponse(
    { data: { ended: true }, message: 'Trip completed' },
    200,
  );
});
