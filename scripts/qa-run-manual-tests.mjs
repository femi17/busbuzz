import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(URL, SRK, { auth: { autoRefreshToken: false, persistSession: false } });

const results = [];
function record(id, desc, pass, detail) {
  results.push({ id, desc, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id}: ${desc}${detail ? ' -- ' + detail : ''}`);
}

async function signIn(email, password) {
  const client = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return { client, token: data.session.access_token, userId: data.user.id };
}

async function callFn(name, token, body) {
  const res = await fetch(`${URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      apikey: ANON,
    },
    body: JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

const SCHOOL_A = '11111111-1111-1111-1111-111111111111';
const SCHOOL_B = '99999999-aaaa-bbbb-cccc-000000000001';

const adminA = await signIn('admin@greenfield.test', 'GreenfieldTest123!');
const adminB = await signIn('qa-admin-b@busbuzz.test', 'QaAdminB123!');
const parent = await signIn('qa-parent@busbuzz.test', 'QaParent123!');
const driverRole = await signIn('qa-driver-role@busbuzz.test', 'QaDriverRole123!');

// ---------- create-driver ----------
const phone = `0801${Math.floor(1000000 + Math.random() * 8999999)}`;

// MT-09 happy path
{
  const r = await callFn('create-driver', adminA.token, { name: 'QA Test Driver', phone });
  record('MT-09', 'create-driver happy path returns 201 with driver data', r.status === 201 && r.json?.data?.role === 'DRIVER', JSON.stringify(r));
  globalThis.__newDriverId = r.json?.data?.id;
}

// MT-10 duplicate phone same school -> 409
{
  const r = await callFn('create-driver', adminA.token, { name: 'Dup Phone Driver', phone });
  record('MT-10', 'create-driver duplicate phone same school returns 409', r.status === 409, JSON.stringify(r));
}

// MT-11a unauthenticated -> 401
{
  const r = await callFn('create-driver', null, { name: 'No Auth', phone: '08011111111' });
  record('MT-11a', 'create-driver with no Authorization header returns 401', r.status === 401, JSON.stringify(r));
}

// MT-11b / MT-30 wrong role (PARENT, DRIVER) -> 403
{
  const rParent = await callFn('create-driver', parent.token, { name: 'X', phone: '08022222222' });
  record('MT-11b', 'create-driver as PARENT returns 403', rParent.status === 403, JSON.stringify(rParent));
  const rDriver = await callFn('create-driver', driverRole.token, { name: 'X', phone: '08033333333' });
  record('MT-30', 'create-driver as DRIVER returns 403', rDriver.status === 403, JSON.stringify(rDriver));
}

// ---------- set-driver-pin ----------
const driverId = globalThis.__newDriverId;

// MT-12 happy path
{
  const r = await callFn('set-driver-pin', adminA.token, { driverId, pin: '1234' });
  record('MT-12', 'set-driver-pin happy path returns 200', r.status === 200 && r.json?.data?.set === true, JSON.stringify(r));
}

// MT-13 client-side validation is UI-only; verify server also rejects bad pin (defense in depth)
{
  const r = await callFn('set-driver-pin', adminA.token, { driverId, pin: 'abcd' });
  record('MT-13', 'set-driver-pin rejects non-numeric pin (400)', r.status === 400, JSON.stringify(r));
}

// MT-14 idempotency: set again with different pin, still exactly one driver_pins row
{
  const before = await admin.from('driver_pins').select('driver_id').eq('driver_id', driverId);
  const r = await callFn('set-driver-pin', adminA.token, { driverId, pin: '5678' });
  const after = await admin.from('driver_pins').select('driver_id, pin_hash').eq('driver_id', driverId);
  record('MT-14', 'set-driver-pin twice updates in place (no duplicate row)', r.status === 200 && before.data.length === 1 && after.data.length === 1 && after.data[0].pin_hash !== undefined, `before=${before.data.length} after=${after.data.length}`);
}

// MT-15 wrong school -> 404
{
  const r = await callFn('set-driver-pin', adminB.token, { driverId, pin: '1111' });
  record('MT-15', 'set-driver-pin from different school admin returns 404', r.status === 404, JSON.stringify(r));
}

// MT-29 wrong role -> 403
{
  const r = await callFn('set-driver-pin', parent.token, { driverId, pin: '1111' });
  record('MT-29', 'set-driver-pin as PARENT returns 403', r.status === 403, JSON.stringify(r));
}

// ---------- RLS: buses reassign ----------
{
  const { data: busesA } = await admin.from('buses').select('id').eq('school_id', SCHOOL_A).limit(1);
  const busId = busesA[0].id;

  // MT-16: adminA (own school) can assign driver to bus
  const { error: e1, data: d1 } = await adminA.client.from('buses').update({ driver_id: driverId }).eq('id', busId).select();
  record('MT-16', 'SCHOOL_ADMIN can assign driver to bus in own school', !e1 && d1.length === 1 && d1[0].driver_id === driverId, e1?.message || JSON.stringify(d1));

  // MT-17: clear assignment
  const { error: e2, data: d2 } = await adminA.client.from('buses').update({ driver_id: null }).eq('id', busId).select();
  record('MT-17', 'SCHOOL_ADMIN can clear bus driver assignment', !e2 && d2.length === 1 && d2[0].driver_id === null, e2?.message || JSON.stringify(d2));

  // Reassign for MT-18 unique constraint check
  await adminA.client.from('buses').update({ driver_id: driverId }).eq('id', busId);
  const { data: busesA2 } = await admin.from('buses').select('id').eq('school_id', SCHOOL_A).neq('id', busId).limit(1);
  if (busesA2 && busesA2.length > 0) {
    const busId2 = busesA2[0].id;
    const { error: e3 } = await adminA.client.from('buses').update({ driver_id: driverId }).eq('id', busId2);
    const { data: check1 } = await admin.from('buses').select('driver_id').eq('id', busId).single();
    const { data: check2 } = await admin.from('buses').select('driver_id').eq('id', busId2).single();
    record('MT-18', 'unique index prevents same driver on two buses simultaneously', !!e3 && check1.driver_id === driverId && check2.driver_id !== driverId, `err=${e3?.message} bus1.driver=${check1.driver_id} bus2.driver=${check2.driver_id}`);
    // cleanup
    await admin.from('buses').update({ driver_id: null }).in('id', [busId, busId2]);
  } else {
    record('MT-18', 'unique index prevents same driver on two buses simultaneously', null, 'SKIPPED: no second bus in school A');
  }

  // Cross-school RLS: adminB tries to update School A's bus -> should be blocked (0 rows)
  const { data: d4, error: e4 } = await adminB.client.from('buses').update({ driver_id: null }).eq('id', busId).select();
  record('MT-26x', 'cross-school admin cannot update another school\'s bus (RLS)', !e4 && (!d4 || d4.length === 0), e4?.message || JSON.stringify(d4));
}

// ---------- RLS: schools update ----------
{
  const { data: before } = await admin.from('schools').select('name').eq('id', SCHOOL_A).single();
  const { data: d5, error: e5 } = await adminA.client.from('schools').update({ name: before.name }).eq('id', SCHOOL_A).select();
  record('MT-26', 'SCHOOL_ADMIN can update own school', !e5 && d5.length === 1, e5?.message || JSON.stringify(d5));

  const { data: d6, error: e6 } = await adminA.client.from('schools').update({ name: 'HACKED' }).eq('id', SCHOOL_B).select();
  record('MT-26b', 'SCHOOL_ADMIN cannot update a different school (RLS blocks)', !e6 && (!d6 || d6.length === 0), e6?.message || JSON.stringify(d6));
}

// ---------- RLS: profiles update own ----------
{
  const { data: d7, error: e7 } = await adminA.client.from('profiles').update({ phone: '08000000000' }).eq('id', adminA.userId).select();
  record('MT-27', 'user can update own profile row', !e7 && d7.length === 1, e7?.message || JSON.stringify(d7));

  const { data: d8, error: e8 } = await adminA.client.from('profiles').update({ phone: '08099999999' }).eq('id', adminB.userId).select();
  record('MT-27b', 'user cannot update another user\'s profile row (RLS blocks)', !e8 && (!d8 || d8.length === 0), e8?.message || JSON.stringify(d8));
}

// ---------- RLS: parents visibility (profiles_select_school_admin_parents) ----------
{
  // Set up a student in School A and link a fresh parent via student_parents
  const { data: student, error: se } = await admin.from('students').insert({
    school_id: SCHOOL_A, name: 'QA Test Student', class_name: 'JSS1', is_active: true,
  }).select().single();
  if (se) {
    record('MT-28-setup', 'create test student for parent RLS test', false, se.message);
  } else {
    await admin.from('student_parents').insert({ student_id: student.id, parent_id: parent.userId });
    const { data: seenByA, error: eA } = await adminA.client.from('profiles').select('id').eq('id', parent.userId);
    record('MT-28', 'SCHOOL_ADMIN sees parent linked to own-school student', !eA && seenByA.length === 1, eA?.message || JSON.stringify(seenByA));

    const { data: seenByB, error: eB } = await adminB.client.from('profiles').select('id').eq('id', parent.userId);
    record('MT-07/28b', 'SCHOOL_ADMIN of a different school does NOT see that parent (RLS)', !eB && (!seenByB || seenByB.length === 0), eB?.message || JSON.stringify(seenByB));

    // MT-05/06 revoke access: adminA sets parent is_active=false via school-admin-parents policy
    const { data: revoked, error: eRevoke } = await adminA.client.from('profiles').update({ is_active: false }).eq('id', parent.userId).select();
    record('MT-05', 'SCHOOL_ADMIN can revoke (is_active=false) a linked parent via profiles_update_school_admin_parents', !eRevoke && revoked.length === 1 && revoked[0].is_active === false, eRevoke?.message || JSON.stringify(revoked));

    // cleanup
    await admin.from('student_parents').delete().eq('student_id', student.id);
    await admin.from('students').delete().eq('id', student.id);
  }
}

console.log('\n=== SUMMARY ===');
const failed = results.filter(r => r.pass === false);
const skipped = results.filter(r => r.pass === null);
console.log(`${results.length - failed.length - skipped.length}/${results.length} passed, ${failed.length} failed, ${skipped.length} skipped`);
if (failed.length) {
  console.log('\nFAILED:');
  failed.forEach(f => console.log(` - ${f.id}: ${f.desc} :: ${f.detail}`));
}
