import { createClient } from 'npm:@supabase/supabase-js@2';
import bcrypt from 'npm:bcryptjs@2';
import { driverLoginSchema } from '../../../shared/schemas.ts';

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

  // Parse JSON body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body', statusCode: 400 }, 400);
  }

  // Validate with Zod
  const parseResult = driverLoginSchema.safeParse(body);
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

  // Service-role client for all operations (no authenticated user yet)
  const serviceSupabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Rate limit check: count failed attempts for this phone in last 15 minutes
  const fifteenMinutesAgo = new Date(
    Date.now() - 15 * 60 * 1000,
  ).toISOString();

  const { count: failedAttemptCount, error: attemptCountError } =
    await serviceSupabase
      .from('driver_login_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('phone', validated.phone)
      .eq('success', false)
      .gt('attempted_at', fifteenMinutesAgo);

  if (attemptCountError) {
    console.error(
      '[driver-login] Failed to check login attempts:',
      attemptCountError,
    );
  }

  if ((failedAttemptCount ?? 0) >= 5) {
    return jsonResponse(
      {
        error: 'Too many login attempts. Try again in 15 minutes.',
        statusCode: 429,
      },
      429,
    );
  }

  // Look up profile
  const { data: profile, error: profileError } = await serviceSupabase
    .from('profiles')
    .select('id, name, role, school_id, phone')
    .eq('phone', validated.phone)
    .eq('role', 'DRIVER')
    .single();

  if (profileError || !profile) {
    await serviceSupabase
      .from('driver_login_attempts')
      .insert({ phone: validated.phone, success: false });
    return jsonResponse({ error: 'Invalid credentials', statusCode: 401 }, 401);
  }

  // Look up PIN
  const { data: driverPin, error: pinError } = await serviceSupabase
    .from('driver_pins')
    .select('pin_hash')
    .eq('driver_id', profile.id)
    .single();

  if (pinError || !driverPin) {
    await serviceSupabase
      .from('driver_login_attempts')
      .insert({ phone: validated.phone, success: false });
    return jsonResponse({ error: 'Invalid credentials', statusCode: 401 }, 401);
  }

  // Compare PIN
  const pinMatches = await bcrypt.compare(validated.pin, driverPin.pin_hash);
  if (!pinMatches) {
    await serviceSupabase
      .from('driver_login_attempts')
      .insert({ phone: validated.phone, success: false });
    return jsonResponse({ error: 'Invalid credentials', statusCode: 401 }, 401);
  }

  // PIN matches — record success attempt
  await serviceSupabase
    .from('driver_login_attempts')
    .insert({ phone: validated.phone, success: true });

  // Generate a session for this driver
  const { data: authUser, error: getUserError } =
    await serviceSupabase.auth.admin.getUserById(profile.id);

  if (getUserError || !authUser.user || !authUser.user.email) {
    return jsonResponse(
      { error: 'Failed to create session', statusCode: 500 },
      500,
    );
  }

  const { data: linkData, error: linkError } =
    await serviceSupabase.auth.admin.generateLink({
      type: 'magiclink',
      email: authUser.user.email,
    });

  if (linkError || !linkData?.properties?.hashed_token) {
    return jsonResponse(
      { error: 'Failed to create session', statusCode: 500 },
      500,
    );
  }

  const { data: otpData, error: otpError } = await serviceSupabase.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  });

  if (otpError || !otpData.session) {
    return jsonResponse(
      { error: 'Failed to create session', statusCode: 500 },
      500,
    );
  }

  return jsonResponse(
    {
      data: {
        accessToken: otpData.session.access_token,
        refreshToken: otpData.session.refresh_token,
        profile: {
          id: profile.id,
          name: profile.name,
          role: 'DRIVER',
          schoolId: profile.school_id,
          phone: profile.phone,
        },
      },
      message: 'Login successful',
    },
    200,
  );
});
