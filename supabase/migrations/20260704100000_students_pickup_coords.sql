-- Store geocoded coordinates on the student record so the map page
-- doesn't need to call the Geocoding API on every route load.
alter table students
  add column if not exists pickup_lat  double precision,
  add column if not exists pickup_lng  double precision;
