import { createClient } from 'npm:@supabase/supabase-js@2';

// Polls Expo's getReceipts endpoint for tickets send-push accepted earlier.
// A ticket status of 'ok' only means Expo took the message — some real
// failures (bad/expired credentials, and some DeviceNotRegistered cases)
// only surface here, later. Without this, a token that dies at the receipt
// stage is never cleared and keeps being tried forever: that person's
// notifications quietly stop working with nothing anywhere flagging it.
//
// Invoked on a schedule by the check-push-receipts pg_cron job
// (supabase/migrations/20260726030000_push_receipts.sql). Deployed with
// verify_jwt disabled: it takes no caller input (the request body is
// ignored — every run does the same fixed, idempotent work against whatever
// is in push_receipts) and there was no safe way to hand it a shared secret
// to check instead (app.settings.service_role_key and Supabase Vault both
// come back empty on this project, and there's no tool available to set an
// Edge Function secret programmatically). Open invocation's worst case is
// wasted Expo API calls — bounded by MAX_RECEIPTS_PER_RUN, a no-op when
// push_receipts is empty, and (below) a self-throttle via function_run_state
// that rejects re-invocation within MIN_RUN_INTERVAL_SECONDS regardless of
// who or what is calling.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
};

const EXPO_RECEIPTS_URL =
  Deno.env.get('EXPO_RECEIPTS_URL') ?? 'https://exp.host/--/api/v2/push/getReceipts';

// Expo recommends keeping receipt batches well under its limit.
const EXPO_RECEIPT_BATCH_SIZE = 300;
// Bound how much work a single run does.
const MAX_RECEIPTS_PER_RUN = 1000;

type PushReceiptRow = { id: string; ticket_id: string; push_token_id: string | null };
type ExpoReceipt = { status: 'ok' | 'error'; message?: string; details?: { error?: string } };

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

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')!)['default'],
  );

  // Self-throttle. This function has no caller auth (see header comment), so
  // without this a repeated/scripted invocation could burn Expo API quota
  // in a tight loop. The cron job that legitimately triggers this runs on a
  // multi-minute schedule, so a short cooldown doesn't affect it.
  const MIN_RUN_INTERVAL_SECONDS = 20;
  const { data: runState } = await supabase
    .from('function_run_state')
    .select('last_run_at')
    .eq('function_name', 'check-push-receipts')
    .maybeSingle();
  if (
    runState &&
    Date.now() - new Date(runState.last_run_at).getTime() < MIN_RUN_INTERVAL_SECONDS * 1000
  ) {
    return jsonResponse({ data: { checked: 0, staleTokensCleared: 0 }, message: 'Throttled' }, 200);
  }
  await supabase
    .from('function_run_state')
    .upsert({ function_name: 'check-push-receipts', last_run_at: new Date().toISOString() });

  const { data: pending, error: pendingError } = await supabase
    .from('push_receipts')
    .select('id, ticket_id, push_token_id')
    .order('created_at', { ascending: true })
    .limit(MAX_RECEIPTS_PER_RUN);

  if (pendingError) {
    console.error('[check-push-receipts] Failed to load pending receipts:', pendingError);
    return jsonResponse({ data: { checked: 0, staleTokensCleared: 0 }, message: 'Checked' }, 200);
  }

  if (!pending || pending.length === 0) {
    return jsonResponse({ data: { checked: 0, staleTokensCleared: 0 }, message: 'Nothing pending' }, 200);
  }

  const rows = pending as PushReceiptRow[];
  const byTicketId = new Map<string, PushReceiptRow>(rows.map((r) => [r.ticket_id, r]));

  const resolvedReceiptIds: string[] = [];
  const staleTokenIds = new Set<string>();

  for (const batch of chunk(rows, EXPO_RECEIPT_BATCH_SIZE)) {
    let expoResp: Response;
    try {
      expoResp = await fetch(EXPO_RECEIPTS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
        body: JSON.stringify({ ids: batch.map((r) => r.ticket_id) }),
      });
    } catch (err) {
      console.error('[check-push-receipts] Expo receipts request failed:', err);
      continue; // leave this batch's rows for the next run
    }

    if (!expoResp.ok) {
      console.error(`[check-push-receipts] Expo returned ${expoResp.status}: ${await expoResp.text()}`);
      continue;
    }

    const expoBody = await expoResp.json();
    const receipts: Record<string, ExpoReceipt> = expoBody?.data ?? {};

    for (const [ticketId, receipt] of Object.entries(receipts)) {
      const row = byTicketId.get(ticketId);
      if (!row) continue;

      // Expo not having resolved this one yet isn't represented as an entry
      // at all — only ids present in the response are done; leave anything
      // absent for the next run.
      resolvedReceiptIds.push(row.id);

      if (
        receipt.status === 'error' &&
        receipt.details?.error === 'DeviceNotRegistered' &&
        row.push_token_id
      ) {
        staleTokenIds.add(row.push_token_id);
      } else if (receipt.status === 'error') {
        console.error(
          `[check-push-receipts] Delivery failed for ticket ${ticketId}: ${receipt.details?.error ?? receipt.message}`,
        );
      }
    }
  }

  if (staleTokenIds.size > 0) {
    const { error: clearError } = await supabase
      .from('push_tokens')
      .delete()
      .in('id', Array.from(staleTokenIds));
    if (clearError) {
      console.error('[check-push-receipts] Failed to clear stale tokens:', clearError);
    }
  }

  if (resolvedReceiptIds.length > 0) {
    const { error: deleteError } = await supabase
      .from('push_receipts')
      .delete()
      .in('id', resolvedReceiptIds);
    if (deleteError) {
      console.error('[check-push-receipts] Failed to clear resolved receipts:', deleteError);
    }
  }

  return jsonResponse(
    {
      data: { checked: resolvedReceiptIds.length, staleTokensCleared: staleTokenIds.size },
      message: 'Checked',
    },
    200,
  );
});
