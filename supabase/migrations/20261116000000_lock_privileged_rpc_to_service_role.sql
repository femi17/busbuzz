-- Lock privileged SECURITY DEFINER RPCs to the service role.
--
-- These functions are meant to be called only by the service-role edge
-- functions (which bypass RLS), never directly by clients. They carried the
-- Postgres default PUBLIC execute grant, so they were callable unauthenticated
-- at /rest/v1/rpc/* — e.g. anyone could POST create_route_with_stops with an
-- arbitrary p_school_id and inject routes/stops into any school.
--
-- Revoke from PUBLIC (which anon/authenticated inherit — revoking from those
-- roles alone was ineffective) and grant execute back to service_role so the
-- edge functions keep working. summarize_trips runs via pg_cron and
-- sync_profile_assigned_bus via trigger; both execute as the owner regardless,
-- so revoking client access doesn't affect them.
--
-- Applied to busbuzz-dev 2026-11-16 via Supabase MCP; this file keeps the repo
-- in sync.

revoke execute on function
  public.create_route_with_stops(uuid, uuid, text, public.route_type, jsonb),
  public.summarize_trips(),
  public.sync_profile_assigned_bus()
from public, anon, authenticated;

grant execute on function
  public.create_route_with_stops(uuid, uuid, text, public.route_type, jsonb)
to service_role;
