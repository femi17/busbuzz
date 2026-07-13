import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'zod';

// Inlined (was ../../../shared/schemas.ts) so the deploy bundler ships one file.
const sosAlertSchema = z.object({
  busId: z.string().uuid(),
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
    .select('role, school_id, name')
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
  const parseResult = sosAlertSchema.safeParse(body);
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

  // Load bus
  const { data: bus, error: busError } = await serviceSupabase
    .from('buses')
    .select('id, plate_number, school_id')
    .eq('id', validated.busId)
    .single();

  if (busError || !bus) {
    return jsonResponse({ error: 'Bus not found', statusCode: 404 }, 404);
  }

  if (bus.school_id !== profile.school_id) {
    return jsonResponse(
      { error: 'Bus does not belong to your school', statusCode: 403 },
      403,
    );
  }

  // Flag the active trip so parents' apps can show a real "breakdown"
  // status instead of just notifying admins.
  const { error: sosFlagError } = await serviceSupabase
    .from('trips')
    .update({ has_sos: true })
    .eq('bus_id', validated.busId)
    .eq('status', 'ACTIVE');

  if (sosFlagError) {
    console.error('[sos-alert] Failed to flag trip has_sos:', sosFlagError);
  }

  // Where did the breakdown happen? Use the active trip's latest GPS ping.
  const { data: activeTrip } = await serviceSupabase
    .from('trips')
    .select('id, route_id')
    .eq('bus_id', validated.busId)
    .eq('status', 'ACTIVE')
    .maybeSingle();

  let locationText = '';
  let sosLat: number | null = null;
  let sosLng: number | null = null;
  if (activeTrip) {
    const { data: lastPing } = await serviceSupabase
      .from('trip_locations')
      .select('latitude, longitude')
      .eq('trip_id', activeTrip.id)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastPing) {
      sosLat = lastPing.latitude;
      sosLng = lastPing.longitude;
      locationText = ` Location: https://maps.google.com/?q=${lastPing.latitude},${lastPing.longitude}`;
    }
  }

  // Query SCHOOL_ADMIN users for this school
  const { data: schoolAdmins, error: schoolAdminsError } =
    await serviceSupabase
      .from('profiles')
      .select('id')
      .eq('school_id', bus.school_id)
      .eq('role', 'SCHOOL_ADMIN');

  if (schoolAdminsError) {
    console.error(
      '[sos-alert] Failed to load school admins:',
      schoolAdminsError,
    );
  }

  // Query SUPER_ADMIN users
  const { data: superAdmins, error: superAdminsError } = await serviceSupabase
    .from('profiles')
    .select('id')
    .eq('role', 'SUPER_ADMIN');

  if (superAdminsError) {
    console.error(
      '[sos-alert] Failed to load super admins:',
      superAdminsError,
    );
  }

  const adminIds = [
    ...(schoolAdmins ?? []).map((a) => a.id),
    ...(superAdmins ?? []).map((a) => a.id),
  ];

  // Parents of active students on the affected route — they deserve to know
  // about a breakdown too, not just the school.
  const parentIds = new Set<string>();
  if (activeTrip?.route_id) {
    const { data: parentRows } = await serviceSupabase
      .from('students')
      .select('student_parents(parent_id)')
      .eq('route_id', activeTrip.route_id)
      .eq('is_active', true);
    for (const row of (parentRows ?? []) as Array<{
      student_parents: Array<{ parent_id: string }> | { parent_id: string } | null;
    }>) {
      const sp = row.student_parents;
      if (Array.isArray(sp)) {
        for (const e of sp) if (e?.parent_id) parentIds.add(e.parent_id);
      } else if (sp?.parent_id) {
        parentIds.add(sp.parent_id);
      }
    }
  }

  if (adminIds.length === 0 && parentIds.size === 0) {
    return jsonResponse(
      { data: { sent: false }, message: 'No one to notify' },
      200,
    );
  }

  // Push to admins and parents (distinct copy) — non-fatal on failure.
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const internalSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET')!;

  async function sendSosPush(userIds: string[], title: string, bodyText: string) {
    if (userIds.length === 0) return;
    try {
      const pushResp = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey,
          'X-Internal-Secret': internalSecret,
        },
        body: JSON.stringify({
          userIds,
          title,
          body: bodyText,
          data: { type: 'sos', busId: validated.busId, lat: sosLat, lng: sosLng },
          // Emergency — alarm-like delivery.
          channelId: 'arrival-alarm',
        }),
      });
      if (!pushResp.ok) {
        console.error(
          `[sos-alert] send-push returned ${pushResp.status}: ${await pushResp.text()}`,
        );
      }
    } catch (err) {
      console.error('[sos-alert] send-push call failed:', err);
    }
  }

  await sendSosPush(
    adminIds,
    'SOS Alert',
    `SOS alert from bus ${bus.plate_number} — Driver: ${profile.name}.${locationText}`,
  );
  await sendSosPush(
    Array.from(parentIds),
    '🚨 Bus emergency',
    `Bus ${bus.plate_number} has reported an emergency on your child's route. The school has been alerted and is responding.${locationText}`,
  );

  return jsonResponse({ data: { sent: true }, message: 'SOS alert sent' }, 200);
});
