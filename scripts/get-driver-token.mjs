import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const { data, error } = await supabase.auth.signInWithPassword({
  email: 'driver@sim.test',
  password: 'Driver1234!',
});

if (error) {
  console.error(`Login failed: ${error.message}`);
  process.exit(1);
}

process.stdout.write(data.session.access_token + '\n');
process.stderr.write('Driver JWT obtained. Add this to your .env as SIMULATION_DRIVER_JWT\n');
