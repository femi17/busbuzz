import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'zod';

// Inlined (was ../../../shared/schemas.ts) so the deploy bundler ships one file.
const markAttendanceSchema = z.object({
  tripId: z.string().uuid(),
  studentId: z.string().uuid(),
  status: z.enum(['BOARDED', 'ABSENT', 'DROPPED_OFF']),
});

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
    .select('role')
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
  const parseResult = markAttendanceSchema.safeParse(body);
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

  // Service-role client for privileged writes
  const serviceSupabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Load the trip
  const { data: trip, error: tripError } = await serviceSupabase
    .from('trips')
    .select('id, bus_id, route_id, driver_id, status')
    .eq('id', validated.tripId)
    .single();

  if (tripError || !trip) {
    return jsonResponse({ error: 'Trip not found', statusCode: 404 }, 404);
  }

  // Verify ownership
  if (trip.driver_id !== userData.user.id) {
    return jsonResponse(
      {
        error: 'You can only mark attendance on your own trips',
        statusCode: 403,
      },
      403,
    );
  }

  // Verify trip is active
  if (trip.status !== 'ACTIVE') {
    return jsonResponse({ error: 'Trip is not active', statusCode: 400 }, 400);
  }

  // Verify student exists, is active, and is assigned to this trip's route + a stop
  const { data: student, error: studentError } = await serviceSupabase
    .from('students')
    .select('id, name, stop_id, route_id')
    .eq('id', validated.studentId)
    .eq('is_active', true)
    .single();

  if (studentError || !student) {
    return jsonResponse({ error: 'Student not found', statusCode: 404 }, 404);
  }

  if (student.route_id !== trip.route_id) {
    return jsonResponse(
      {
        error: "Student is not assigned to this trip's route",
        statusCode: 400,
      },
      400,
    );
  }

  if (!student.stop_id) {
    return jsonResponse(
      {
        error: 'Student has no stop assigned on this route',
        statusCode: 400,
      },
      400,
    );
  }

  const markedAt = new Date().toISOString();

  // Upsert attendance record
  const { error: upsertError } = await serviceSupabase
    .from('attendance')
    .upsert(
      {
        trip_id: validated.tripId,
        student_id: validated.studentId,
        status: validated.status,
        marked_by: userData.user.id,
        marked_at: markedAt,
      },
      { onConflict: 'trip_id,student_id' },
    );

  if (upsertError) {
    return jsonResponse(
      { error: 'Failed to mark attendance', statusCode: 500 },
      500,
    );
  }

  // Realtime broadcast on the private bus channel (non-fatal on failure)
  try {
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    await fetch(`${Deno.env.get('SUPABASE_URL')}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        messages: [
          {
            topic: `bus:${trip.bus_id}`,
            event: validated.status === 'DROPPED_OFF' ? 'student_dropped' : 'student_boarded',
            payload: {
              studentId: validated.studentId,
              status: validated.status,
              timestamp: markedAt,
            },
            private: true,
          },
        ],
      }),
    });
  } catch (err) {
    console.error('[mark-attendance] Realtime broadcast failed:', err);
  }

  // Notify parents for all statuses (non-fatal on failure)
  try {
    const { data: parentLinks, error: parentLinksError } =
      await serviceSupabase
        .from('student_parents')
        .select('parent_id')
        .eq('student_id', validated.studentId);

    if (parentLinksError) {
      console.error(
        '[mark-attendance] Failed to load parent links:',
        parentLinksError,
      );
    } else {
      const parentIds = (parentLinks ?? []).map((p) => p.parent_id);

      if (parentIds.length > 0) {
        let pushBody: string;
        if (validated.status === 'BOARDED') {
          pushBody = `${student.name} has boarded the bus \u{1F68C}`;
        } else if (validated.status === 'DROPPED_OFF') {
          pushBody = `${student.name} has been dropped off at school \u{2705}`;
        } else {
          pushBody = `${student.name} was not at the stop \u{2014} please contact the school.`;
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const internalSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET')!;

        const pushResp = await fetch(
          `${supabaseUrl}/functions/v1/send-push`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${serviceRoleKey}`,
              'apikey': serviceRoleKey,
              'X-Internal-Secret': internalSecret,
            },
            body: JSON.stringify({
              userIds: parentIds,
              title: 'Bus Update',
              body: pushBody,
              data: {
                type: 'attendance',
                tripId: validated.tripId,
                studentId: validated.studentId,
                status: validated.status,
              },
              channelId: 'trip-updates',
            }),
          },
        );

        if (!pushResp.ok) {
          console.error(
            `[mark-attendance] send-push returned ${pushResp.status}: ${await pushResp.text()}`,
          );
        }
      }
    }
  } catch (err) {
    console.error('[mark-attendance] send-push call failed:', err);
  }

  return jsonResponse(
    {
      data: { recorded: true },
      message: 'Attendance marked',
    },
    200,
  );
});
