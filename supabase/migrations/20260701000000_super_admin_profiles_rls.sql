-- Allow SUPER_ADMIN to read all profile rows.
-- Needed so the /dashboard/schools list page can join
-- profiles to show each school's admin name.
create policy profiles_select_super_admin
on profiles for select
using (busbuzz_auth_role() = 'SUPER_ADMIN');
