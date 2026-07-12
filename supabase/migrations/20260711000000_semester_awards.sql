-- Most On-Time Student award.
--
-- The compute-ontime-award Edge Function ranks a school's students by boarding
-- readiness (avg seconds between the bus reaching a student's stop and the
-- driver marking them BOARDED) over a date range, persists the result here, and
-- emails the winner to the configured recipient. School admins read their own
-- school's awards to render the leaderboard + winner card on the Reports page.
--
-- Written only by the Edge Function (service-role, bypasses RLS). Admins get a
-- read-only policy scoped to their school.

create table semester_awards (
  id                        uuid primary key default gen_random_uuid(),
  school_id                 uuid not null references schools(id) on delete cascade,
  label                     text not null,
  period_start              date not null,
  period_end                date not null,
  winner_student_id         uuid references students(id) on delete set null,
  winner_name               text,
  winner_avg_board_seconds  real,
  winner_timed_boardings    int not null default 0,
  -- Snapshot of the ranked entries at compute time (names/classes/averages),
  -- so the card renders without re-joining historical attendance.
  leaderboard               jsonb not null default '[]'::jsonb,
  email_sent                boolean not null default false,
  email_to                  text,
  computed_by               uuid references profiles(id) on delete set null,
  computed_at               timestamptz not null default now()
);

create index idx_semester_awards_school_id on semester_awards (school_id, computed_at desc);

alter table semester_awards enable row level security;

create policy semester_awards_select_school_admin
on semester_awards for select
using (
  busbuzz_auth_role() in ('SCHOOL_ADMIN', 'SUPER_ADMIN')
  and school_id = busbuzz_auth_school_id()
);
