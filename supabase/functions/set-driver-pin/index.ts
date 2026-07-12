import { createClient } from 'npm:@supabase/supabase-js@2';
import bcrypt from 'npm:bcryptjs@2';
import { setDriverPinSchema } from '../../../shared/schemas.ts';

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

  // Step 3: Parse JSON body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body', statusCode: 400 }, 400);
  }

  // Step 4: Validate with Zod
  const parseResult = setDriverPinSchema.safeParse(body);
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

  // Step 5: Create user-scoped Supabase client
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse(
      { error: 'Missing Authorization header', statusCode: 401 },
      401,
    );
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  // Step 6: Verify user session
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse(
      { error: 'Invalid or expired session', statusCode: 401 },
      401,
    );
  }

  // Step 7: Check SCHOOL_ADMIN role
  const { data: callerProfile, error: profileError } = await supabase
    .from('profiles')
    .select('role, school_id')
    .eq('id', userData.user.id)
    .single();

  if (
    profileError ||
    !callerProfile ||
    callerProfile.role !== 'SCHOOL_ADMIN' ||
    !callerProfile.school_id
  ) {
    return jsonResponse(
      { error: 'Forbidden: SCHOOL_ADMIN role required', statusCode: 403 },
      403,
    );
  }

  const adminSchoolId: string = callerProfile.school_id;

  // Step 8: Service-role client for driver lookup and PIN upsert
  const serviceSupabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Step 9: Verify driver belongs to admin's school
  const { data: driverProfile, error: driverError } = await serviceSupabase
    .from('profiles')
    .select('id, role, school_id')
    .eq('id', validated.driverId)
    .single();

  if (
    driverError ||
    !driverProfile ||
    driverProfile.role !== 'DRIVER' ||
    driverProfile.school_id !== adminSchoolId
  ) {
    return jsonResponse(
      {
        error: 'Driver not found or does not belong to your school',
        statusCode: 404,
      },
      404,
    );
  }

  // Step 10: Hash the PIN
  const hashedPin = await bcrypt.hash(validated.pin, 10);

  // Step 11: Upsert into driver_pins
  const { error: upsertError } = await serviceSupabase
    .from('driver_pins')
    .upsert(
      { driver_id: validated.driverId, pin_hash: hashedPin },
      { onConflict: 'driver_id' },
    );

  if (upsertError) {
    return jsonResponse(
      { error: upsertError.message, statusCode: 500 },
      500,
    );
  }

  // Step 12: Return success
  return jsonResponse(
    { data: { set: true }, message: 'PIN updated' },
    200,
  );
});
