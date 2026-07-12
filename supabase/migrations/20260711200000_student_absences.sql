-- Parent-reported absences ("my child is not going to school today").
--
-- A parent taps "Not going today" in the parent app → report-absence Edge
-- Function writes a row here, notifies the school admins (notification bell +
-- push) and the route's driver. When the driver starts a trip, start-trip
-- auto-marks students with an absence for that date as ABSENT so the driver
-- sees them cancelled and skips the stop.
--
-- Written only by the report-absence Edge Function (service role). Parents can
-- read their own children's rows (so the app shows "marked absent · undo");
-- school admins can read their school's rows.

create table student_absences (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references students(id) on delete cascade,
  absence_date  date not null,
  reported_by   uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (student_id, absence_date)
);

create index idx_student_absences_date on student_absences (absence_date, student_id);

alter table student_absences enable row level security;

create policy student_absences_select_parent
on student_absences for select
using (
  busbuzz_auth_role() = 'PARENT'
  and busbuzz_is_parent_of_student(student_id)
);

create policy student_absences_select_school_admin
on student_absences for select
using (
  busbuzz_auth_role() in ('SCHOOL_ADMIN', 'SUPER_ADMIN')
  and exists (
    select 1 from students s
    where s.id = student_absences.student_id
      and s.school_id = busbuzz_auth_school_id()
  )
);
