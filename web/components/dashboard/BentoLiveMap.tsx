'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { RotateCcw } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { hasGoogleMapsToken, loadGoogleMaps } from '@/lib/google-maps';

type ActiveBusPosition = {
  busId: string;
  plateNumber: string;
  routeName: string;
  lat: number;
  lng: number;
  lastUpdateTime: number;
};

function relativeTime(timestamp: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

function svgIconUrl(svg: string): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function schoolIconUrl(): string {
  return svgIconUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">
      <rect x="1" y="1" width="28" height="28" rx="8" fill="#0C1E3D" />
      <g transform="translate(7,6)" stroke="#FFC900" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" fill="none">
        <path d="M0 7l8-6.2 8 6.2v9.4a1.8 1.8 0 0 1-1.8 1.8H1.8A1.8 1.8 0 0 1 0 16.4z" />
        <path d="M5.4 17.6v-8h5.2v8" />
      </g>
    </svg>`);
}

function busIconUrl(): string {
  return svgIconUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="14" fill="#FFC900" />
      <g transform="translate(9,9)" stroke="#0C1E3D" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none">
        <rect x="0" y="2" width="14" height="9" rx="2" />
        <path d="M0 7h14" />
        <circle cx="3.5" cy="12.5" r="1.2" fill="#0C1E3D" stroke="none" />
        <circle cx="10.5" cy="12.5" r="1.2" fill="#0C1E3D" stroke="none" />
      </g>
    </svg>`);
}

const DEFAULT_CENTER = { lat: 6.5244, lng: 3.3792 };

export function BentoLiveMap({
  schoolLat,
  schoolLng,
  schoolAddress,
}: {
  schoolLat?: number | null;
  schoolLng?: number | null;
  schoolAddress?: string | null;
}) {
  const hasSchoolLocation = typeof schoolLat === 'number' && typeof schoolLng === 'number';
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const [buses, setBuses] = useState<ActiveBusPosition[]>([]);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [relativeLabel, setRelativeLabel] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);

  const loadBusPositions = useCallback(async () => {
    const supabase = createClient();
    const { data: activeTrips } = await supabase
      .from('trips')
      .select('id, bus_id, bus:buses(plate_number), route:routes(name)')
      .eq('status', 'ACTIVE');

    if (!activeTrips || activeTrips.length === 0) {
      setBuses([]);
      setLastUpdated(Date.now());
      setIsLoading(false);
      return;
    }

    const positions: ActiveBusPosition[] = [];

    await Promise.all(
      activeTrips.map(async (trip) => {
        const busField = trip.bus as unknown;
        const routeField = trip.route as unknown;
        const bus = Array.isArray(busField) ? busField[0] : busField;
        const route = Array.isArray(routeField) ? routeField[0] : routeField;

        const supabase2 = createClient();
        const { data: location } = await supabase2
          .from('trip_locations')
          .select('latitude, longitude, recorded_at')
          .eq('trip_id', trip.id)
          .order('recorded_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (location) {
          positions.push({
            busId: trip.bus_id as string,
            plateNumber: (bus as { plate_number: string } | null)?.plate_number ?? '—',
            routeName: (route as { name: string } | null)?.name ?? '—',
            lat: location.latitude,
            lng: location.longitude,
            lastUpdateTime: new Date(location.recorded_at).getTime(),
          });
        }
      }),
    );

    setBuses(positions);
    setLastUpdated(Date.now());
    setIsLoading(false);
  }, []);

  // Initialize map
  useEffect(() => {
    if (!hasGoogleMapsToken() || !mapContainerRef.current) return;
    let cancelled = false;
    let schoolMarker: google.maps.Marker | null = null;

    loadGoogleMaps().then((google) => {
      if (cancelled || !mapContainerRef.current) return;

      const center = hasSchoolLocation
        ? { lat: schoolLat as number, lng: schoolLng as number }
        : DEFAULT_CENTER;

      const map = new google.maps.Map(mapContainerRef.current, {
        center,
        zoom: hasSchoolLocation ? 13 : 11,
        disableDefaultUI: true,
        zoomControl: true,
        styles: [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }],
      });

      mapRef.current = map;

      if (hasSchoolLocation) {
        const infoWindow = new google.maps.InfoWindow({
          content: `<div style="font-family: inherit; font-size: 12px; padding: 2px 0;">
            <div style="font-weight: 700; color: #0A0A0A;">School</div>
            ${schoolAddress ? `<div style="color: #6B6B6B; margin-top: 2px;">${schoolAddress}</div>` : ''}
          </div>`,
        });
        schoolMarker = new google.maps.Marker({
          position: { lat: schoolLat as number, lng: schoolLng as number },
          map,
          icon: { url: schoolIconUrl(), scaledSize: new google.maps.Size(30, 30) },
        });
        schoolMarker.addListener('click', () => infoWindow.open({ map, anchor: schoolMarker! }));
      }

      setMapReady(true);
    });

    const currentMarkers = markersRef.current;

    return () => {
      cancelled = true;
      currentMarkers.forEach((m) => m.setMap(null));
      markersRef.current = [];
      schoolMarker?.setMap(null);
      mapRef.current = null;
    };
  }, [hasSchoolLocation, schoolLat, schoolLng, schoolAddress]);

  // Place markers when buses data changes
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    buses.forEach((bus) => {
      const infoWindow = new google.maps.InfoWindow({
        content: `<div style="font-family: inherit; font-size: 12px; padding: 2px 0;">
          <div style="font-weight: 700; color: #0A0A0A;">${bus.plateNumber}</div>
          <div style="color: #6B6B6B; margin-top: 2px;">${bus.routeName}</div>
          <div style="color: #6B6B6B; margin-top: 1px; font-size: 11px;">${relativeTime(bus.lastUpdateTime)}</div>
        </div>`,
      });

      const marker = new google.maps.Marker({
        position: { lat: bus.lat, lng: bus.lng },
        map,
        icon: { url: busIconUrl(), scaledSize: new google.maps.Size(32, 32) },
      });
      marker.addListener('click', () => infoWindow.open({ map, anchor: marker }));

      markersRef.current.push(marker);
    });
  }, [buses, mapReady]);

  // Relative time label update
  useEffect(() => {
    if (!lastUpdated) return;

    function update() {
      if (!lastUpdated) return;
      setRelativeLabel(relativeTime(lastUpdated));
    }

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [lastUpdated]);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const { data: activeTrips } = await supabase
        .from('trips')
        .select('id, bus_id, bus:buses(plate_number), route:routes(name)')
        .eq('status', 'ACTIVE');

      if (!activeTrips || activeTrips.length === 0) {
        if (!cancelled) {
          setBuses([]);
          setLastUpdated(Date.now());
          setIsLoading(false);
        }
        return;
      }

      const positions: ActiveBusPosition[] = [];

      await Promise.all(
        activeTrips.map(async (trip) => {
          const busField = trip.bus as unknown;
          const routeField = trip.route as unknown;
          const bus = Array.isArray(busField) ? busField[0] : busField;
          const route = Array.isArray(routeField) ? routeField[0] : routeField;

          const supabase2 = createClient();
          const { data: location } = await supabase2
            .from('trip_locations')
            .select('latitude, longitude, recorded_at')
            .eq('trip_id', trip.id)
            .order('recorded_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (location) {
            positions.push({
              busId: trip.bus_id as string,
              plateNumber: (bus as { plate_number: string } | null)?.plate_number ?? '—',
              routeName: (route as { name: string } | null)?.name ?? '—',
              lat: location.latitude,
              lng: location.longitude,
              lastUpdateTime: new Date(location.recorded_at).getTime(),
            });
          }
        }),
      );

      if (!cancelled) {
        setBuses(positions);
        setLastUpdated(Date.now());
        setIsLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="bg-surface shadow-[var(--shadow-card)] rounded-[var(--radius-card)] overflow-hidden hover:shadow-[var(--shadow-float)] hover:-translate-y-0.5 transition-all duration-200">
      {/* Card header */}
      <div className="p-4 pb-0 flex items-center justify-between">
        <span className="text-[14px] font-semibold text-ink">Live Map</span>
        <div className="flex items-center gap-3">
          {!isLoading && (
            <div className="flex items-center gap-1.5">
              <span className="w-[6px] h-[6px] rounded-full bg-green animate-pulse-dot" aria-hidden />
              <span className="text-[12px] font-medium text-green">
                {buses.length} {buses.length === 1 ? 'bus' : 'buses'} tracking
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={loadBusPositions}
            className="flex items-center gap-1 text-[12px] text-sub hover:text-ink transition-colors duration-100 border border-rule rounded-[var(--radius-btn)] px-2 py-1"
            aria-label="Refresh bus positions"
          >
            <RotateCcw size={12} />
            Refresh
          </button>
        </div>
      </div>

      {/* Map container */}
      <div className="relative mt-3">
        {hasGoogleMapsToken() ? (
          <div ref={mapContainerRef} className="h-[340px] w-full" />
        ) : (
          <div className="h-[340px] w-full bg-canvas flex items-center justify-center">
            <p className="text-xs text-sub">Map preview requires a Google Maps token</p>
          </div>
        )}

        {/* Last updated pill */}
        {lastUpdated && (
          <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur rounded-[var(--radius-chip)] px-3 py-1.5 shadow-[var(--shadow-float)]">
            <span className="board-figure text-[11px] text-sub">
              Last updated {relativeLabel}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
