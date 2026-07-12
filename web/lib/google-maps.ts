'use client';

import { useEffect, useState } from 'react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';

const GOOGLE_MAPS_TOKEN = process.env.NEXT_PUBLIC_GOOGLEMAP_TOKEN;

let optionsSet = false;
let loadPromise: Promise<typeof google> | null = null;

export function hasGoogleMapsToken(): boolean {
  return Boolean(GOOGLE_MAPS_TOKEN);
}

export function loadGoogleMaps(): Promise<typeof google> {
  if (!optionsSet) {
    setOptions({ key: GOOGLE_MAPS_TOKEN ?? '', v: 'weekly' });
    optionsSet = true;
  }
  if (!loadPromise) {
    // importLibrary attaches its exports onto the global `google.maps` namespace
    // as a side effect, so once both libraries resolve, window.google is fully populated.
    loadPromise = Promise.all([importLibrary('maps'), importLibrary('places')]).then(
      () => window.google,
    );
  }
  return loadPromise;
}

export function useGoogleMapsLoaded(): boolean {
  const [loaded, setLoaded] = useState(
    () => typeof window !== 'undefined' && !!(window as any).google?.maps?.places,
  );
  useEffect(() => {
    if (loaded) return;
    loadGoogleMaps().then(() => setLoaded(true)).catch(() => {});
  }, [loaded]);
  return loaded;
}

// Best-effort geocode via Places Text Search (new API, no billing gate) —
// used as a fallback when an address is typed without picking an autocomplete
// suggestion, so we still end up with coordinates that exist on the map.
export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    await loadGoogleMaps();
    const g = (window as any).google;
    const { places } = await g.maps.places.Place.searchByText({
      textQuery: `${address}, Nigeria`,
      fields: ['location'],
      maxResultCount: 1,
    });
    if (places?.[0]?.location) {
      return { lat: places[0].location.lat(), lng: places[0].location.lng() };
    }
    return null;
  } catch {
    return null;
  }
}
