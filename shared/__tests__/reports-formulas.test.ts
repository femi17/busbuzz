/**
 * These tests verify the formulas behind the reports module (on-time %,
 * attendance %, CSV field escaping) in isolation.
 *
 * The old header comment here cited ".pipeline/spec.md section 'On-time
 * percentage computation' and step 8b-4" as the formula source — that
 * section no longer exists; .pipeline/spec.md is overwritten by each new
 * feature's planner stage (it currently describes an unrelated bento-grid
 * visual rebuild), so that reference was stale documentation debt pointing
 * at a formula (whole-trip duration vs. a route's single max eta_minutes,
 * 10-minute grace) that get-reports' handleSummary() no longer implements.
 *
 * On-time % now has one canonical implementation, shared/geo.ts's
 * computeOnTimePercentage (per-stop arrival vs. that stop's own
 * eta_minutes, 5-minute grace) — imported directly here, and also used by
 * the web dashboard (dashboard-data.ts). get-reports/index.ts inlines a
 * copy of the same function (Deno Edge Functions here bundle standalone, so
 * it can't import shared/geo.ts directly) — these tests exercise the
 * shared/geo.ts original, not that inlined copy, so a regression there
 * specifically requires checking the two stay in sync by hand.
 *
 * IMPORTANT: supabase/functions/get-reports/index.ts is a Deno Edge Function
 * and is not imported here directly (Deno-style `npm:` imports are not
 * resolvable under ts-jest/Node). The attendance % test below re-implements
 * that formula in isolation to lock in the expected behaviour and catch
 * regressions in the formula itself. It does NOT exercise the actual
 * deployed function, DB joins, or auth/authorization logic — those require
 * a live Supabase instance (see .pipeline/manual-tests.md). It also only
 * covers the boardedCount/totalTrips division itself, not how totalTrips is
 * computed upstream (get-reports' handleAttendance now scopes each
 * student's totalTrips to the trip directions matching their own
 * trip_type, not just every trip on their route — see totalTripsFor()).
 */

import { computeOnTimePercentage } from '../geo';

// ---- On-time percentage (shared/geo.ts, the single canonical formula) ----

describe('on-time percentage formula', () => {
  test('returns null when there are no arrivals at all', () => {
    expect(computeOnTimePercentage([])).toBeNull();
  });

  test('returns null (not NaN or 0) when arrivals exist but none have etaMinutes data', () => {
    const result = computeOnTimePercentage([
      { triggeredAt: '2026-06-01T08:20:00Z', tripStartedAt: '2026-06-01T08:00:00Z', etaMinutes: null },
    ]);
    expect(result).toBeNull();
  });

  test('excludes arrivals with no etaMinutes from BOTH numerator and denominator (not counted as late)', () => {
    const result = computeOnTimePercentage([
      // Has eta data, arrived on time.
      { triggeredAt: '2026-06-01T08:20:00Z', tripStartedAt: '2026-06-01T08:00:00Z', etaMinutes: 20 },
      // No eta data -- must be fully excluded, not counted as a miss.
      { triggeredAt: '2026-06-01T09:30:00Z', tripStartedAt: '2026-06-01T08:00:00Z', etaMinutes: null },
    ]);
    // If the second arrival were wrongly counted as "late," this would be 50%.
    // Correct behaviour: it's excluded entirely -> 1/1 scored arrival, on time -> 100%.
    expect(result).toBe(100);
  });

  test('arrival exactly at eta+5min grace counts as on time (inclusive boundary)', () => {
    const result = computeOnTimePercentage([
      // Stop's eta is 20 min; arrived at 25 min -- exactly on the grace boundary.
      { triggeredAt: '2026-06-01T08:25:00Z', tripStartedAt: '2026-06-01T08:00:00Z', etaMinutes: 20 },
    ]);
    expect(result).toBe(100);
  });

  test('arrival one minute past eta+5min grace counts as late', () => {
    const result = computeOnTimePercentage([
      { triggeredAt: '2026-06-01T08:26:00Z', tripStartedAt: '2026-06-01T08:00:00Z', etaMinutes: 20 },
    ]);
    expect(result).toBe(0);
  });

  test('mixed on-time and late arrivals compute correct percentage rounded to an integer', () => {
    const result = computeOnTimePercentage([
      { triggeredAt: '2026-06-01T08:20:00Z', tripStartedAt: '2026-06-01T08:00:00Z', etaMinutes: 20 }, // on time
      { triggeredAt: '2026-06-01T08:20:00Z', tripStartedAt: '2026-06-01T08:00:00Z', etaMinutes: 20 }, // on time
      { triggeredAt: '2026-06-01T09:00:00Z', tripStartedAt: '2026-06-01T08:00:00Z', etaMinutes: 20 }, // late
    ]);
    // 2/3 = 66.666...% -> rounds to 67
    expect(result).toBe(67);
  });

  test('early arrival always counts as on time regardless of how early', () => {
    const result = computeOnTimePercentage([
      { triggeredAt: '2026-06-01T08:01:00Z', tripStartedAt: '2026-06-01T08:00:00Z', etaMinutes: 20 },
    ]);
    expect(result).toBe(100);
  });
});

// ---- Attendance percentage (mirrors handleAttendance in get-reports/index.ts) ----

function computeAttendancePercentage(boardedCount: number, totalTrips: number): number {
  return totalTrips > 0 ? Math.round((boardedCount / totalTrips) * 1000) / 10 : 0;
}

describe('attendance percentage formula', () => {
  test('returns 0 when totalTrips is 0 (student not assigned to a route, or route has no trips)', () => {
    expect(computeAttendancePercentage(0, 0)).toBe(0);
  });

  test('returns 100 when boarded every trip', () => {
    expect(computeAttendancePercentage(5, 5)).toBe(100);
  });

  test('rounds to 1 decimal place', () => {
    expect(computeAttendancePercentage(1, 3)).toBe(33.3);
  });

  test('boardedCount of 0 with trips present returns 0%, not NaN', () => {
    const result = computeAttendancePercentage(0, 4);
    expect(result).toBe(0);
    expect(Number.isNaN(result)).toBe(false);
  });
});

describe('attendance sort ordering (default ascending)', () => {
  test('sorts students by attendancePercentage ascending (lowest first)', () => {
    const students = [
      { studentId: 'a', attendancePercentage: 90 },
      { studentId: 'b', attendancePercentage: 10 },
      { studentId: 'c', attendancePercentage: 50 },
    ];
    const sorted = [...students].sort(
      (a, b) => a.attendancePercentage - b.attendancePercentage,
    );
    expect(sorted.map((s) => s.studentId)).toEqual(['b', 'c', 'a']);
  });

  test('descending toggle reverses the order', () => {
    const students = [
      { studentId: 'a', attendancePercentage: 90 },
      { studentId: 'b', attendancePercentage: 10 },
      { studentId: 'c', attendancePercentage: 50 },
    ];
    const sorted = [...students].sort(
      (a, b) => b.attendancePercentage - a.attendancePercentage,
    );
    expect(sorted.map((s) => s.studentId)).toEqual(['a', 'c', 'b']);
  });
});

// ---- CSV escaping (mirrors handleExportCsv in web/app/dashboard/reports/page.tsx) ----

function csvRow(cells: string[]): string {
  return cells.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',');
}

describe('CSV field escaping (reports page export)', () => {
  test('wraps every field in double quotes regardless of content', () => {
    expect(csvRow(['Plain', 'Fields'])).toBe('"Plain","Fields"');
  });

  test('route name containing a comma does not break column alignment', () => {
    const row = csvRow(['2026-06-01', '08:00 AM', 'LAG-123-XY', 'Lekki, Phase 1 Route', '25', 'COMPLETED']);
    const fields = row.split('","');
    expect(fields).toHaveLength(6);
    expect(row).toContain('"Lekki, Phase 1 Route"');
  });

  test('field containing a double quote is escaped by doubling it', () => {
    const row = csvRow(['Route "Express" 1']);
    expect(row).toBe('"Route ""Express"" 1"');
  });

  test('field containing a newline stays inside its quoted field', () => {
    const row = csvRow(['Multi\nLine']);
    expect(row).toBe('"Multi\nLine"');
  });

  test('field containing comma AND quote together escapes correctly', () => {
    const row = csvRow(['Bus "A", Route 2']);
    expect(row).toBe('"Bus ""A"", Route 2"');
  });
});
