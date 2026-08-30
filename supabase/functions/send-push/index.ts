import { createClient } from 'npm:@supabase/supabase-js@2';
import * as webpush from 'jsr:@negrel/webpush@0.5.0';

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

// Constant-time string compare for the internal secret check below — a
// plain !== leaks timing information proportional to how many leading
// characters match, which in theory helps an attacker brute-force the
// secret character by character. Impractical to exploit over a real
// network, but free to close.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// Expo accepts at most 100 messages per request.
const EXPO_BATCH_SIZE = 100;

type PushTokenRow = { id: string; profile_id: string; expo_push_token: string };
type WebPushSubRow = {
  id: string;
  profile_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};
type ExpoTicket = {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
};

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

// ── Web Push (parent PWA) ──────────────────────────────────────────────
// Browsers subscribed via the PWA get the same notification through the
// Web Push protocol (VAPID + aes128gcm). Runs alongside Expo delivery —
// a parent may have both the PWA and a native install; each device row
// gets its own delivery. Skipped entirely when the VAPID_KEYS secret is
// missing so Expo delivery never depends on the PWA setup.
async function sendWebPush(
  supabase: ReturnType<typeof createClient>,
  validated: SendPushBody,
): Promise<{ sent: number; failed: number }> {
  const vapidKeysJson = Deno.env.get('VAPID_KEYS');
  if (!vapidKeysJson) return { sent: 0, failed: 0 };

  const { data: subRows, error: subError } = await supabase
    .from('web_push_subscriptions')
    .select('id, profile_id, endpoint, p256dh, auth')
    .in('profile_id', validated.userIds);

  if (subError) {
    console.error('[send-push] Failed to load web push subscriptions:', subError);
    return { sent: 0, failed: 0 };
  }
  const subs = (subRows ?? []) as WebPushSubRow[];
  if (subs.length === 0) return { sent: 0, failed: 0 };

  const vapidKeys = await webpush.importVapidKeys(JSON.parse(vapidKeysJson), {
    extractable: false,
  });
  const appServer = await webpush.ApplicationServer.new({
    contactInformation: Deno.env.get('WEB_PUSH_CONTACT') ?? 'mailto:hello@busbuzz.com.ng',
    vapidKeys,
  });

  // The PWA's sw.js reads { title, body, tag, url, data }. SOS/arrival
  // alerts land on the Track screen; everything else opens Alerts.
  const dataType = (validated.data?.type as string | undefined) ?? '';
  const payload = JSON.stringify({
    title: validated.title,
    body: validated.body,
    tag: dataType || validated.channelId || 'trip-updates',
    url: dataType === 'sos' || dataType === 'trip-started' ? '/' : '/alerts',
    data: validated.data ?? {},
  });
  const urgency =
    validated.channelId === 'arrival-alarm' ? webpush.Urgency.High : webpush.Urgency.Normal;

  let sent = 0;
  let failed = 0;
  const goneIds: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        const subscriber = appServer.subscribe({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        });
        await subscriber.pushTextMessage(payload, { urgency });
        sent += 1;
      } catch (err) {
        failed += 1;
        // 404/410 mean the browser dropped the subscription — prune it so
        // we stop paying for dead sends (mirrors Expo's DeviceNotRegistered).
        if (
          err instanceof webpush.PushMessageError &&
          (err.isGone() || err.response.status === 404)
        ) {
          goneIds.push(sub.id);
        } else {
          console.error(`[send-push] web push to ${sub.id} failed:`, err);
        }
      }
    }),
  );

  if (goneIds.length > 0) {
    const { error: pruneError } = await supabase
      .from('web_push_subscriptions')
      .delete()
      .in('id', goneIds);
    if (pruneError) {
      console.error('[send-push] Failed to prune dead web subscriptions:', pruneError);
    }
  }

  return { sent, failed };
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
  if (!internalSecretHeader || !internalSecretEnv || !timingSafeEqual(internalSecretHeader, internalSecretEnv)) {
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
    JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')!)['default'],
  );

  // Persist in-app notification history (best-effort) — one row per
  // recipient regardless of whether they have a working push token, so it's
  // still visible next time they open the Notifications screen.
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

  // Web Push (PWA browsers) runs concurrently with Expo delivery below —
  // and must complete even when a recipient has no native tokens at all,
  // which is the norm now that parents use the PWA.
  const webPushPromise = sendWebPush(supabase, validated).catch((err) => {
    console.error('[send-push] web push delivery crashed:', err);
    return { sent: 0, failed: 0 };
  });

  // push_tokens holds one row per device/install (a profile can have
  // several), replacing the old single profiles.expo_push_token column that
  // let a second device silently steal delivery from the first.
  const { data: tokenRows, error: tokenRowsError } = await supabase
    .from('push_tokens')
    .select('id, profile_id, expo_push_token')
    .in('profile_id', validated.userIds);

  if (tokenRowsError) {
    console.error('[send-push] Failed to load push tokens:', tokenRowsError);
    const web = await webPushPromise;
    return jsonResponse(
      { data: { sent: web.sent, failed: web.failed, web }, message: 'Notifications sent' },
      200,
    );
  }

  const validTokens: PushTokenRow[] = ((tokenRows ?? []) as PushTokenRow[]).filter(
    (t) => !!t.expo_push_token && t.expo_push_token.trim() !== '',
  );

  if (validTokens.length === 0) {
    const web = await webPushPromise;
    return jsonResponse(
      { data: { sent: web.sent, failed: web.failed, web }, message: 'Notifications sent' },
      200,
    );
  }

  let sent = 0;
  let failed = 0;
  const staleTokenRowIds: string[] = [];
  // Tickets Expo accepted — their eventual delivery outcome is only knowable
  // by polling Expo's separate receipts endpoint later (check-push-receipts,
  // on a schedule). A ticket of 'ok' here just means Expo took the message,
  // not that it reached the device.
  const receiptRows: Array<{ ticket_id: string; push_token_id: string }> = [];

  const channelId = validated.channelId ?? 'trip-updates';

  // Send in batches of 100 (Expo's per-request limit).
  for (const batch of chunk(validTokens, EXPO_BATCH_SIZE)) {
    const messages = batch.map((entry) => ({
      to: entry.expo_push_token,
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
        if (ticket.id) {
          receiptRows.push({ ticket_id: ticket.id, push_token_id: batch[i].id });
        }
      } else if (ticket.status === 'error') {
        failed += 1;
        if (ticket.details?.error === 'DeviceNotRegistered') {
          staleTokenRowIds.push(batch[i].id);
        }
      }
    });
  }

  if (staleTokenRowIds.length > 0) {
    const { error: clearError } = await supabase
      .from('push_tokens')
      .delete()
      .in('id', staleTokenRowIds);
    if (clearError) {
      console.error('[send-push] Failed to clear stale tokens:', staleTokenRowIds, clearError);
    }
  }

  if (receiptRows.length > 0) {
    const { error: receiptError } = await supabase.from('push_receipts').insert(receiptRows);
    if (receiptError) {
      console.error('[send-push] Failed to record receipt tickets:', receiptError);
    }
  }

  const web = await webPushPromise;
  return jsonResponse(
    { data: { sent: sent + web.sent, failed: failed + web.failed, web }, message: 'Notifications sent' },
    200,
  );
});
