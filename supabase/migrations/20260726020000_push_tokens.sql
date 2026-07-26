-- Multiple Expo push tokens per profile (one row per device/install),
-- replacing profiles.expo_push_token — a single column that a second
-- device's registration silently overwrote. A parent (or driver) signed
-- into the app on two phones only ever had whichever one registered most
-- recently receiving pushes; the other went quietly dark with no error
-- surfaced anywhere.
--
-- Unique on the token itself, not (profile_id, token): an Expo push token
-- identifies a specific app install on a specific device, not an account —
-- if the same device/token re-registers under a different account (phone
-- handed to a new driver, reinstall under a different login), the new
-- registration should take over delivery to that device, not create a
-- second live row still pointing at the old owner.
--
-- profiles.expo_push_token is left in place (unused going forward) rather
-- than dropped, since nothing else needs to change to stop relying on it.

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  expo_push_token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (expo_push_token)
);

create index if not exists idx_push_tokens_profile_id on public.push_tokens(profile_id);

-- No policies: only service-role Edge Functions read/write this table
-- (update-push-token to register, send-push to deliver, check-push-receipts
-- to prune dead tokens) — same access model profiles.expo_push_token had.
alter table public.push_tokens enable row level security;

-- Carry over whatever's already registered so nobody's existing token is
-- lost in the cutover.
insert into public.push_tokens (profile_id, expo_push_token)
select id, expo_push_token
from public.profiles
where expo_push_token is not null and expo_push_token <> ''
on conflict (expo_push_token) do nothing;
