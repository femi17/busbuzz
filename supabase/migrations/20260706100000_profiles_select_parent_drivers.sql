-- Parents can read the DRIVER profile (name, photo_url) for whichever bus
-- their child is assigned to, so the Track screen can show "who's driving"
-- instead of just a bus plate number. Mirrors the existing
-- busbuzz_is_parent_of_bus() pattern already used for buses_select_parent.

create policy profiles_select_parent_drivers
on profiles for select
using (
  role = 'DRIVER'
  and exists (
    select 1 from buses b
    where b.driver_id = profiles.id
      and busbuzz_is_parent_of_bus(b.id)
  )
);
