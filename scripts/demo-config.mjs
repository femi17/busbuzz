// Shared definitions for the BusBuzz sales-demo fleet (Ejigbo LCDA, Lagos).
//
// One fictional school, 5 buses on 5 routes converging on the school, each with
// a driver and a handful of students. Everything is keyed off deterministic,
// stable UUIDs under the fixed DEMO school id, so demo-seed.mjs can be re-run
// without duplicating rows and demo-teardown.mjs can remove it all cleanly.
//
// Used by: demo-seed.mjs (creates the data), demo-simulate.mjs (moves the
// buses through the real edge-function pipeline), demo-teardown.mjs (removes it).
//
// Coordinates are approximate real points around Ejigbo — accuracy doesn't
// matter for the demo; the simulated path passes through each stop so the
// geofence (arrival/approach pushes) fires naturally.

// ── Deterministic UUID helper ───────────────────────────────────────────────
// uid('001', 2)      -> deded001-0000-0000-0000-000002000000
// uid('003', 4, 3)   -> deded003-0000-0000-0000-000004000003
// First group = 'deded' (5) + 3-hex tag = 8 chars; last group = a|b each
// zero-padded to 6 => 12 hex chars. All digits, so always a valid UUID.
function uid(tag, a = 0, b = 0) {
  const tail = String(a).padStart(6, '0') + String(b).padStart(6, '0');
  return `deded${tag}-0000-0000-0000-${tail}`;
}

export const SCHOOL = {
  id: 'deded000-0000-0000-0000-000000000001',
  name: 'Crestwood Montessori & Nursery School',
  address: '15 Ejigbo Road, Ejigbo, Lagos',
  latitude: 6.5490,
  longitude: 3.3020,
};

export const ADMIN = {
  email: 'demo-admin@busbuzz.ng',
  password: 'DemoBusBuzz2026!',
  name: 'Demo Admin',
};

// The school gate — every route's final stop. Students get picked up along the
// way and the bus finishes here.
const GATE = { name: 'Crestwood School Gate', latitude: 6.5490, longitude: 3.3020 };

// Each route: a driver, a bus, and an ordered list of stops ending at the gate,
// plus the students riding it. stop `s` and student indices are 1-based.
// The FIRST route carries the designated "owner's child" (see OWNER_CHILD).
export const ROUTES = [
  {
    index: 1,
    name: 'Ikotun Corridor',
    bus: { plate: 'CRW-01', deviceId: 'demo-device-1', capacity: 30 },
    driver: { name: 'Sunday Okafor', phone: '+2348100000001', email: 'demo-driver-1@busbuzz.local' },
    stops: [
      { name: 'Ikotun Roundabout', latitude: 6.5485, longitude: 3.2660 },
      { name: 'Isheri-Osun Road', latitude: 6.5500, longitude: 3.2780 },
      { name: 'Ejigbo Pipeline', latitude: 6.5505, longitude: 3.2900 },
      GATE,
    ],
    students: [
      { name: 'Tomiwa Adeyemi', className: 'Grade 3', stop: 2 }, // OWNER'S CHILD
      { name: 'Zainab Bello', className: 'Grade 1', stop: 1 },
      { name: 'Chidi Okonkwo', className: 'Grade 4', stop: 3 },
    ],
  },
  {
    index: 2,
    name: 'Isolo / Jakande Estate',
    bus: { plate: 'CRW-02', deviceId: 'demo-device-2', capacity: 30 },
    driver: { name: 'Bola Ajayi', phone: '+2348100000002', email: 'demo-driver-2@busbuzz.local' },
    stops: [
      { name: 'Jakande Estate, Isolo', latitude: 6.5340, longitude: 3.3230 },
      { name: 'Osolo Way', latitude: 6.5390, longitude: 3.3150 },
      { name: 'Ejigbo Market', latitude: 6.5450, longitude: 3.3080 },
      GATE,
    ],
    students: [
      { name: 'Fatima Sule', className: 'Grade 2', stop: 1 },
      { name: 'Emeka Nwosu', className: 'Grade 5', stop: 2 },
      { name: 'Aisha Lawal', className: 'Grade 1', stop: 3 },
    ],
  },
  {
    index: 3,
    name: 'Idimu Road',
    bus: { plate: 'CRW-03', deviceId: 'demo-device-3', capacity: 30 },
    driver: { name: 'Ibrahim Yusuf', phone: '+2348100000003', email: 'demo-driver-3@busbuzz.local' },
    stops: [
      { name: 'Idimu Roundabout', latitude: 6.5660, longitude: 3.2790 },
      { name: 'Council Bus Stop, Idimu', latitude: 6.5600, longitude: 3.2860 },
      { name: 'Ejigbo Town Hall', latitude: 6.5540, longitude: 3.2950 },
      GATE,
    ],
    students: [
      { name: 'Grace Eze', className: 'Grade 3', stop: 1 },
      { name: 'Yusuf Abdullahi', className: 'Grade 2', stop: 2 },
      { name: 'Ngozi Obi', className: 'Grade 4', stop: 3 },
    ],
  },
  {
    index: 4,
    name: 'Egbe – Powerline',
    bus: { plate: 'CRW-04', deviceId: 'demo-device-4', capacity: 30 },
    driver: { name: 'Tunde Balogun', phone: '+2348100000004', email: 'demo-driver-4@busbuzz.local' },
    stops: [
      { name: 'Egbe Station', latitude: 6.5420, longitude: 3.2900 },
      { name: 'Powerline, Ejigbo', latitude: 6.5450, longitude: 3.2960 },
      { name: 'NNPC, Ejigbo', latitude: 6.5480, longitude: 3.3000 },
      GATE,
    ],
    students: [
      { name: 'David Okoro', className: 'Grade 1', stop: 1 },
      { name: 'Halima Garba', className: 'Grade 5', stop: 2 },
      { name: 'Samuel Adeniyi', className: 'Grade 3', stop: 3 },
    ],
  },
  {
    index: 5,
    name: 'Iyana-Ejigbo / Pipeline',
    bus: { plate: 'CRW-05', deviceId: 'demo-device-5', capacity: 30 },
    driver: { name: 'Peter Eze', phone: '+2348100000005', email: 'demo-driver-5@busbuzz.local' },
    stops: [
      { name: 'Iyana-Ejigbo Bus Stop', latitude: 6.5560, longitude: 3.3120 },
      { name: 'Egbe-Isolo Road', latitude: 6.5535, longitude: 3.3085 },
      { name: 'Ejigbo Bus Stop', latitude: 6.5510, longitude: 3.3050 },
      GATE,
    ],
    students: [
      { name: 'Blessing Nnaji', className: 'Grade 2', stop: 1 },
      { name: 'Musa Ahmed', className: 'Grade 4', stop: 2 },
      { name: 'Temi Adewale', className: 'Grade 1', stop: 3 },
    ],
  },
];

// The student the owner links their email to during the demo: route 1, student 1.
export const OWNER_CHILD = { routeIndex: 1, studentIndex: 1 };

// ── Stable id accessors (all derived, no random) ─────────────────────────────
export const routeId = (routeIndex) => uid('001', routeIndex);
export const busId = (routeIndex) => uid('002', routeIndex);
export const stopId = (routeIndex, stopSeq) => uid('003', routeIndex, stopSeq);
export const studentId = (routeIndex, studentIndex) => uid('004', routeIndex, studentIndex);

// ── Env / client bootstrap shared by all three scripts ───────────────────────
// Reads values straight from the repo-root .env.local (and .env) rather than
// relying on `node --env-file`. That file has a duplicate, EMPTY
// `SUPABASE_SERVICE_ROLE_KEY=` line that --env-file would honour (last wins),
// so we parse it ourselves and keep the FIRST non-empty value per key. Anything
// already set in the real process environment still takes precedence.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

function parseEnvFile(path, into) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return; // file absent — fine
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // First non-empty value wins; never clobber the real process env.
    if (value && into[key] === undefined && !process.env[key]) {
      into[key] = value;
    }
  }
}

export function env() {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  const fromFiles = {};
  parseEnvFile(join(repoRoot, '.env.local'), fromFiles);
  parseEnvFile(join(repoRoot, '.env'), fromFiles);
  const get = (k) => process.env[k] || fromFiles[k];

  const url = get('NEXT_PUBLIC_SUPABASE_URL') || get('SUPABASE_URL');
  const serviceKey = get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = get('NEXT_PUBLIC_SUPABASE_ANON_KEY') || get('SUPABASE_ANON_KEY');

  const missing = [];
  if (!url) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!serviceKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!anonKey) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (missing.length) {
    console.error(
      `Missing env var(s): ${missing.join(', ')}\n` +
        `Expected them in the repo-root .env.local`,
    );
    process.exit(1);
  }
  return { url, serviceKey, anonKey };
}
