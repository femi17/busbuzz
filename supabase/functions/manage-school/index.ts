import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { onboardSchoolSchema } from '../../../shared/schemas.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, content-type, x-client-info, apikey',
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function authenticateSuperAdmin(
  req: Request,
): Promise<
  | { ok: true; supabase: SupabaseClient }
  | { ok: false; response: Response }
> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return {
      ok: false,
      response: jsonResponse(
        { error: 'Missing Authorization header', statusCode: 401 },
        401,
      ),
    };
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return {
      ok: false,
      response: jsonResponse(
        { error: 'Invalid or expired session', statusCode: 401 },
        401,
      ),
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single();

  if (profileError || !profile || profile.role !== 'SUPER_ADMIN') {
    return {
      ok: false,
      response: jsonResponse(
        { error: 'Forbidden: SUPER_ADMIN role required', statusCode: 403 },
        403,
      ),
    };
  }

  return { ok: true, supabase };
}

async function handlePost(req: Request): Promise<Response> {
  const auth = await authenticateSuperAdmin(req);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body', statusCode: 400 }, 400);
  }

  const parseResult = onboardSchoolSchema.safeParse(body);
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

  const serviceSupabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Insert school record
  const { data: school, error: insertError } = await serviceSupabase
    .from('schools')
    .insert({
      name: validated.schoolName,
      address: validated.schoolAddress,
      logo_url: validated.schoolLogoUrl ?? null,
    })
    .select()
    .single();

  if (insertError) {
    return jsonResponse({ error: insertError.message, statusCode: 500 }, 500);
  }

  // Geocode the school address via Google Geocoding API (best-effort; never fails school creation)
  let geocodedLat: number | null = null;
  let geocodedLng: number | null = null;

  const googleMapsApiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
  if (googleMapsApiKey) {
    try {
      const geocodeUrl =
        // Lagos State bounding box (approx, south,west|north,east) — BusBuzz only
        // serves Lagos schools, so bias results here rather than resolving ambiguous
        // place names (e.g. "Ejigbo") to same-named locations elsewhere in Nigeria.
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(validated.schoolAddress)}&region=ng&bounds=6.35,2.7|6.70,4.33&key=${googleMapsApiKey}`;
      const geocodeRes = await fetch(geocodeUrl);
      if (geocodeRes.ok) {
        const geocodeJson = await geocodeRes.json() as {
          status: string;
          results?: Array<{
            geometry: { location: { lat: number; lng: number } };
          }>;
        };
        const result = geocodeJson.results?.[0];
        if (geocodeJson.status === 'OK' && result?.geometry?.location) {
          geocodedLat = result.geometry.location.lat;
          geocodedLng = result.geometry.location.lng;
        } else if (geocodeJson.status !== 'ZERO_RESULTS') {
          console.warn(
            `Google geocoding returned status ${geocodeJson.status} for address: ${validated.schoolAddress}`,
          );
        }
      } else {
        console.warn(
          `Google geocoding returned non-OK status ${geocodeRes.status} for address: ${validated.schoolAddress}`,
        );
      }
    } catch (geocodeErr) {
      console.warn(
        `Google geocoding failed for address "${validated.schoolAddress}":`,
        (geocodeErr as Error).message,
      );
    }
  }

  if (geocodedLat !== null && geocodedLng !== null) {
    const { error: coordUpdateError } = await serviceSupabase
      .from('schools')
      .update({ latitude: geocodedLat, longitude: geocodedLng })
      .eq('id', school.id);

    if (coordUpdateError) {
      console.warn(
        `Failed to persist geocoded coordinates for school ${school.id}:`,
        coordUpdateError.message,
      );
      geocodedLat = null;
      geocodedLng = null;
    }
  }

  // Create auth user (email_confirm: true so admin can log in immediately)
  const { data: newUserData, error: createUserError } =
    await serviceSupabase.auth.admin.createUser({
      email: validated.adminEmail,
      password: validated.adminPassword,
      email_confirm: true,
      user_metadata: { name: validated.adminName },
    });

  if (createUserError) {
    // Roll back: delete the orphaned school row
    const { error: rollbackError } = await serviceSupabase
      .from('schools')
      .delete()
      .eq('id', school.id);

    if (rollbackError) {
      console.error(
        `Failed to roll back orphaned school ${school.id} after createUser error:`,
        rollbackError.message,
      );
    }

    if (createUserError.message?.includes('already been registered')) {
      return jsonResponse(
        {
          error: 'A user with this email address already exists',
          statusCode: 409,
        },
        409,
      );
    }
    return jsonResponse(
      { error: 'Failed to create admin account', statusCode: 500 },
      500,
    );
  }

  const newUser = newUserData.user;
  if (!newUser) {
    await serviceSupabase.from('schools').delete().eq('id', school.id);
    return jsonResponse(
      { error: 'Failed to create admin account', statusCode: 500 },
      500,
    );
  }

  // Update the profile row created by the auth trigger (default role: PARENT)
  // to SCHOOL_ADMIN with the correct school_id and name.
  const { error: updateProfileError } = await serviceSupabase
    .from('profiles')
    .update({
      role: 'SCHOOL_ADMIN',
      school_id: school.id,
      name: validated.adminName,
    })
    .eq('id', newUser.id);

  if (updateProfileError) {
    return jsonResponse(
      { error: 'Failed to configure admin profile', statusCode: 500 },
      500,
    );
  }

  return jsonResponse(
    {
      data: {
        school: {
          id: school.id,
          name: school.name,
          address: school.address,
          logoUrl: school.logo_url ?? null,
          isActive: school.is_active,
          latitude: geocodedLat,
          longitude: geocodedLng,
        },
        admin: {
          id: newUser.id,
          name: validated.adminName,
          email: validated.adminEmail,
          role: 'SCHOOL_ADMIN' as const,
          schoolId: school.id,
        },
      },
      message: 'School onboarded successfully',
    },
    201,
  );
}

async function handleGet(req: Request): Promise<Response> {
  const auth = await authenticateSuperAdmin(req);
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const { data: schools, error: schoolsError } = await supabase
    .from('schools')
    .select('*')
    .order('created_at', { ascending: false });

  if (schoolsError) {
    return jsonResponse({ error: schoolsError.message, statusCode: 500 }, 500);
  }

  const { data: admins, error: adminsError } = await supabase
    .from('profiles')
    .select('id, name, school_id')
    .eq('role', 'SCHOOL_ADMIN');

  if (adminsError) {
    return jsonResponse({ error: adminsError.message, statusCode: 500 }, 500);
  }

  // Build a map from school_id to the first SCHOOL_ADMIN found for that school
  const adminMap = new Map<string, { id: string; name: string }>();
  for (const admin of admins ?? []) {
    if (admin.school_id && !adminMap.has(admin.school_id)) {
      adminMap.set(admin.school_id, { id: admin.id, name: admin.name });
    }
  }

  const result = (schools ?? []).map((school) => ({
    id: school.id,
    name: school.name,
    address: school.address,
    logoUrl: school.logo_url ?? null,
    isActive: school.is_active,
    createdAt: school.created_at,
    latitude: school.latitude ?? null,
    longitude: school.longitude ?? null,
    admin: adminMap.get(school.id) ?? null,
  }));

  return jsonResponse({ data: result, message: 'Schools retrieved' }, 200);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  switch (req.method) {
    case 'POST':
      return handlePost(req);
    case 'GET':
      return handleGet(req);
    default:
      return jsonResponse({ error: 'Method not allowed', statusCode: 405 }, 405);
  }
});
