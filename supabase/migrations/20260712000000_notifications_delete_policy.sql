-- Notifications: users may delete their own rows.
-- (SELECT/UPDATE-own policies already existed; DELETE was missing, blocking
-- the dashboard notification bell/page's per-item and bulk-clear actions.)

create policy notifications_delete_own
on notifications for delete
using (user_id = auth.uid());
