-- Add latitude and longitude to schools table.
-- Nullable because existing schools may not have been geocoded yet.
alter table schools
  add column latitude double precision,
  add column longitude double precision;

-- Comment for clarity
comment on column schools.latitude is 'School latitude from Mapbox Geocoding API, populated at onboarding';
comment on column schools.longitude is 'School longitude from Mapbox Geocoding API, populated at onboarding';
