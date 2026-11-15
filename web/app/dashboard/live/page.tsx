'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Map as MapLibreMap, Marker, Popup } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { createClient } from '@/lib/supabase';
import { OSM_STYLE } from '@/lib/osm';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { LocationBroadcast } from '../../../../shared/types';

type ActiveTripMarker = {
  tripId: string;
  busId: string;
  plateNumber: string;
  routeName: string;
  routeType: 'MORNING' | 'AFTERNOON';
  studentCount: number;
  startedAt: string;
  lat: number | null;
  lng: number | null;
  speed: number;
  lastUpdateTime: number | null; // Date.now() timestamp of last location_update received
  signalLost: boolean;
  hasLocation: boolean;
};

type TripQueryRow = {
  id: string;
  bus_id: string;
  route_id: string;
  started_at: string;
  bus: { id: string; plate_number: string } | { id: string; plate_number: string }[] | null;
  route: { id: string; name: string; type: 'MORNING' | 'AFTERNOON' } | { id: string; name: string; type: 'MORNING' | 'AFTERNOON' }[] | null;
};

const SIGNAL_LOST_THRESHOLD_MS = 90_000;
const SIGNAL_CHECK_INTERVAL_MS = 10_000;
const ANIMATION_DURATION_MS = 1000;

const COLOR_NORMAL = '#F5A623';
const COLOR_SIGNAL_LOST = '#9CA3AF';

function single<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function relativeTime(timestamp: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function relativeStartedTime(startedAt: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000));
  if (minutes < 60) return `Started ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `Started ${hours}h ago`;
}

function schoolIconUrl(): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">
      <rect x="1" y="1" width="28" height="28" rx="8" fill="#0F2044" />
      <g transform="translate(7,6)" stroke="#FFC900" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" fill="none">
        <path d="M0 7l8-6.2 8 6.2v9.4a1.8 1.8 0 0 1-1.8 1.8H1.8A1.8 1.8 0 0 1 0 16.4z" />
        <path d="M5.4 17.6v-8h5.2v8" />
      </g>
    </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function busIconUrl(color: string): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="15" fill="${color}" stroke="#fff" stroke-width="0" />
      <g transform="translate(9,9)" stroke="#0F2044" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none">
        <rect x="0" y="2" width="14" height="9" rx="2" />
        <path d="M0 7h14" />
        <circle cx="3.5" cy="12.5" r="1.2" fill="#0F2044" stroke="none" />
        <circle cx="10.5" cy="12.5" r="1.2" fill="#0F2044" stroke="none" />
      </g>
    </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

type LatLng = { lat: number; lng: number };

// MapLibre markers are HTML elements — an <img> of the bus icon, recolored by
// swapping its src on signal-lost.
function busMarkerEl(color: string): HTMLImageElement {
  const img = document.createElement('img');
  img.src = busIconUrl(color);
  img.width = 32;
  img.height = 32;
  img.style.cursor = 'pointer';
  img.style.display = 'block';
  return img;
}

function schoolMarkerEl(): HTMLImageElement {
  const img = document.createElement('img');
  img.src = schoolIconUrl();
  img.width = 30;
  img.height = 30;
  img.style.cursor = 'pointer';
  img.style.display = 'block';
  return img;
}

function animateMarker(
  marker: Marker,
  from: LatLng,
  to: LatLng,
  duration: number,
) {
  const start = performance.now();
  function step(now: number) {
    const t = Math.min((now - start) / duration, 1);
    const lat = from.lat + (to.lat - from.lat) * t;
    const lng = from.lng + (to.lng - from.lng) * t;
    marker.setLngLat([lng, lat]);
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

export default function LiveMapPage() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  // The imported maplibre-gl module (default export). Stored so the realtime
  // broadcast callback can new up Marker/Popup without re-importing. Typed
  // loosely because maplibre-gl's default export isn't referenceable as a type
  // expression; the marker/popup instances it creates stay typed via the refs
  // below.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const glRef = useRef<any>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const infoWindowsRef = useRef<Map<string, Popup>>(new Map());
  const channelsRef = useRef<Map<string, RealtimeChannel>>(new Map());
  const tripsRef = useRef<Map<string, ActiveTripMarker>>(new Map());
  const schoolMarkerRef = useRef<Marker | null>(null);

  const [trips, setTrips] = useState<ActiveTripMarker[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [schoolLocation, setSchoolLocation] = useState<LatLng | null>(null);
  const [schoolAddress, setSchoolAddress] = useState<string | null>(null);
  const [schoolResolved, setSchoolResolved] = useState(false);

  const syncTripsState = useCallback(() => {
    setTrips(Array.from(tripsRef.current.values()));
  }, []);

  const updateMarkerVisual = useCallback((trip: ActiveTripMarker) => {
    const marker = markersRef.current.get(trip.busId);
    if (!marker) return;
    (marker.getElement() as HTMLImageElement).src = busIconUrl(
      trip.signalLost ? COLOR_SIGNAL_LOST : COLOR_NORMAL,
    );

    const popup = infoWindowsRef.current.get(trip.busId);
    if (popup) {
      const statusText = trip.signalLost
        ? 'Signal lost'
        : trip.lastUpdateTime
          ? relativeTime(trip.lastUpdateTime)
          : 'Waiting for GPS...';
      popup.setHTML(
        `<div style="font-family: inherit; font-size: 13px;">
          <div style="font-weight: 700; color: #0F2044;">${trip.plateNumber}</div>
          <div style="color: #0F2044; opacity: 0.7;">${trip.routeName}</div>
          <div style="color: ${trip.signalLost ? '#9CA3AF' : '#0F2044'}; opacity: 0.6; margin-top: 2px;">${statusText}</div>
        </div>`,
      );
    }
  }, []);

  const removeTripMarkerAndChannel = useCallback((busId: string, tripId: string) => {
    const marker = markersRef.current.get(busId);
    if (marker) {
      marker.remove();
      markersRef.current.delete(busId);
    }
    infoWindowsRef.current.delete(busId);
    const channel = channelsRef.current.get(busId);
    if (channel) {
      channel.unsubscribe();
      channelsRef.current.delete(busId);
    }
    tripsRef.current.delete(tripId);
  }, []);

  const subscribeToTrip = useCallback(
    (trip: ActiveTripMarker) => {
      if (channelsRef.current.has(trip.busId)) return;
      const supabase = createClient();
      const channel = supabase
        .channel(`bus:${trip.busId}`, { config: { private: true } })
        .on('broadcast', { event: 'location_update' }, (message) => {
          const payload = message.payload as LocationBroadcast;
          const current = tripsRef.current.get(trip.tripId);
          if (!current) return;

          const from: LatLng = {
            lat: current.lat ?? payload.lat,
            lng: current.lng ?? payload.lng,
          };
          const to: LatLng = { lat: payload.lat, lng: payload.lng };

          const updated: ActiveTripMarker = {
            ...current,
            lat: payload.lat,
            lng: payload.lng,
            speed: payload.speed,
            lastUpdateTime: Date.now(),
            signalLost: false,
            hasLocation: true,
          };
          tripsRef.current.set(trip.tripId, updated);

          const map = mapRef.current;
          const maplibregl = glRef.current;
          if (map && maplibregl) {
            let marker = markersRef.current.get(trip.busId);
            if (!marker) {
              const popup = new maplibregl.Popup({ offset: 20, closeButton: false });
              marker = new maplibregl.Marker({ element: busMarkerEl(COLOR_NORMAL), anchor: 'center' })
                .setLngLat([to.lng, to.lat])
                .setPopup(popup)
                .addTo(map) as Marker;
              markersRef.current.set(trip.busId, marker);
              infoWindowsRef.current.set(trip.busId, popup);
            } else {
              animateMarker(marker, from, to, ANIMATION_DURATION_MS);
            }
          }

          updateMarkerVisual(updated);
          syncTripsState();
        })
        .on('broadcast', { event: 'trip_ended' }, () => {
          removeTripMarkerAndChannel(trip.busId, trip.tripId);
          syncTripsState();
        })
        .subscribe((status, err) => {
          if (status === 'CHANNEL_ERROR' && process.env.NODE_ENV === 'development') {
            console.error(`[live-map] Failed to subscribe to bus:${trip.busId}`, err);
          }
        });

      channelsRef.current.set(trip.busId, channel);
    },
    [removeTripMarkerAndChannel, syncTripsState, updateMarkerVisual],
  );

  // Load the school's geocoded address — used as the map's starting point before any bus moves
  useEffect(() => {
    let cancelled = false;
    async function loadSchool() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (!cancelled) setSchoolResolved(true); return; }
      const { data: profile } = await supabase.from('profiles').select('school_id').eq('id', user.id).single();
      if (!profile?.school_id) { if (!cancelled) setSchoolResolved(true); return; }
      const { data: school } = await supabase.from('schools').select('address, latitude, longitude').eq('id', profile.school_id).single();
      if (cancelled) return;
      if (school?.latitude != null && school?.longitude != null) {
        setSchoolLocation({ lat: school.latitude, lng: school.longitude });
      }
      setSchoolAddress(school?.address ?? null);
      setSchoolResolved(true);
    }
    loadSchool();
    return () => { cancelled = true; };
  }, []);

  // Initial map setup — centers on the school until a bus has GPS data to show instead
  useEffect(() => {
    if (!schoolResolved || !mapContainerRef.current) return;
    let cancelled = false;

    (async () => {
      const maplibregl = (await import('maplibre-gl')).default;
      if (cancelled || !mapContainerRef.current) return;
      glRef.current = maplibregl;

      const center = schoolLocation ?? { lat: 6.5244, lng: 3.3792 };
      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: OSM_STYLE,
        center: [center.lng, center.lat],
        zoom: schoolLocation ? 13 : 11,
        attributionControl: false,
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
      mapRef.current = map;

      if (schoolLocation) {
        const popup = new maplibregl.Popup({ offset: 18, closeButton: false }).setHTML(
          `<div style="font-family: inherit; font-size: 12px; padding: 2px 0;">
            <div style="font-weight: 700; color: #0F2044;">School</div>
            ${schoolAddress ? `<div style="color: #6B6B6B; margin-top: 2px;">${schoolAddress}</div>` : ''}
          </div>`,
        );
        schoolMarkerRef.current = new maplibregl.Marker({ element: schoolMarkerEl(), anchor: 'center' })
          .setLngLat([schoolLocation.lng, schoolLocation.lat])
          .setPopup(popup)
          .addTo(map);
      }

      map.on('load', () => {
        if (!cancelled) setMapLoaded(true);
      });
    })();

    const markers = markersRef.current;
    const channels = channelsRef.current;

    return () => {
      cancelled = true;
      markers.forEach((marker) => marker.remove());
      markers.clear();
      channels.forEach((channel) => channel.unsubscribe());
      channels.clear();
      schoolMarkerRef.current?.remove();
      schoolMarkerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [schoolResolved, schoolLocation, schoolAddress]);

  // Initial data fetch
  useEffect(() => {
    let cancelled = false;

    async function loadActiveTrips() {
      const supabase = createClient();

      const { data: tripRows, error: tripsError } = await supabase
        .from('trips')
        .select(
          `
          id,
          bus_id,
          route_id,
          started_at,
          bus:buses(id, plate_number),
          route:routes(id, name, type)
        `,
        )
        .eq('status', 'ACTIVE');

      if (tripsError || !tripRows) {
        if (!cancelled) setLoadError(true);
        return;
      }

      const typedTrips = tripRows as unknown as TripQueryRow[];

      const enriched = await Promise.all(
        typedTrips.map(async (row) => {
          const bus = single(row.bus);
          const route = single(row.route);

          const [locationResult, countResult] = await Promise.all([
            supabase
              .from('trip_locations')
              .select('latitude, longitude, speed, recorded_at')
              .eq('trip_id', row.id)
              .order('recorded_at', { ascending: false })
              .limit(1)
              .maybeSingle(),
            supabase
              .from('students')
              .select('*', { count: 'exact', head: true })
              .eq('route_id', row.route_id)
              .eq('is_active', true),
          ]);

          const location = locationResult.data;
          const studentCount = countResult.count ?? 0;

          const trip: ActiveTripMarker = {
            tripId: row.id,
            busId: row.bus_id,
            plateNumber: bus?.plate_number ?? '—',
            routeName: route?.name ?? '—',
            routeType: route?.type ?? 'MORNING',
            studentCount,
            startedAt: row.started_at,
            lat: location?.latitude ?? null,
            lng: location?.longitude ?? null,
            speed: location?.speed ?? 0,
            lastUpdateTime: location?.recorded_at
              ? new Date(location.recorded_at).getTime()
              : null,
            signalLost: false,
            hasLocation: Boolean(location),
          };

          return trip;
        }),
      );

      if (cancelled) return;

      tripsRef.current = new Map(enriched.map((trip) => [trip.tripId, trip]));
      setTrips(enriched);
    }

    loadActiveTrips().catch(() => {
      if (!cancelled) setLoadError(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Place initial markers once map has loaded and trips are fetched
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;
    const maplibregl = glRef.current;
    if (!maplibregl) return;

    trips.forEach((trip) => {
      if (!trip.hasLocation || trip.lat === null || trip.lng === null) return;
      if (markersRef.current.has(trip.busId)) return;

      const popup = new maplibregl.Popup({ offset: 20, closeButton: false });
      const marker = new maplibregl.Marker({
        element: busMarkerEl(trip.signalLost ? COLOR_SIGNAL_LOST : COLOR_NORMAL),
        anchor: 'center',
      })
        .setLngLat([trip.lng, trip.lat])
        .setPopup(popup)
        .addTo(map);

      markersRef.current.set(trip.busId, marker);
      infoWindowsRef.current.set(trip.busId, popup);
      updateMarkerVisual(trip);
      subscribeToTrip(trip);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded, trips.length]);

  // Subscribe trips that have no location yet (waiting for first GPS ping)
  useEffect(() => {
    trips.forEach((trip) => {
      if (!channelsRef.current.has(trip.busId)) {
        subscribeToTrip(trip);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trips.length]);

  // Signal-lost detection interval
  useEffect(() => {
    const interval = setInterval(() => {
      let changed = false;
      tripsRef.current.forEach((trip, tripId) => {
        if (!trip.lastUpdateTime) return;
        const isStale = Date.now() - trip.lastUpdateTime > SIGNAL_LOST_THRESHOLD_MS;
        if (isStale && !trip.signalLost) {
          const updated = { ...trip, signalLost: true };
          tripsRef.current.set(tripId, updated);
          updateMarkerVisual(updated);
          changed = true;
        } else if (!isStale && trip.signalLost) {
          const updated = { ...trip, signalLost: false };
          tripsRef.current.set(tripId, updated);
          updateMarkerVisual(updated);
          changed = true;
        }
      });
      if (changed) syncTripsState();
    }, SIGNAL_CHECK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [syncTripsState, updateMarkerVisual]);

  const handleTripClick = useCallback((trip: ActiveTripMarker) => {
    const map = mapRef.current;
    if (!map || trip.lat === null || trip.lng === null) return;
    map.easeTo({ center: [trip.lng, trip.lat], zoom: 15 });
  }, []);

  return (
    <div className="-mx-4 -mb-4 lg:-m-6 flex h-[calc(100vh-70px)] lg:h-[calc(100vh-4rem)] flex-col">
      {/* Page header */}
      <div className="shrink-0 border-b border-navy/10 bg-white px-4 py-4 lg:px-6 lg:py-5">
        <DashboardHeader title="Live Map" subtitle="Track every active bus in real time" noMargin />
      </div>

      <div className="flex flex-1 flex-col lg:flex-row overflow-hidden">
        <div className="relative flex-1 min-h-[45%] lg:min-h-0">
          {loadError && (
            <div className="absolute left-0 right-0 top-0 z-10 bg-red-50 px-4 py-3 text-center text-sm font-medium text-red-600">
              Failed to load active trips. Please refresh.
            </div>
          )}
          <div ref={mapContainerRef} className="h-full w-full" />
        </div>

        <div className="w-full lg:w-80 shrink-0 overflow-y-auto border-t lg:border-t-0 lg:border-l border-navy/10 bg-white max-h-[45%] lg:max-h-none">
          <div className="border-b border-navy/10 px-5 py-4">
            <h2 className="text-base font-bold text-navy">
              Active Trips ({trips.length})
            </h2>
          </div>

          {trips.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-navy/50">
              No active trips right now. Trips will appear here when drivers
              start their routes.
            </div>
          ) : (
            <ul className="divide-y divide-navy/5">
              {trips.map((trip) => {
                const dotColor = trip.signalLost
                  ? '#9CA3AF'
                  : trip.hasLocation
                    ? '#22C55E'
                    : '#F5A623';

                return (
                  <li key={trip.tripId}>
                    <button
                      type="button"
                      onClick={() => handleTripClick(trip)}
                      className="flex w-full flex-col gap-1.5 px-5 py-4 text-left transition-colors hover:bg-gray-50"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: dotColor }}
                        />
                        <span className="font-bold text-navy">{trip.plateNumber}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-navy/70">
                        <span>{trip.routeName}</span>
                        <span className="inline-flex rounded-full bg-amber/15 px-2 py-0.5 text-xs font-semibold text-amber-dark">
                          {trip.routeType === 'MORNING' ? 'AM' : 'PM'}
                        </span>
                      </div>
                      <div className="text-xs text-navy/50">
                        {trip.studentCount} students
                      </div>
                      <div className="text-xs text-navy/50">
                        {!trip.hasLocation
                          ? 'Waiting for GPS...'
                          : relativeStartedTime(trip.startedAt)}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
