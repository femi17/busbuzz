-- Web Push subscriptions for the parent PWA (parent/). One row per
-- browser/device install — same multi-device model as push_tokens for the
-- native apps. endpoint is globally unique (it identifies the browser's
-- push-service mailbox), so re-subscribing upserts on it.

create table web_push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);

create index idx_web_push_subscriptions_profile
  on web_push_subscriptions (profile_id);

alter table web_push_subscriptions enable row level security;

-- Owners manage their own subscriptions from the PWA; send-push reads and
-- prunes with the service key, which bypasses RLS.
create policy web_push_subscriptions_select_own
on web_push_subscriptions for select
using (profile_id = auth.uid());

create policy web_push_subscriptions_insert_own
on web_push_subscriptions for insert
with check (profile_id = auth.uid());

create policy web_push_subscriptions_update_own
on web_push_subscriptions for update
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

create policy web_push_subscriptions_delete_own
on web_push_subscriptions for delete
using (profile_id = auth.uid());
