-- Add assigned_bus_id to profiles so drivers have a default bus
-- Used by the driver app to pre-select the bus on trip start,
-- and by the dashboard Drivers page to show bus assignment.

alter table profiles
  add column if not exists assigned_bus_id uuid references buses(id) on delete set null;

create index if not exists idx_profiles_assigned_bus_id on profiles (assigned_bus_id);
