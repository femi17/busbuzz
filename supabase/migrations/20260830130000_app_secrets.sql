-- Service-role-only key/value store for runtime secrets that can't be set
-- as Edge Function env secrets from this workflow (the dashboard/CLI can
-- still be used later; env always wins when both exist). RLS is enabled
-- with NO policies on purpose: anon/authenticated clients get nothing,
-- only the service key (which bypasses RLS) can read or write.

create table app_secrets (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now()
);

alter table app_secrets enable row level security;
