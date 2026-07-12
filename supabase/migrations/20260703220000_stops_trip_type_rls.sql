-- Add trip_type to stops (ROUND_TRIP = both directions, ONE_WAY = single direction)
ALTER TABLE stops ADD COLUMN IF NOT EXISTS trip_type text DEFAULT 'ROUND_TRIP'
  CHECK (trip_type IN ('ROUND_TRIP', 'ONE_WAY'));

-- Enable RLS on stops (may already be enabled, idempotent)
ALTER TABLE stops ENABLE ROW LEVEL SECURITY;

-- School admins: read stops for their routes
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'stops' AND policyname = 'stops_select_school') THEN
    CREATE POLICY stops_select_school ON stops FOR SELECT USING (
      route_id IN (SELECT id FROM routes WHERE school_id = busbuzz_auth_school_id())
      OR busbuzz_auth_role() = 'SUPER_ADMIN'
    );
  END IF;
END $$;

-- School admins: create stops for their routes
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'stops' AND policyname = 'stops_insert_school_admin') THEN
    CREATE POLICY stops_insert_school_admin ON stops FOR INSERT WITH CHECK (
      route_id IN (SELECT id FROM routes WHERE school_id = busbuzz_auth_school_id())
    );
  END IF;
END $$;

-- School admins: update stops for their routes
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'stops' AND policyname = 'stops_update_school_admin') THEN
    CREATE POLICY stops_update_school_admin ON stops FOR UPDATE USING (
      route_id IN (SELECT id FROM routes WHERE school_id = busbuzz_auth_school_id())
    );
  END IF;
END $$;

-- School admins: delete stops for their routes
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'stops' AND policyname = 'stops_delete_school_admin') THEN
    CREATE POLICY stops_delete_school_admin ON stops FOR DELETE USING (
      route_id IN (SELECT id FROM routes WHERE school_id = busbuzz_auth_school_id())
    );
  END IF;
END $$;

-- Parents can read stops on routes their children use
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'stops' AND policyname = 'stops_select_parent') THEN
    CREATE POLICY stops_select_parent ON stops FOR SELECT USING (
      route_id IN (
        SELECT route_id FROM students
        WHERE id IN (SELECT student_id FROM student_parents WHERE parent_id = auth.uid())
      )
    );
  END IF;
END $$;
