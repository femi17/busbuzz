// Remove the BusBuzz demo fleet created by demo-seed.mjs.
//
//   node --env-file=.env.local scripts/demo-teardown.mjs
//
// Scoped strictly to the demo school UUID (see demo-config.mjs): deletes its
// trips/attendance/locations, students (and their parent links), stops, routes,
// buses, and the demo admin + driver accounts — then the school itself.
//
// Parent accounts linked live during a demo are NOT deleted (they may be a real
// person's email); only their link rows go, via the students cascade.

import { createClient } from '@supabase/supabase-js';
import { SCHOOL, ROUTES, routeId, busId, env } from './demo-config.mjs';

const { url, serviceKey } = env();
const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Tolerant delete: a missing optional table (older schema) shouldn't abort the
// teardown, but a real failure on a core table should be surfaced.
async function del(table, column, values, { optional = false } = {}) {
  if (Array.isArray(values) && values.length === 0) return;
  const q = admin.from(table).delete();
  const { error } = Array.isArray(values)
    ? await q.in(column, values)
    : await q.eq(column, values);
  if (error) {
    const msg = `${table}: ${error.message}`;
    if (optional) console.warn(`  (skipped ${msg})`);
    else console.error(`  ✗ ${msg}`);
  } else {
    console.log(`  cleared ${table}`);
  }
}

async function ids(table, select, column, values) {
  if (Array.isArray(values) && values.length === 0) return [];
  const { data } = await admin.from(table).select(select).in(column, values);
  return (data ?? []).map((r) => r.id);
}

async function main() {
  console.log(`Tearing down demo → ${SCHOOL.name}\n`);

  const routeIds = ROUTES.map((r) => routeId(r.index));
  const busIds = ROUTES.map((r) => busId(r.index));

  const tripIds = await ids('trips', 'id', 'bus_id', busIds);
  const { data: studentRows } = await admin
    .from('students')
    .select('id')
    .eq('school_id', SCHOOL.id);
  const studentIds = (studentRows ?? []).map((s) => s.id);

  const { data: demoUsers } = await admin
    .from('profiles')
    .select('id, email')
    .eq('school_id', SCHOOL.id)
    .in('role', ['DRIVER', 'SCHOOL_ADMIN']);
  const demoUserIds = (demoUsers ?? []).map((u) => u.id);

  // Trip children → trips
  await del('attendance', 'trip_id', tripIds, { optional: true });
  await del('trip_stop_triggers', 'trip_id', tripIds, { optional: true });
  await del('trip_stop_approaches', 'trip_id', tripIds, { optional: true });
  await del('trip_locations', 'trip_id', tripIds, { optional: true });
  await del('trip_summaries', 'trip_id', tripIds, { optional: true });
  await del('trips', 'bus_id', busIds);

  // Students (student_parents cascades) → stops → routes → buses
  await del('student_parents', 'student_id', studentIds, { optional: true });
  await del('students', 'school_id', SCHOOL.id);
  await del('stops', 'route_id', routeIds);
  await del('routes', 'school_id', SCHOOL.id);
  await del('buses', 'school_id', SCHOOL.id);

  // Demo accounts: profile-linked rows → profiles → auth users
  await del('push_tokens', 'profile_id', demoUserIds, { optional: true });
  await del('web_push_subscriptions', 'profile_id', demoUserIds, { optional: true });
  await del('driver_pins', 'driver_id', demoUserIds, { optional: true });
  await del('notifications', 'user_id', demoUserIds, { optional: true });
  await del('profiles', 'id', demoUserIds);
  for (const id of demoUserIds) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.warn(`  (auth user ${id}: ${error.message})`);
  }
  if (demoUserIds.length) console.log(`  removed ${demoUserIds.length} demo auth user(s)`);

  // School
  await del('schools', 'id', SCHOOL.id);

  console.log('\n✓ Demo removed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
