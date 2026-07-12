// One-time migration: the `photos` bucket is now private, so the public URLs
// stored in students.photo_url / profiles.photo_url no longer resolve. This
// re-signs each existing photo and updates the row. Run once with the service
// key (from repo root):
//   SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/resign-photos.mjs
import { createClient } from '@supabase/supabase-js';

const URL =
  process.env.SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  'https://nmgvnoudmxrzqthnfxkk.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const TTL = 60 * 60 * 24 * 365 * 10; // ~10 years
const sb = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } });

// Path within the bucket is whatever follows "/photos/" in the old public URL.
function pathFromUrl(u) {
  if (!u) return null;
  const m = u.match(/\/photos\/(.+?)(\?|$)/);
  return m ? m[1] : null;
}

async function resign(table) {
  const { data, error } = await sb.from(table).select('id, photo_url').not('photo_url', 'is', null);
  if (error) throw error;
  let done = 0;
  for (const row of data ?? []) {
    const path = pathFromUrl(row.photo_url);
    if (!path) continue;
    const { data: signed, error: signErr } = await sb.storage
      .from('photos')
      .createSignedUrl(path, TTL);
    if (signErr || !signed?.signedUrl) {
      console.warn(`  skip ${table}/${row.id}: ${signErr?.message ?? 'no url'}`);
      continue;
    }
    const { error: upErr } = await sb.from(table).update({ photo_url: signed.signedUrl }).eq('id', row.id);
    if (upErr) console.warn(`  update failed ${table}/${row.id}: ${upErr.message}`);
    else done += 1;
  }
  console.log(`${table}: re-signed ${done} photo(s)`);
}

await resign('students');
await resign('profiles');
console.log('Done.');
process.exit(0);
