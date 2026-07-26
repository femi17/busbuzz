-- send-push only ever checked Expo's immediate "ticket" response, which
-- means "Expo accepted the message for delivery" — not that it actually
-- reached the device. Some real failures (bad/expired credentials, and some
-- DeviceNotRegistered cases) only surface later, in Expo's separate
-- getReceipts endpoint. Without polling that, a token that silently dies at
-- the receipt stage is never cleared and keeps being tried forever — that
-- parent's notifications quietly stop working with nothing anywhere
-- flagging it.
--
-- push_receipts holds one row per Expo "ticket" id worth following up on
-- (send-push inserts these); check-push-receipts (scheduled below) polls
-- Expo for their outcome and deletes the underlying push_tokens row on a
-- terminal delivery failure.

create table if not exists public.push_receipts (
  id uuid primary key default gen_random_uuid(),
  ticket_id text not null unique,
  push_token_id uuid references public.push_tokens(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_push_receipts_created_at on public.push_receipts(created_at);

-- No policies: only service-role Edge Functions touch this table.
alter table public.push_receipts enable row level security;

create extension if not exists pg_net;

-- Every 20 minutes — Expo says receipts are typically ready within a few
-- minutes of the ticket, so this comfortably keeps up without hammering
-- their API. current_setting('app.settings.service_role_key') is a
-- Supabase-managed Postgres setting populated automatically per project;
-- the actual key value never appears in this file or anywhere in git.
-- cron.schedule upserts by job name, so re-running this migration is safe.
select cron.schedule(
  'check-push-receipts',
  '*/20 * * * *',
  $$
  select net.http_post(
    url := 'https://nmgvnoudmxrzqthnfxkk.supabase.co/functions/v1/check-push-receipts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- Safety net: a receipt Expo never resolves (lost ticket, API hiccup) would
-- otherwise sit here forever. 3 days is generous relative to the 20-minute
-- poll cadence.
select cron.schedule(
  'purge-old-push-receipts',
  '15 4 * * *',
  $$ delete from public.push_receipts where created_at < now() - interval '3 days' $$
);
