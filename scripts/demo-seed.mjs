// Seed the BusBuzz sales-demo fleet (Ejigbo LCDA).
//
//   node --env-file=.env.local scripts/demo-seed.mjs
//
// Idempotent: everything is upserted by stable id (see demo-config.mjs), so
// re-running rebuilds the same fleet without duplicates and without wiping any
// parent links created live during a demo. Creates a fictional school, one
// admin login, 5 drivers, 5 buses, 5 routes with 4 stops each, and students.
//
// Nothing here is BusBuzz-app code — it only writes rows with the service-role
// key, the same way scripts/qa-setup-test-identities.mjs does.

import { createClient } from '@supabase/supabase-js';
import {
  SCHOOL,
  ADMIN,
  ROUTES,
  OWNER_CHILD,
  routeId,
  busId,
  stopId,
  studentId,
  env,
} from './demo-config.mjs';

const { url, serviceKey } = env();
const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function die(label, error) {
  if (error) {
    console.error(`\n✗ ${label}:`, error.message ?? error);
    process.exit(1);
  }
}

// Find an auth user by email (paging listUsers), create if absent, and make
// sure its password / metadata are current. Mirrors ensureUser in the qa
// script but pages so it works regardless of how many users exist.
async function ensureUser(email, password, name) {
  const perPage = 1000;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    die(`listUsers (${email})`, error);
    const found = data.users.find((u) => u.email === email);
    if (found) {
      await admin.auth.admin.updateUserById(found.id, {
        password,
        email_confirm: true,
        user_metadata: { name },
      });
      return found.id;
    }
    if (data.users.length < perPage) break; // last page reached
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });
  die(`createUser (${email})`, error);
  return data.user.id;
}

async function upsertProfile(row) {
  const { error } = await admin.from('profiles').upsert(row, { onConflict: 'id' });
  die(`profiles upsert (${row.name})`, error);
}

async function main() {
  console.log(`Seeding demo fleet → ${SCHOOL.name} (Ejigbo)\n`);

  // 1. School
  die(
    'schools upsert',
    (
      await admin.from('schools').upsert(
        {
          id: SCHOOL.id,
          name: SCHOOL.name,
          address: SCHOOL.address,
          latitude: SCHOOL.latitude,
          longitude: SCHOOL.longitude,
          is_active: true,
        },
        { onConflict: 'id' },
      )
    ).error,
  );
  console.log('✓ School');

  // 2. Admin (the account you log into the web dashboard with)
  const adminId = await ensureUser(ADMIN.email, ADMIN.password, ADMIN.name);
  await upsertProfile({
    id: adminId,
    name: ADMIN.name,
    role: 'SCHOOL_ADMIN',
    school_id: SCHOOL.id,
    email: ADMIN.email,
    onboarding_completed: true,
    is_active: true,
  });
  console.log('✓ Admin');

  // 3. Per route: driver, bus, route, stops, students
  for (const route of ROUTES) {
    const r = route.index;

    // Driver
    const driverId = await ensureUser(
      route.driver.email,
      ADMIN.password, // shared password; drivers normally use a PIN, unused here
      route.driver.name,
    );
    await upsertProfile({
      id: driverId,
      name: route.driver.name,
      role: 'DRIVER',
      school_id: SCHOOL.id,
      phone: route.driver.phone,
      email: route.driver.email,
      onboarding_completed: true,
      is_active: true,
    });

    // Bus
    die(
      `buses upsert (${route.bus.plate})`,
      (
        await admin.from('buses').upsert(
          {
            id: busId(r),
            school_id: SCHOOL.id,
            plate_number: route.bus.plate,
            capacity: route.bus.capacity,
            device_id: route.bus.deviceId,
            status: 'ACTIVE',
            driver_id: driverId,
          },
          { onConflict: 'id' },
        )
      ).error,
    );

    // Route (type BOTH so it runs morning + afternoon)
    die(
      `routes upsert (${route.name})`,
      (
        await admin.from('routes').upsert(
          {
            id: routeId(r),
            school_id: SCHOOL.id,
            bus_id: busId(r),
            name: route.name,
            type: 'BOTH',
          },
          { onConflict: 'id' },
        )
      ).error,
    );

    // Stops (sequence 1..N)
    const stopRows = route.stops.map((s, i) => ({
      id: stopId(r, i + 1),
      route_id: routeId(r),
      name: s.name,
      latitude: s.latitude,
      longitude: s.longitude,
      sequence: i + 1,
      eta_minutes: (route.stops.length - (i + 1)) * 5,
    }));
    die(
      `stops upsert (${route.name})`,
      (await admin.from('stops').upsert(stopRows, { onConflict: 'id' })).error,
    );

    // Students — each tied to a stop so that stop's geofence has a parent to
    // notify. stop index is 1-based into route.stops.
    const studentRows = route.students.map((st, i) => {
      const stopDef = route.stops[st.stop - 1];
      return {
        id: studentId(r, i + 1),
        school_id: SCHOOL.id,
        name: st.name,
        class_name: st.className,
        route_id: routeId(r),
        stop_id: stopId(r, st.stop),
        trip_type: 'BOTH',
        pickup_address: stopDef.name,
        pickup_lat: stopDef.latitude,
        pickup_lng: stopDef.longitude,
        pickup_sequence: st.stop,
        is_active: true,
      };
    });
    die(
      `students upsert (${route.name})`,
      (await admin.from('students').upsert(studentRows, { onConflict: 'id' })).error,
    );

    console.log(
      `✓ Route ${r}: ${route.name}  (bus ${route.bus.plate}, ` +
        `${route.stops.length} stops, ${route.students.length} students)`,
    );
  }

  // Designated owner's child
  const ownerRoute = ROUTES[OWNER_CHILD.routeIndex - 1];
  const ownerStudent = ownerRoute.students[OWNER_CHILD.studentIndex - 1];

  console.log('\n─────────────────────────────────────────────');
  console.log('DEMO READY\n');
  console.log('Web dashboard admin login:');
  console.log(`   email:    ${ADMIN.email}`);
  console.log(`   password: ${ADMIN.password}`);
  console.log('\nDuring the demo, link the owner as a parent to THIS student:');
  console.log(`   "${ownerStudent.name}" (${ownerStudent.className}) — ${ownerRoute.name}`);
  console.log('   Students → open that student → Add Parent → owner\'s email');
  console.log('\nThen start the buses moving:');
  console.log('   node --env-file=.env.local scripts/demo-simulate.mjs --loop');
  console.log('─────────────────────────────────────────────');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
