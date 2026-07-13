import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  createStudentSchema,
  updateStudentSchema,
  bulkImportStudentSchema,
  inviteParentSchema,
} from '../../../shared/schemas.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, PATCH, GET, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, content-type, x-client-info, apikey',
};

type StudentRow = {
  id: string;
  school_id: string;
  name: string;
  class_name: string;
  route_id: string | null;
  stop_id: string | null;
  photo_url: string | null;
  medical_notes: string | null;
  is_active: boolean;
};

type StudentListRow = StudentRow & {
  route: { name: string; type: string } | { name: string; type: string }[] | null;
  stop: { name: string } | { name: string }[] | null;
  student_parents?: { count: number }[];
};

function mapStudentRow(row: StudentRow) {
  return {
    id: row.id,
    schoolId: row.school_id,
    name: row.name,
    className: row.class_name,
    routeId: row.route_id ?? undefined,
    stopId: row.stop_id ?? undefined,
    photoUrl: row.photo_url ?? undefined,
    medicalNotes: row.medical_notes ?? undefined,
    isActive: row.is_active,
  };
}

// Lagos-biased geocode, mirroring manage-school's school-address geocoding.
// Best-effort: a failed/absent lookup never blocks student creation, it just
// leaves pickup_lat/pickup_lng null until an admin fixes it via Map Students.
async function geocodeAddress(
  address: string,
  apiKey: string,
): Promise<{ lat: number; lng: number } | null> {
  try {
    const url =
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&region=ng&bounds=6.35,2.7|6.70,4.33&key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json() as {
      status: string;
      results?: Array<{ geometry: { location: { lat: number; lng: number } } }>;
    };
    const result = json.results?.[0];
    if (json.status === 'OK' && result?.geometry?.location) {
      return { lat: result.geometry.location.lat, lng: result.geometry.location.lng };
    }
    if (json.status !== 'ZERO_RESULTS') {
      console.warn(`Google geocoding returned status ${json.status} for address: ${address}`);
    }
    return null;
  } catch (err) {
    console.warn(`Google geocoding failed for address "${address}":`, (err as Error).message);
    return null;
  }
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ----- Stop assignment (snap or create) -----
// The driver app walks the route stop by stop and groups students by stop_id,
// so every student with coordinates needs one. A student within
// STOP_SNAP_RADIUS_M of an existing stop shares it (same street); farther out,
// the student's own street becomes a NEW stop on the route — snapping to a
// far-away stop would send the bus to the wrong place.
const STOP_SNAP_RADIUS_M = 250;

type StopRow = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  sequence: number;
};

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// "The student's street": first comma segment of the address, house number
// stripped ("54 Alabi St, Bucknor, Lagos" → "Alabi St").
function streetFromAddress(address: string | null | undefined, fallback: string): string {
  const first = (address ?? '').split(',')[0].trim();
  const street = first.replace(/^\d+[a-zA-Z]?\s+/, '').trim();
  return street || fallback;
}

// Snap to the nearest stop in workingStops or create a new one on the route.
// workingStops is mutated so repeated calls within one request share newly
// created stops (several imported students on the same new street → one stop).
async function resolveStopId(
  supabase: SupabaseClient,
  routeId: string,
  lat: number,
  lng: number,
  address: string | null | undefined,
  fallbackName: string,
  workingStops: StopRow[],
): Promise<string | null> {
  let best: StopRow | null = null;
  let bestDist = Infinity;
  for (const stop of workingStops) {
    const d = haversineMeters(lat, lng, stop.latitude, stop.longitude);
    if (d < bestDist) {
      best = stop;
      bestDist = d;
    }
  }
  if (best && bestDist <= STOP_SNAP_RADIUS_M) return best.id;

  const name = streetFromAddress(address, fallbackName);
  const sequence = workingStops.reduce((m, s) => Math.max(m, s.sequence), 0) + 1;
  const { data: created, error } = await supabase
    .from('stops')
    .insert({ route_id: routeId, name, latitude: lat, longitude: lng, sequence })
    .select('id, name, latitude, longitude, sequence')
    .single();
  if (error || !created) {
    console.warn('[manage-student] failed to create stop:', error?.message);
    return best?.id ?? null;
  }
  workingStops.push(created as StopRow);
  return created.id;
}

async function loadRouteStops(
  supabase: SupabaseClient,
  routeId: string,
): Promise<StopRow[]> {
  const { data } = await supabase
    .from('stops')
    .select('id, name, latitude, longitude, sequence')
    .eq('route_id', routeId);
  return (data ?? []) as StopRow[];
}

async function authenticate(
  req: Request,
): Promise<
  | { ok: true; supabase: SupabaseClient; schoolId: string }
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
    {
      global: { headers: { Authorization: authHeader } },
    },
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
    .select('role, school_id')
    .eq('id', userData.user.id)
    .single();

  if (
    profileError ||
    !profile ||
    profile.role !== 'SCHOOL_ADMIN' ||
    !profile.school_id
  ) {
    return {
      ok: false,
      response: jsonResponse(
        {
          error: 'Forbidden: SCHOOL_ADMIN role required',
          statusCode: 403,
        },
        403,
      ),
    };
  }

  return { ok: true, supabase, schoolId: profile.school_id };
}

async function handleCreate(
  req: Request,
  body: Record<string, unknown>,
): Promise<Response> {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const { supabase, schoolId } = auth;

  const parseResult = createStudentSchema.safeParse({
    ...body,
    schoolId,
  });

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

  if (validated.routeId) {
    const { data: route, error: routeError } = await supabase
      .from('routes')
      .select('id')
      .eq('id', validated.routeId)
      .eq('school_id', schoolId)
      .single();

    if (routeError || !route) {
      return jsonResponse(
        {
          error: 'Route not found or does not belong to your school',
          statusCode: 404,
        },
        404,
      );
    }
  }

  if (validated.stopId) {
    if (!validated.routeId) {
      return jsonResponse(
        { error: 'stopId requires routeId', statusCode: 400 },
        400,
      );
    }

    const { data: stop, error: stopError } = await supabase
      .from('stops')
      .select('id')
      .eq('id', validated.stopId)
      .eq('route_id', validated.routeId)
      .single();

    if (stopError || !stop) {
      return jsonResponse(
        {
          error: 'Stop not found or does not belong to the specified route',
          statusCode: 404,
        },
        404,
      );
    }
  }

  // Trust Places-selected coordinates from the client when present; otherwise
  // geocode the address server-side (best-effort — never blocks creation).
  let pickupLat: number | null = validated.pickupLat ?? null;
  let pickupLng: number | null = validated.pickupLng ?? null;
  if (validated.pickupAddress && (pickupLat === null || pickupLng === null)) {
    const googleMapsApiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
    if (googleMapsApiKey) {
      const coords = await geocodeAddress(validated.pickupAddress, googleMapsApiKey);
      if (coords) {
        pickupLat = coords.lat;
        pickupLng = coords.lng;
      }
    }
  }

  // No explicit stop from the client: snap to the nearest stop on the route,
  // or create one for the student's street.
  let stopId: string | null = validated.stopId ?? null;
  if (!stopId && validated.routeId && pickupLat !== null && pickupLng !== null) {
    const workingStops = await loadRouteStops(supabase, validated.routeId);
    stopId = await resolveStopId(
      supabase,
      validated.routeId,
      pickupLat,
      pickupLng,
      validated.pickupAddress,
      `${validated.name}'s pickup`,
      workingStops,
    );
  }

  const { data: inserted, error: insertError } = await supabase
    .from('students')
    .insert({
      school_id: validated.schoolId,
      name: validated.name,
      class_name: validated.className,
      route_id: validated.routeId ?? null,
      stop_id: stopId,
      medical_notes: validated.medicalNotes ?? null,
      pickup_address: validated.pickupAddress ?? null,
      pickup_lat: pickupLat,
      pickup_lng: pickupLng,
    })
    .select()
    .single();

  if (insertError) {
    return jsonResponse(
      { error: insertError.message, statusCode: 500 },
      500,
    );
  }

  return jsonResponse(
    {
      data: mapStudentRow(inserted as StudentRow),
      message: 'Student created',
    },
    201,
  );
}

async function handleUpdate(req: Request): Promise<Response> {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const { supabase, schoolId } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body', statusCode: 400 }, 400);
  }

  const parseResult = updateStudentSchema.safeParse(body);
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

  const updateObj: Record<string, unknown> = {};
  if (validated.name !== undefined) {
    updateObj.name = validated.name;
  }
  if (validated.className !== undefined) {
    updateObj.class_name = validated.className;
  }
  if (validated.photoUrl !== undefined) {
    updateObj.photo_url = validated.photoUrl;
  }
  if (validated.medicalNotes !== undefined) {
    updateObj.medical_notes = validated.medicalNotes;
  }
  if (validated.isActive !== undefined) {
    updateObj.is_active = validated.isActive;
  }

  if (validated.stopId !== undefined && validated.stopId !== null) {
    const effectiveRouteId =
      validated.routeId !== undefined ? validated.routeId : undefined;
    if (effectiveRouteId === undefined || effectiveRouteId === null) {
      return jsonResponse(
        { error: 'stopId requires routeId', statusCode: 400 },
        400,
      );
    }
  }

  if (validated.routeId !== undefined) {
    if (validated.routeId === null) {
      updateObj.route_id = null;
      updateObj.stop_id = null;
    } else {
      const { data: route, error: routeError } = await supabase
        .from('routes')
        .select('id')
        .eq('id', validated.routeId)
        .eq('school_id', schoolId)
        .single();

      if (routeError || !route) {
        return jsonResponse(
          {
            error: 'Route not found or does not belong to your school',
            statusCode: 404,
          },
          404,
        );
      }
      updateObj.route_id = validated.routeId;
    }
  }

  if (validated.stopId !== undefined) {
    if (validated.stopId === null) {
      updateObj.stop_id = null;
    } else {
      const routeIdForStop =
        updateObj.route_id !== undefined
          ? (updateObj.route_id as string | null)
          : validated.routeId;

      if (!routeIdForStop) {
        return jsonResponse(
          { error: 'stopId requires routeId', statusCode: 400 },
          400,
        );
      }

      const { data: stop, error: stopError } = await supabase
        .from('stops')
        .select('id')
        .eq('id', validated.stopId)
        .eq('route_id', routeIdForStop)
        .single();

      if (stopError || !stop) {
        return jsonResponse(
          {
            error:
              'Stop not found or does not belong to the specified route',
            statusCode: 404,
          },
          404,
        );
      }
      updateObj.stop_id = validated.stopId;
    }
  }

  if (Object.keys(updateObj).length === 0) {
    return jsonResponse(
      { error: 'No fields to update', statusCode: 400 },
      400,
    );
  }

  const { data: updated, error: updateError } = await supabase
    .from('students')
    .update(updateObj)
    .eq('id', validated.id)
    .select()
    .single();

  if (updateError) {
    if (updateError.code === 'PGRST116') {
      return jsonResponse(
        { error: 'Student not found', statusCode: 404 },
        404,
      );
    }
    return jsonResponse(
      { error: updateError.message, statusCode: 400 },
      400,
    );
  }

  return jsonResponse(
    {
      data: mapStudentRow(updated as StudentRow),
      message: 'Student updated',
    },
    200,
  );
}

async function handleBulkImport(
  req: Request,
  body: Record<string, unknown>,
): Promise<Response> {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const { supabase, schoolId } = auth;

  const parseResult = bulkImportStudentSchema.safeParse(body);
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

  const { students } = parseResult.data;

  const { data: routes, error: routesError } = await supabase
    .from('routes')
    .select('id, name')
    .eq('school_id', schoolId);

  if (routesError) {
    return jsonResponse(
      { error: routesError.message, statusCode: 500 },
      500,
    );
  }

  const routeMap = new Map<string, string>();
  for (const route of (routes ?? []) as { id: string; name: string }[]) {
    routeMap.set(route.name.toLowerCase().trim(), route.id);
  }

  const toInsert: Array<{
    school_id: string;
    name: string;
    class_name: string;
    pickup_address: string | null;
    pickup_lat: number | null;
    pickup_lng: number | null;
    route_id: string;
    stop_id: string | null;
  }> = [];
  const unmatchedSet = new Set<string>();
  let skipped = 0;

  for (const student of students) {
    const routeId = routeMap.get(student.routeName.toLowerCase().trim());
    if (routeId) {
      toInsert.push({
        school_id: schoolId,
        name: student.name,
        class_name: student.className,
        pickup_address: student.pickupAddress ?? null,
        pickup_lat: null,
        pickup_lng: null,
        route_id: routeId,
        stop_id: null,
      });
    } else {
      unmatchedSet.add(student.routeName);
      skipped += 1;
    }
  }

  // Geocode addresses server-side so imported students get a real map
  // location immediately, instead of waiting on the admin to open Map
  // Students later. Best-effort and rate-limited to a small concurrency —
  // a failed/absent lookup just leaves pickup_lat/pickup_lng null.
  const googleMapsApiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
  if (googleMapsApiKey) {
    const GEOCODE_BATCH_SIZE = 10;
    const rowsWithAddress = toInsert.filter((row) => row.pickup_address);
    for (let i = 0; i < rowsWithAddress.length; i += GEOCODE_BATCH_SIZE) {
      const batch = rowsWithAddress.slice(i, i + GEOCODE_BATCH_SIZE);
      await Promise.all(
        batch.map(async (row) => {
          const coords = await geocodeAddress(row.pickup_address!, googleMapsApiKey);
          if (coords) {
            row.pickup_lat = coords.lat;
            row.pickup_lng = coords.lng;
          }
        }),
      );
    }
  }

  // Assign each geocoded student a stop: shared if one exists on their street
  // (within STOP_SNAP_RADIUS_M), otherwise their street becomes a new stop.
  // Sequential per route so students on the same new street share the stop
  // created for the first of them.
  const stopsByRoute = new Map<string, StopRow[]>();
  for (const row of toInsert) {
    if (row.pickup_lat === null || row.pickup_lng === null) continue;
    let workingStops = stopsByRoute.get(row.route_id);
    if (!workingStops) {
      workingStops = await loadRouteStops(supabase, row.route_id);
      stopsByRoute.set(row.route_id, workingStops);
    }
    row.stop_id = await resolveStopId(
      supabase,
      row.route_id,
      row.pickup_lat,
      row.pickup_lng,
      row.pickup_address,
      `${row.name}'s pickup`,
      workingStops,
    );
  }

  if (toInsert.length > 0) {
    const { error: insertError } = await supabase
      .from('students')
      .insert(toInsert);

    if (insertError) {
      return jsonResponse(
        { error: insertError.message, statusCode: 500 },
        500,
      );
    }
  }

  return jsonResponse(
    {
      data: {
        created: toInsert.length,
        skipped,
        unmatchedRoutes: [...unmatchedSet],
      },
      message: 'Bulk import complete',
    },
    200,
  );
}

async function handleInviteParent(
  req: Request,
  body: Record<string, unknown>,
): Promise<Response> {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const parseResult = inviteParentSchema.safeParse(body);
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

  const { studentId, parentEmail, parentName } = parseResult.data;

  const { data: student, error: studentError } = await supabase
    .from('students')
    .select('id')
    .eq('id', studentId)
    .single();

  if (studentError || !student) {
    return jsonResponse(
      {
        error: 'Student not found or does not belong to your school',
        statusCode: 404,
      },
      404,
    );
  }

  const serviceSupabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let parentId: string;
  let isNewUser: boolean;

  const inviteResult = await serviceSupabase.auth.admin.inviteUserByEmail(
    parentEmail,
    { data: { name: parentName ?? parentEmail } },
  );

  if (inviteResult.error) {
    const message = inviteResult.error.message ?? '';
    if (message.includes('already been registered')) {
      const linkResult = await serviceSupabase.auth.admin.generateLink({
        type: 'magiclink',
        email: parentEmail,
      });

      if (linkResult.error || !linkResult.data.user) {
        return jsonResponse(
          { error: 'Failed to invite parent', statusCode: 500 },
          500,
        );
      }

      parentId = linkResult.data.user.id;
      isNewUser = false;

      if (parentName) {
        await serviceSupabase
          .from('profiles')
          .update({ name: parentName })
          .eq('id', parentId)
          .eq('name', parentEmail);
      }
    } else {
      return jsonResponse(
        { error: 'Failed to invite parent', statusCode: 500 },
        500,
      );
    }
  } else {
    if (!inviteResult.data.user) {
      return jsonResponse(
        { error: 'Failed to invite parent', statusCode: 500 },
        500,
      );
    }
    parentId = inviteResult.data.user.id;
    isNewUser = true;
  }

  const { error: linkError } = await serviceSupabase
    .from('student_parents')
    .insert({ student_id: studentId, parent_id: parentId });

  if (linkError && linkError.code !== '23505') {
    return jsonResponse(
      { error: 'Failed to link parent to student', statusCode: 500 },
      500,
    );
  }

  return jsonResponse(
    {
      data: {
        parentId,
        email: parentEmail,
        studentId,
        isNewUser,
      },
      message: 'Parent invited',
    },
    200,
  );
}

async function handleList(req: Request): Promise<Response> {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const { data: students, error: studentsError } = await supabase
    .from('students')
    .select('*, route:routes(name, type), stop:stops(name), student_parents(count)')
    .order('name');

  if (studentsError) {
    return jsonResponse(
      { error: studentsError.message, statusCode: 500 },
      500,
    );
  }

  const studentRows = (students ?? []) as unknown as StudentListRow[];

  const mapped = studentRows.map((row) => {
    const routeField = row.route;
    const route = Array.isArray(routeField) ? routeField[0] : routeField;
    const stopField = row.stop;
    const stop = Array.isArray(stopField) ? stopField[0] : stopField;
    const parentCount = Array.isArray(row.student_parents)
      ? row.student_parents[0]?.count ?? 0
      : 0;

    return {
      ...mapStudentRow(row),
      route: route ? { name: route.name, type: route.type } : null,
      stop: stop ? { name: stop.name } : null,
      parentCount,
    };
  });

  return jsonResponse(
    { data: mapped, message: 'Students retrieved' },
    200,
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method === 'GET') {
    return handleList(req);
  }

  if (req.method === 'PATCH') {
    return handleUpdate(req);
  }

  if (req.method === 'POST') {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonResponse(
        { error: 'Invalid JSON body', statusCode: 400 },
        400,
      );
    }

    const bodyRecord = body as Record<string, unknown>;
    const action = bodyRecord.action;

    if (action === 'bulk') {
      return handleBulkImport(req, bodyRecord);
    }
    if (action === 'invite-parent') {
      return handleInviteParent(req, bodyRecord);
    }
    if (action === undefined || action === 'create') {
      return handleCreate(req, bodyRecord);
    }

    return jsonResponse(
      { error: 'Invalid action', statusCode: 400 },
      400,
    );
  }

  return jsonResponse(
    { error: 'Method not allowed', statusCode: 405 },
    405,
  );
});
