-- Driver-arranged pickup order.
--
-- Drivers know their road: they arrange students once in the order they are
-- picked up along the route (driver app → "Arrange pickup order"). The order
-- persists here — it is NOT re-entered every day. The morning run lists
-- students in this order; the afternoon run uses the reverse (drop-offs mirror
-- pickups). Written only by the set-pickup-order Edge Function (service role);
-- null means "not yet arranged" and sorts last.

alter table students add column pickup_sequence int;
