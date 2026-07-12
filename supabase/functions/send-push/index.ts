import { createClient } from 'npm:@supabase/supabase-js@2';

// Validation inlined — no cross-directory import, so the deploy bundler only
// needs this file.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, content-type, x-client-info, apikey, x-internal-secret',
};

const EXPO_PUSH_URL =
  Deno.env.get('EXPO_PUSH_URL') ?? 'https://exp.host/--/api/v2/push/send';

// Expo accepts at most 100 messages per request.
const EXPO_BATCH_SIZE = 100;

type ProfileRow = { id: string; expo_push_token: string | null };
type ExpoTicket = { status: 'ok' | 'error'; message?: string; details?: { error?: string } };

type SendPushBody = {
  userIds: string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
  // Android notification channel — controls sound/vibration/heads-up loudness.
  // 'trip-updates' (default) or 'arrival-alarm' (alarm-like, for bus-arrival
  // and SOS). Channels are created by the mobile apps at startup.
  channelId?: string;
};

function validate(input: unknown): SendPushBody | null {
  if (!input || typeof input !== 'object') return null;
  const b = input as Record<string, unknown>;
  if (
    !Array.isArray(b.userIds) ||
    b.userIds.length > 1000 ||
    !b.userIds.every((u) => typeof u === 'string') ||
    typeof b.title !== 'string' ||
    b.title.length < 1 ||
    b.title.length > 200 ||
    typeof b.body !== 'string' ||
    b.body.length < 1 ||
    b.body.length > 1000 ||
    (b.channelId !== undefined &&
      (typeof b.channelId !== 'string' || b.channelId.length > 64))
  ) {
    return null;
  }
  return {
    userIds: b.userIds as string[],
    title: b.title,
    body: b.body,
    data: (b.data as Record<string, unknown> | undefined) ?? undefined,
    channelId: (b.channelId as string | undefined) ?? undefined,
  };
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed', statusCode: 405 }, 405);
  }

  const internalSecretHeader = req.headers.get('X-Internal-Secret');
  const internalSecretEnv = Deno.env.get('INTERNAL_FUNCTION_SECRET');
  if (!internalSecretHeader || !internalSecretEnv || internalSecretHeader !== internalSecretEnv) {
    return jsonResponse({ error: 'Forbidden', statusCode: 403 }, 403);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body', statusCode: 400 }, 400);
  }

  const validated = validate(raw);
  if (!validated) {
    return jsonResponse({ error: 'Validation error', statusCode: 400 }, 400);
  }

  if (validated.userIds.length === 0) {
    return jsonResponse({ data: { sent: 0, failed: 0 }, message: 'Notifications sent' }, 200);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Persist in-app notification history (best-effort).
  try {
    const rows = validated.userIds.map((userId) => ({
      user_id: userId,
      title: validated.title,
      body: validated.body,
      data: validated.data ?? {},
    }));
    const { error } = await supabase.from('notifications').insert(rows);
    if (error) console.error('[send-push] Failed to persist notifications:', error);
  } catch (err) {
    console.error('[send-push] Unexpected error persisting notifications:', err);
  }

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, expo_push_token')
    .in('id', validated.userIds);

  if (profilesError) {
    console.error('[send-push] Failed to load profiles:', profilesError);
    return jsonResponse({ data: { sent: 0, failed: 0 }, message: 'Notifications sent' }, 200);
  }

  const validTokens: Array<{ id: string; token: string }> = ((profiles ?? []) as ProfileRow[])
    .filter((p) => !!p.expo_push_token && p.expo_push_token.trim() !== '')
    .map((p) => ({ id: p.id, token: p.expo_push_token as string }));

  if (validTokens.length === 0) {
    return jsonResponse({ data: { sent: 0, failed: 0 }, message: 'Notifications sent' }, 200);
  }

  let sent = 0;
  let failed = 0;
  const staleTokenUserIds: string[] = [];

  const channelId = validated.channelId ?? 'trip-updates';

  // Send in batches of 100 (Expo's per-request limit).
  for (const batch of chunk(validTokens, EXPO_BATCH_SIZE)) {
    const messages = batch.map((entry) => ({
      to: entry.token,
      title: validated.title,
      body: validated.body,
      data: validated.data ?? {},
      sound: 'default' as const,
      // High priority wakes the device for an immediate heads-up banner;
      // channelId selects the Android loudness (vibration pattern, DND).
      priority: 'high' as const,
      channelId,
      // iOS: arrival/SOS alerts break through Focus modes like an alarm.
      ...(channelId === 'arrival-alarm'
        ? { interruptionLevel: 'time-sensitive' as const }
        : {}),
    }));

    let expoResp: Response;
    try {
      expoResp = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
        body: JSON.stringify(messages),
      });
    } catch (err) {
      console.error('[send-push] Expo API request failed:', err);
      failed += batch.length;
      continue;
    }

    if (!expoResp.ok) {
      console.error(`[send-push] Expo returned ${expoResp.status}: ${await expoResp.text()}`);
      failed += batch.length;
      continue;
    }

    const expoBody = await expoResp.json();
    const tickets: ExpoTicket[] = expoBody?.data ?? [];
    tickets.forEach((ticket, i) => {
      if (ticket.status === 'ok') {
        sent += 1;
      } else if (ticket.status === 'error') {
        failed += 1;
        if (ticket.details?.error === 'DeviceNotRegistered') {
          const userId = batch[i]?.id;
          if (userId) staleTokenUserIds.push(userId);
        }
      }
    });
  }

  if (staleTokenUserIds.length > 0) {
    const { error: clearError } = await supabase
      .from('profiles')
      .update({ expo_push_token: null })
      .in('id', staleTokenUserIds);
    if (clearError) {
      console.error('[send-push] Failed to clear stale tokens:', staleTokenUserIds, clearError);
    }
  }

  return jsonResponse({ data: { sent, failed }, message: 'Notifications sent' }, 200);
});
