const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

export type GeoSuggestion = { placeName: string; lat: number; lng: number };

export function hasMapboxToken(): boolean {
  return Boolean(MAPBOX_TOKEN);
}

/**
 * Address autocomplete via the Mapbox Geocoding API — the same provider the
 * edge functions geocode with, so an admin-picked pickup pin matches the
 * coordinates the server would have resolved. Biased to Lagos and restricted
 * to Nigeria, which is where OSM's own labels fall short (hence Mapbox for the
 * pin, OSM only for the base-map tiles).
 *
 * Each feature already carries its center, so selecting a suggestion needs no
 * second "retrieve" round-trip (unlike Google's toPlace().fetchFields()).
 */
export async function mapboxSuggest(
  input: string,
  signal?: AbortSignal,
): Promise<GeoSuggestion[]> {
  if (!MAPBOX_TOKEN || input.trim().length < 3) return [];
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(input)}.json` +
    `?access_token=${MAPBOX_TOKEN}&autocomplete=true&country=ng&limit=5` +
    `&proximity=3.3792,6.5244&language=en`;
  try {
    const resp = await fetch(url, { signal });
    if (!resp.ok) return [];
    const json = await resp.json();
    return ((json.features ?? []) as Array<{ place_name: string; center: [number, number] }>).map(
      (f) => ({ placeName: f.place_name, lng: f.center[0], lat: f.center[1] }),
    );
  } catch {
    return [];
  }
}

/**
 * One-shot geocode of a free-typed address (no suggestion picked) — returns the
 * best match's coordinates, or null. Used as a fallback so we still end up with
 * a map-verified pin.
 */
export async function geocodeAddress(
  address: string,
): Promise<{ lat: number; lng: number } | null> {
  const [first] = await mapboxSuggest(address);
  return first ? { lat: first.lat, lng: first.lng } : null;
}
