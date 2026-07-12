import { createClient } from 'npm:@supabase/supabase-js@2';

// Most On-Time Student award.
//
// Ranks a school's active students by boarding readiness — the average number
// of seconds between the bus reaching a student's stop (geofence trigger) and
// the driver marking them BOARDED — over an admin-chosen date range (a term /
// semester). Persists the ranked result to semester_awards and emails the
// winner to the configured recipient via Resend.
//
// POST, SCHOOL_ADMIN / SUPER_ADMIN. Body: { startDate, endDate, label }.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, content-type, x-client-info, apikey',
};

// Minimum timed boardings for a student to be eligible for the prize, so a
// single lucky on-time morning can't win a whole term.
const MIN_TIMED_BOARDINGS = 3;
const LEADERBOARD_SIZE = 10;

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMinsSecs(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem === 0 ? `${m}m` : `${m}m ${rem}s`;
}

interface LeaderboardEntry {
  studentId: string;
  studentName: string;
  className: string;
  avgBoardSeconds: number;
  timedBoardings: number;
  boardedCount: number;
  absentCount: number;
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

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, school_id')
    .eq('id', userData.user.id)
    .single();

  if (
    profileError ||
    !profile ||
    (profile.role !== 'SCHOOL_ADMIN' && profile.role !== 'SUPER_ADMIN')
  ) {
    return jsonResponse(
      { error: 'Forbidden: SCHOOL_ADMIN or SUPER_ADMIN role required', statusCode: 403 },
      403,
    );
  }
  if (!profile.school_id) {
    return jsonResponse({ error: 'No school associated with this account', statusCode: 403 }, 403);
  }
  const schoolId = profile.school_id as string;

  let body: { startDate?: unknown; endDate?: unknown; label?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body', statusCode: 400 }, 400);
  }

  const startDate = typeof body.startDate === 'string' ? body.startDate : '';
  const endDate = typeof body.endDate === 'string' ? body.endDate : '';
  const label = typeof body.label === 'string' ? body.label.trim() : '';

  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
    return jsonResponse({ error: 'startDate and endDate must be YYYY-MM-DD', statusCode: 400 }, 400);
  }
  if (startDate > endDate) {
    return jsonResponse({ error: 'startDate must be on or before endDate', statusCode: 400 }, 400);
  }
  if (label.length < 1 || label.length > 200) {
    return jsonResponse({ error: 'A label (1–200 chars) is required', statusCode: 400 }, 400);
  }

  const startDateISO = `${startDate}T00:00:00.000Z`;
  const endExclusive = new Date(`${endDate}T00:00:00.000Z`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  const endDateExclusiveISO = endExclusive.toISOString();

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let leaderboard: LeaderboardEntry[] = [];
  try {
    // Active students with their assigned stop.
    const { data: students, error: studentsError } = await service
      .from('students')
      .select('id, name, class_name, stop_id')
      .eq('school_id', schoolId)
      .eq('is_active', true);
    if (studentsError) throw studentsError;

    const studentList = (students ?? []) as {
      id: string;
      name: string;
      class_name: string;
      stop_id: string | null;
    }[];
    const studentStopId = new Map<string, string | null>();
    for (const s of studentList) studentStopId.set(s.id, s.stop_id ?? null);

    // Trips for this school in range.
    const { data: trips, error: tripsError } = await service
      .from('trips')
      .select('id, route:routes!inner(school_id)')
      .eq('route.school_id', schoolId)
      .gte('started_at', startDateISO)
      .lt('started_at', endDateExclusiveISO);
    if (tripsError) throw tripsError;

    const tripIds = (trips ?? []).map((t: { id: string }) => t.id);

    const boardedCount: Record<string, number> = {};
    const absentCount: Record<string, number> = {};
    const delaySum: Record<string, number> = {};
    const timed: Record<string, number> = {};

    if (tripIds.length > 0) {
      const [attendanceRes, triggersRes] = await Promise.all([
        service
          .from('attendance')
          .select('student_id, trip_id, status, marked_at')
          .in('trip_id', tripIds),
        service
          .from('trip_stop_triggers')
          .select('trip_id, stop_id, triggered_at')
          .in('trip_id', tripIds),
      ]);
      if (attendanceRes.error) throw attendanceRes.error;
      if (triggersRes.error) throw triggersRes.error;

      const arrivalByTripStop = new Map<string, number>();
      for (const tr of triggersRes.data ?? []) {
        arrivalByTripStop.set(
          `${tr.trip_id}:${tr.stop_id}`,
          new Date(tr.triggered_at).getTime(),
        );
      }

      for (const row of attendanceRes.data ?? []) {
        if (row.status === 'BOARDED') {
          boardedCount[row.student_id] = (boardedCount[row.student_id] ?? 0) + 1;
          const stopId = studentStopId.get(row.student_id) ?? null;
          const arrival = stopId
            ? arrivalByTripStop.get(`${row.trip_id}:${stopId}`)
            : undefined;
          if (arrival !== undefined && row.marked_at) {
            const delaySec = Math.max(
              0,
              (new Date(row.marked_at).getTime() - arrival) / 1000,
            );
            delaySum[row.student_id] = (delaySum[row.student_id] ?? 0) + delaySec;
            timed[row.student_id] = (timed[row.student_id] ?? 0) + 1;
          }
        } else if (row.status === 'ABSENT') {
          absentCount[row.student_id] = (absentCount[row.student_id] ?? 0) + 1;
        }
      }
    }

    leaderboard = studentList
      .map((s): LeaderboardEntry => {
        const t = timed[s.id] ?? 0;
        return {
          studentId: s.id,
          studentName: s.name,
          className: s.class_name,
          avgBoardSeconds: t > 0 ? Math.round(delaySum[s.id] / t) : 0,
          timedBoardings: t,
          boardedCount: boardedCount[s.id] ?? 0,
          absentCount: absentCount[s.id] ?? 0,
        };
      })
      .filter((e) => e.timedBoardings >= MIN_TIMED_BOARDINGS)
      .sort(
        (a, b) =>
          a.avgBoardSeconds - b.avgBoardSeconds ||
          b.timedBoardings - a.timedBoardings ||
          a.absentCount - b.absentCount,
      )
      .slice(0, LEADERBOARD_SIZE);
  } catch (_err) {
    return jsonResponse({ error: 'Failed to compute award', statusCode: 500 }, 500);
  }

  const winner = leaderboard[0] ?? null;
  const emailTo = Deno.env.get('AWARD_EMAIL_TO') ?? 'scrpoll07@gmail.com';

  // Persist the award before emailing so it's visible even if email fails.
  const { data: schoolRow } = await service
    .from('schools')
    .select('name')
    .eq('id', schoolId)
    .single();
  const schoolName = schoolRow?.name ?? 'Your school';

  const { data: inserted, error: insertError } = await service
    .from('semester_awards')
    .insert({
      school_id: schoolId,
      label,
      period_start: startDate,
      period_end: endDate,
      winner_student_id: winner?.studentId ?? null,
      winner_name: winner?.studentName ?? null,
      winner_avg_board_seconds: winner?.avgBoardSeconds ?? null,
      winner_timed_boardings: winner?.timedBoardings ?? 0,
      leaderboard,
      email_to: emailTo,
      computed_by: userData.user.id,
    })
    .select('id, computed_at')
    .single();

  if (insertError || !inserted) {
    return jsonResponse({ error: 'Failed to save award', statusCode: 500 }, 500);
  }

  // Email the result via Resend (non-fatal — the award is already saved).
  let emailSent = false;
  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (resendKey && winner) {
    try {
      const from =
        Deno.env.get('AWARD_FROM_EMAIL') ?? 'BusBuzz Awards <awards@busbuzz.app>';
      const rows = leaderboard
        .map(
          (e, i) => `
        <tr>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;">${i + 1}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;font-weight:${i === 0 ? 700 : 400};">${escapeHtml(e.studentName)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#666;">${escapeHtml(e.className)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;font-family:monospace;">${formatMinsSecs(e.avgBoardSeconds)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;font-family:monospace;color:#666;">${e.timedBoardings}</td>
        </tr>`,
        )
        .join('');

      const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;color:#0A0E19;">
        <div style="height:6px;background:repeating-linear-gradient(-45deg,#FFC900 0 15px,#14161C 15px 30px);border-radius:6px 6px 0 0;"></div>
        <div style="padding:28px 24px;">
          <p style="font-family:monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#888;margin:0 0 6px;">${escapeHtml(schoolName)} · ${escapeHtml(label)}</p>
          <h1 style="font-size:24px;margin:0 0 4px;">Most On-Time Student</h1>
          <p style="color:#666;margin:0 0 20px;font-size:14px;">${escapeHtml(startDate)} → ${escapeHtml(endDate)}</p>
          <div style="background:#0A0E19;color:#fff;border-radius:14px;padding:20px 22px;margin-bottom:22px;">
            <p style="font-family:monospace;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#FFC900;margin:0 0 8px;">🏆 Winner</p>
            <p style="font-size:26px;font-weight:700;margin:0;">${escapeHtml(winner.studentName)}</p>
            <p style="color:#9aa;margin:6px 0 0;font-size:14px;">${escapeHtml(winner.className)} · ready in <b style="color:#FFC900;">${formatMinsSecs(winner.avgBoardSeconds)}</b> on average across ${winner.timedBoardings} timed pickups</p>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead>
              <tr style="text-align:left;color:#888;font-size:11px;text-transform:uppercase;letter-spacing:1px;">
                <th style="padding:6px 10px;">#</th><th style="padding:6px 10px;">Student</th>
                <th style="padding:6px 10px;">Class</th><th style="padding:6px 10px;">Avg board</th>
                <th style="padding:6px 10px;">Pickups</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <p style="color:#999;font-size:12px;margin-top:24px;">Lower average board time = more on-time. Measured from the moment the bus reached each student's stop to when they were marked boarded.</p>
        </div>
      </div>`;

      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [emailTo],
          subject: `🏆 Most On-Time Student — ${label} (${schoolName})`,
          html,
        }),
      });
      emailSent = resp.ok;
      if (!resp.ok) {
        console.error(`[compute-ontime-award] Resend ${resp.status}: ${await resp.text()}`);
      }
    } catch (err) {
      console.error('[compute-ontime-award] email failed:', err);
    }
  }

  if (emailSent) {
    await service.from('semester_awards').update({ email_sent: true }).eq('id', inserted.id);
  }

  return jsonResponse(
    {
      data: {
        award: {
          id: inserted.id,
          schoolId,
          label,
          periodStart: startDate,
          periodEnd: endDate,
          winnerStudentId: winner?.studentId ?? null,
          winnerName: winner?.studentName ?? null,
          winnerAvgBoardSeconds: winner?.avgBoardSeconds ?? null,
          winnerTimedBoardings: winner?.timedBoardings ?? 0,
          leaderboard,
          emailSent,
          emailTo,
          computedAt: inserted.computed_at,
        },
      },
      message: winner
        ? 'Award computed'
        : 'No student had enough timed pickups to qualify for this period',
    },
    200,
  );
});
