-- ============================================================
-- BusBuzz Row Level Security policies
-- ============================================================

-- ----- Helper functions -----
-- security definer + fixed search_path so these run with elevated
-- privileges and read profiles/student_parents without recursing
-- back through RLS on those tables.

create or replace function busbuzz_auth_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function busbuzz_auth_school_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select school_id from profiles where id = auth.uid();
$$;

-- True if the calling user (a parent) has a child linked to the given student.
create or replace function busbuzz_is_parent_of_student(target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from student_parents sp
    where sp.student_id = target_student_id
      and sp.parent_id = auth.uid()
  );
$$;

-- True if the calling user (a parent) has a child assigned to a route on the given bus.
create or replace function busbuzz_is_parent_of_bus(target_bus_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from student_parents sp
    join students st on st.id = sp.student_id
    join routes r on r.id = st.route_id
    where sp.parent_id = auth.uid()
      and r.bus_id = target_bus_id
  );
$$;

-- True if the calling user (a parent) has a child on a trip's bus.
create or replace function busbuzz_is_parent_of_trip(target_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from trips t
    where t.id = target_trip_id
      and busbuzz_is_parent_of_bus(t.bus_id)
  );
$$;

-- ----- Enable RLS on every table -----

alter table schools enable row level security;
alter table profiles enable row level security;
alter table buses enable row level security;
alter table routes enable row level security;
alter table stops enable row level security;
alter table students enable row level security;
alter table student_parents enable row level security;
alter table trips enable row level security;
alter table trip_locations enable row level security;
alter table attendance enable row level security;

-- ----- PROFILES -----
-- Users can read only their own row.
-- School admins can read all profiles in their school.

create policy profiles_select_own
on profiles for select
using (id = auth.uid());

create policy profiles_select_school_admin
on profiles for select
using (
  busbuzz_auth_role() = 'SCHOOL_ADMIN'
  and school_id = busbuzz_auth_school_id()
);

-- ----- SCHOOLS -----
-- School admins can read and update their own school only.
-- Super admins can do everything.

create policy schools_select_school_admin
on schools for select
using (
  busbuzz_auth_role() = 'SCHOOL_ADMIN'
  and id = busbuzz_auth_school_id()
);

create policy schools_update_school_admin
on schools for update
using (
  busbuzz_auth_role() = 'SCHOOL_ADMIN'
  and id = busbuzz_auth_school_id()
);

create policy schools_select_super_admin
on schools for select
using (busbuzz_auth_role() = 'SUPER_ADMIN');

create policy schools_insert_super_admin
on schools for insert
with check (busbuzz_auth_role() = 'SUPER_ADMIN');

create policy schools_update_super_admin
on schools for update
using (busbuzz_auth_role() = 'SUPER_ADMIN');

create policy schools_delete_super_admin
on schools for delete
using (busbuzz_auth_role() = 'SUPER_ADMIN');

-- ----- BUSES -----
-- School admins can read and write rows where school_id matches theirs.
-- Parents can read buses for buses their children are assigned to.

create policy buses_select_school_admin
on buses for select
using (
  busbuzz_auth_role() = 'SCHOOL_ADMIN'
  and school_id = busbuzz_auth_school_id()
);

create policy buses_insert_school_admin
on buses for insert
with check (
  busbuzz_auth_role() = 'SCHOOL_ADMIN'
  and school_id = busbuzz_auth_school_id()
);

create policy buses_update_school_admin
on buses for update
using (
  busbuzz_auth_role() = 'SCHOOL_ADMIN'
  and school_id = busbuzz_auth_school_id()
);

create policy buses_delete_school_admin
on buses for delete
using (
  busbuzz_auth_role() = 'SCHOOL_ADMIN'
  and school_id = busbuzz_auth_school_id()
);

create policy buses_select_parent
on buses for select
using (
  busbuzz_auth_role() = 'PARENT'
  and busbuzz_is_parent_of_bus(id)
);

-- ----- ROUTES -----
-- School admins can read and write rows where school_id matches theirs.
-- Parents can read routes for buses their children are assigned to.

create policy routes_select_school_admin
on routes for select
using (
  busbuzz_auth_role() = 'SCHOOL_ADMIN'
  and school_id = busbuzz_auth_school_id()
);

create policy routes_insert_school_admin
on routes for insert
with check (
  busbuzz_auth_role() = 'SCHOOL_ADMIN'
  and school_id = busbuzz_auth_school_id()
);

create policy routes_update_school_admin
on routes for update
using (
  busbuzz_auth_role() = 'SCHOOL_ADMIN'
  and school_id = busbuzz_auth_school_id()
);

create policy routes_delete_school_admin
on routes for delete
using (
  busbuzz_auth_role() = 'SCHOOL_ADMIN'
  and school_id = busbuzz_auth_school_id()
);

create policy routes_select_parent
on routes for select
using (
  busbuzz_auth_role() = 'PARENT'
  and bus_id is not null
  and busbuzz_is_parent_of_bus(bus_id)
);

-- ----- STOPS -----
-- School admins can read and write rows where the parent route's school_id matches theirs.
-- (Stops have no school_id column directly — derived via routes.)

create policy stops_select_school_admin
on stops for select
using (
  busbuzz_auth_role() = 'SCHOOL_ADMIN'
  and exists (
    select 1 from routes r
    where r.id = stops.route_id
      and r.school_id = busbuzz_auth_school_id()
  )
);

create policy stops_insert_school_admin
on stops for insert
with check (
  busbuzz_auth_role() = 'SCHOOL_ADMIN'
  and exists (
    select 1 from routes r
    where r.id = stops.route_id
      and r.school_id = busbuzz_auth_school_id()
  )
);

create policy stops_update_school_admin
on stops for update
using (
  busbuzz_auth_role() = 'SCHOOL_ADMIN'
  and exists (
    select 1 from routes r
    where r.id = stops.route_id
      and r.school_id = busbuzz_auth_school_id()
  )
);

create policy stops_delete_school_admin
on stops for delete
using (
  busbuzz_auth_role() = 'SCHOOL_ADMIN'
  and exists (
    select 1 from routes r
    where r.id = stops.route_id
      and r.school_id = busbuzz_auth_school_id()
  )
);

-- ----- STUDENTS -----
-- School admins can read and write students in their school.
-- Parents can only read students linked to them via student_parents.

create policy students_select_school_admin
on students for select
using (
  busbuzz_auth_role() = 'SCHOOL_ADMIN'
  and school_id = busbuzz_auth_school_id()
);

create policy students_insert_school_admin
on students for insert
with check (
  busbuzz_auth_role() = 'SCHOOL_ADMIN'
  and school_id = busbuzz_auth_school_id()
);

create policy students_update_school_admin
on students for update
using (
  busbuzz_auth_role() = 'SCHOOL_ADMIN'
  and school_id = busbuzz_auth_school_id()
);

create policy students_delete_school_admin
on students for delete
using (
  busbuzz_auth_role() = 'SCHOOL_ADMIN'
  and school_id = busbuzz_auth_school_id()
);

create policy students_select_parent
on students for select
using (
  busbuzz_auth_role() = 'PARENT'
  and busbuzz_is_parent_of_student(id)
);

-- ----- STUDENT_PARENTS -----
-- Not explicitly scoped in the request, but RLS must be enabled on every table
-- and the helper functions above rely on reading this table. Grant the minimal
-- direct-read access needed for parents and school admins to see their own links;
-- all writes go through Edge Functions using the service role key.

create policy student_parents_select_parent
on student_parents for select
using (parent_id = auth.uid());

create policy student_parents_select_school_admin
on student_parents for select
using (
  busbuzz_auth_role() = 'SCHOOL_ADMIN'
  and exists (
    select 1 from students st
    where st.id = student_parents.student_id
      and st.school_id = busbuzz_auth_school_id()
  )
);

-- ----- TRIPS -----
-- School admins can read all trips in their school.
-- Parents can read trips for buses their children are assigned to.

create policy trips_select_school_admin
on trips for select
using (
  busbuzz_auth_role() = 'SCHOOL_ADMIN'
  and exists (
    select 1 from routes r
    where r.id = trips.route_id
      and r.school_id = busbuzz_auth_school_id()
  )
);

create policy trips_select_parent
on trips for select
using (
  busbuzz_auth_role() = 'PARENT'
  and busbuzz_is_parent_of_bus(bus_id)
);

-- ----- TRIP_LOCATIONS -----
-- School admins can read all trip locations in their school.
-- Parents can read trip locations for buses their children are assigned to.

create policy trip_locations_select_school_admin
on trip_locations for select
using (
  busbuzz_auth_role() = 'SCHOOL_ADMIN'
  and exists (
    select 1 from trips t
    join routes r on r.id = t.route_id
    where t.id = trip_locations.trip_id
      and r.school_id = busbuzz_auth_school_id()
  )
);

create policy trip_locations_select_parent
on trip_locations for select
using (
  busbuzz_auth_role() = 'PARENT'
  and busbuzz_is_parent_of_trip(trip_id)
);

-- ----- ATTENDANCE -----
-- School admins can read all attendance in their school.
-- Parents can read attendance only for their own children.

create policy attendance_select_school_admin
on attendance for select
using (
  busbuzz_auth_role() = 'SCHOOL_ADMIN'
  and exists (
    select 1 from students st
    where st.id = attendance.student_id
      and st.school_id = busbuzz_auth_school_id()
  )
);

create policy attendance_select_parent
on attendance for select
using (
  busbuzz_auth_role() = 'PARENT'
  and busbuzz_is_parent_of_student(student_id)
);
