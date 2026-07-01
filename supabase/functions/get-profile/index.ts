import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  if (req.method !== 'GET') {
    return Response.json(
      { error: 'Method not allowed', statusCode: 405 },
      { status: 405 },
    );
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return Response.json(
      { error: 'Missing Authorization header', statusCode: 401 },
      { status: 401 },
    );
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: { headers: { Authorization: authHeader } },
    },
  );

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return Response.json(
      { error: 'Invalid or expired session', statusCode: 401 },
      { status: 401 },
    );
  }

  // RLS scopes this to the caller's own row regardless of role.
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*, school:schools(name)')
    .eq('id', userData.user.id)
    .single();

  if (profileError || !profile) {
    return Response.json(
      { error: 'Profile not found', statusCode: 404 },
      { status: 404 },
    );
  }

  return Response.json({ data: profile, message: 'Profile retrieved' });
});
