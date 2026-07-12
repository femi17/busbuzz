-- Real "breakdown" signal for the parent app: sos-alert already fires a
-- one-shot notification to school/super admins when a driver hits SOS, but
-- there was nothing durable a parent could read to show "breakdown" status
-- on the Track screen. This column is the durable flag; sos-alert sets it
-- true on the active trip, and the next trip naturally starts back at
-- false. No separate "all clear" endpoint exists yet — resolving mid-trip
-- would need one, out of scope for now.
alter table trips add column if not exists has_sos boolean not null default false;
