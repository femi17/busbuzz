// Per-child "route line" color — lets a parent with multiple children tell
// them apart at a glance on the map (icons, pins) without relying on names.
// Purely a local display preference, not a fact about the student, so it's
// stored on-device rather than round-tripped through the backend.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { color } from './theme';

const KEY_PREFIX = '@busbuzz/child-color:';

// Distinct hues, deliberately not reusing routeGreen/stopRed (which already
// carry status meaning elsewhere in the app — "on route" / "stop marker").
export const CHILD_COLOR_PALETTE = [
  color.danfo500, // default — matches the rest of the app for a single child
  '#3B82F6', // sky
  '#8B5CF6', // violet
  '#14B8A6', // teal
  '#EC4899', // rose
  '#F97316', // orange
] as const;

export function getDefaultChildColor(index: number): string {
  return CHILD_COLOR_PALETTE[index % CHILD_COLOR_PALETTE.length];
}

export async function getChildColor(studentId: string, fallbackIndex: number): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(`${KEY_PREFIX}${studentId}`);
    return stored ?? getDefaultChildColor(fallbackIndex);
  } catch {
    return getDefaultChildColor(fallbackIndex);
  }
}

export async function getChildColors(
  studentIds: string[],
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    studentIds.map(async (id, index) => [id, await getChildColor(id, index)] as const),
  );
  return Object.fromEntries(entries);
}

export async function setChildColor(studentId: string, colorHex: string): Promise<void> {
  try {
    await AsyncStorage.setItem(`${KEY_PREFIX}${studentId}`, colorHex);
  } catch {
    // Non-fatal — worst case the picker just doesn't stick this session.
  }
}
