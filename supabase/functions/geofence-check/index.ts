// DISABLED — dead code. gps-update now inlines this same approach/arrival
// geofence logic directly (see supabase/functions/gps-update/index.ts) so
// every ping stays a single function invocation; nothing has called this
// endpoint since. Left deployed-but-inert (rather than deleted outright)
// so a stray caller gets a clear, cheap 410 instead of a 404 with no
// explanation. No secret check or DB access here — there's nothing left
// to protect; if this is ever repurposed, reinstate the X-Internal-Secret
// check that used to gate it.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, content-type, x-client-info, apikey, x-internal-secret',
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

  return jsonResponse(
    {
      error: 'This endpoint has been retired — geofence checks are now handled inline by gps-update.',
      statusCode: 410,
    },
    410,
  );
});
