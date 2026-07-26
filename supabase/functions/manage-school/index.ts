import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  onboardSchoolSchema,
  updateSchoolSchema,
  resetSchoolAdminPasswordSchema,
} from '../../../shared/schemas.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, PATCH, GET, OPTIONS',
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

// Lagos-biased geocode, shared by school creation and address edits.
// Best-effort: a failed/absent lookup never blocks the write, it just
// leaves latitude/longitude unset (create) or unchanged (edit).
async function geocodeSchoolAddress(
  address: string,
): Promise<{ lat: number; lng: number } | null> {
  const googleMapsApiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
  if (!googleMapsApiKey) return null;
  try {
    const geocodeUrl =
      // Lagos State bounding box (approx, south,west|north,east) — BusBuzz only
      // serves Lagos schools, so bias results here rather than resolving ambiguous
      // place names (e.g. "Ejigbo") to same-named locations elsewhere in Nigeria.
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&region=ng&bounds=6.35,2.7|6.70,4.33&key=${googleMapsApiKey}`;
    const geocodeRes = await fetch(geocodeUrl);
    if (!geocodeRes.ok) {
      console.warn(
        `Google geocoding returned non-OK status ${geocodeRes.status} for address: ${address}`,
      );
      return null;
    }
    const geocodeJson = await geocodeRes.json() as {
      status: string;
      results?: Array<{
        geometry: { location: { lat: number; lng: number } };
      }>;
    };
    const result = geocodeJson.results?.[0];
    if (geocodeJson.status === 'OK' && result?.geometry?.location) {
      return { lat: result.geometry.location.lat, lng: result.geometry.location.lng };
    }
    if (geocodeJson.status !== 'ZERO_RESULTS') {
      console.warn(
        `Google geocoding returned status ${geocodeJson.status} for address: ${address}`,
      );
    }
    return null;
  } catch (geocodeErr) {
    console.warn(
      `Google geocoding failed for address "${address}":`,
      (geocodeErr as Error).message,
    );
    return null;
  }
}

async function handleOnboard(req: Request): Promise<Response> {
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
    JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')!)['default'],
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
    console.error('[manage-school] insert failed:', insertError.message);
    return jsonResponse({ error: 'Failed to onboard school', statusCode: 500 }, 500);
  }

  // Geocode the school address via Google Geocoding API (best-effort; never fails school creation)
  const geocoded = await geocodeSchoolAddress(validated.schoolAddress);
  let geocodedLat = geocoded?.lat ?? null;
  let geocodedLng = geocoded?.lng ?? null;

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

// Schools had no update path at all before this — a super admin could
// onboard a school but never fix a typo'd name/address, replace the logo,
// or deactivate/reactivate it. RLS's schools_update_super_admin policy
// already permitted this at the DB level; nothing on the frontend or here
// used it.
async function handlePatch(req: Request): Promise<Response> {
  const auth = await authenticateSuperAdmin(req);
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body', statusCode: 400 }, 400);
  }

  const parseResult = updateSchoolSchema.safeParse(body);
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

  const { id, ...updates } = parseResult.data;

  const { data: existing, error: existingError } = await supabase
    .from('schools')
    .select('id, address')
    .eq('id', id)
    .single();

  if (existingError || !existing) {
    return jsonResponse({ error: 'School not found', statusCode: 404 }, 404);
  }

  const updatePayload: Record<string, unknown> = {};
  if (updates.name !== undefined) updatePayload.name = updates.name;
  if (updates.address !== undefined) updatePayload.address = updates.address;
  // logoUrl is nullable (clear the logo) vs. simply absent (leave
  // unchanged) — 'logoUrl' in updates distinguishes those since zod omits
  // untouched optional keys from the parsed result entirely.
  if ('logoUrl' in updates) updatePayload.logo_url = updates.logoUrl ?? null;
  if (updates.isActive !== undefined) updatePayload.is_active = updates.isActive;

  // Address changed — re-geocode so the school's map position stays
  // accurate. Best-effort: on failure, keep the previous coordinates
  // rather than nulling out a working location over a transient API error.
  if (updates.address !== undefined && updates.address !== existing.address) {
    const geocoded = await geocodeSchoolAddress(updates.address);
    if (geocoded) {
      updatePayload.latitude = geocoded.lat;
      updatePayload.longitude = geocoded.lng;
    }
  }

  if (Object.keys(updatePayload).length === 0) {
    return jsonResponse(
      { error: 'No fields to update', statusCode: 400 },
      400,
    );
  }

  const { data: updated, error: updateError } = await supabase
    .from('schools')
    .update(updatePayload)
    .eq('id', id)
    .select()
    .single();

  if (updateError) {
    console.error('[manage-school] update failed:', updateError.message);
    return jsonResponse({ error: 'Failed to update school', statusCode: 400 }, 400);
  }

  return jsonResponse(
    {
      data: {
        id: updated.id,
        name: updated.name,
        address: updated.address,
        logoUrl: updated.logo_url ?? null,
        isActive: updated.is_active,
        latitude: updated.latitude ?? null,
        longitude: updated.longitude ?? null,
      },
      message: 'School updated',
    },
    200,
  );
}

// A super admin had no way to recover a school admin's forgotten password
// after onboarding — the admin's own Settings page can change it, but if
// they're locked out (forgotten password, no working email access) there
// was no recovery path. Resets via auth.admin.updateUserById, which
// requires the service role key and bypasses the admin's own session.
async function handleResetAdminPassword(
  req: Request,
  body: Record<string, unknown>,
): Promise<Response> {
  const auth = await authenticateSuperAdmin(req);
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const parseResult = resetSchoolAdminPasswordSchema.safeParse(body);
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

  const { schoolId, newPassword } = parseResult.data;

  const { data: admin, error: adminError } = await supabase
    .from('profiles')
    .select('id, name, email')
    .eq('school_id', schoolId)
    .eq('role', 'SCHOOL_ADMIN')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (adminError) {
    console.error('[manage-school] admin lookup failed:', adminError.message);
    return jsonResponse({ error: 'Failed to reset admin password', statusCode: 500 }, 500);
  }
  if (!admin) {
    return jsonResponse(
      { error: 'No admin account found for this school', statusCode: 404 },
      404,
    );
  }

  const serviceSupabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')!)['default'],
  );

  const { error: updateAuthError } = await serviceSupabase.auth.admin.updateUserById(
    admin.id,
    { password: newPassword },
  );

  if (updateAuthError) {
    console.error('[manage-school] password reset failed:', updateAuthError.message);
    return jsonResponse(
      { error: 'Failed to reset admin password', statusCode: 500 },
      500,
    );
  }

  return jsonResponse(
    {
      data: { adminId: admin.id, adminName: admin.name, adminEmail: admin.email },
      message: 'Admin password reset',
    },
    200,
  );
}

async function handlePost(req: Request): Promise<Response> {
  // Onboarding (the original, still-default behaviour) has no `action`
  // field on its body, matching manage-student's action-discriminator
  // convention — read the body once here and dispatch, since
  // handleResetAdminPassword needs the already-parsed body too.
  let body: Record<string, unknown>;
  try {
    body = (await req.clone().json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: 'Invalid JSON body', statusCode: 400 }, 400);
  }

  if (body.action === 'reset-admin-password') {
    return handleResetAdminPassword(req, body);
  }

  return handleOnboard(req);
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
    console.error('[manage-school] list failed:', schoolsError.message);
    return jsonResponse({ error: 'Failed to load schools', statusCode: 500 }, 500);
  }

  const { data: admins, error: adminsError } = await supabase
    .from('profiles')
    .select('id, name, school_id')
    .eq('role', 'SCHOOL_ADMIN');

  if (adminsError) {
    console.error('[manage-school] admin list failed:', adminsError.message);
    return jsonResponse({ error: 'Failed to load schools', statusCode: 500 }, 500);
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
    case 'PATCH':
      return handlePatch(req);
    case 'GET':
      return handleGet(req);
    default:
      return jsonResponse({ error: 'Method not allowed', statusCode: 405 }, 405);
  }
});
