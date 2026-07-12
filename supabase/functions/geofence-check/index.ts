import { createClient } from 'npm:@supabase/supabase-js@2';
import { geofenceCheckSchema } from '../../../shared/schemas.ts';
import { haversineDistance } from '../../../shared/geo.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, content-type, x-client-info, apikey, x-internal-secret',
};

const GEOFENCE_RADIUS_M = 300;

type StopRow = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  sequence: number;
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

  // 2. Internal secret check
  const internalSecretHeader = req.headers.get('X-Internal-Secret');
  const internalSecretEnv = Deno.env.get('INTERNAL_FUNCTION_SECRET');
  if (
    !internalSecretHeader ||
    !internalSecretEnv ||
    internalSecretHeader !== internalSecretEnv
  ) {
    return jsonResponse({ error: 'Forbidden', statusCode: 403 }, 403);
  }

  // 3. Parse JSON body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body', statusCode: 400 }, 400);
  }

  // 4. Validate with Zod
  const parseResult = geofenceCheckSchema.safeParse(body);
  if (!parseResult.success) {
    return jsonResponse(
      {
        error: 'Validation error',
        statusCode: 400,
        details: parseResult.error.issues,
      },
      400,
    );
  }

  const validated = parseResult.data;

  // 5. Service-role client
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // 6. Load stops for route
  const { data: stops, error: stopsError } = await supabase
    .from('stops')
    .select('id, name, latitude, longitude, sequence')
    .eq('route_id', validated.routeId)
    .order('sequence');

  if (stopsError || !stops || stops.length === 0) {
    return jsonResponse(
      {
        data: { triggeredStopIds: [], pendingNotifications: [] },
        message: 'Geofence check complete',
      },
      200,
    );
  }

  // 7. Load already-triggered stops for this trip
  const { data: triggeredRows } = await supabase
    .from('trip_stop_triggers')
    .select('stop_id')
    .eq('trip_id', validated.tripId);

  const triggeredSet = new Set<string>(
    (triggeredRows ?? []).map((row: { stop_id: string }) => row.stop_id),
  );

  // 8. Filter to untriggered stops
  const untriggeredStops = (stops as StopRow[]).filter(
    (stop) => !triggeredSet.has(stop.id),
  );

  const triggeredStopIds: string[] = [];
  const pendingNotifications: Array<{
    stopId: string;
    stopName: string;
    parentIds: string[];
  }> = [];

  // 9-10. Distance check and trigger
  for (const stop of untriggeredStops) {
    const distance = haversineDistance(
      validated.lat,
      validated.lng,
      stop.latitude,
      stop.longitude,
    );

    if (distance > GEOFENCE_RADIUS_M) {
      continue;
    }

    try {
      const { error: upsertError } = await supabase
        .from('trip_stop_triggers')
        .upsert(
          {
            trip_id: validated.tripId,
            stop_id: stop.id,
            triggered_at: new Date().toISOString(),
          },
          { onConflict: 'trip_id,stop_id' },
        );

      if (upsertError) {
        console.error(
          `[geofence] Failed to upsert trip_stop_trigger for stop ${stop.id}:`,
          upsertError,
        );
        continue;
      }

      let uniqueParentIds: string[] = [];
      try {
        const { data: parentRows, error: parentError } = await supabase
          .from('students')
          .select('student_parents(parent_id)')
          .eq('stop_id', stop.id)
          .eq('route_id', validated.routeId)
          .eq('is_active', true);

        if (parentError) {
          console.error(
            `[geofence] Failed to look up parents for stop ${stop.id}:`,
            parentError,
          );
        } else {
          const parentIdSet = new Set<string>();
          for (const row of (parentRows ?? []) as Array<{
            student_parents: Array<{ parent_id: string }> | { parent_id: string } | null;
          }>) {
            const sp = row.student_parents;
            if (Array.isArray(sp)) {
              for (const entry of sp) {
                if (entry?.parent_id) parentIdSet.add(entry.parent_id);
              }
            } else if (sp && sp.parent_id) {
              parentIdSet.add(sp.parent_id);
            }
          }
          uniqueParentIds = Array.from(parentIdSet);
        }
      } catch (err) {
        console.error(
          `[geofence] Error looking up parents for stop ${stop.id}:`,
          err,
        );
      }

      pendingNotifications.push({
        stopId: stop.id,
        stopName: stop.name,
        parentIds: uniqueParentIds,
      });
      triggeredStopIds.push(stop.id);

      if (uniqueParentIds.length > 0) {
        try {
          const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
          const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
          const internalSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET')!;

          const pushResp = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${serviceRoleKey}`,
              'apikey': serviceRoleKey,
              'X-Internal-Secret': internalSecret,
            },
            body: JSON.stringify({
              userIds: uniqueParentIds,
              title: 'Bus approaching',
              body: `The bus is approaching ${stop.name}`,
              data: {
                type: 'geofence',
                tripId: validated.tripId,
                stopId: stop.id,
                stopName: stop.name,
              },
            }),
          });

          if (!pushResp.ok) {
            console.error(
              `[geofence] send-push returned ${pushResp.status}: ${await pushResp.text()}`,
            );
          }
        } catch (err) {
          console.error(
            `[geofence] send-push call failed for stop ${stop.id}:`,
            err,
          );
        }
      }
    } catch (err) {
      console.error(
        `[geofence] Unexpected error processing stop ${stop.id}:`,
        err,
      );
      continue;
    }
  }

  // 11-12. Return result (send-push not called yet)
  return jsonResponse(
    { data: { triggeredStopIds, pendingNotifications }, message: 'Geofence check complete' },
    200,
  );
});
