import { createClient } from 'npm:@supabase/supabase-js@2';

// "My child is not going to school today."
//
// PARENT role. Body: { studentId: uuid, action: 'report' | 'cancel' }.
// Applies to today (Africa/Lagos). On report: records the absence, notifies
// the school admins (notification bell + push) and the route's driver so they
// skip the stop; start-trip then auto-marks the child ABSENT on today's runs.
// On cancel (child is going after all): removes the absence and tells the same
// people.

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

// Today in Africa/Lagos (UTC+1) — the edge runtime clock is UTC.
function lagosToday(): string {
  const now = new Date(Date.now() + 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

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
    .select('role, name')
    .eq('id', userData.user.id)
    .single();

  if (profileError || !profile || profile.role !== 'PARENT') {
    return jsonResponse({ error: 'Forbidden: PARENT role required', statusCode: 403 }, 403);
  }

  let body: { studentId?: unknown; action?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body', statusCode: 400 }, 400);
  }

  const studentId = typeof body.studentId === 'string' ? body.studentId : '';
  const action = body.action === 'cancel' ? 'cancel' : body.action === 'report' ? 'report' : null;

  if (!UUID_RE.test(studentId) || !action) {
    return jsonResponse(
      { error: 'studentId and action (report | cancel) are required', statusCode: 400 },
      400,
    );
  }

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // The caller must be a linked parent of this student.
  const { data: link, error: linkError } = await service
    .from('student_parents')
    .select('student_id')
    .eq('student_id', studentId)
    .eq('parent_id', userData.user.id)
    .maybeSingle();

  if (linkError || !link) {
    return jsonResponse(
      { error: 'You can only report absence for your own child', statusCode: 403 },
      403,
    );
  }

  const { data: student, error: studentError } = await service
    .from('students')
    .select('id, name, school_id, route_id, route:routes(name, bus:buses(driver_id))')
    .eq('id', studentId)
    .eq('is_active', true)
    .single();

  if (studentError || !student) {
    return jsonResponse({ error: 'Student not found', statusCode: 404 }, 404);
  }

  const today = lagosToday();

  if (action === 'report') {
    const { error: upsertError } = await service
      .from('student_absences')
      .upsert(
        { student_id: studentId, absence_date: today, reported_by: userData.user.id },
        { onConflict: 'student_id,absence_date' },
      );
    if (upsertError) {
      return jsonResponse({ error: 'Failed to record absence', statusCode: 500 }, 500);
    }
  } else {
    const { error: deleteError } = await service
      .from('student_absences')
      .delete()
      .eq('student_id', studentId)
      .eq('absence_date', today);
    if (deleteError) {
      return jsonResponse({ error: 'Failed to cancel absence', statusCode: 500 }, 500);
    }
  }

  // Notify the school admins and the route's driver (non-fatal on failure).
  try {
    const { data: admins } = await service
      .from('profiles')
      .select('id')
      .eq('school_id', student.school_id)
      .eq('role', 'SCHOOL_ADMIN');

    const routeRow = Array.isArray(student.route) ? student.route[0] : student.route;
    const busRow = routeRow
      ? (Array.isArray(routeRow.bus) ? routeRow.bus[0] : routeRow.bus)
      : null;
    const driverId: string | null = busRow?.driver_id ?? null;

    const recipientIds = [
      ...(admins ?? []).map((a: { id: string }) => a.id),
      ...(driverId ? [driverId] : []),
    ];

    if (recipientIds.length > 0) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const internalSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET')!;

      const routeName = routeRow?.name ? ` (${routeRow.name})` : '';
      const pushResp = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey,
          'X-Internal-Secret': internalSecret,
        },
        body: JSON.stringify({
          userIds: recipientIds,
          title: action === 'report' ? 'Absence notice' : 'Absence cancelled',
          body:
            action === 'report'
              ? `${student.name}${routeName} will NOT ride the bus today — no need to stop for them.`
              : `${student.name}${routeName} WILL ride the bus today after all.`,
          data: { type: 'absence', studentId, date: today, action },
          channelId: 'trip-updates',
        }),
      });
      if (!pushResp.ok) {
        console.error(`[report-absence] send-push returned ${pushResp.status}`);
      }
    }
  } catch (err) {
    console.error('[report-absence] notify failed:', err);
  }

  return jsonResponse(
    {
      data: { studentId, date: today, absent: action === 'report' },
      message: action === 'report' ? 'Absence recorded' : 'Absence cancelled',
    },
    200,
  );
});
