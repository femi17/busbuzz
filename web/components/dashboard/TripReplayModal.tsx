'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Play, Pause, X, RotateCcw, MapPin } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { hasGoogleMapsToken, loadGoogleMaps } from '@/lib/google-maps';
import type { TripReplayData, TripReplayPoint } from '../../../shared/types';

const SPEEDS = [30, 60, 120, 300] as const; // playback multipliers (× real time)

function svgIconUrl(svg: string): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function busIconUrl(): string {
  return svgIconUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34">
      <circle cx="17" cy="17" r="15" fill="#FFC900" stroke="#0A0E19" stroke-width="2"/>
      <g transform="translate(9.5,10)" stroke="#0A0E19" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none">
        <rect x="0" y="2" width="15" height="9.5" rx="2"/>
        <path d="M0 7.2h15"/>
        <circle cx="3.7" cy="13" r="1.3" fill="#0A0E19" stroke="none"/>
        <circle cx="11.3" cy="13" r="1.3" fill="#0A0E19" stroke="none"/>
      </g>
    </svg>`);
}

function stopDot(visited: boolean): string {
  const fill = visited ? '#FFC900' : '#FFFFFF';
  const ring = visited ? '#0A0E19' : '#9AA3B2';
  return svgIconUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="6" fill="${fill}" stroke="${ring}" stroke-width="2"/>
    </svg>`);
}

function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

// Bus position at time t (ms since start), linearly interpolated between breadcrumbs.
function positionAt(points: TripReplayPoint[], t: number): { lat: number; lng: number } | null {
  if (points.length === 0) return null;
  if (t <= points[0].t) return { lat: points[0].lat, lng: points[0].lng };
  const last = points[points.length - 1];
  if (t >= last.t) return { lat: last.lat, lng: last.lng };
  // Binary search for the segment containing t.
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = points[lo];
  const b = points[hi];
  const span = b.t - a.t || 1;
  const f = (t - a.t) / span;
  return { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f };
}

const statusMeta: Record<string, { label: string; dot: string; text: string }> = {
  BOARDED: { label: 'Boarded', dot: 'bg-green', text: 'text-green' },
  DROPPED_OFF: { label: 'Dropped off', dot: 'bg-navy', text: 'text-navy' },
  ABSENT: { label: 'Absent', dot: 'bg-red', text: 'text-red' },
};

export function TripReplayModal({
  tripId,
  onClose,
}: {
  tripId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<TripReplayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackMs, setPlaybackMs] = useState(0);
  const [speed, setSpeed] = useState<number>(60);
  const [mounted, setMounted] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const busMarkerRef = useRef<google.maps.Marker | null>(null);
  const stopMarkersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const traveledRef = useRef<google.maps.Polyline | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const playbackRef = useRef(0);
  const eventLogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setMounted(true), []);

  // Fetch replay payload.
  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/get-trip-replay?tripId=${tripId}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            },
          },
        );
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? 'Failed to load trip replay');
        }
        const body = await res.json();
        if (!ignore) {
          setData(body.data as TripReplayData);
          setLoading(false);
        }
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : 'Failed to load trip replay');
          setLoading(false);
        }
      }
    })();
    return () => { ignore = true; };
  }, [tripId]);

  // Close on Escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === ' ' && data && data.points.length > 0) {
        e.preventDefault();
        setIsPlaying((p) => !p);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, data]);

  // Initialise the map once data + container are ready.
  useEffect(() => {
    if (!data || data.points.length === 0 || !mapContainerRef.current || !hasGoogleMapsToken()) return;
    let cancelled = false;

    loadGoogleMaps().then((google) => {
      if (cancelled || !mapContainerRef.current) return;

      const bounds = new google.maps.LatLngBounds();
      data.points.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
      data.stops.forEach((s) => bounds.extend({ lat: s.lat, lng: s.lng }));

      const map = new google.maps.Map(mapContainerRef.current, {
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'greedy',
        backgroundColor: '#0A0E19',
        styles: [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }],
      });
      map.fitBounds(bounds, 48);
      mapRef.current = map;

      // Full recorded route (faint), then the traveled portion drawn in amber on top.
      new google.maps.Polyline({
        path: data.points.map((p) => ({ lat: p.lat, lng: p.lng })),
        map,
        strokeColor: '#9AA3B2',
        strokeOpacity: 0.55,
        strokeWeight: 4,
      });
      traveledRef.current = new google.maps.Polyline({
        path: [],
        map,
        strokeColor: '#FFC900',
        strokeOpacity: 1,
        strokeWeight: 5,
      });

      data.stops.forEach((s) => {
        const marker = new google.maps.Marker({
          position: { lat: s.lat, lng: s.lng },
          map,
          icon: { url: stopDot(false), scaledSize: new google.maps.Size(16, 16), anchor: new google.maps.Point(8, 8) },
          title: s.name,
          zIndex: 1,
        });
        stopMarkersRef.current.set(s.id, marker);
      });

      const start = data.points[0];
      busMarkerRef.current = new google.maps.Marker({
        position: { lat: start.lat, lng: start.lng },
        map,
        icon: { url: busIconUrl(), scaledSize: new google.maps.Size(34, 34), anchor: new google.maps.Point(17, 17) },
        zIndex: 999,
      });
    });

    const stopMarkers = stopMarkersRef.current;
    return () => {
      cancelled = true;
      busMarkerRef.current?.setMap(null);
      busMarkerRef.current = null;
      traveledRef.current?.setMap(null);
      traveledRef.current = null;
      stopMarkers.forEach((m) => m.setMap(null));
      stopMarkers.clear();
      mapRef.current = null;
    };
  }, [data]);

  // Sync map visuals to the current playback time.
  const syncVisuals = useCallback((t: number) => {
    if (!data) return;
    const pos = positionAt(data.points, t);
    if (pos && busMarkerRef.current) busMarkerRef.current.setPosition(pos);
    if (traveledRef.current) {
      const traveled = data.points.filter((p) => p.t <= t).map((p) => ({ lat: p.lat, lng: p.lng }));
      if (pos) traveled.push(pos);
      traveledRef.current.setPath(traveled);
    }
    data.stops.forEach((s) => {
      const marker = stopMarkersRef.current.get(s.id);
      if (!marker) return;
      const visited = s.arrivedT !== null && s.arrivedT <= t;
      marker.setIcon({
        url: stopDot(visited),
        scaledSize: new google.maps.Size(visited ? 20 : 16, visited ? 20 : 16),
        anchor: new google.maps.Point(visited ? 10 : 8, visited ? 10 : 8),
      });
    });
  }, [data]);

  useEffect(() => { syncVisuals(playbackMs); }, [playbackMs, syncVisuals]);

  // Playback clock.
  useEffect(() => {
    if (!isPlaying || !data) return;
    lastTsRef.current = null;
    function frame(ts: number) {
      if (lastTsRef.current === null) lastTsRef.current = ts;
      const deltaReal = ts - lastTsRef.current;
      lastTsRef.current = ts;
      const next = Math.min(data!.durationMs, playbackRef.current + deltaReal * speed);
      playbackRef.current = next;
      setPlaybackMs(next);
      if (next >= data!.durationMs) {
        setIsPlaying(false);
        return;
      }
      rafRef.current = requestAnimationFrame(frame);
    }
    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, speed, data]);

  const handlePlayPause = () => {
    if (!data) return;
    if (playbackRef.current >= data.durationMs) {
      playbackRef.current = 0;
      setPlaybackMs(0);
    }
    setIsPlaying((p) => !p);
  };

  const handleRestart = () => {
    playbackRef.current = 0;
    setPlaybackMs(0);
    setIsPlaying(true);
  };

  const seek = (fraction: number) => {
    if (!data) return;
    const t = Math.max(0, Math.min(1, fraction)) * data.durationMs;
    playbackRef.current = t;
    setPlaybackMs(t);
  };

  const passedEvents = useMemo(
    () => (data ? data.events.filter((e) => e.t <= playbackMs) : []),
    [data, playbackMs],
  );
  const latestEvent = passedEvents[passedEvents.length - 1] ?? null;

  // Auto-scroll the event log to the latest passed event.
  useEffect(() => {
    if (eventLogRef.current) {
      eventLogRef.current.scrollTop = eventLogRef.current.scrollHeight;
    }
  }, [passedEvents.length]);

  const progress = data && data.durationMs > 0 ? playbackMs / data.durationMs : 0;

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-6"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative flex w-full max-w-5xl flex-col overflow-hidden rounded-[20px] bg-night shadow-[0_40px_100px_-30px_rgba(0,0,0,0.85)] h-[88vh] max-h-[820px]">
        <div aria-hidden className="h-1.5 hazard-stripe shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-white/[0.07]">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-amber">Trip Replay</p>
            {data ? (
              <h2 className="font-heading font-bold text-[17px] tracking-tight text-white truncate">
                {data.busPlateNumber} · {data.routeName}
              </h2>
            ) : (
              <h2 className="font-heading font-bold text-[17px] tracking-tight text-white">Loading…</h2>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full p-2 text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close replay"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col lg:flex-row min-h-0 flex-1">
          {/* Map */}
          <div className="relative flex-1 min-h-[300px] lg:min-h-0 bg-night-2">
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/40 animate-pulse">Loading breadcrumbs…</p>
              </div>
            ) : error ? (
              <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
                <p className="text-sm text-red">{error}</p>
              </div>
            ) : !hasGoogleMapsToken() ? (
              <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
                <p className="text-sm text-white/50">Replay map needs a Google Maps token.</p>
              </div>
            ) : data && data.points.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
                <MapPin size={30} strokeWidth={1.4} className="text-white/30" />
                <p className="text-sm text-white/60">No GPS breadcrumbs were recorded for this trip.</p>
              </div>
            ) : null}

            <div ref={mapContainerRef} className="h-full w-full" />

            {/* Live event toast */}
            {latestEvent && (
              <div className="absolute left-3 top-3 max-w-[80%] rounded-[12px] bg-black/70 backdrop-blur px-3.5 py-2.5 border border-white/10">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${statusMeta[latestEvent.status]?.dot ?? 'bg-white'}`} />
                  <span className="text-[13px] font-semibold text-white">{latestEvent.studentName}</span>
                </div>
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-white/55">
                  {statusMeta[latestEvent.status]?.label ?? latestEvent.status} · {clock(latestEvent.t)}
                </p>
              </div>
            )}

            {/* Elapsed clock */}
            {data && data.points.length > 0 && (
              <div className="absolute right-3 top-3 rounded-[10px] bg-black/60 backdrop-blur px-3 py-1.5 border border-white/10">
                <span className="board-figure text-[13px] font-semibold text-amber">{clock(playbackMs)}</span>
                <span className="board-figure text-[11px] text-white/45"> / {clock(data.durationMs)}</span>
              </div>
            )}
          </div>

          {/* Event timeline */}
          <div className="lg:w-[260px] shrink-0 border-t lg:border-t-0 lg:border-l border-white/[0.07] flex flex-col min-h-0">
            <div className="px-4 py-2.5 border-b border-white/[0.07]">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">Pickups & drop-offs</p>
            </div>
            <div ref={eventLogRef} className="flex-1 overflow-y-auto px-3 py-2 max-h-[160px] lg:max-h-none">
              {data && data.events.length === 0 ? (
                <p className="px-1 py-3 text-[12px] text-white/40">No attendance was marked on this trip.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {(data?.events ?? []).map((e, i) => {
                    const passed = e.t <= playbackMs;
                    const meta = statusMeta[e.status];
                    return (
                      <li
                        key={`${e.studentId}-${i}`}
                        className={`flex items-center gap-2.5 rounded-[8px] px-2 py-1.5 transition-all duration-300 ${passed ? 'bg-white/[0.06]' : 'opacity-40'}`}
                      >
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${meta?.dot ?? 'bg-white'}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[12.5px] font-medium text-white truncate">{e.studentName}</p>
                          <p className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-white/40">{meta?.label ?? e.status}</p>
                        </div>
                        <span className="board-figure text-[11px] text-white/45">{clock(e.t)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Transport controls */}
        {data && data.points.length > 0 && (
          <div className="border-t border-white/[0.07] px-4 py-3 flex items-center gap-3">
            <button
              type="button"
              onClick={handlePlayPause}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber text-navy hover:brightness-110 active:scale-95 transition-all"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
            </button>
            <button
              type="button"
              onClick={handleRestart}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Restart"
            >
              <RotateCcw size={15} />
            </button>

            {/* Scrubber */}
            <button
              type="button"
              className="relative h-2 flex-1 rounded-full bg-white/10 cursor-pointer group"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                seek((e.clientX - rect.left) / rect.width);
              }}
              aria-label="Seek"
            >
              <span className="absolute inset-y-0 left-0 rounded-full bg-amber" style={{ width: `${progress * 100}%` }} />
              <span
                className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 -translate-x-1/2 rounded-full bg-white shadow opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ left: `${progress * 100}%` }}
              />
            </button>

            {/* Speed */}
            <div className="flex shrink-0 items-center gap-1">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSpeed(s)}
                  className={`board-figure rounded-[6px] px-2 py-1 text-[11px] font-semibold transition-colors ${speed === s ? 'bg-amber text-navy' : 'text-white/50 hover:text-white hover:bg-white/10'}`}
                >
                  {s}×
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
