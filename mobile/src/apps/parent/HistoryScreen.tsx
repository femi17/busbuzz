import {
  Camera,
  LineLayer,
  MapView,
  MarkerView,
  PointAnnotation,
  ShapeSource as ShapeSourceComponent,
  StyleURL,
} from '@rnmapbox/maps';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ElementRef,
  type ReactNode,
} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getFirstName } from '../../../../shared/name';
import { supabase } from '../../lib/supabase';
import { ChildSwitcher } from './components/ChildSwitcher';
import { BusIcon, CheckIcon } from './components/Icons';
import { useStudents } from './StudentContext';
import { color, radius, space, type } from './theme';

// @rnmapbox/maps' generated .d.ts for ShapeSource merges two mismatched
// constructor signatures, which breaks JSX prop-checking even for valid
// usage. Re-typing it locally to its actual documented props sidesteps that
// declaration-file bug without loosening anything in our own code.
const ShapeSource = ShapeSourceComponent as unknown as ComponentType<{
  id: string;
  shape: GeoJSON.Feature<GeoJSON.LineString>;
  children?: ReactNode;
}>;

const LAGOS_LAT = 6.5244;
const LAGOS_LNG = 3.3792;
const DEFAULT_ZOOM = 13;

// The whole journey plays back in this many seconds — long enough to watch
// the bus travel, short enough that a parent actually watches it through.
const REPLAY_WALL_MS = 20_000;

type TripRow = {
  id: string;
  busId: string;
  routeId: string;
  startedAt: string;
  endedAt: string | null;
};

// Breadcrumb with trip-relative time (ms since trip start).
type ReplayPoint = {
  lat: number;
  lng: number;
  t: number;
};

// The selected child's own moments on this trip.
type ChildEvent = {
  status: 'BOARDED' | 'DROPPED_OFF' | 'ABSENT';
  t: number;
  clockLabel: string;
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function formatClock(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(startedAt: string, endedAt: string | null): string {
  if (!endedAt) return '—';
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  const minutes = Math.round(ms / 60000);
  return `${minutes} min`;
}

function buildTraceFeature(points: ReplayPoint[]): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: points.map((p) => [p.lng, p.lat]),
    },
  };
}

function getBounds(points: ReplayPoint[]): { ne: [number, number]; sw: [number, number] } {
  let minLat = points[0].lat;
  let maxLat = points[0].lat;
  let minLng = points[0].lng;
  let maxLng = points[0].lng;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }
  return { ne: [maxLng, maxLat], sw: [minLng, minLat] };
}

// Bus position at trip time t, linearly interpolated between breadcrumbs.
function positionAt(points: ReplayPoint[], t: number): { lat: number; lng: number } | null {
  if (points.length === 0) return null;
  if (t <= points[0].t) return { lat: points[0].lat, lng: points[0].lng };
  const last = points[points.length - 1];
  if (t >= last.t) return { lat: last.lat, lng: last.lng };
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

const EVENT_LABEL: Record<ChildEvent['status'], string> = {
  BOARDED: 'Boarded the bus',
  DROPPED_OFF: 'Dropped off',
  ABSENT: 'Marked absent',
};

// Blunt play/pause glyphs built from Views — no icon dependency.
function PlayGlyph({ size = 22, tint = color.ink900 }: { size?: number; tint?: string }) {
  return (
    <View
      style={{
        marginLeft: size * 0.18,
        width: 0,
        height: 0,
        borderTopWidth: size * 0.55,
        borderBottomWidth: size * 0.55,
        borderLeftWidth: size * 0.9,
        borderTopColor: 'transparent',
        borderBottomColor: 'transparent',
        borderLeftColor: tint,
      }}
    />
  );
}

function PauseGlyph({ size = 22, tint = color.ink900 }: { size?: number; tint?: string }) {
  const bar = {
    width: size * 0.28,
    height: size * 1.05,
    borderRadius: size * 0.12,
    backgroundColor: tint,
  } as const;
  return (
    <View style={{ flexDirection: 'row', gap: size * 0.26 }}>
      <View style={bar} />
      <View style={bar} />
    </View>
  );
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const {
    students,
    selectedStudent,
    selectStudent,
    isLoading: isLoadingStudents,
    errorMessage: studentsErrorMessage,
  } = useStudents();

  const [trips, setTrips] = useState<TripRow[]>([]);
  const [isLoadingTrips, setIsLoadingTrips] = useState(true);
  const [tripsErrorMessage, setTripsErrorMessage] = useState<string | null>(null);

  const [selectedTrip, setSelectedTrip] = useState<TripRow | null>(null);
  const [replayPoints, setReplayPoints] = useState<ReplayPoint[]>([]);
  const [childEvents, setChildEvents] = useState<ChildEvent[]>([]);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // Playback clock: progress through the trip, 0..1.
  const [progress, setProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const progressRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const trackWidthRef = useRef(1);

  const cameraRef = useRef<ElementRef<typeof Camera> | null>(null);

  const durationMs = useMemo(() => {
    if (!selectedTrip) return 0;
    if (selectedTrip.endedAt) {
      return Math.max(
        1,
        new Date(selectedTrip.endedAt).getTime() - new Date(selectedTrip.startedAt).getTime(),
      );
    }
    return Math.max(1, replayPoints[replayPoints.length - 1]?.t ?? 1);
  }, [selectedTrip, replayPoints]);

  useEffect(() => {
    let isMounted = true;

    setSelectedTrip(null);
    setReplayPoints([]);
    setChildEvents([]);
    setTrips([]);

    if (!selectedStudent) {
      setIsLoadingTrips(false);
      return;
    }

    async function load() {
      setIsLoadingTrips(true);
      setTripsErrorMessage(null);

      try {
        if (!selectedStudent!.routeId) {
          if (isMounted) setIsLoadingTrips(false);
          return;
        }

        const { data: tripsData, error: tripsError } = await supabase
          .from('trips')
          .select('id, bus_id, route_id, status, started_at, ended_at')
          .eq('route_id', selectedStudent!.routeId)
          .eq('status', 'COMPLETED')
          .order('started_at', { ascending: false })
          .limit(50);

        if (tripsError) {
          if (isMounted) setTripsErrorMessage('Could not load trip history. Try again.');
          return;
        }

        if (isMounted) {
          setTrips(
            (tripsData ?? []).map((t) => ({
              id: t.id,
              busId: t.bus_id,
              routeId: t.route_id,
              startedAt: t.started_at,
              endedAt: t.ended_at,
            })),
          );
        }
      } catch {
        if (isMounted) setTripsErrorMessage('Something went wrong. Try again.');
      } finally {
        if (isMounted) setIsLoadingTrips(false);
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [selectedStudent]);

  // Fit the camera to the whole journey once its trace is loaded.
  useEffect(() => {
    if (replayPoints.length > 1) {
      const { ne, sw } = getBounds(replayPoints);
      cameraRef.current?.fitBounds(ne, sw, 56, 0);
    }
  }, [replayPoints]);

  // The playback engine: real time → trip time, driven by rAF while playing.
  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }
    lastTsRef.current = null;

    function frame(ts: number) {
      if (lastTsRef.current === null) lastTsRef.current = ts;
      const delta = ts - lastTsRef.current;
      lastTsRef.current = ts;
      const next = Math.min(1, progressRef.current + delta / REPLAY_WALL_MS);
      progressRef.current = next;
      setProgress(next);
      if (next >= 1) {
        setIsPlaying(false);
        return;
      }
      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying]);

  const openReplay = useCallback(
    async (trip: TripRow) => {
      setSelectedTrip(trip);
      setIsLoadingDetail(true);
      setReplayPoints([]);
      setChildEvents([]);
      progressRef.current = 0;
      setProgress(0);
      setIsPlaying(false);

      try {
        const startMs = new Date(trip.startedAt).getTime();

        const [locationsRes, attendanceRes] = await Promise.all([
          supabase
            .from('trip_locations')
            .select('latitude, longitude, recorded_at')
            .eq('trip_id', trip.id)
            .order('recorded_at'),
          selectedStudent
            ? supabase
                .from('attendance')
                .select('status, marked_at')
                .eq('trip_id', trip.id)
                .eq('student_id', selectedStudent.id)
            : Promise.resolve({ data: [], error: null }),
        ]);

        if (!locationsRes.error && locationsRes.data) {
          setReplayPoints(
            locationsRes.data.map((d) => ({
              lat: d.latitude,
              lng: d.longitude,
              t: new Date(d.recorded_at).getTime() - startMs,
            })),
          );
        }

        if (!attendanceRes.error && attendanceRes.data) {
          setChildEvents(
            (attendanceRes.data as Array<{ status: ChildEvent['status']; marked_at: string }>)
              .map((a) => ({
                status: a.status,
                t: new Date(a.marked_at).getTime() - startMs,
                clockLabel: formatClock(a.marked_at),
              }))
              .sort((a, b) => a.t - b.t),
          );
        }

        // Journeys are best experienced in motion — start rolling right away.
        setIsPlaying(true);
      } finally {
        setIsLoadingDetail(false);
      }
    },
    [selectedStudent],
  );

  function closeReplay() {
    setIsPlaying(false);
    setSelectedTrip(null);
    setReplayPoints([]);
    setChildEvents([]);
    progressRef.current = 0;
    setProgress(0);
  }

  function togglePlay() {
    if (progressRef.current >= 1) {
      progressRef.current = 0;
      setProgress(0);
      setIsPlaying(true);
      return;
    }
    setIsPlaying((p) => !p);
  }

  function seekToFraction(fraction: number) {
    const clamped = Math.max(0, Math.min(1, fraction));
    progressRef.current = clamped;
    setProgress(clamped);
  }

  const routeName = selectedStudent?.routeName ?? '';
  const childFirstName = selectedStudent
    ? getFirstName(selectedStudent.name) || selectedStudent.name
    : '';

  if (isLoadingStudents) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading…</Text>
      </SafeAreaView>
    );
  }

  if (studentsErrorMessage) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <Text style={styles.errorText}>{studentsErrorMessage}</Text>
      </SafeAreaView>
    );
  }

  // ── Replay view ──────────────────────────────────────────────
  if (selectedTrip) {
    const tripT = progress * durationMs;
    const busPos = positionAt(replayPoints, tripT);
    const traveled = replayPoints.filter((p) => p.t <= tripT);
    if (busPos && traveled.length > 0) traveled.push({ ...busPos, t: tripT } as ReplayPoint);
    const startPoint = replayPoints[0];
    const endPoint = replayPoints[replayPoints.length - 1];
    const playheadClock = formatClock(
      new Date(new Date(selectedTrip.startedAt).getTime() + tripT).toISOString(),
    );

    return (
      <View style={styles.container}>
        {/* Full-bleed map — same peace-of-mind surface as Track, with the
            deck floating over it rather than a flush bottom sheet. */}
        <View style={StyleSheet.absoluteFill}>
          <MapView
            style={StyleSheet.absoluteFill}
            styleURL={StyleURL.Street}
            attributionEnabled={false}
            logoEnabled={false}
          >
            <Camera
              ref={cameraRef}
              defaultSettings={{
                centerCoordinate: [
                  startPoint?.lng ?? LAGOS_LNG,
                  startPoint?.lat ?? LAGOS_LAT,
                ],
                zoomLevel: DEFAULT_ZOOM,
              }}
            />

            {/* Full journey — faint, so the traveled portion reads as progress */}
            {replayPoints.length > 1 ? (
              <ShapeSource id="replay-full" shape={buildTraceFeature(replayPoints)}>
                <LineLayer
                  id="replay-full-line"
                  style={{
                    lineColor: color.mist400,
                    lineOpacity: 0.5,
                    lineWidth: 4,
                    lineCap: 'round',
                    lineJoin: 'round',
                  }}
                />
              </ShapeSource>
            ) : null}

            {/* Traveled so far — the danfo-yellow playback trail */}
            {traveled.length > 1 ? (
              <ShapeSource id="replay-traveled" shape={buildTraceFeature(traveled)}>
                <LineLayer
                  id="replay-traveled-line"
                  style={{
                    lineColor: color.danfo500,
                    lineWidth: 5,
                    lineCap: 'round',
                    lineJoin: 'round',
                  }}
                />
              </ShapeSource>
            ) : null}

            {startPoint ? (
              <PointAnnotation
                id="replay-start"
                coordinate={[startPoint.lng, startPoint.lat]}
              >
                <View style={[styles.endpointDot, { backgroundColor: color.routeGreen }]} />
              </PointAnnotation>
            ) : null}
            {replayPoints.length > 1 && endPoint ? (
              <PointAnnotation id="replay-end" coordinate={[endPoint.lng, endPoint.lat]}>
                <View style={[styles.endpointDot, { backgroundColor: color.stopRed }]} />
              </PointAnnotation>
            ) : null}

            {/* Where this child's own moments happened along the road */}
            {childEvents.map((event, i) => {
              const pos = positionAt(replayPoints, event.t);
              if (!pos || event.status === 'ABSENT') return null;
              const passed = event.t <= tripT;
              return (
                <PointAnnotation
                  key={`event-${i}`}
                  id={`replay-event-${i}`}
                  coordinate={[pos.lng, pos.lat]}
                >
                  <View style={[styles.eventPin, passed && styles.eventPinPassed]}>
                    <CheckIcon size={11} color={passed ? color.ink900 : color.mist400} />
                  </View>
                </PointAnnotation>
              );
            })}

            {/* The bus, riding the trail */}
            {busPos ? (
              <MarkerView coordinate={[busPos.lng, busPos.lat]} allowOverlap>
                <View style={styles.busMarker}>
                  <BusIcon size={18} color={color.ink900} />
                </View>
              </MarkerView>
            ) : null}
          </MapView>

          <Pressable
            style={[styles.backButton, { top: insets.top + space.sm }]}
            onPress={closeReplay}
          >
            <Text style={styles.backButtonText}>← Back</Text>
          </Pressable>

          {/* Playhead wall-clock — what time it was at this point of the run */}
          <View style={[styles.clockPill, { top: insets.top + space.sm }]}>
            <Text style={styles.clockPillText}>{playheadClock}</Text>
          </View>

          {isLoadingDetail ? (
            <View style={styles.detailLoading}>
              <ActivityIndicator color={color.danfo500} size="large" />
            </View>
          ) : null}
        </View>

        {/* Replay deck — floats over the map exactly like Track's tracking
            card: white, fully rounded, soft shadow, margin on every side. */}
        <View style={[styles.deck, { bottom: insets.bottom + space.md }]}>
          <View style={styles.deckHead}>
            <View style={styles.deckHeadText}>
              <Text style={styles.deckDate}>{formatDate(selectedTrip.startedAt)}</Text>
              <Text style={styles.deckRoute} numberOfLines={1}>
                {routeName} · {formatDuration(selectedTrip.startedAt, selectedTrip.endedAt)}
              </Text>
            </View>
            <View style={styles.deckBadge}>
              <Text style={styles.deckBadgeText}>REPLAY</Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* This child's moments, lighting up as the playhead passes them */}
          {childEvents.length > 0 ? (
            <View style={styles.eventRow}>
              {childEvents.map((event, i) => {
                const passed = event.t <= tripT;
                return (
                  <View
                    key={i}
                    style={[styles.eventChip, passed && styles.eventChipPassed]}
                  >
                    <View
                      style={[
                        styles.eventChipDot,
                        passed &&
                          (event.status === 'ABSENT'
                            ? styles.eventChipDotRed
                            : styles.eventChipDotGreen),
                      ]}
                    />
                    <Text style={[styles.eventChipText, passed && styles.eventChipTextPassed]}>
                      {childFirstName} · {EVENT_LABEL[event.status]} · {event.clockLabel}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={styles.eventEmpty}>
              No boarding record for {childFirstName} on this trip.
            </Text>
          )}

          <View style={styles.divider} />

          {/* Transport controls */}
          <View style={styles.controlsRow}>
            <Pressable
              onPress={togglePlay}
              accessibilityRole="button"
              accessibilityLabel={isPlaying ? 'Pause replay' : 'Play replay'}
              style={({ pressed }) => [styles.playButton, pressed && styles.playButtonPressed]}
            >
              {isPlaying ? <PauseGlyph size={16} /> : <PlayGlyph size={16} />}
            </Pressable>

            <Pressable
              style={styles.progressTrack}
              onLayout={(e) => {
                trackWidthRef.current = Math.max(1, e.nativeEvent.layout.width);
              }}
              onPress={(e) => seekToFraction(e.nativeEvent.locationX / trackWidthRef.current)}
              accessibilityRole="adjustable"
              accessibilityLabel="Replay position"
            >
              <View style={styles.progressRail} />
              <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
              <View style={[styles.progressKnob, { left: `${progress * 100}%` }]} />
            </Pressable>

            <Text style={styles.timeLabel}>
              {formatClock(selectedTrip.startedAt)}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  // ── Trip list ────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerEyebrow}>Journey replays</Text>
        <Text style={styles.headerTitle}>{routeName || 'All trips'}</Text>
        <Text style={styles.headerSub}>
          Watch how {childFirstName ? `${childFirstName}'s` : 'each'} school run played out.
        </Text>

        {students.length > 1 ? (
          <View style={styles.headerSwitcher}>
            <ChildSwitcher
              students={students}
              selectedId={selectedStudent?.id ?? null}
              onSelect={selectStudent}
              variant="dark"
            />
          </View>
        ) : null}
      </View>

      {isLoadingTrips ? (
        <View style={styles.listLoadingWrap}>
          <ActivityIndicator color={color.danfo500} />
        </View>
      ) : tripsErrorMessage ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateTitle}>Couldn't load trips</Text>
          <Text style={styles.emptyStateText}>{tripsErrorMessage}</Text>
        </View>
      ) : trips.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateTitle}>No journeys yet</Text>
          <Text style={styles.emptyStateText}>
            Once your child's first trip finishes, you can replay it here.
          </Text>
        </View>
      ) : (
        <FlatList<TripRow>
          data={trips}
          keyExtractor={(item: TripRow) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }: { item: TripRow }) => (
            <Pressable
              style={({ pressed }) => [styles.tripRow, pressed && styles.tripRowPressed]}
              onPress={() => openReplay(item)}
              accessibilityRole="button"
              accessibilityLabel={`Replay trip from ${formatDate(item.startedAt)}`}
            >
              <View style={styles.tripPlay}>
                <PlayGlyph size={13} tint={color.ink900} />
              </View>
              <View style={styles.tripRowBody}>
                <View style={styles.tripRowTop}>
                  <Text style={styles.tripDate}>{formatDate(item.startedAt)}</Text>
                  <Text style={styles.tripDuration}>
                    {formatClock(item.startedAt)} · {formatDuration(item.startedAt, item.endedAt)}
                  </Text>
                </View>
                <Text style={styles.tripRouteName}>{routeName}</Text>
                <Text style={styles.tripReplayCue}>▶ Watch replay</Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.paper50,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.paper50,
  },
  loadingText: {
    color: color.ledger400,
    fontSize: 16,
  },
  errorText: {
    color: color.ledger400,
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  // Header
  header: {
    backgroundColor: color.ink900,
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
    paddingBottom: space.xl,
  },
  headerEyebrow: {
    ...type.eyebrow,
    color: color.danfo500,
    marginBottom: 2,
  },
  headerTitle: {
    color: color.white,
    fontSize: 22,
    fontWeight: '800',
  },
  headerSub: {
    color: color.mist400,
    fontSize: 13,
    marginTop: 3,
  },
  headerSwitcher: {
    marginTop: space.lg,
  },
  // Trip list
  listContent: {
    padding: space.lg,
  },
  listLoadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xxl,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: color.ledger700,
    marginBottom: space.xs,
  },
  emptyStateText: {
    color: color.ledger400,
    fontSize: 14,
    textAlign: 'center',
  },
  tripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.white,
    borderRadius: radius.md,
    marginBottom: space.md,
    padding: space.lg,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  tripRowPressed: {
    opacity: 0.85,
  },
  tripPlay: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: color.danfo500,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.lg,
  },
  tripRowBody: {
    flex: 1,
  },
  tripRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tripDate: {
    fontSize: 15,
    fontWeight: '700',
    color: color.ledger700,
  },
  tripDuration: {
    ...type.data,
    fontSize: 12.5,
    color: color.ledger400,
  },
  tripRouteName: {
    fontSize: 13,
    color: color.ledger400,
    marginTop: 2,
  },
  tripReplayCue: {
    fontSize: 12,
    fontWeight: '800',
    color: color.danfo600,
    marginTop: space.sm,
    letterSpacing: 0.3,
  },
  // Replay view
  backButton: {
    position: 'absolute',
    left: space.lg,
    backgroundColor: color.white,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  backButtonText: {
    color: color.ink900,
    fontWeight: '700',
  },
  clockPill: {
    position: 'absolute',
    right: space.lg,
    backgroundColor: color.ink900,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
  },
  clockPillText: {
    ...type.data,
    color: color.danfo500,
    fontSize: 14,
    fontWeight: '800',
  },
  detailLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(247,245,240,0.6)',
  },
  endpointDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: color.white,
  },
  eventPin: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: color.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: color.mist400,
  },
  eventPinPassed: {
    backgroundColor: color.danfo500,
    borderColor: color.white,
  },
  busMarker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.danfo500,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: color.white,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
    elevation: 5,
  },
  // Replay deck — floats over the map exactly like Track's tracking card:
  // same radius, shadow, and margins, so the two screens read as one family.
  deck: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    backgroundColor: color.white,
    borderRadius: 24,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.md,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 18,
    elevation: 14,
  },
  divider: {
    height: 1,
    backgroundColor: color.paper100,
    marginVertical: space.md,
  },
  deckHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  deckHeadText: {
    flex: 1,
    marginRight: space.md,
  },
  deckDate: {
    fontSize: 19,
    fontWeight: '800',
    color: color.ledger700,
  },
  deckRoute: {
    fontSize: 13,
    color: color.ledger400,
    marginTop: 2,
  },
  deckBadge: {
    backgroundColor: color.ink900,
    paddingHorizontal: space.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  deckBadgeText: {
    color: color.danfo500,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  eventRow: {
    gap: space.sm,
  },
  eventChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: color.paper50,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    opacity: 0.55,
  },
  eventChipPassed: {
    opacity: 1,
  },
  eventChipDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: color.mist400,
  },
  eventChipDotGreen: {
    backgroundColor: color.routeGreen,
  },
  eventChipDotRed: {
    backgroundColor: color.stopRed,
  },
  eventChipText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: color.ledger400,
    flex: 1,
  },
  eventChipTextPassed: {
    color: color.ledger700,
    fontWeight: '700',
  },
  eventEmpty: {
    fontSize: 13,
    color: color.ledger400,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
  },
  playButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: color.danfo500,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 4,
  },
  playButtonPressed: {
    transform: [{ scale: 0.94 }],
  },
  progressTrack: {
    flex: 1,
    height: 28,
    justifyContent: 'center',
  },
  progressRail: {
    height: 5,
    borderRadius: 2.5,
    backgroundColor: color.paper50,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: color.danfo500,
  },
  progressKnob: {
    position: 'absolute',
    marginLeft: -8,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: color.ink900,
    borderWidth: 3,
    borderColor: color.white,
  },
  timeLabel: {
    ...type.data,
    fontSize: 12.5,
    color: color.ledger400,
  },
});
