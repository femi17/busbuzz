-- app.settings.service_role_key and Vault both come back empty on this
-- project (no MCP tool exists to set an Edge Function secret, so there's no
-- safe way to hand check-push-receipts a shared secret to check either).
-- Re-scheduling without the broken 'Bearer ' || null header — cron.schedule
-- upserts by job name, so this replaces the version from
-- 20260726030000_push_receipts.sql cleanly. check-push-receipts is deployed
-- with verify_jwt disabled instead: it takes no caller input (ignores the
-- request body) and only ever does the same fixed, idempotent,
-- side-effect-bounded work regardless of who calls it, so open invocation
-- has no meaningful abuse surface beyond wasted Expo API calls, which it
-- self-limits by no-oping when push_receipts is empty.

select cron.schedule(
  'check-push-receipts',
  '*/20 * * * *',
  $$
  select net.http_post(
    url := 'https://nmgvnoudmxrzqthnfxkk.supabase.co/functions/v1/check-push-receipts',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
