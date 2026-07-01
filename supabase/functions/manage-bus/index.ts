import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';
import { createBusSchema, updateBusSchema } from '../../../shared/schemas.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, content-type, x-client-info, apikey',
};

type BusRow = {
  id: string;
  school_id: string;
  plate_number: string;
  capacity: number;
  device_id: string | null;
  status: 'ACTIVE' | 'MAINTENANCE' | 'RETIRED';
};

function mapBusRow(row: BusRow) {
  return {
    id: row.id,
    schoolId: row.school_id,
    plateNumber: row.plate_number,
    capacity: row.capacity,
    deviceId: row.device_id ?? undefined,
    status: row.status,
  };
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isDuplicateDeviceIdError(message: string): boolean {
  return message.includes('duplicate key') && message.includes('device_id');
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

  const parseResult = createBusSchema.safeParse({
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

  const { data: inserted, error: insertError } = await supabase
    .from('buses')
    .insert({
      plate_number: validated.plateNumber,
      capacity: validated.capacity,
      device_id: validated.deviceId ?? null,
      school_id: validated.schoolId,
      status: 'ACTIVE',
    })
    .select()
    .single();

  if (insertError) {
    if (isDuplicateDeviceIdError(insertError.message)) {
      return jsonResponse(
        {
          error: 'A bus with this device ID already exists',
          statusCode: 409,
        },
        409,
      );
    }
    return jsonResponse(
      { error: insertError.message, statusCode: 400 },
      400,
    );
  }

  return jsonResponse(
    { data: mapBusRow(inserted as BusRow), message: 'Bus created' },
    201,
  );
}

async function handleUpdate(req: Request): Promise<Response> {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body', statusCode: 400 }, 400);
  }

  const parseResult = updateBusSchema.safeParse(body);
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
  if (validated.plateNumber !== undefined) {
    updateObj.plate_number = validated.plateNumber;
  }
  if (validated.capacity !== undefined) {
    updateObj.capacity = validated.capacity;
  }
  if (validated.deviceId !== undefined) {
    updateObj.device_id = validated.deviceId;
  }
  if (validated.status !== undefined) {
    updateObj.status = validated.status;
  }

  if (Object.keys(updateObj).length === 0) {
    return jsonResponse(
      { error: 'No fields to update', statusCode: 400 },
      400,
    );
  }

  const { data: updated, error: updateError } = await supabase
    .from('buses')
    .update(updateObj)
    .eq('id', validated.id)
    .select()
    .single();

  if (updateError) {
    if (updateError.code === 'PGRST116') {
      return jsonResponse(
        { error: 'Bus not found', statusCode: 404 },
        404,
      );
    }
    if (isDuplicateDeviceIdError(updateError.message)) {
      return jsonResponse(
        {
          error: 'A bus with this device ID already exists',
          statusCode: 409,
        },
        409,
      );
    }
    return jsonResponse(
      { error: updateError.message, statusCode: 400 },
      400,
    );
  }

  return jsonResponse(
    { data: mapBusRow(updated as BusRow), message: 'Bus updated' },
    200,
  );
}

async function handleRetire(req: Request): Promise<Response> {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body', statusCode: 400 }, 400);
  }

  const idResult = z
    .object({ id: z.string().uuid() })
    .safeParse(body);

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

  const { data: retired, error: retireError } = await supabase
    .from('buses')
    .update({ status: 'RETIRED' })
    .eq('id', idResult.data.id)
    .select()
    .single();

  if (retireError) {
    if (retireError.code === 'PGRST116') {
      return jsonResponse(
        { error: 'Bus not found', statusCode: 404 },
        404,
      );
    }
    return jsonResponse(
      { error: retireError.message, statusCode: 400 },
      400,
    );
  }

  return jsonResponse(
    { data: mapBusRow(retired as BusRow), message: 'Bus retired' },
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
    case 'DELETE':
      return handleRetire(req);
    default:
      return jsonResponse(
        { error: 'Method not allowed', statusCode: 405 },
        405,
      );
  }
});
