-- Captures everything that was created directly on busbuzz-dev (via MCP /
-- dashboard) without a migration file, discovered while bootstrapping
-- busbuzz-prod: two tables edge functions depend on, two columns, two
-- column drops, the private photos bucket + policies, and the Realtime
-- Authorization policy for the private bus:{busId} channels. Idempotent so
-- it no-ops on dev.

alter table profiles add column if not exists photo_url text;
alter table trips add column if not exists sos_notified_at timestamptz;
alter table profiles drop column if exists expo_push_token;
alter table stops drop column if exists trip_type;

-- Per-function scheduling state (used by scheduled edge functions).
create table if not exists function_run_state (
  function_name text primary key,
  last_run_at   timestamptz not null default now()
);
alter table function_run_state enable row level security;

-- APPROACH-stage geofence notifications (~5 min away), one per stop per
-- trip; the ARRIVE stage lives in trip_stop_triggers. Service-role only.
create table if not exists trip_stop_approaches (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references trips(id) on delete cascade,
  stop_id     uuid not null references stops(id) on delete cascade,
  notified_at timestamptz not null default now(),
  unique (trip_id, stop_id)
);
alter table trip_stop_approaches enable row level security;

-- Private photos bucket (student/driver photos; long-lived signed URLs).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='storage' and policyname='photos_insert_authenticated') then
    create policy photos_insert_authenticated on storage.objects for insert
      with check (bucket_id = 'photos' and auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and policyname='photos_select_authenticated') then
    create policy photos_select_authenticated on storage.objects for select
      using (bucket_id = 'photos' and auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and policyname='photos_update_authenticated') then
    create policy photos_update_authenticated on storage.objects for update
      using (bucket_id = 'photos' and auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and policyname='photos_delete_authenticated') then
    create policy photos_delete_authenticated on storage.objects for delete
      using (bucket_id = 'photos' and auth.role() = 'authenticated');
  end if;
end $$;

-- Realtime Authorization for the private bus:{busId} channels: a bus's
-- parents, its driver, and the school's admins may receive broadcasts.
create or replace function public.busbuzz_topic_bus_id(topic text)
returns uuid
language plpgsql
immutable
set search_path to 'public'
as $function$
declare m text;
begin
  m := substring(topic from '^bus:(.+)$');
  if m is null then return null; end if;
  begin
    return m::uuid;
  exception when others then
    return null;
  end;
end;
$function$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='realtime' and policyname='busbuzz_bus_channel_receive') then
    create policy busbuzz_bus_channel_receive on realtime.messages
      for select to authenticated
      using (
        busbuzz_topic_bus_id(realtime.topic()) is not null
        and (
          busbuzz_is_parent_of_bus(busbuzz_topic_bus_id(realtime.topic()))
          or busbuzz_driver_owns_bus(busbuzz_topic_bus_id(realtime.topic()))
          or exists (
            select 1 from buses b
            where b.id = busbuzz_topic_bus_id(realtime.topic())
              and busbuzz_auth_role() = 'SCHOOL_ADMIN'
              and b.school_id = busbuzz_auth_school_id()
          )
        )
      );
  end if;
end $$;
