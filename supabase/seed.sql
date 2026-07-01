-- ============================================================
-- BusBuzz seed data — visual verification of the bus & fleet
-- management feature. Safe to re-run (idempotent via fixed UUIDs
-- and ON CONFLICT DO NOTHING).
-- ============================================================

-- ----- Test school -----

insert into schools (id, name, address, is_active)
values (
  '11111111-1111-1111-1111-111111111111',
  'Greenfield Academy',
  '123 Greenfield Road, Lekki, Lagos',
  true
)
on conflict (id) do nothing;

-- ----- Test school admin (auth.users row triggers profiles insert) -----
-- Email: admin@greenfield.test
-- Password: GreenfieldTest123!

-- NOTE: GoTrue (Supabase Auth) fails password login with a generic
-- "Database error querying schema" 500 if any of the email_change*/
-- phone_change*/reauthentication_token columns are NULL instead of ''
-- (its Go scanner can't read NULL into a non-nullable string field).
-- All of them must be explicitly set to '', not left to default.
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  confirmation_token,
  recovery_token,
  email_change,
  email_change_token_new,
  email_change_token_current,
  phone_change,
  phone_change_token,
  reauthentication_token
)
values (
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-2222-2222-222222222222',
  'authenticated',
  'authenticated',
  'admin@greenfield.test',
  extensions.crypt('GreenfieldTest123!', extensions.gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"name":"Greenfield Admin"}',
  false,
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  ''
)
on conflict (id) do nothing;

-- GoTrue also requires a matching auth.identities row for password login
-- to resolve the user at all — a auth.users row alone is not sufficient.
insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
values (
  gen_random_uuid(),
  '22222222-2222-2222-2222-222222222222',
  '22222222-2222-2222-2222-222222222222',
  '{"sub":"22222222-2222-2222-2222-222222222222","email":"admin@greenfield.test","email_verified":true}',
  'email',
  now(),
  now(),
  now()
)
on conflict do nothing;

-- The on_auth_user_created trigger (20240101000002_auth_trigger.sql) just
-- inserted a profiles row defaulting to role = 'PARENT'. Promote it to the
-- school admin we actually want for this seed.

update profiles
set
  role = 'SCHOOL_ADMIN',
  school_id = '11111111-1111-1111-1111-111111111111',
  name = 'Greenfield Admin'
where id = '22222222-2222-2222-2222-222222222222';

-- ----- Test buses -----

insert into buses (id, school_id, plate_number, capacity, device_id, status)
values
  (
    '33333333-3333-3333-3333-333333333333',
    '11111111-1111-1111-1111-111111111111',
    'LAG-101-GA',
    30,
    null,
    'ACTIVE'
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    '11111111-1111-1111-1111-111111111111',
    'LAG-102-GA',
    25,
    'test-device-002',
    'ACTIVE'
  ),
  (
    '55555555-5555-5555-5555-555555555555',
    '11111111-1111-1111-1111-111111111111',
    'LAG-103-GA',
    18,
    null,
    'MAINTENANCE'
  )
on conflict (id) do nothing;
