// Tests the hand-rolled CSV parser embedded inline in:
//   web/app/dashboard/students/import/page.tsx (function parseCsv)
//
// IMPORTANT: web/ has no test runner installed (no jest/vitest/testing-library
// in web/package.json, same known gap flagged in prior features' test-results.md).
// This function is NOT exported from the page file (it's a local function in a
// 'use client' component), so it cannot be imported directly. Per the page's
// source (read directly via the Read tool on 2026-06-29), the logic is
// reproduced VERBATIM below:
//
//   function parseCsv(text: string): { rows: ParsedRow[]; warning: boolean } {
//     const lines = text.split(/\r?\n/);
//     const rows: ParsedRow[] = [];
//     let warning = false;
//
//     for (const rawLine of lines) {
//       const line = rawLine.trim();
//       if (!line) continue;
//
//       if (
//         /^name\s*,\s*classname\s*,\s*stopname$/i.test(line.replace(/\s+/g, ''))
//       ) {
//         continue;
//       }
//
//       const fields = line.split(',').map((field) => field.trim());
//       const nonEmptyFields = fields.filter((field) => field.length > 0);
//
//       if (fields.length !== 3 || nonEmptyFields.length !== 3) {
//         warning = true;
//         continue;
//       }
//
//       rows.push({
//         name: fields[0],
//         className: fields[1],
//         stopName: fields[2],
//       });
//     }
//
//     return { rows, warning };
//   }
//
// If this logic is ever edited in the page file without updating this copy,
// this test will silently drift — see .pipeline/test-results.md "Coverage
// gaps" for this caveat (same caveat pattern as bus-form-schema.test.ts and
// route-stop-reorder.test.ts).

type ParsedRow = {
  name: string;
  className: string;
  stopName: string;
};

function parseCsv(text: string): { rows: ParsedRow[]; warning: boolean } {
  const lines = text.split(/\r?\n/);
  const rows: ParsedRow[] = [];
  let warning = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (
      /^name\s*,\s*classname\s*,\s*stopname$/i.test(line.replace(/\s+/g, ''))
    ) {
      continue;
    }

    const fields = line.split(',').map((field) => field.trim());
    const nonEmptyFields = fields.filter((field) => field.length > 0);

    if (fields.length !== 3 || nonEmptyFields.length !== 3) {
      warning = true;
      continue;
    }

    rows.push({
      name: fields[0],
      className: fields[1],
      stopName: fields[2],
    });
  }

  return { rows, warning };
}

describe('parseCsv (bulk student import — hand-rolled CSV parser, local copy)', () => {
  test('parses a simple well-formed CSV with header row', () => {
    const text =
      'name,className,stopName\nChidi Okafor, JSS1, Ikoyi Roundabout\nAmina Bello, SS2, Victoria Island Gate';
    const { rows, warning } = parseCsv(text);
    expect(warning).toBe(false);
    expect(rows).toEqual([
      { name: 'Chidi Okafor', className: 'JSS1', stopName: 'Ikoyi Roundabout' },
      { name: 'Amina Bello', className: 'SS2', stopName: 'Victoria Island Gate' },
    ]);
  });

  test('skips the header row case-insensitively', () => {
    const text = 'NAME,CLASSNAME,STOPNAME\nChidi, JSS1, Ikoyi';
    const { rows } = parseCsv(text);
    expect(rows).toEqual([{ name: 'Chidi', className: 'JSS1', stopName: 'Ikoyi' }]);
  });

  test('skips header row regardless of internal whitespace', () => {
    const text = ' Name , ClassName , StopName \nChidi, JSS1, Ikoyi';
    const { rows } = parseCsv(text);
    expect(rows).toEqual([{ name: 'Chidi', className: 'JSS1', stopName: 'Ikoyi' }]);
  });

  test('does not skip a data row that happens to start with "name" as a value', () => {
    // Only an EXACT match of "name,classname,stopname" (after whitespace
    // stripping) is treated as a header. A row like "Name Jr, JSS1, Ikoyi"
    // should NOT match the header regex and should be parsed as data.
    const text = 'Name Jr, JSS1, Ikoyi';
    const { rows, warning } = parseCsv(text);
    expect(warning).toBe(false);
    expect(rows).toEqual([{ name: 'Name Jr', className: 'JSS1', stopName: 'Ikoyi' }]);
  });

  test('skips empty lines', () => {
    const text = 'Chidi, JSS1, Ikoyi\n\n\nAmina, SS2, VI Gate\n';
    const { rows, warning } = parseCsv(text);
    expect(warning).toBe(false);
    expect(rows).toHaveLength(2);
  });

  test('skips lines that are only whitespace', () => {
    const text = 'Chidi, JSS1, Ikoyi\n   \nAmina, SS2, VI Gate';
    const { rows, warning } = parseCsv(text);
    expect(warning).toBe(false);
    expect(rows).toHaveLength(2);
  });

  test('skips a malformed row with too few fields (2 instead of 3) and sets warning', () => {
    const text = 'Chidi, JSS1, Ikoyi\nAmina, SS2';
    const { rows, warning } = parseCsv(text);
    expect(warning).toBe(true);
    expect(rows).toEqual([{ name: 'Chidi', className: 'JSS1', stopName: 'Ikoyi' }]);
  });

  test('skips a malformed row with too many fields (4 instead of 3) and sets warning', () => {
    const text = 'Chidi, JSS1, Ikoyi\nAmina, SS2, VI Gate, Extra';
    const { rows, warning } = parseCsv(text);
    expect(warning).toBe(true);
    expect(rows).toEqual([{ name: 'Chidi', className: 'JSS1', stopName: 'Ikoyi' }]);
  });

  test('skips a row with an empty field among 3 comma-separated fields and sets warning', () => {
    // "Chidi,,Ikoyi" splits into 3 fields but the middle one is empty.
    const text = 'Chidi,,Ikoyi';
    const { rows, warning } = parseCsv(text);
    expect(warning).toBe(true);
    expect(rows).toEqual([]);
  });

  test('skips a row that is only commas (3 empty fields) and sets warning', () => {
    const text = ',,';
    const { rows, warning } = parseCsv(text);
    expect(warning).toBe(true);
    expect(rows).toEqual([]);
  });

  test('trims whitespace around each field', () => {
    const text = '  Chidi Okafor  ,   JSS1  ,  Ikoyi Roundabout  ';
    const { rows } = parseCsv(text);
    expect(rows).toEqual([
      { name: 'Chidi Okafor', className: 'JSS1', stopName: 'Ikoyi Roundabout' },
    ]);
  });

  test('handles Windows-style CRLF line endings', () => {
    const text = 'Chidi, JSS1, Ikoyi\r\nAmina, SS2, VI Gate\r\n';
    const { rows, warning } = parseCsv(text);
    expect(warning).toBe(false);
    expect(rows).toHaveLength(2);
  });

  test('returns warning=false when there are no malformed rows at all', () => {
    const text = 'Chidi, JSS1, Ikoyi\nAmina, SS2, VI Gate';
    const { warning } = parseCsv(text);
    expect(warning).toBe(false);
  });

  test('returns empty rows array and warning=false for an empty file', () => {
    const { rows, warning } = parseCsv('');
    expect(rows).toEqual([]);
    expect(warning).toBe(false);
  });

  test('returns empty rows array for a file containing only the header row', () => {
    const { rows, warning } = parseCsv('name,className,stopName');
    expect(rows).toEqual([]);
    expect(warning).toBe(false);
  });

  test('a partial success scenario: some valid rows mixed with malformed ones', () => {
    const text = [
      'name,className,stopName',
      'Chidi Okafor, JSS1, Ikoyi Roundabout',
      'BadRow, OnlyTwoFields',
      'Amina Bello, SS2, Victoria Island Gate',
      ',,',
      'Tunde Lawal, JSS3, Lekki Phase 1',
    ].join('\n');
    const { rows, warning } = parseCsv(text);
    expect(warning).toBe(true);
    expect(rows).toEqual([
      { name: 'Chidi Okafor', className: 'JSS1', stopName: 'Ikoyi Roundabout' },
      { name: 'Amina Bello', className: 'SS2', stopName: 'Victoria Island Gate' },
      { name: 'Tunde Lawal', className: 'JSS3', stopName: 'Lekki Phase 1' },
    ]);
  });

  test('does not handle quoted fields containing commas (documented limitation)', () => {
    // A field like "Lagos, Nigeria" wrapped in quotes will be split on its
    // internal comma, producing more than 3 fields and triggering a warning.
    // This is an explicit, documented spec decision (no quoting support).
    const text = 'Chidi, JSS1, "Ikoyi, Lagos"';
    const { rows, warning } = parseCsv(text);
    expect(warning).toBe(true);
    expect(rows).toEqual([]);
  });
});
