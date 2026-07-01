-- ============================================================
-- Driver PIN authentication: driver_pins, driver_login_attempts
-- ============================================================

-- Table: driver_pins
create table driver_pins (
  id          uuid primary key default gen_random_uuid(),
  driver_id   uuid not null unique references profiles(id) on delete cascade,
  pin_hash    text not null,
  created_at  timestamptz default now()
);

create index idx_driver_pins_driver_id on driver_pins (driver_id);

-- Table: driver_login_attempts
create table driver_login_attempts (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null,
  attempted_at timestamptz default now(),
  success     boolean not null default false
);

create index idx_driver_login_attempts_phone_time on driver_login_attempts (phone, attempted_at desc);

-- ----- RLS: driver_pins -----
-- RLS enabled, no direct access from client.
-- All reads/writes happen via service-role client in Edge Functions.
alter table driver_pins enable row level security;

-- School admins can read/write driver_pins for drivers in their school.
create policy driver_pins_select_school_admin
on driver_pins for select
using (
  busbuzz_auth_role() = 'SCHOOL_ADMIN'
  and exists (
    select 1 from profiles p
    where p.id = driver_pins.driver_id
      and p.school_id = busbuzz_auth_school_id()
  )
);

create policy driver_pins_insert_school_admin
on driver_pins for insert
with check (
  busbuzz_auth_role() = 'SCHOOL_ADMIN'
  and exists (
    select 1 from profiles p
    where p.id = driver_pins.driver_id
      and p.school_id = busbuzz_auth_school_id()
  )
);

create policy driver_pins_update_school_admin
on driver_pins for update
using (
  busbuzz_auth_role() = 'SCHOOL_ADMIN'
  and exists (
    select 1 from profiles p
    where p.id = driver_pins.driver_id
      and p.school_id = busbuzz_auth_school_id()
  )
);

create policy driver_pins_delete_school_admin
on driver_pins for delete
using (
  busbuzz_auth_role() = 'SCHOOL_ADMIN'
  and exists (
    select 1 from profiles p
    where p.id = driver_pins.driver_id
      and p.school_id = busbuzz_auth_school_id()
  )
);

-- ----- RLS: driver_login_attempts -----
-- RLS enabled, no client access at all.
-- Only service-role client writes/reads.
alter table driver_login_attempts enable row level security;
-- No policies — only service-role client touches this table.
