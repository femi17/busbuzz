import { getReportsQuerySchema } from '../schemas';

describe('getReportsQuerySchema', () => {
  test('accepts a valid trips query', () => {
    const result = getReportsQuerySchema.safeParse({
      type: 'trips',
      startDate: '2026-06-01',
      endDate: '2026-06-30',
    });
    expect(result.success).toBe(true);
  });

  test('accepts attendance and summary types', () => {
    expect(
      getReportsQuerySchema.safeParse({
        type: 'attendance',
        startDate: '2026-06-01',
        endDate: '2026-06-30',
      }).success,
    ).toBe(true);
    expect(
      getReportsQuerySchema.safeParse({
        type: 'summary',
        startDate: '2026-06-01',
        endDate: '2026-06-30',
      }).success,
    ).toBe(true);
  });

  test('rejects invalid type value', () => {
    const result = getReportsQuerySchema.safeParse({
      type: 'invoices',
      startDate: '2026-06-01',
      endDate: '2026-06-30',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('type');
    }
  });

  test('rejects missing type', () => {
    const result = getReportsQuerySchema.safeParse({
      startDate: '2026-06-01',
      endDate: '2026-06-30',
    });
    expect(result.success).toBe(false);
  });

  test('rejects malformed startDate (not YYYY-MM-DD)', () => {
    const result = getReportsQuerySchema.safeParse({
      type: 'trips',
      startDate: '06/01/2026',
      endDate: '2026-06-30',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('startDate');
    }
  });

  test('rejects malformed endDate', () => {
    const result = getReportsQuerySchema.safeParse({
      type: 'trips',
      startDate: '2026-06-01',
      endDate: 'not-a-date',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('endDate');
    }
  });

  test('rejects empty string dates', () => {
    const result = getReportsQuerySchema.safeParse({
      type: 'trips',
      startDate: '',
      endDate: '',
    });
    expect(result.success).toBe(false);
  });

  // Note: the regex only validates *format*, not that start <= end or that the
  // date is calendrically valid (e.g. "2026-02-30" passes the regex). The Edge
  // Function does not appear to separately validate logical date ordering or
  // calendar validity server-side -- see test-results.md "Coverage gaps".
  test('regex does not catch calendrically invalid dates (documents current behaviour)', () => {
    const result = getReportsQuerySchema.safeParse({
      type: 'trips',
      startDate: '2026-02-30',
      endDate: '2026-02-31',
    });
    expect(result.success).toBe(true);
  });

  test('regex does not catch startDate after endDate (documents current behaviour)', () => {
    const result = getReportsQuerySchema.safeParse({
      type: 'trips',
      startDate: '2026-06-30',
      endDate: '2026-06-01',
    });
    expect(result.success).toBe(true);
  });
});
