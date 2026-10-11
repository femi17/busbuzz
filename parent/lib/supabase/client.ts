import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser-side Supabase client for the parent PWA — a module-level singleton.
 *
 * Every client component used to call createClient() on its own, and in
 * @supabase/ssr each call builds a separate GoTrueClient with its own
 * token-refresh timer. With two mounted at once (e.g. TrackLive + PushToggle),
 * one would rotate the refresh token while the other still held the old one in
 * memory; that stale client's next refresh hit "Invalid Refresh Token: Already
 * Used", which signs the user out and clears the auth cookies — the "session
 * keeps timing out, have to log in again" bug. A single shared instance means
 * one refresh timer and no rotation race.
 */
let client: SupabaseClient | undefined;

export function createClient() {
  if (client) return client;
  client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  return client;
}
