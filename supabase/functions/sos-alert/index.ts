import { createClient } from 'npm:@supabase/supabase-js@2';
import { sosAlertSchema } from '../../../shared/schemas.ts';

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

  if (adminIds.length === 0) {
    return jsonResponse(
      { data: { sent: false }, message: 'No admins to notify' },
      200,
    );
  }

  // Call send-push (non-fatal on failure — still return 200)
  try {
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
        userIds: adminIds,
        title: 'SOS Alert',
        body: `SOS alert from bus ${bus.plate_number} — Driver: ${profile.name}`,
        data: { type: 'sos', busId: validated.busId },
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

  return jsonResponse({ data: { sent: true }, message: 'SOS alert sent' }, 200);
});
