import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, content-type, x-client-info, apikey',
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

  // Auth header check
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse(
      { error: 'Missing Authorization header', statusCode: 401 },
      401,
    );
  }

  // Anon-key client with user's JWT
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: { headers: { Authorization: authHeader } },
    },
  );

  // Verify user
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse(
      { error: 'Invalid or expired session', statusCode: 401 },
      401,
    );
  }

  // Service-role client for profile lookup and update
  const serviceSupabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Look up profile
  const { data: profile, error: profileError } = await serviceSupabase
    .from('profiles')
    .select('id, role')
    .eq('id', userData.user.id)
    .single();

  if (profileError || !profile) {
    return jsonResponse({ error: 'Profile not found', statusCode: 404 }, 404);
  }

  if (profile.role !== 'PARENT') {
    return jsonResponse(
      { error: 'Only parents can complete onboarding', statusCode: 403 },
      403,
    );
  }

  // Update profile
  const { error: updateError } = await serviceSupabase
    .from('profiles')
    .update({ onboarding_completed: true })
    .eq('id', userData.user.id);

  if (updateError) {
    return jsonResponse(
      { error: 'Failed to complete onboarding', statusCode: 500 },
      500,
    );
  }

  return jsonResponse(
    { data: { updated: true }, message: 'Onboarding completed' },
    200,
  );
});
