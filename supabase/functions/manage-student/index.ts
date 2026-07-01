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

  const { data: inserted, error: insertError } = await supabase
    .from('students')
    .insert({
      school_id: validated.schoolId,
      name: validated.name,
      class_name: validated.className,
      route_id: validated.routeId ?? null,
      stop_id: validated.stopId ?? null,
      medical_notes: validated.medicalNotes ?? null,
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

  const { data: stops, error: stopsError } = await supabase
    .from('stops')
    .select('id, name, route_id, routes!inner(school_id)');

  if (stopsError) {
    return jsonResponse(
      { error: stopsError.message, statusCode: 500 },
      500,
    );
  }

  type StopLookupRow = {
    id: string;
    name: string;
    route_id: string;
  };

  const stopMap = new Map<string, { stopId: string; routeId: string }>();
  for (const stop of (stops ?? []) as StopLookupRow[]) {
    stopMap.set(stop.name.toLowerCase().trim(), {
      stopId: stop.id,
      routeId: stop.route_id,
    });
  }

  const toInsert: Array<{
    school_id: string;
    name: string;
    class_name: string;
    route_id: string;
    stop_id: string;
  }> = [];
  const unmatchedSet = new Set<string>();
  let skipped = 0;

  for (const student of students) {
    const match = stopMap.get(student.stopName.toLowerCase().trim());
    if (match) {
      toInsert.push({
        school_id: schoolId,
        name: student.name,
        class_name: student.className,
        route_id: match.routeId,
        stop_id: match.stopId,
      });
    } else {
      unmatchedSet.add(student.stopName);
      skipped += 1;
    }
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
        unmatchedStops: [...unmatchedSet],
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
