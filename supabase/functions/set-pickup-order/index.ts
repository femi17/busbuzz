import { createClient } from 'npm:@supabase/supabase-js@2';

// Saves the driver-arranged pickup order for a route's students.
//
// The driver knows the road: they arrange students once, in the order they are
// picked up along the route, and it persists on students.pickup_sequence (the
// afternoon run reads it in reverse). POST, DRIVER role only, and the route's
// bus must be assigned to the calling driver.
//
// Body: { routeId: uuid, studentIds: uuid[] }  — studentIds in pickup order.

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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed', statusCode: 405 }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Missing Authorization header', statusCode: 401 }, 401);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse({ error: 'Invalid or expired session', statusCode: 401 }, 401);
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, school_id')
    .eq('id', userData.user.id)
    .single();

  if (profileError || !profile || profile.role !== 'DRIVER') {
    return jsonResponse({ error: 'Forbidden: DRIVER role required', statusCode: 403 }, 403);
  }

  let body: { routeId?: unknown; studentIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body', statusCode: 400 }, 400);
  }

  const routeId = typeof body.routeId === 'string' ? body.routeId : '';
  const studentIds = Array.isArray(body.studentIds) ? body.studentIds : null;

  if (
    !UUID_RE.test(routeId) ||
    !studentIds ||
    studentIds.length === 0 ||
    studentIds.length > 200 ||
    !studentIds.every((id) => typeof id === 'string' && UUID_RE.test(id)) ||
    new Set(studentIds).size !== studentIds.length
  ) {
    return jsonResponse(
      { error: 'routeId and an ordered list of unique studentIds are required', statusCode: 400 },
      400,
    );
  }

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // The route must belong to the driver's school, and its bus must be assigned
  // to this driver — a driver can only arrange their own route.
  const { data: route, error: routeError } = await service
    .from('routes')
    .select('id, school_id, bus_id, bus:buses(driver_id)')
    .eq('id', routeId)
    .single();

  if (routeError || !route || route.school_id !== profile.school_id) {
    return jsonResponse({ error: 'Route not found', statusCode: 404 }, 404);
  }

  const busRow = Array.isArray(route.bus) ? route.bus[0] : route.bus;
  if (!busRow || busRow.driver_id !== userData.user.id) {
    return jsonResponse(
      { error: 'You can only arrange the pickup order for your own route', statusCode: 403 },
      403,
    );
  }

  // Every submitted student must be an active student on this route.
  const { data: routeStudents, error: studentsError } = await service
    .from('students')
    .select('id')
    .eq('route_id', routeId)
    .eq('is_active', true);

  if (studentsError) {
    return jsonResponse({ error: 'Failed to save pickup order', statusCode: 500 }, 500);
  }

  const routeStudentIds = new Set((routeStudents ?? []).map((s: { id: string }) => s.id));
  if (!studentIds.every((id: string) => routeStudentIds.has(id))) {
    return jsonResponse(
      { error: 'All students must belong to this route', statusCode: 400 },
      400,
    );
  }

  const updates = await Promise.all(
    (studentIds as string[]).map((id, index) =>
      service.from('students').update({ pickup_sequence: index + 1 }).eq('id', id),
    ),
  );

  if (updates.some((u) => u.error)) {
    return jsonResponse({ error: 'Failed to save pickup order', statusCode: 500 }, 500);
  }

  return jsonResponse(
    { data: { saved: studentIds.length }, message: 'Pickup order saved' },
    200,
  );
});
