-- Notifications: in-app history of pushes sent to a user (geofence approach
-- alerts, attendance updates). Written exclusively by the send-push Edge
-- Function via the service-role client; users may only read/mark-read their
-- own rows.

create table notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  title       text not null,
  body        text not null,
  data        jsonb,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index idx_notifications_user_id on notifications (user_id, created_at desc);

alter table notifications enable row level security;

create policy notifications_select_own
on notifications for select
using (user_id = auth.uid());

create policy notifications_update_own
on notifications for update
using (user_id = auth.uid())
with check (user_id = auth.uid());
