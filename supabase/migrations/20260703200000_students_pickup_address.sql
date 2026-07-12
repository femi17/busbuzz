-- Add pickup address to students (used for CSV bulk import and future geocoding)
ALTER TABLE students ADD COLUMN IF NOT EXISTS pickup_address text;
