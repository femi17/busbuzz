-- BusBuzz Ejigbo Simulation Seed
-- Run in Supabase SQL Editor on your dev project

-- School
INSERT INTO schools (id, name, address, is_active)
VALUES (
  'bbbbbbbb-0000-0000-0000-000000000001',
  'Greenfield Academy',
  'Surulere, Lagos',
  true
)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- Bus (device_id tied to simulation script)
INSERT INTO buses (id, school_id, plate_number, capacity, device_id, status)
VALUES (
  'bbbbbbbb-0000-0000-0000-000000000010',
  'bbbbbbbb-0000-0000-0000-000000000001',
  'LND-SIM-01', 20, 'SIM_DEVICE_EJIGBO', 'ACTIVE'
)
ON CONFLICT (id) DO UPDATE SET device_id = EXCLUDED.device_id;

-- Route
INSERT INTO routes (id, school_id, bus_id, name, type)
VALUES (
  'bbbbbbbb-0000-0000-0000-000000000020',
  'bbbbbbbb-0000-0000-0000-000000000001',
  'bbbbbbbb-0000-0000-0000-000000000010',
  'Route — Surulere to Ejigbo',
  'AFTERNOON'
)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- Stops — real Lagos route to Anna's location
INSERT INTO stops (id, route_id, name, latitude, longitude, sequence, eta_minutes)
VALUES
  ('bbbbbbbb-0000-0000-0000-000000000031', 'bbbbbbbb-0000-0000-0000-000000000020', 'School Gate',           6.4598557, 3.3362686, 1, 0),
  ('bbbbbbbb-0000-0000-0000-000000000032', 'bbbbbbbb-0000-0000-0000-000000000020', 'Mushin Market',         6.4720,    3.3235,    2, 8),
  ('bbbbbbbb-0000-0000-0000-000000000033', 'bbbbbbbb-0000-0000-0000-000000000020', 'Idi-Araba',             6.4865,    3.3105,    3, 16),
  ('bbbbbbbb-0000-0000-0000-000000000034', 'bbbbbbbb-0000-0000-0000-000000000020', 'Isolo Junction',        6.5010,    3.2995,    4, 24),
  ('bbbbbbbb-0000-0000-0000-000000000035', 'bbbbbbbb-0000-0000-0000-000000000020', 'Ejigbo Road',           6.5105,    3.2935,    5, 30),
  ('bbbbbbbb-0000-0000-0000-000000000036', 'bbbbbbbb-0000-0000-0000-000000000020', 'Parent Home — Ejigbo',  6.518898,  3.2882858, 6, 36)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- Student
INSERT INTO students (id, school_id, name, class_name, route_id, stop_id, is_active)
VALUES (
  'bbbbbbbb-0000-0000-0000-000000000040',
  'bbbbbbbb-0000-0000-0000-000000000001',
  'Chidi Okonkwo', 'Year 4',
  'bbbbbbbb-0000-0000-0000-000000000020',
  'bbbbbbbb-0000-0000-0000-000000000036',
  true
)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- AFTER RUNNING THE BLOCK ABOVE:
-- 1. Go to Supabase Dashboard → Authentication → Users
-- 2. Confirm scrpoll07@gmail.com exists (or Add User if not)
-- 3. Also Add User: driver@sim.test / Driver1234!
-- 4. Copy the UUID for scrpoll07@gmail.com → replace PARENT_UUID below
-- 5. Copy the UUID for driver@sim.test   → replace DRIVER_UUID below
-- 6. Run the block below with the real UUIDs

-- INSERT INTO profiles (id, name, role, school_id, phone)
-- VALUES
--   ('PARENT_UUID', 'Anna', 'PARENT', NULL, NULL),
--   ('DRIVER_UUID', 'Sim Driver', 'DRIVER', 'bbbbbbbb-0000-0000-0000-000000000001', NULL)
-- ON CONFLICT (id) DO NOTHING;

-- INSERT INTO student_parents (student_id, parent_id)
-- VALUES ('bbbbbbbb-0000-0000-0000-000000000040', 'PARENT_UUID')
-- ON CONFLICT DO NOTHING;

-- VERIFY:
-- SELECT s.name AS student, sp.name AS stop, p.name AS parent
-- FROM students s
-- JOIN stops sp ON sp.id = s.stop_id
-- JOIN student_parents stp ON stp.student_id = s.id
-- JOIN profiles p ON p.id = stp.parent_id
-- WHERE s.id = 'bbbbbbbb-0000-0000-0000-000000000040';
-- Expected: Chidi Okonkwo | Parent Home — Ejigbo | Anna
