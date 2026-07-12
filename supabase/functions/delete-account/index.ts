import { createClient } from 'npm:@supabase/supabase-js@2';

// In-app account deletion (Apple Guideline 5.1.1(v)). A signed-in user deletes
// their OWN account: removing the auth user cascades to profiles, and from
// there to student_parents / notifications via ON DELETE CASCADE. Students,
// buses, routes etc. belong to the school and are untouched.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed', statusCode: 405 }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Missing Authorization header', statusCode: 401 }, 401);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse({ error: 'Invalid or expired session', statusCode: 401 }, 401);
  }

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { error: deleteError } = await service.auth.admin.deleteUser(userData.user.id);
  if (deleteError) {
    console.error('[delete-account] Failed to delete user:', deleteError);
    return jsonResponse({ error: 'Failed to delete account', statusCode: 500 }, 500);
  }

  return jsonResponse({ data: { deleted: true }, message: 'Account deleted' }, 200);
});
