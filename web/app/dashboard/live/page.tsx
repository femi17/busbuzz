'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { createClient } from '@/lib/supabase';
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

function createBusElement(color: string): HTMLDivElement {
  const el = document.createElement('div');
  el.style.width = '32px';
  el.style.height = '32px';
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'center';
  el.style.borderRadius = '50%';
  el.style.backgroundColor = color;
  el.style.boxShadow = '0 1px 4px rgba(0,0,0,0.4)';
  el.style.cursor = 'pointer';
  el.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0F2044" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="5" width="18" height="12" rx="2" />
      <path d="M3 11h18" />
      <circle cx="7.5" cy="19" r="1.5" />
      <circle cx="16.5" cy="19" r="1.5" />
    </svg>
  `;
  return el;
}

function animateMarker(
  marker: mapboxgl.Marker,
  from: [number, number],
  to: [number, number],
  duration: number,
) {
  const start = performance.now();
  function step(now: number) {
    const t = Math.min((now - start) / duration, 1);
    const lng = from[0] + (to[0] - from[0]) * t;
    const lat = from[1] + (to[1] - from[1]) * t;
    marker.setLngLat([lng, lat]);
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

export default function LiveMapPage() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const channelsRef = useRef<Map<string, RealtimeChannel>>(new Map());
  const tripsRef = useRef<Map<string, ActiveTripMarker>>(new Map());

  const [trips, setTrips] = useState<ActiveTripMarker[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);

  const syncTripsState = useCallback(() => {
    setTrips(Array.from(tripsRef.current.values()));
  }, []);

  const updateMarkerVisual = useCallback((trip: ActiveTripMarker) => {
    const marker = markersRef.current.get(trip.busId);
    if (!marker) return;
    const el = marker.getElement();
    el.style.backgroundColor = trip.signalLost ? COLOR_SIGNAL_LOST : COLOR_NORMAL;

    const popup = marker.getPopup();
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
        .channel(`bus:${trip.busId}`)
        .on('broadcast', { event: 'location_update' }, (message) => {
          const payload = message.payload as LocationBroadcast;
          const current = tripsRef.current.get(trip.tripId);
          if (!current) return;

          const from: [number, number] = [
            current.lng ?? payload.lng,
            current.lat ?? payload.lat,
          ];
          const to: [number, number] = [payload.lng, payload.lat];

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
          if (map) {
            let marker = markersRef.current.get(trip.busId);
            if (!marker) {
              const el = createBusElement(COLOR_NORMAL);
              const popup = new mapboxgl.Popup({ offset: 18 });
              marker = new mapboxgl.Marker({ element: el })
                .setLngLat(to)
                .setPopup(popup)
                .addTo(map);
              markersRef.current.set(trip.busId, marker);
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

  // Initial map setup
  useEffect(() => {
    if (!mapContainerRef.current) return;

    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [3.3792, 6.5244],
      zoom: 11,
    });

    map.addControl(new mapboxgl.NavigationControl(), 'top-right');

    map.on('load', () => {
      setMapLoaded(true);
    });

    mapRef.current = map;

    const markers = markersRef.current;
    const channels = channelsRef.current;

    return () => {
      markers.forEach((marker) => marker.remove());
      markers.clear();
      channels.forEach((channel) => channel.unsubscribe());
      channels.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

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

    trips.forEach((trip) => {
      if (!trip.hasLocation || trip.lat === null || trip.lng === null) return;
      if (markersRef.current.has(trip.busId)) return;

      const el = createBusElement(trip.signalLost ? COLOR_SIGNAL_LOST : COLOR_NORMAL);
      const popup = new mapboxgl.Popup({ offset: 18 });
      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([trip.lng, trip.lat])
        .setPopup(popup)
        .addTo(map);

      markersRef.current.set(trip.busId, marker);
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
    map.flyTo({ center: [trip.lng, trip.lat], zoom: 15, duration: 1500 });
  }, []);

  return (
    <div className="-m-6 flex h-[calc(100vh-4rem)]">
      <div className="relative flex-1">
        {loadError && (
          <div className="absolute left-0 right-0 top-0 z-10 bg-red-50 px-4 py-3 text-center text-sm font-medium text-red-600">
            Failed to load active trips. Please refresh.
          </div>
        )}
        <div ref={mapContainerRef} className="h-full w-full" />
      </div>

      <div className="w-80 shrink-0 overflow-y-auto border-l border-navy/10 bg-white">
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
  );
}
