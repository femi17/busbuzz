import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client for the parent PWA.
 * Mirrors web/lib/supabase.ts — same anon key, same project.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
