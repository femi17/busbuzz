import { createClient } from 'npm:@supabase/supabase-js@2';
import { updatePushTokenSchema } from '../../../shared/schemas.ts';

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

  // 1-2. Auth header check
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse(
      { error: 'Missing Authorization header', statusCode: 401 },
      401,
    );
  }

  // 3. Anon-key client with user's JWT
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: { headers: { Authorization: authHeader } },
    },
  );

  // 4. Verify user
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse(
      { error: 'Invalid or expired session', statusCode: 401 },
      401,
    );
  }

  // 5. Parse JSON body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body', statusCode: 400 }, 400);
  }

  // 6. Validate with Zod
  const parseResult = updatePushTokenSchema.safeParse(body);
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

  // 7. Service-role client for the update
  const serviceSupabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // 8. Register the token in push_tokens — one row per device/install, so a
  // profile signed into two devices gets pushes on both instead of the
  // second registration silently overwriting the first (the old behaviour,
  // back when this was a single profiles.expo_push_token column). The
  // unique constraint is on the token itself: if this exact token was
  // previously registered under a different profile (device handed off,
  // reinstall under a different login), this hands delivery over to the new
  // owner instead of leaving a stale row still pointing at the old one.
  const { error: updateError } = await serviceSupabase
    .from('push_tokens')
    .upsert(
      {
        profile_id: userData.user.id,
        expo_push_token: validated.expoPushToken,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'expo_push_token' },
    );

  if (updateError) {
    return jsonResponse(
      { error: 'Failed to update push token', statusCode: 500 },
      500,
    );
  }

  // 9. Return success
  return jsonResponse(
    { data: { updated: true }, message: 'Push token updated' },
    200,
  );
});
