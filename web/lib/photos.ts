import type { SupabaseClient } from '@supabase/supabase-js';

// The `photos` bucket is private (children's photos), so we store a signed URL
// rather than a public one. Long-lived because the URL is persisted on the
// record and rendered directly in <img>/<Image>, which can't send auth headers.
export const PHOTO_SIGNED_URL_TTL = 60 * 60 * 24 * 365 * 10; // ~10 years

export async function createPhotoSignedUrl(
  supabase: SupabaseClient,
  path: string,
): Promise<string | null> {
  const { data } = await supabase.storage
    .from('photos')
    .createSignedUrl(path, PHOTO_SIGNED_URL_TTL);
  return data?.signedUrl ?? null;
}
