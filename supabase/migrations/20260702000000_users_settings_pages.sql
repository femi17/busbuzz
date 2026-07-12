-- Migration: users and settings pages support
-- Adds email + is_active to profiles, driver_id to buses,
-- RLS policies for school admin parent access, and storage bucket for school logos.

-- Change 1: Add email column to profiles
-- Parents table needs email for display on Users page.
ALTER TABLE profiles ADD COLUMN email text;

-- Change 2: Add is_active column to profiles
-- "Revoke access" sets this to false.
ALTER TABLE profiles ADD COLUMN is_active boolean DEFAULT true;

-- Change 3: Backfill email from auth.users for existing rows
UPDATE profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND p.email IS NULL;

-- Change 4: Update auth trigger function to populate email on new signups
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, role, email)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', new.email, ''),
    'PARENT',
    new.email
  );
  RETURN new;
END;
$$;

-- Change 5: Add driver_id column to buses for persistent driver-bus assignment
ALTER TABLE buses ADD COLUMN driver_id uuid REFERENCES profiles(id);
CREATE INDEX idx_buses_driver_id ON buses (driver_id);
CREATE UNIQUE INDEX idx_buses_driver_id_unique ON buses (driver_id) WHERE driver_id IS NOT NULL;

-- Change 6: RLS -- any user can update their own profile row
-- Required for Settings page My Account section.
CREATE POLICY profiles_update_own
ON profiles FOR UPDATE
USING (id = auth.uid());

-- Change 7: RLS -- SCHOOL_ADMIN can update driver/staff profiles in their school
-- Required for future driver profile editing.
CREATE POLICY profiles_update_school_admin
ON profiles FOR UPDATE
USING (
  busbuzz_auth_role() = 'SCHOOL_ADMIN'
  AND school_id = busbuzz_auth_school_id()
);

-- Change 8: RLS -- SCHOOL_ADMIN can SELECT parent profiles via student_parents link
-- Parents have school_id = NULL (set by auth trigger). This policy allows school admin
-- to read parent profiles for parents linked to students in their school.
CREATE POLICY profiles_select_school_admin_parents
ON profiles FOR SELECT
USING (
  busbuzz_auth_role() = 'SCHOOL_ADMIN'
  AND role = 'PARENT'
  AND EXISTS (
    SELECT 1 FROM student_parents sp
    JOIN students s ON s.id = sp.student_id
    WHERE sp.parent_id = profiles.id
      AND s.school_id = busbuzz_auth_school_id()
  )
);

-- Change 9: RLS -- SCHOOL_ADMIN can UPDATE parent profiles via student_parents link
-- Required for "Revoke access" action on Users page.
CREATE POLICY profiles_update_school_admin_parents
ON profiles FOR UPDATE
USING (
  busbuzz_auth_role() = 'SCHOOL_ADMIN'
  AND role = 'PARENT'
  AND EXISTS (
    SELECT 1 FROM student_parents sp
    JOIN students s ON s.id = sp.student_id
    WHERE sp.parent_id = profiles.id
      AND s.school_id = busbuzz_auth_school_id()
  )
);

-- Change 10: Storage bucket for school logos
-- Required for Settings page logo upload.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'school-logos',
  'school-logos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- Change 11: Storage RLS policies for school-logos bucket
-- Scoped to SCHOOL_ADMIN, and to files under their own school's folder
-- (upload path is always `${school.id}/...`) -- otherwise any authenticated
-- user of any role from any school could overwrite or delete another
-- school's logo.
CREATE POLICY school_logos_upload
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'school-logos'
  AND busbuzz_auth_role() = 'SCHOOL_ADMIN'
  AND (storage.foldername(name))[1] = busbuzz_auth_school_id()::text
);

CREATE POLICY school_logos_view
ON storage.objects FOR SELECT
USING (bucket_id = 'school-logos');

CREATE POLICY school_logos_update
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'school-logos'
  AND busbuzz_auth_role() = 'SCHOOL_ADMIN'
  AND (storage.foldername(name))[1] = busbuzz_auth_school_id()::text
);

CREATE POLICY school_logos_delete
ON storage.objects FOR DELETE
USING (
  bucket_id = 'school-logos'
  AND busbuzz_auth_role() = 'SCHOOL_ADMIN'
  AND (storage.foldername(name))[1] = busbuzz_auth_school_id()::text
);
