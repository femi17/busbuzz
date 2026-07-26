import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';

const routeTypeSchema = z.enum(['MORNING', 'AFTERNOON', 'BOTH']);

const stopInputSchema = z.object({
  name: z.string().min(1).max(200),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  sequence: z.number().int().min(0),
  etaMinutes: z.number().int().min(0).optional(),
});

const createRouteSchema = z.object({
  schoolId: z.string().uuid(),
  busId: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  type: routeTypeSchema,
  stops: z.array(stopInputSchema),
});

// Routes had no update path at all before this — the web dashboard could
// only create (always as type 'BOTH', with no way to pick MORNING/AFTERNOON)
// or delete a route, never rename it, change its type, or reassign its bus.
const updateRouteSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  type: routeTypeSchema.optional(),
  busId: z.string().uuid().nullable().optional(),
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, PATCH, GET, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, content-type, x-client-info, apikey',
};

type StopRow = {
  id: string;
  route_id: string;
  name: string;
  latitude: number;
  longitude: number;
  sequence: number;
  eta_minutes: number | null;
};

type RouteRow = {
  id: string;
  school_id: string;
  bus_id: string | null;
  name: string;
  type: 'MORNING' | 'AFTERNOON' | 'BOTH';
  stops?: StopRow[];
  bus?: { plate_number: string } | { plate_number: string }[] | null;
  students?: { count: number }[];
};

function mapStopRow(row: StopRow) {
  return {
    id: row.id,
    routeId: row.route_id,
    name: row.name,
    latitude: row.latitude,
    longitude: row.longitude,
    sequence: row.sequence,
    etaMinutes: row.eta_minutes ?? undefined,
  };
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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

async function handleCreate(req: Request): Promise<Response> {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const { supabase, schoolId } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body', statusCode: 400 }, 400);
  }

  const parseResult = createRouteSchema.safeParse({
    ...(body as Record<string, unknown>),
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

  if (validated.busId) {
    const { data: bus, error: busError } = await supabase
      .from('buses')
      .select('id')
      .eq('id', validated.busId)
      .eq('school_id', schoolId)
      .single();

    if (busError || !bus) {
      return jsonResponse(
        {
          error: 'Bus not found or does not belong to your school',
          statusCode: 404,
        },
        404,
      );
    }
  }

  const serviceSupabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: rpcResult, error: rpcError } = await serviceSupabase.rpc(
    'create_route_with_stops',
    {
      p_school_id: schoolId,
      p_bus_id: validated.busId ?? null,
      p_name: validated.name,
      p_type: validated.type,
      p_stops: validated.stops,
    },
  );

  if (rpcError) {
    return jsonResponse(
      { error: 'Failed to create route', statusCode: 500 },
      500,
    );
  }

  return jsonResponse(
    { data: rpcResult, message: 'Route created' },
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

  const parseResult = updateRouteSchema.safeParse(body);
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
    .from('routes')
    .select('id, school_id')
    .eq('id', id)
    .single();

  if (existingError || !existing) {
    return jsonResponse({ error: 'Route not found', statusCode: 404 }, 404);
  }
  if (existing.school_id !== schoolId) {
    return jsonResponse(
      { error: 'Route does not belong to your school', statusCode: 403 },
      403,
    );
  }

  if (updates.busId) {
    const { data: bus, error: busError } = await supabase
      .from('buses')
      .select('id')
      .eq('id', updates.busId)
      .eq('school_id', schoolId)
      .single();

    if (busError || !bus) {
      return jsonResponse(
        {
          error: 'Bus not found or does not belong to your school',
          statusCode: 404,
        },
        404,
      );
    }
  }

  const updatePayload: Record<string, unknown> = {};
  if (updates.name !== undefined) updatePayload.name = updates.name;
  if (updates.type !== undefined) updatePayload.type = updates.type;
  // busId is nullable (unassign the bus) vs. simply absent (leave
  // unchanged) — 'busId' in updates distinguishes those since zod omits
  // untouched optional keys from the parsed result entirely.
  if ('busId' in updates) updatePayload.bus_id = updates.busId ?? null;

  if (Object.keys(updatePayload).length === 0) {
    return jsonResponse(
      { error: 'No fields to update', statusCode: 400 },
      400,
    );
  }

  const { data: updated, error: updateError } = await supabase
    .from('routes')
    .update(updatePayload)
    .eq('id', id)
    .select()
    .single();

  if (updateError) {
    return jsonResponse({ error: updateError.message, statusCode: 400 }, 400);
  }

  return jsonResponse(
    { data: updated, message: 'Route updated' },
    200,
  );
}

async function handleList(req: Request): Promise<Response> {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const { data: routes, error: routesError } = await supabase
    .from('routes')
    .select('*, stops(*), bus:buses(plate_number), students(count)')
    .order('name')
    .order('sequence', { referencedTable: 'stops' });

  if (routesError) {
    return jsonResponse(
      { error: routesError.message, statusCode: 500 },
      500,
    );
  }

  const routeRows = (routes ?? []) as unknown as RouteRow[];

  const mapped = routeRows.map((row) => {
    const busField = row.bus;
    const bus = Array.isArray(busField) ? busField[0] : busField;
    const studentCount = Array.isArray(row.students)
      ? row.students[0]?.count ?? 0
      : 0;

    return {
      id: row.id,
      schoolId: row.school_id,
      busId: row.bus_id ?? undefined,
      name: row.name,
      type: row.type,
      stops: (row.stops ?? []).map(mapStopRow),
      bus: bus ? { plateNumber: bus.plate_number } : null,
      studentCount,
    };
  });

  return jsonResponse(
    { data: mapped, message: 'Routes retrieved' },
    200,
  );
}

async function handleDelete(req: Request): Promise<Response> {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body', statusCode: 400 }, 400);
  }

  const idResult = z.object({ id: z.string().uuid() }).safeParse(body);

  if (!idResult.success) {
    return jsonResponse(
      {
        error: 'Validation error',
        statusCode: 400,
        details: idResult.error.issues,
      },
      400,
    );
  }

  const { id } = idResult.data;

  const { count: studentCount, error: studentCountError } = await supabase
    .from('students')
    .select('id', { count: 'exact', head: true })
    .eq('route_id', id);

  if (studentCountError) {
    return jsonResponse(
      { error: studentCountError.message, statusCode: 500 },
      500,
    );
  }

  if (studentCount && studentCount > 0) {
    return jsonResponse(
      {
        error: `Cannot delete route: ${studentCount} students are still assigned to it`,
        statusCode: 409,
      },
      409,
    );
  }

  const { data: deleted, error: deleteError } = await supabase
    .from('routes')
    .delete()
    .eq('id', id)
    .select()
    .single();

  if (deleteError) {
    if (deleteError.code === 'PGRST116') {
      return jsonResponse(
        { error: 'Route not found', statusCode: 404 },
        404,
      );
    }
    return jsonResponse(
      { error: deleteError.message, statusCode: 400 },
      400,
    );
  }

  if (!deleted) {
    return jsonResponse(
      { error: 'Route not found', statusCode: 404 },
      404,
    );
  }

  return jsonResponse(
    { data: { id }, message: 'Route deleted' },
    200,
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  switch (req.method) {
    case 'POST':
      return handleCreate(req);
    case 'PATCH':
      return handleUpdate(req);
    case 'GET':
      return handleList(req);
    case 'DELETE':
      return handleDelete(req);
    default:
      return jsonResponse(
        { error: 'Method not allowed', statusCode: 405 },
        405,
      );
  }
});
