import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const BASE = process.env.WEB_BASE_URL || 'http://localhost:3000';

const projectRef = new URL_(URL).hostname.split('.')[0];
function URL_(u) { return new (globalThis.URL)(u); }
const storageKey = `sb-${projectRef}-auth-token`;

const MAX_CHUNK_SIZE = 3180;
function createChunks(key, value) {
  const encodedValue = encodeURIComponent(value);
  if (encodedValue.length <= MAX_CHUNK_SIZE) {
    return [{ name: key, value }];
  }
  const chunks = [];
  let remaining = encodedValue;
  while (remaining.length > 0) {
    let head = remaining.slice(0, MAX_CHUNK_SIZE);
    const lastEscape = head.lastIndexOf('%');
    if (lastEscape > MAX_CHUNK_SIZE - 3) head = head.slice(0, lastEscape);
    // find valid boundary
    let valueHead = '';
    while (head.length > 0) {
      try { valueHead = decodeURIComponent(head); break; } catch { head = head.slice(0, -1); }
    }
    chunks.push(valueHead);
    remaining = remaining.slice(head.length);
  }
  return chunks.map((v, i) => ({ name: `${key}.${i}`, value: v }));
}

function toBase64Url(str) {
  return Buffer.from(str, 'utf8').toString('base64url');
}

async function getSessionCookieHeader(email, password) {
  const client = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  const encoded = 'base64-' + toBase64Url(JSON.stringify(data.session));
  const chunks = createChunks(storageKey, encoded);
  return chunks.map(c => `${c.name}=${c.value}`).join('; ');
}

async function checkPage(path, cookieHeader, expectStrings, forbidStrings = []) {
  const res = await fetch(`${BASE}${path}`, {
    headers: cookieHeader ? { Cookie: cookieHeader } : {},
    redirect: 'manual',
  });
  const body = res.status < 300 || res.status >= 400 ? await res.text() : '';
  const missing = expectStrings.filter(s => !body.includes(s));
  const present = forbidStrings.filter(s => body.includes(s));
  const pass = res.status === 200 && missing.length === 0 && present.length === 0;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${path} -> status=${res.status} missing=${JSON.stringify(missing)} forbidden-present=${JSON.stringify(present)}`);
  return pass;
}

const cookieHeader = await getSessionCookieHeader('admin@greenfield.test', 'GreenfieldTest123!');
console.log('cookie header length:', cookieHeader.length);

console.log('\n-- MT-01 /dashboard/users renders --');
await checkPage('/dashboard/users', cookieHeader, ['Parents', 'Drivers']);

console.log('\n-- MT-19 /dashboard/reports renders --');
await checkPage('/dashboard/reports', cookieHeader, ['Total Trips']);

console.log('\n-- MT-20/23 /dashboard/settings renders --');
await checkPage('/dashboard/settings', cookieHeader, ['School Name', 'Email']);

console.log('\n-- Unauthenticated redirect check (no cookie) --');
{
  const res = await fetch(`${BASE}/dashboard/settings`, { redirect: 'manual' });
  const pass = res.status === 307 && res.headers.get('location')?.includes('/login');
  console.log(`${pass ? 'PASS' : 'FAIL'} unauthenticated -> status=${res.status} location=${res.headers.get('location')}`);
}
