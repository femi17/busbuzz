-- ============================================================
-- BusBuzz initial schema
-- Enums, tables, foreign keys, and indexes.
-- ============================================================

-- ----- ENUMS -----

create type user_role as enum ('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PARENT', 'DRIVER');
create type bus_status as enum ('ACTIVE', 'MAINTENANCE', 'RETIRED');
create type trip_status as enum ('ACTIVE', 'COMPLETED', 'CANCELLED');
create type route_type as enum ('MORNING', 'AFTERNOON');
create type attendance_status as enum ('BOARDED', 'ABSENT', 'DROPPED_OFF');

-- ----- SCHOOLS -----

create table schools (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  address     text not null,
  logo_url    text,
  is_active   boolean default true,
  created_at  timestamptz default now()
);

-- ----- PROFILES (extends Supabase Auth) -----

create table profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  name            text not null,
  role            user_role not null,
  school_id       uuid references schools(id),
  phone           text,
  expo_push_token text,
  created_at      timestamptz default now()
);

create index idx_profiles_school_id on profiles (school_id);

-- ----- BUSES -----

create table buses (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id),
  plate_number    text not null,
  capacity        int not null,
  device_id       text unique,
  status          bus_status default 'ACTIVE',
  created_at      timestamptz default now()
);

create index idx_buses_school_id on buses (school_id);

-- ----- ROUTES -----

create table routes (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id),
  bus_id      uuid references buses(id),
  name        text not null,
  type        route_type not null,
  created_at  timestamptz default now()
);

create index idx_routes_school_id on routes (school_id);
create index idx_routes_bus_id on routes (bus_id);

-- ----- STOPS -----

create table stops (
  id           uuid primary key default gen_random_uuid(),
  route_id     uuid not null references routes(id) on delete cascade,
  name         text not null,
  latitude     double precision not null,
  longitude    double precision not null,
  sequence     int not null,
  eta_minutes  int,
  created_at   timestamptz default now()
);

create index idx_stops_route_id on stops (route_id);

-- ----- STUDENTS -----

create table students (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools(id),
  name          text not null,
  class_name    text not null,
  photo_url     text,
  medical_notes text,
  route_id      uuid references routes(id),
  stop_id       uuid references stops(id),
  is_active     boolean default true,
  created_at    timestamptz default now()
);

create index idx_students_school_id on students (school_id);
create index idx_students_route_id on students (route_id);
create index idx_students_stop_id on students (stop_id);

-- ----- STUDENT <-> PARENT (many-to-many) -----

create table student_parents (
  student_id  uuid references students(id) on delete cascade,
  parent_id   uuid references profiles(id) on delete cascade,
  primary key (student_id, parent_id)
);

create index idx_student_parents_student_id on student_parents (student_id);
create index idx_student_parents_parent_id on student_parents (parent_id);

-- ----- TRIPS -----

create table trips (
  id           uuid primary key default gen_random_uuid(),
  bus_id       uuid not null references buses(id),
  route_id     uuid not null references routes(id),
  driver_id    uuid references profiles(id),
  status       trip_status default 'ACTIVE',
  started_at   timestamptz default now(),
  ended_at     timestamptz,
  created_at   timestamptz default now()
);

create index idx_trips_bus_id on trips (bus_id);
create index idx_trips_route_id on trips (route_id);
create index idx_trips_driver_id on trips (driver_id);

-- ----- TRIP LOCATIONS (GPS breadcrumbs) -----

create table trip_locations (
  id          bigint generated always as identity primary key,
  trip_id     uuid not null references trips(id) on delete cascade,
  latitude    double precision not null,
  longitude   double precision not null,
  speed       real,
  recorded_at timestamptz not null,
  created_at  timestamptz default now()
);

create index on trip_locations (trip_id, recorded_at desc);

-- ----- ATTENDANCE -----

create table attendance (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references trips(id),
  student_id  uuid not null references students(id),
  status      attendance_status not null,
  marked_by   uuid references profiles(id),
  marked_at   timestamptz default now(),
  unique (trip_id, student_id)
);

create index idx_attendance_trip_id on attendance (trip_id);
create index idx_attendance_student_id on attendance (student_id);
create index idx_attendance_marked_by on attendance (marked_by);
