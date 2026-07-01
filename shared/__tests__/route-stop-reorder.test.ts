// Tests the pure stop-list reordering/sequence-recalculation logic embedded
// inline in web/app/dashboard/routes/new/page.tsx (handleRemoveStop, handleDrop).
//
// IMPORTANT: web/ has no test runner installed (no jest/vitest/testing-library
// in web/package.json — confirmed via Read, same known gap flagged in prior
// features' test-results.md). This logic is NOT exported from the page file
// (it operates on local component state via setStops/rebuildMarkers), so it
// cannot be imported directly. Per the page's source (read directly), the
// logic is reproduced verbatim below as standalone pure functions operating
// on a plain array, with the exact same array methods/semantics:
//
//   function handleRemoveStop(index: number) {
//     const updatedStops = stops
//       .filter((_, i) => i !== index)
//       .map((stop, i) => ({ ...stop, sequence: i }));
//     setStops(updatedStops);
//     rebuildMarkers(updatedStops);
//   }
//
//   function handleDrop(index: number) {
//     const draggedIndex = draggedIndexRef.current;
//     draggedIndexRef.current = null;
//     if (draggedIndex === null || draggedIndex === index) return;
//
//     const updated = [...stops];
//     const [moved] = updated.splice(draggedIndex, 1);
//     updated.splice(index, 0, moved);
//     const resequenced = updated.map((stop, i) => ({ ...stop, sequence: i }));
//     setStops(resequenced);
//     rebuildMarkers(resequenced);
//   }
//
// If this logic is ever edited in the page file without updating this copy,
// this test will silently drift — see .pipeline/test-results.md "Coverage
// gaps" for this caveat (same caveat pattern as bus-form-schema.test.ts).

type StopDraft = {
  name: string;
  latitude: number;
  longitude: number;
  sequence: number;
  etaMinutes?: number;
};

function removeStop(stops: StopDraft[], index: number): StopDraft[] {
  return stops
    .filter((_, i) => i !== index)
    .map((stop, i) => ({ ...stop, sequence: i }));
}

function dropStop(
  stops: StopDraft[],
  draggedIndex: number | null,
  dropIndex: number,
): StopDraft[] {
  if (draggedIndex === null || draggedIndex === dropIndex) return stops;

  const updated = [...stops];
  const [moved] = updated.splice(draggedIndex, 1);
  updated.splice(dropIndex, 0, moved);
  return updated.map((stop, i) => ({ ...stop, sequence: i }));
}

function makeStop(name: string, sequence: number): StopDraft {
  return { name, latitude: 6.5, longitude: 3.4, sequence };
}

describe('removeStop (route stop list — remove + resequence)', () => {
  test('removes the stop at the given index', () => {
    const stops = [makeStop('A', 0), makeStop('B', 1), makeStop('C', 2)];
    const result = removeStop(stops, 1);
    expect(result.map((s) => s.name)).toEqual(['A', 'C']);
  });

  test('recalculates sequence numbers to be 0-based and contiguous after removal', () => {
    const stops = [makeStop('A', 0), makeStop('B', 1), makeStop('C', 2)];
    const result = removeStop(stops, 0);
    expect(result.map((s) => s.sequence)).toEqual([0, 1]);
    expect(result.map((s) => s.name)).toEqual(['B', 'C']);
  });

  test('removing the last stop results in an empty list', () => {
    const stops = [makeStop('A', 0)];
    const result = removeStop(stops, 0);
    expect(result).toEqual([]);
  });

  test('removing the last item in a multi-item list resequences correctly', () => {
    const stops = [makeStop('A', 0), makeStop('B', 1), makeStop('C', 2)];
    const result = removeStop(stops, 2);
    expect(result.map((s) => s.sequence)).toEqual([0, 1]);
    expect(result.map((s) => s.name)).toEqual(['A', 'B']);
  });

  test('does not mutate the original array', () => {
    const stops = [makeStop('A', 0), makeStop('B', 1)];
    const original = [...stops];
    removeStop(stops, 0);
    expect(stops).toEqual(original);
  });
});

describe('dropStop (route stop list — drag/drop reorder + resequence)', () => {
  test('moves a stop from an earlier index to a later index', () => {
    const stops = [makeStop('A', 0), makeStop('B', 1), makeStop('C', 2)];
    const result = dropStop(stops, 0, 2);
    expect(result.map((s) => s.name)).toEqual(['B', 'C', 'A']);
  });

  test('moves a stop from a later index to an earlier index', () => {
    const stops = [makeStop('A', 0), makeStop('B', 1), makeStop('C', 2)];
    const result = dropStop(stops, 2, 0);
    expect(result.map((s) => s.name)).toEqual(['C', 'A', 'B']);
  });

  test('recalculates sequence numbers to be 0-based after reorder', () => {
    const stops = [makeStop('A', 0), makeStop('B', 1), makeStop('C', 2)];
    const result = dropStop(stops, 0, 2);
    expect(result.map((s) => s.sequence)).toEqual([0, 1, 2]);
  });

  test('dropping on the same index as the dragged item is a no-op', () => {
    const stops = [makeStop('A', 0), makeStop('B', 1), makeStop('C', 2)];
    const result = dropStop(stops, 1, 1);
    expect(result).toBe(stops); // same reference — function returns early
  });

  test('a null draggedIndex (no drag in progress) is a no-op', () => {
    const stops = [makeStop('A', 0), makeStop('B', 1)];
    const result = dropStop(stops, null, 0);
    expect(result).toBe(stops);
  });

  test('moving adjacent items swaps their relative order', () => {
    const stops = [makeStop('A', 0), makeStop('B', 1)];
    const result = dropStop(stops, 0, 1);
    expect(result.map((s) => s.name)).toEqual(['B', 'A']);
  });

  test('does not mutate the original array', () => {
    const stops = [makeStop('A', 0), makeStop('B', 1), makeStop('C', 2)];
    const original = stops.map((s) => ({ ...s }));
    dropStop(stops, 0, 2);
    expect(stops).toEqual(original);
  });

  test('reordering a single-item list is a no-op (same index)', () => {
    const stops = [makeStop('A', 0)];
    const result = dropStop(stops, 0, 0);
    expect(result).toBe(stops);
  });
});

describe('removeStop + dropStop combined (simulating realistic UI sequences)', () => {
  test('remove then reorder produces correct final sequence', () => {
    let stops = [
      makeStop('A', 0),
      makeStop('B', 1),
      makeStop('C', 2),
      makeStop('D', 3),
    ];
    stops = removeStop(stops, 1); // remove B -> [A, C, D] seq [0,1,2]
    expect(stops.map((s) => s.name)).toEqual(['A', 'C', 'D']);

    stops = dropStop(stops, 2, 0); // move D to front -> [D, A, C]
    expect(stops.map((s) => s.name)).toEqual(['D', 'A', 'C']);
    expect(stops.map((s) => s.sequence)).toEqual([0, 1, 2]);
  });
});
