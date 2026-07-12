import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(URL, SRK, { auth: { autoRefreshToken: false, persistSession: false } });

const SCHOOL_A = '11111111-1111-1111-1111-111111111111'; // Greenfield Academy (existing seed school)
let SCHOOL_B;

async function ensureSchoolB() {
  const { data, error } = await admin.from('schools')
    .upsert({ id: '99999999-aaaa-bbbb-cccc-000000000001', name: 'QA RLS School B', address: 'Test Address B', is_active: true }, { onConflict: 'id' })
    .select().single();
  if (error) throw error;
  SCHOOL_B = data.id;
  console.log('School B:', SCHOOL_B);
}

async function ensureUser(email, password, name, role, school_id) {
  // Try to find existing auth user by email via listUsers (small dataset, fine for test setup)
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listErr) throw listErr;
  let user = list.users.find(u => u.email === email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { name },
    });
    if (error) throw error;
    user = data.user;
    console.log('Created user', email, user.id);
  } else {
    await admin.auth.admin.updateUserById(user.id, { password });
    console.log('Reset password for existing user', email, user.id);
  }
  const { error: profErr } = await admin.from('profiles').upsert({
    id: user.id, name, role, school_id: school_id ?? null, is_active: true,
  }, { onConflict: 'id' });
  if (profErr) throw profErr;
  return user.id;
}

await ensureSchoolB();

const adminA = await ensureUser('admin@greenfield.test', 'GreenfieldTest123!', 'Greenfield Admin', 'SCHOOL_ADMIN', SCHOOL_A);
const adminB = await ensureUser('qa-admin-b@busbuzz.test', 'QaAdminB123!', 'QA Admin B', 'SCHOOL_ADMIN', SCHOOL_B);
const parent = await ensureUser('qa-parent@busbuzz.test', 'QaParent123!', 'QA Parent', 'PARENT', null);
const driverRole = await ensureUser('qa-driver-role@busbuzz.test', 'QaDriverRole123!', 'QA Driver Role', 'DRIVER', SCHOOL_A);

console.log(JSON.stringify({ SCHOOL_A, SCHOOL_B, adminA, adminB, parent, driverRole }, null, 2));
