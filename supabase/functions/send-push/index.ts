import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendPushSchema } from '../../../shared/schemas.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, content-type, x-client-info, apikey, x-internal-secret',
};

const EXPO_PUSH_URL =
  Deno.env.get('EXPO_PUSH_URL') ?? 'https://exp.host/--/api/v2/push/send';

type ProfileRow = {
  id: string;
  expo_push_token: string | null;
};

type ExpoTicket = {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
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

  // 2. Internal secret check
  const internalSecretHeader = req.headers.get('X-Internal-Secret');
  const internalSecretEnv = Deno.env.get('INTERNAL_FUNCTION_SECRET');
  if (
    !internalSecretHeader ||
    !internalSecretEnv ||
    internalSecretHeader !== internalSecretEnv
  ) {
    return jsonResponse({ error: 'Forbidden', statusCode: 403 }, 403);
  }

  // 3. Parse JSON body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body', statusCode: 400 }, 400);
  }

  // 4. Validate with Zod
  const parseResult = sendPushSchema.safeParse(body);
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

  // 5. Short-circuit on empty userIds
  if (validated.userIds.length === 0) {
    return jsonResponse(
      { data: { sent: 0, failed: 0 }, message: 'Notifications sent' },
      200,
    );
  }

  // 6. Service-role client
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // 7. Look up push tokens
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, expo_push_token')
    .in('id', validated.userIds);

  if (profilesError) {
    console.error('[send-push] Failed to load profiles:', profilesError);
    return jsonResponse(
      { data: { sent: 0, failed: 0 }, message: 'Notifications sent' },
      200,
    );
  }

  const validTokens: Array<{ id: string; token: string }> = (
    (profiles ?? []) as ProfileRow[]
  )
    .filter((p) => !!p.expo_push_token && p.expo_push_token.trim() !== '')
    .map((p) => ({ id: p.id, token: p.expo_push_token as string }));

  if (validTokens.length === 0) {
    return jsonResponse(
      { data: { sent: 0, failed: 0 }, message: 'Notifications sent' },
      200,
    );
  }

  // 8. Build Expo push messages
  const messages = validTokens.map((entry) => ({
    to: entry.token,
    title: validated.title,
    body: validated.body,
    data: validated.data ?? {},
    sound: 'default' as const,
  }));

  // 9. POST to Expo Push API
  let expoResp: Response;
  try {
    expoResp = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify(messages),
    });
  } catch (err) {
    console.error('[send-push] Expo API request failed:', err);
    return jsonResponse(
      { error: 'Failed to reach Expo Push API', statusCode: 502 },
      502,
    );
  }

  if (!expoResp.ok) {
    console.error(
      `[send-push] Expo Push API returned ${expoResp.status}: ${await expoResp.text()}`,
    );
    return jsonResponse(
      { error: 'Expo Push API error', statusCode: 502 },
      502,
    );
  }

  const expoBody = await expoResp.json();
  const tickets: ExpoTicket[] = expoBody?.data ?? [];

  let sent = 0;
  let failed = 0;
  const staleTokenUserIds: string[] = [];

  tickets.forEach((ticket, i) => {
    if (ticket.status === 'ok') {
      sent += 1;
    } else if (ticket.status === 'error') {
      failed += 1;
      if (ticket.details?.error === 'DeviceNotRegistered') {
        const userId = validTokens[i]?.id;
        if (userId) staleTokenUserIds.push(userId);
      }
    }
  });

  // Clear stale tokens
  if (staleTokenUserIds.length > 0) {
    const { error: clearError } = await supabase
      .from('profiles')
      .update({ expo_push_token: null })
      .in('id', staleTokenUserIds);

    if (clearError) {
      console.error(
        '[send-push] Failed to clear stale tokens for user IDs:',
        staleTokenUserIds,
        clearError,
      );
    } else {
      console.error(
        '[send-push] Cleared stale tokens for user IDs:',
        staleTokenUserIds,
      );
    }
  }

  return jsonResponse(
    { data: { sent, failed }, message: 'Notifications sent' },
    200,
  );
});
