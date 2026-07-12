import { createClient } from 'npm:@supabase/supabase-js@2';
import { createDriverSchema } from '../../../shared/schemas.ts';

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
  const parseResult = createDriverSchema.safeParse(body);
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

  // Step 8: Service-role client for all subsequent DB operations
  const serviceSupabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Step 9: Check phone uniqueness within this school
  const { data: existingDrivers, error: checkError } = await serviceSupabase
    .from('profiles')
    .select('id')
    .eq('phone', validated.phone)
    .eq('role', 'DRIVER')
    .eq('school_id', adminSchoolId);

  if (checkError) {
    return jsonResponse(
      { error: checkError.message, statusCode: 500 },
      500,
    );
  }

  if (existingDrivers && existingDrivers.length > 0) {
    return jsonResponse(
      {
        error: 'A driver with this phone number already exists in your school',
        statusCode: 409,
      },
      409,
    );
  }

  // Step 10: Generate synthetic email for driver auth account
  const syntheticEmail = `driver-${crypto.randomUUID().slice(0, 8)}@busbuzz.local`;

  // Step 11: Create auth user via service client
  const { data: newUserData, error: createUserError } =
    await serviceSupabase.auth.admin.createUser({
      email: syntheticEmail,
      password: crypto.randomUUID(),
      email_confirm: true,
      user_metadata: { name: validated.name },
    });

  if (createUserError || !newUserData.user) {
    return jsonResponse(
      { error: 'Failed to create driver account', statusCode: 500 },
      500,
    );
  }

  const newUser = newUserData.user;

  // Step 12: Update the profile row created by the auth trigger
  const { error: updateError } = await serviceSupabase
    .from('profiles')
    .update({
      role: 'DRIVER',
      school_id: adminSchoolId,
      phone: validated.phone,
      name: validated.name,
      email: syntheticEmail,
    })
    .eq('id', newUser.id);

  if (updateError) {
    return jsonResponse(
      { error: 'Failed to configure driver profile', statusCode: 500 },
      500,
    );
  }

  // Step 13: Return 201
  return jsonResponse(
    {
      data: {
        id: newUser.id,
        name: validated.name,
        phone: validated.phone,
        role: 'DRIVER',
        schoolId: adminSchoolId,
      },
      message: 'Driver created',
    },
    201,
  );
});
