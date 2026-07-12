-- Fix driver <-> bus assignment drift.
-- buses.driver_id (bus -> driver) and profiles.assigned_bus_id (driver -> bus)
-- both represent the same relationship, but were being written independently
-- by two different dashboard pages (Users vs Drivers) with nothing keeping
-- them in sync -- assigning a bus from one page silently didn't show up on
-- the other. buses.driver_id is the source of truth (it already has a unique
-- index preventing two drivers sharing one bus); this trigger mirrors it onto
-- profiles.assigned_bus_id so both pages agree no matter which one wrote it.

-- Backfill: reset assigned_bus_id to match the current buses.driver_id truth.
update profiles set assigned_bus_id = null where assigned_bus_id is not null;

update profiles p
set assigned_bus_id = b.id
from buses b
where b.driver_id = p.id;

create or replace function sync_profile_assigned_bus()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'DELETE' then
    if old.driver_id is not null then
      update profiles set assigned_bus_id = null where id = old.driver_id and assigned_bus_id = old.id;
    end if;
    return old;
  end if;

  if TG_OP = 'UPDATE' and old.driver_id is distinct from new.driver_id and old.driver_id is not null then
    update profiles set assigned_bus_id = null where id = old.driver_id and assigned_bus_id = old.id;
  end if;

  if new.driver_id is not null then
    update profiles set assigned_bus_id = new.id where id = new.driver_id;
  end if;

  return new;
end;
$$;

drop trigger if exists buses_sync_driver_assignment on buses;
create trigger buses_sync_driver_assignment
after insert or update of driver_id or delete on buses
for each row execute function sync_profile_assigned_bus();
