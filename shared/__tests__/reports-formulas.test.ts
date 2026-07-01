/**
 * These tests verify the *spec-mandated formulas* for the reports module
 * (on-time %, attendance %, CSV field escaping) in isolation.
 *
 * IMPORTANT: supabase/functions/get-reports/index.ts is a Deno Edge Function
 * and is not imported here directly (Deno-style `npm:` imports are not
 * resolvable under ts-jest/Node). These tests re-implement the exact same
 * formulas as the reviewed implementation to lock in the expected behaviour
 * and catch regressions in the formula itself. They do NOT exercise the
 * actual deployed function, DB joins, or auth/authorization logic -- those
 * require a live Supabase instance (see .pipeline/manual-tests.md).
 *
 * Formula source: supabase/functions/get-reports/index.ts handleSummary()
 * and handleAttendance(), cross-checked against spec.md section
 * "On-time percentage computation" and step 8b-4.
 */

// ---- On-time percentage (mirrors handleSummary in get-reports/index.ts) ----

interface CompletedTripInput {
  routeId: string | null;
  startedAt: string;
  endedAt: string;
}

function computeOnTimePercentage(
  trips: CompletedTripInput[],
  routeMaxEta: Record<string, number | null>,
): number {
  let eligibleCount = 0;
  let onTimeCount = 0;
  for (const trip of trips) {
    const expectedDuration = trip.routeId ? routeMaxEta[trip.routeId] : null;
    if (expectedDuration === null || expectedDuration === undefined) {
      continue; // exclude routes with no eta_minutes data
    }
    eligibleCount += 1;
    const actualDuration =
      (new Date(trip.endedAt).getTime() - new Date(trip.startedAt).getTime()) /
      60000;
    if (actualDuration <= expectedDuration + 10) {
      onTimeCount += 1;
    }
  }
  return eligibleCount > 0 ? Math.round((onTimeCount / eligibleCount) * 1000) / 10 : 0;
}

describe('on-time percentage formula', () => {
  test('returns 0 when there are no eligible trips at all', () => {
    expect(computeOnTimePercentage([], {})).toBe(0);
  });

  test('returns 0 (not NaN) when trips exist but none have eta_minutes data', () => {
    const trips: CompletedTripInput[] = [
      { routeId: 'r1', startedAt: '2026-06-01T08:00:00Z', endedAt: '2026-06-01T08:30:00Z' },
    ];
    const result = computeOnTimePercentage(trips, { r1: null });
    expect(result).toBe(0);
    expect(Number.isNaN(result)).toBe(false);
  });

  test('excludes routes with no eta_minutes from BOTH numerator and denominator (not counted as late)', () => {
    const trips: CompletedTripInput[] = [
      // r1 has eta data, on time
      { routeId: 'r1', startedAt: '2026-06-01T08:00:00Z', endedAt: '2026-06-01T08:20:00Z' },
      // r2 has no eta data -- must be fully excluded
      { routeId: 'r2', startedAt: '2026-06-01T08:00:00Z', endedAt: '2026-06-01T09:30:00Z' },
    ];
    const routeMaxEta = { r1: 20, r2: null };
    // If r2 were wrongly counted as "late," percentage would be 50%.
    // Correct behaviour: r2 excluded entirely -> 1/1 eligible trip, on time -> 100%.
    expect(computeOnTimePercentage(trips, routeMaxEta)).toBe(100);
  });

  test('trip exactly at expected+10 minutes counts as on time (inclusive boundary)', () => {
    const trips: CompletedTripInput[] = [
      { routeId: 'r1', startedAt: '2026-06-01T08:00:00Z', endedAt: '2026-06-01T08:30:00Z' }, // 30 min actual
    ];
    const routeMaxEta = { r1: 20 }; // expected 20 + 10 tolerance = 30 -> exactly on boundary
    expect(computeOnTimePercentage(trips, routeMaxEta)).toBe(100);
  });

  test('trip one minute past expected+10 tolerance counts as late', () => {
    const trips: CompletedTripInput[] = [
      { routeId: 'r1', startedAt: '2026-06-01T08:00:00Z', endedAt: '2026-06-01T08:31:00Z' }, // 31 min actual
    ];
    const routeMaxEta = { r1: 20 }; // tolerance ceiling = 30
    expect(computeOnTimePercentage(trips, routeMaxEta)).toBe(0);
  });

  test('mixed on-time and late trips compute correct percentage rounded to 1 decimal', () => {
    const trips: CompletedTripInput[] = [
      { routeId: 'r1', startedAt: '2026-06-01T08:00:00Z', endedAt: '2026-06-01T08:20:00Z' }, // on time
      { routeId: 'r1', startedAt: '2026-06-01T08:00:00Z', endedAt: '2026-06-01T08:20:00Z' }, // on time
      { routeId: 'r1', startedAt: '2026-06-01T08:00:00Z', endedAt: '2026-06-01T09:00:00Z' }, // late
    ];
    const routeMaxEta = { r1: 20 };
    // 2/3 = 66.666...% -> rounds to 66.7
    expect(computeOnTimePercentage(trips, routeMaxEta)).toBe(66.7);
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
