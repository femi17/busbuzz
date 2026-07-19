import type { NativeStackScreenProps } from '@react-navigation/native-stack';
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
  Alert,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import * as Location from 'expo-location';

import { haversineDistance } from '../../../../shared/geo';
import type { AttendanceStatus } from '../../../../shared/types';
import { supabase } from '../../lib/supabase';
import { ConfirmDialog } from './components/ConfirmDialog';
import {
  AlertDiamondIcon,
  BusFrontIcon,
  CheckIcon,
} from './components/Icons';
import type { DriverStackParamList } from './DriverApp';
import { stopGPSBroadcast } from './gpsService';
import { color, radius, space } from './theme';

// Synthetic id for the school end of the run — the school is not an authored
// route stop, but the run starts/ends there.
const SCHOOL_STOP_ID = '__school__';
// A stop authored this close to the school IS the school (avoid doubling it).
const SCHOOL_MATCH_RADIUS_M = 200;
// "Back at school" for the auto-end check.
const SCHOOL_ARRIVE_RADIUS_M = 300;
// Pause between finishing one student/stop and auto-advancing to the next —
// long enough to register the checkmark, short enough not to feel stuck.
const AUTO_ADVANCE_DELAY_MS = 650;

// @rnmapbox/maps' generated .d.ts for ShapeSource merges two mismatched
// constructor signatures, which breaks JSX prop-checking even for valid
// usage — same workaround already used in the parent app's HomeScreen.
const ShapeSource = ShapeSourceComponent as unknown as ComponentType<{
  id: string;
  shape: GeoJSON.Feature<GeoJSON.LineString>;
  children?: ReactNode;
}>;

type Props = NativeStackScreenProps<DriverStackParamList, 'Attendance'>;

type AttendanceStudent = DriverStackParamList['Attendance']['students'][number];

type MapPin = {
  id: string;
  lat: number;
  lng: number;
  label: string;
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

function formatDistance(meters: number): string {
  if (meters < 950) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function buildLineFeature(
  points: Array<{ lat: number; lng: number }>,
): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: points.map((p) => [p.lng, p.lat]),
    },
  };
}

export default function AttendanceScreen({ navigation, route }: Props) {
  const {
    tripId,
    stops,
    students,
    busId,
    routeName,
    direction,
    routeType,
    schoolName,
    schoolLat,
    schoolLng,
  } = route.params;
  const insets = useSafeAreaInsets();

  const [currentStopIndex, setCurrentStopIndex] = useState(0);
  const [attendanceMap, setAttendanceMap] = useState<
    Record<string, AttendanceStatus>
  >({});
  const [isSubmitting, setIsSubmitting] = useState<Record<string, boolean>>(
    {},
  );
  const [isLoadingExisting, setIsLoadingExisting] = useState(true);
  const [isEndingTrip, setIsEndingTrip] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [nearSchool, setNearSchool] = useState(false);
  // The bus = this phone. A foreground watcher keeps the marker moving while
  // the screen is open (the background broadcaster serves the parents).
  const [busPosition, setBusPosition] = useState<{ lat: number; lng: number } | null>(null);
  const cameraRef = useRef<ElementRef<typeof Camera> | null>(null);

  // A BOTH route is authored in morning order (homes → school); the afternoon
  // run drives it back, so the stop sequence reverses. Dedicated AFTERNOON
  // routes keep the order the admin authored.
  //
  // The SCHOOL is not an authored street stop — it's synthesized as the run's
  // endpoint: morning = streets are pickups only, then one final
  // "drop everyone at school" phase; afternoon = board everyone at school,
  // then streets are drop-offs. This is what keeps drop-off UI from ever
  // appearing at a street mid-morning. Authored stops that sit at the school
  // (within 200m) are folded into the synthetic one, and street stops with no
  // students riding THIS run are skipped entirely.
  const sortedStops = useMemo(() => {
    const asc = [...stops].sort((a, b) => a.sequence - b.sequence);
    const ordered =
      direction === 'AFTERNOON' && routeType === 'BOTH' ? asc.reverse() : asc;

    const atSchool = (s: { latitude: number; longitude: number }) =>
      schoolLat != null &&
      schoolLng != null &&
      haversineDistance(s.latitude, s.longitude, schoolLat, schoolLng) <=
        SCHOOL_MATCH_RADIUS_M;

    const streets = ordered.filter(
      (stop) =>
        !atSchool(stop) &&
        students.some((s) => s.stopId === stop.id || s.stopId === null),
    );

    const schoolStop = {
      id: SCHOOL_STOP_ID,
      routeId: ordered[0]?.routeId ?? '',
      name: schoolName?.trim() || 'School',
      latitude: schoolLat ?? 0,
      longitude: schoolLng ?? 0,
      sequence: -1,
    };

    return direction === 'MORNING'
      ? [...streets, schoolStop]
      : [schoolStop, ...streets];
  }, [stops, direction, routeType, students, schoolName, schoolLat, schoolLng]);

  const isLastStop = currentStopIndex === sortedStops.length - 1;
  const currentStop = sortedStops[currentStopIndex];
  const nextStop = !isLastStop ? sortedStops[currentStopIndex + 1] : null;

  // Morning: board at every stop, drop everyone at the last (school).
  // Afternoon: board everyone at the first stop (school), drop at each stop after.
  function isBoardStopAt(index: number): boolean {
    return direction === 'MORNING'
      ? index < sortedStops.length - 1
      : index === 0;
  }

  function studentsForStop(index: number): AttendanceStudent[] {
    const stop = sortedStops[index];
    if (!stop) return [];
    // The school end of the run involves every student: morning's last stop
    // drops everyone off; afternoon's first stop boards everyone.
    const isEveryoneStop =
      direction === 'MORNING' ? index === sortedStops.length - 1 : index === 0;
    if (isEveryoneStop) return students;
    return students.filter((s) => s.stopId === stop.id || s.stopId === null);
  }

  // Whether this student needs no further action at the given stop.
  function isDoneAtStop(
    status: AttendanceStatus | undefined,
    boardStop: boolean,
  ): boolean {
    if (!status) return false;
    if (boardStop) return true;
    // Drop stops: a boarded student still needs dropping off.
    return status === 'DROPPED_OFF' || status === 'ABSENT';
  }

  useEffect(() => {
    async function loadExisting() {
      try {
        const { data: existing, error } = await supabase
          .from('attendance')
          .select('student_id, status')
          .eq('trip_id', tripId);

        if (!error && existing) {
          const map: Record<string, AttendanceStatus> = {};
          existing.forEach((row) => {
            map[row.student_id] = row.status as AttendanceStatus;
          });
          setAttendanceMap(map);

          // Determine currentStopIndex: first stop with students still needing action
          let resumeIndex = sortedStops.length - 1;
          for (let i = 0; i < sortedStops.length; i++) {
            const boardStop = isBoardStopAt(i);
            const stopStudents = studentsForStop(i);
            const allDone = stopStudents.every((s) =>
              isDoneAtStop(map[s.id], boardStop),
            );
            if (!allDone) {
              resumeIndex = i;
              break;
            }
            if (i === sortedStops.length - 1) {
              resumeIndex = i;
            }
          }
          setCurrentStopIndex(resumeIndex);
        }
      } finally {
        setIsLoadingExisting(false);
      }
    }

    loadExisting();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  // Follow the phone's own GPS while this screen is up — this is what moves
  // the bus puck and drives the distance readout. Permissions were already
  // granted when the background broadcast started.
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;

    (async () => {
      try {
        const first = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!cancelled) {
          setBusPosition({ lat: first.coords.latitude, lng: first.coords.longitude });
        }
        sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 5000,
            distanceInterval: 15,
          },
          (pos) => {
            if (!cancelled) {
              setBusPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            }
          },
        );
      } catch {
        // No fix — the map still shows stops; the puck appears when GPS returns.
      }
    })();

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, []);

  async function markStudent(
    studentId: string,
    status: AttendanceStatus,
  ): Promise<boolean> {
    setIsSubmitting((prev) => ({ ...prev, [studentId]: true }));

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        Alert.alert('Error', 'Session expired. Please log in again.');
        return false;
      }

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const response = await fetch(
        `${supabaseUrl}/functions/v1/mark-attendance`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ tripId, studentId, status }),
        },
      );

      if (!response.ok) {
        const errJson = await response.json().catch(() => null);
        Alert.alert('Error', errJson?.error ?? 'Failed to mark attendance.');
        return false;
      }

      setAttendanceMap((prev) => ({ ...prev, [studentId]: status }));
      return true;
    } catch {
      Alert.alert('Error', 'Failed to mark attendance.');
      return false;
    } finally {
      setIsSubmitting((prev) => ({ ...prev, [studentId]: false }));
    }
  }

  const [showSosConfirm, setShowSosConfirm] = useState(false);

  async function sendSOS() {
    setShowSosConfirm(false);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) return;

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/sos-alert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ busId }),
      });

      if (response.ok) {
        Alert.alert('SOS sent', 'The school and parents on this route have been alerted.');
      } else {
        Alert.alert('Failed to send SOS. Please call the school directly.');
      }
    } catch {
      Alert.alert('Failed to send SOS. Please call the school directly.');
    }
  }

  async function confirmEndTrip() {
    setIsEndingTrip(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        Alert.alert('Error', 'Session expired. Please log in again.');
        setIsEndingTrip(false);
        return;
      }

      // Anyone still on board is being dropped at the school right now —
      // record it so parents get their "dropped off" moment.
      const stillOnBoard = students.filter(
        (s) => attendanceMap[s.id] === 'BOARDED',
      );
      for (const s of stillOnBoard) {
        await markStudent(s.id, 'DROPPED_OFF');
      }

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/end-trip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ tripId }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => null);
        Alert.alert('Error', errJson?.error ?? 'Failed to end trip.');
        setIsEndingTrip(false);
        return;
      }

      await stopGPSBroadcast();

      navigation.reset({ index: 0, routes: [{ name: 'Today' }] });
    } catch {
      Alert.alert('Error', 'Failed to end trip.');
      setIsEndingTrip(false);
    }
  }

  const isBoardStop = isBoardStopAt(currentStopIndex);
  const currentStopStudents = studentsForStop(currentStopIndex);
  const isSchoolPhase = currentStop?.id === SCHOOL_STOP_ID;
  // The morning run's final phase is a wait-for-arrival + end-trip screen,
  // not a per-student marking screen (nobody needs individually marking —
  // confirmEndTrip sweeps everyone still boarded into DROPPED_OFF).
  const isMorningSchoolWait = isSchoolPhase && direction === 'MORNING';

  // Each student's own street (their assigned stop) — shown at the school
  // boarding phase (afternoon) where the whole bus is listed, so rows aren't
  // all captioned with one street name.
  const stopNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of stops) map.set(s.id, s.name);
    return map;
  }, [stops]);

  // The next student at this stop still needing a mark — the one card shown
  // at a time. Marking them reveals whichever student is next in the same
  // find() call, no extra state needed.
  const activeStudent = isMorningSchoolWait
    ? null
    : currentStopStudents.find(
        (s) => !isDoneAtStop(attendanceMap[s.id], isBoardStop),
      ) ?? null;

  // A synthetic school stop only has real coordinates when the school has
  // been geocoded — guard so (0,0) never leaks onto the map.
  const stopHasCoords = (s: { id: string; latitude: number; longitude: number }) =>
    s.id !== SCHOOL_STOP_ID || (schoolLat != null && schoolLng != null);

  // The road ahead: the bus, then every stop still to visit, in driving
  // order. Drawn as the route line so the driver always sees where the run
  // goes next — the whole reason this screen is a map now.
  const remainingStops = sortedStops.slice(currentStopIndex).filter(stopHasCoords);
  const routeLinePoints = useMemo(() => {
    const pts: Array<{ lat: number; lng: number }> = [];
    if (busPosition) pts.push(busPosition);
    for (const s of remainingStops) pts.push({ lat: s.latitude, lng: s.longitude });
    return pts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busPosition?.lat, busPosition?.lng, currentStopIndex, sortedStops]);

  // Only students with a real saved pickup location get a pin — showing a
  // fallback here (e.g. the school) would send the driver to the wrong door.
  // At the school phase nobody's home pin is relevant any more (they're all
  // already on the bus, or about to board) — show the school itself instead.
  const pickupPins: MapPin[] = isSchoolPhase
    ? schoolLat != null && schoolLng != null
      ? [
          {
            id: SCHOOL_STOP_ID,
            lat: schoolLat,
            lng: schoolLng,
            label: (schoolName?.trim() || 'School')[0]?.toUpperCase() ?? 'S',
          },
        ]
      : []
    : currentStopStudents
        .filter(
          (s): s is AttendanceStudent & { pickupLat: number; pickupLng: number } =>
            s.pickupLat != null && s.pickupLng != null,
        )
        .map((s) => ({
          id: s.id,
          lat: s.pickupLat,
          lng: s.pickupLng,
          label: s.name[0]?.toUpperCase() ?? '?',
        }));

  // Live distance from the bus to the current stop — the number a driver
  // actually wants while rolling.
  const distanceToStop =
    busPosition && currentStop && stopHasCoords(currentStop)
      ? haversineDistance(
          busPosition.lat,
          busPosition.lng,
          currentStop.latitude,
          currentStop.longitude,
        )
      : null;

  // Keep the bus and the current stop framed together, padded clear of the
  // floating card. Re-fits on every fix — the phone is mounted, nobody is
  // pinch-zooming mid-drive.
  useEffect(() => {
    const focus: Array<{ lat: number; lng: number }> = [];
    if (busPosition) focus.push(busPosition);
    if (currentStop && stopHasCoords(currentStop)) {
      focus.push({ lat: currentStop.latitude, lng: currentStop.longitude });
    }
    for (const pin of pickupPins) focus.push({ lat: pin.lat, lng: pin.lng });

    if (focus.length === 0) return;
    if (focus.length === 1) {
      cameraRef.current?.setCamera({
        centerCoordinate: [focus[0].lng, focus[0].lat],
        zoomLevel: 15,
        animationDuration: 600,
      });
      return;
    }

    const lngs = focus.map((p) => p.lng);
    const lats = focus.map((p) => p.lat);
    cameraRef.current?.fitBounds(
      [Math.max(...lngs), Math.max(...lats)],
      [Math.min(...lngs), Math.min(...lats)],
      [110, 60, 340, 60],
      700,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStop?.id, busPosition?.lat, busPosition?.lng]);

  // The trip can end once every student is accounted for (boarded, dropped,
  // or absent) and the driver is at the run's final stop. Students still on
  // board when the trip ends at school are marked DROPPED_OFF automatically —
  // that's what physically happened.
  const pendingDropCount = students.filter(
    (s) => attendanceMap[s.id] === 'BOARDED',
  ).length;
  const allAccounted = students.every((s) => !!attendanceMap[s.id]);
  const canEndTrip = isLastStop && allAccounted;
  // Morning's end trip is additionally gated on GPS proximity — the driver
  // shouldn't be able to tap it until the bus is actually back at school.
  const endTripReady = canEndTrip && (!isMorningSchoolWait || nearSchool);

  // Once every pickup is done on the morning run, the live GPS watcher above
  // doubles as the arrival check: when the bus is back at the school, reveal
  // the end-trip button and pop a one-time confirmation.
  useEffect(() => {
    if (!isMorningSchoolWait || nearSchool) return;
    if (!allAccounted) return;
    if (schoolLat == null || schoolLng == null) return;
    if (!busPosition) return;

    const dist = haversineDistance(
      busPosition.lat,
      busPosition.lng,
      schoolLat,
      schoolLng,
    );
    if (dist <= SCHOOL_ARRIVE_RADIUS_M) {
      setNearSchool(true);
      setShowEndConfirm(true);
    }
  }, [isMorningSchoolWait, nearSchool, allAccounted, schoolLat, schoolLng, busPosition]);

  // Auto-advance: once every student at this stop is marked, move to the
  // next stop on its own — no "next stop" tap required. The morning school
  // phase and the run's last stop are handled by the end-trip flow instead.
  useEffect(() => {
    if (isLoadingExisting) return;
    if (isMorningSchoolWait) return;
    if (isLastStop) return;
    if (activeStudent) return;
    if (currentStopStudents.length === 0) return;

    const timer = setTimeout(() => {
      setCurrentStopIndex((i) => i + 1);
    }, AUTO_ADVANCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [
    isLoadingExisting,
    isMorningSchoolWait,
    isLastStop,
    activeStudent,
    currentStopStudents.length,
  ]);

  const droppedCount = students.filter(
    (s) => attendanceMap[s.id] === 'DROPPED_OFF',
  ).length;
  const boardedCount = students.filter(
    (s) => attendanceMap[s.id] === 'BOARDED',
  ).length;
  const absentCount = students.filter(
    (s) => attendanceMap[s.id] === 'ABSENT',
  ).length;

  if (isLoadingExisting) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={color.danfoDim} />
      </SafeAreaView>
    );
  }

  const markedCount = currentStopStudents.filter((s) => !!attendanceMap[s.id]).length;
  const totalAtStop = currentStopStudents.length;

  // Map camera's very first frame: current stop, else school, else Lagos.
  const initialCenter: [number, number] =
    currentStop && stopHasCoords(currentStop)
      ? [currentStop.longitude, currentStop.latitude]
      : schoolLat != null && schoolLng != null
      ? [schoolLng, schoolLat]
      : [3.3792, 6.5244];

  return (
    <View style={styles.container}>
      <ConfirmDialog
        visible={showSosConfirm}
        title="Send SOS?"
        message="This alerts all school administrators AND every parent on this route, with the bus's current location."
        confirmLabel="SEND SOS"
        destructive
        onCancel={() => setShowSosConfirm(false)}
        onConfirm={sendSOS}
      />

      {/* Fullscreen map — the screen IS the drive. Everything else floats. */}
      <MapView
        style={StyleSheet.absoluteFill}
        styleURL={StyleURL.Street}
        scrollEnabled
        zoomEnabled
        pitchEnabled={false}
        attributionEnabled={false}
        logoEnabled={false}
      >
        <Camera
          ref={cameraRef}
          defaultSettings={{ centerCoordinate: initialCenter, zoomLevel: 14 }}
        />

        {/* The road ahead: bus → current stop → every remaining stop */}
        {routeLinePoints.length > 1 && (
          <ShapeSource id="run-line" shape={buildLineFeature(routeLinePoints)}>
            <LineLayer
              id="run-line-layer"
              style={{
                lineColor: color.danfo,
                lineWidth: 4,
                lineCap: 'round',
                lineJoin: 'round',
                lineDasharray: [0.2, 1.8],
              }}
            />
          </ShapeSource>
        )}

        {/* Upcoming stops after the current one — small waypoints */}
        {remainingStops.slice(1).map((s) => (
          <PointAnnotation key={s.id} id={`waypoint-${s.id}`} coordinate={[s.longitude, s.latitude]}>
            <View style={styles.waypointDot} />
          </PointAnnotation>
        ))}

        {/* The current stop — where the driver is headed right now */}
        {currentStop && stopHasCoords(currentStop) && (
          <PointAnnotation
            key={`current-${currentStop.id}`}
            id="current-stop"
            coordinate={[currentStop.longitude, currentStop.latitude]}
          >
            <View style={styles.currentStopPin}>
              <View style={styles.currentStopPinInner} />
            </View>
          </PointAnnotation>
        )}

        {/* Student doors at the current stop (initial-letter pins) */}
        {pickupPins.map((pin) => (
          <PointAnnotation key={pin.id} id={`pin-${pin.id}`} coordinate={[pin.lng, pin.lat]}>
            <View style={styles.pickupPin}>
              <Text style={styles.pickupPinText}>{pin.label}</Text>
            </View>
          </PointAnnotation>
        ))}

        {/* The bus — this phone, live */}
        {busPosition && (
          <MarkerView
            coordinate={[busPosition.lng, busPosition.lat]}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.busMarker}>
              <BusFrontIcon size={20} color={color.danfo} />
            </View>
          </MarkerView>
        )}
      </MapView>

      {/* Floating top row: stop context pill + SOS */}
      <SafeAreaView edges={['top']} pointerEvents="box-none" style={styles.topOverlay}>
        <View style={styles.topRow} pointerEvents="box-none">
          <View style={styles.stopPill}>
            <Text style={styles.stopPillEyebrow}>
              {isMorningSchoolWait
                ? 'FINAL STOP'
                : `STOP ${currentStopIndex + 1} OF ${sortedStops.length}${
                    totalAtStop > 0 ? ` · ${markedCount}/${totalAtStop} MARKED` : ''
                  }`}
            </Text>
            <Text style={styles.stopPillName} numberOfLines={1}>
              {currentStop?.name}
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.sosDiamond, pressed && styles.pressed]}
            onPress={() => setShowSosConfirm(true)}
            accessibilityLabel="Send SOS alert"
          >
            <AlertDiamondIcon size={20} color={color.stopRed} />
          </Pressable>
        </View>
      </SafeAreaView>

      {/* Floating action card — the single working surface. One primary action. */}
      <View style={[styles.card, { bottom: insets.bottom + space.md }]}>
        {/* Distance readout — how far to the door the bus is heading for */}
        {distanceToStop !== null && !nearSchool && (
          <View style={styles.distanceRow}>
            <View style={styles.distanceDot} />
            <Text style={styles.distanceText}>
              {formatDistance(distanceToStop)} to {currentStop?.name}
            </Text>
          </View>
        )}

        {isMorningSchoolWait ? (
          <>
            <View style={styles.sheetHeadRow}>
              <View style={styles.sheetHeadIcon}>
                <BusFrontIcon size={22} color={color.ink} />
              </View>
              <View style={styles.sheetHeadMeta}>
                <Text style={styles.sheetHeadTitle}>
                  {nearSchool ? "You're back at school" : 'Heading to school'}
                </Text>
                <Text style={styles.sheetHeadSub} numberOfLines={2}>
                  {nearSchool
                    ? 'End the trip to notify parents their children are in school.'
                    : `End the trip once you're back at ${schoolName?.trim() || 'the school'}.`}
                </Text>
              </View>
            </View>
            <View style={styles.sheetStatRow}>
              <View style={styles.sheetStat}>
                <Text style={styles.sheetStatValue}>{boardedCount}</Text>
                <Text style={styles.sheetStatLabel}>On board</Text>
              </View>
              <View style={styles.sheetStatDivider} />
              <View style={styles.sheetStat}>
                <Text style={[styles.sheetStatValue, absentCount > 0 && styles.statValueRed]}>
                  {absentCount}
                </Text>
                <Text style={styles.sheetStatLabel}>Absent</Text>
              </View>
            </View>
          </>
        ) : activeStudent ? (
          <>
            <View style={styles.studentRow}>
              {activeStudent.photoUrl ? (
                <Image source={{ uri: activeStudent.photoUrl }} style={styles.studentPhoto} />
              ) : (
                <View style={[styles.studentPhoto, styles.studentPhotoFallback]}>
                  <Text style={styles.studentPhotoInitials}>
                    {getInitials(activeStudent.name)}
                  </Text>
                </View>
              )}
              <View style={styles.studentMeta}>
                <Text style={styles.studentAction}>
                  {isBoardStop ? 'Board' : 'Drop off'}
                </Text>
                <Text style={styles.studentName} numberOfLines={1}>
                  {activeStudent.name}
                </Text>
                <Text style={styles.studentSub} numberOfLines={1}>
                  {activeStudent.className}
                  {isSchoolPhase && activeStudent.stopId && stopNameById.get(activeStudent.stopId)
                    ? ` · ${stopNameById.get(activeStudent.stopId)}`
                    : ''}
                </Text>
              </View>
            </View>

            <Pressable
              style={({ pressed }) => [styles.activePrimary, pressed && styles.pressed]}
              onPress={() =>
                markStudent(activeStudent.id, isBoardStop ? 'BOARDED' : 'DROPPED_OFF')
              }
              disabled={!!isSubmitting[activeStudent.id]}
              accessibilityRole="button"
              accessibilityLabel={`Mark ${activeStudent.name} ${isBoardStop ? 'boarded' : 'dropped off'}`}
            >
              {isSubmitting[activeStudent.id] ? (
                <ActivityIndicator color={color.white} />
              ) : (
                <>
                  <CheckIcon size={20} color={color.white} />
                  <Text style={styles.activePrimaryText}>
                    {isBoardStop ? 'BOARDED' : 'DROPPED OFF'}
                  </Text>
                </>
              )}
            </Pressable>
            {/* A student already on the bus can't be absent — only offer it
                while they still haven't boarded. */}
            {attendanceMap[activeStudent.id] !== 'BOARDED' && (
              <Pressable
                style={({ pressed }) => [styles.activeSecondary, pressed && styles.pressed]}
                onPress={() => markStudent(activeStudent.id, 'ABSENT')}
                disabled={!!isSubmitting[activeStudent.id]}
                accessibilityRole="button"
                accessibilityLabel={`Mark ${activeStudent.name} absent`}
              >
                <Text style={styles.activeSecondaryText}>ABSENT</Text>
              </Pressable>
            )}
          </>
        ) : (
          <View style={styles.stopDoneRow}>
            <CheckIcon size={20} color={color.routeGreen} />
            <Text style={styles.stopDoneText}>Stop complete</Text>
          </View>
        )}

        {isLastStop ? (
          <Pressable
            style={({ pressed }) => [
              styles.endTripButton,
              !endTripReady && styles.endTripButtonDisabled,
              pressed && endTripReady && styles.ctaPressed,
            ]}
            onPress={() => setShowEndConfirm(true)}
            disabled={!endTripReady || isEndingTrip}
            accessibilityRole="button"
            accessibilityLabel="End trip"
          >
            <BusFrontIcon size={22} color={endTripReady ? color.white : color.sub} />
            <Text style={[styles.endTripButtonText, !endTripReady && styles.endTripButtonTextDim]}>
              {isMorningSchoolWait && !nearSchool ? 'ARRIVING…' : 'END TRIP'}
            </Text>
          </Pressable>
        ) : (
          <View style={styles.nextStopPreview}>
            <Text style={styles.nextStopPreviewLabel}>Next stop</Text>
            <Text style={styles.nextStopPreviewName} numberOfLines={1}>
              {nextStop?.name ?? '—'}
            </Text>
          </View>
        )}
      </View>

      {/* End-trip confirmation — a designed summary sheet, not a bare alert */}
      <Modal
        visible={showEndConfirm}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!isEndingTrip) setShowEndConfirm(false);
        }}
      >
        <View style={styles.sheetOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              if (!isEndingTrip) setShowEndConfirm(false);
            }}
          />
          <View style={styles.endSheet}>
            <View style={styles.endSheetStripe}>
              {Array.from({ length: 12 }).map((_, i) => (
                <View key={i} style={styles.endSheetStripeSegment} />
              ))}
            </View>
            <View style={styles.sheetGrabber} />

            <View style={styles.endIconRing}>
              <BusFrontIcon size={30} color={color.stopRed} />
            </View>

            <Text style={styles.endTitle}>End this trip?</Text>
            <Text style={styles.endSub}>
              {routeName} · {direction === 'MORNING' ? 'Morning run' : 'Afternoon run'}
            </Text>

            <View style={styles.endStatRow}>
              <View style={styles.endStat}>
                <Text style={styles.endStatValue}>{droppedCount}</Text>
                <Text style={styles.endStatLabel}>Dropped off</Text>
              </View>
              <View style={styles.endStatDivider} />
              <View style={styles.endStat}>
                <Text style={[styles.endStatValue, absentCount > 0 && styles.statValueRed]}>
                  {absentCount}
                </Text>
                <Text style={styles.endStatLabel}>Absent</Text>
              </View>
              <View style={styles.endStatDivider} />
              <View style={styles.endStat}>
                <Text style={styles.endStatValue}>{students.length}</Text>
                <Text style={styles.endStatLabel}>Students</Text>
              </View>
            </View>

            <Text style={styles.endNote}>
              {pendingDropCount > 0
                ? `${pendingDropCount} student${pendingDropCount === 1 ? '' : 's'} still on board will be marked dropped off at ${schoolName?.trim() || 'school'}. GPS tracking stops and the trip is marked complete.`
                : 'GPS tracking stops and the trip is marked complete.'}
            </Text>

            <Pressable
              style={({ pressed }) => [styles.endConfirmButton, pressed && styles.ctaPressed]}
              onPress={confirmEndTrip}
              disabled={isEndingTrip}
              accessibilityRole="button"
              accessibilityLabel="Confirm end trip"
            >
              {isEndingTrip ? (
                <ActivityIndicator color={color.white} />
              ) : (
                <Text style={styles.endConfirmText}>YES, END TRIP</Text>
              )}
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.endCancelButton, pressed && styles.pressed]}
              onPress={() => setShowEndConfirm(false)}
              disabled={isEndingTrip}
            >
              <Text style={styles.endCancelText}>Keep driving</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.canvas,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.canvas,
  },
  pressed: {
    opacity: 0.85,
  },
  // ── Map elements ──────────────────────────────────────────
  waypointDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: color.white,
    borderWidth: 3,
    borderColor: color.ink,
  },
  currentStopPin: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: color.danfo,
    borderWidth: 3,
    borderColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentStopPinInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: color.ink,
  },
  pickupPin: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: color.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: color.ink,
  },
  pickupPinText: {
    color: color.ink,
    fontWeight: '800',
    fontSize: 12,
  },
  busMarker: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: color.danfo,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
    elevation: 6,
  },
  // ── Floating top overlay ──────────────────────────────────
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 2,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
  },
  stopPill: {
    flex: 1,
    minWidth: 0,
    backgroundColor: color.ink,
    borderRadius: radius.lg,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm + 4,
    borderBottomWidth: 3,
    borderBottomColor: color.danfo,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 8,
  },
  stopPillEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    color: color.danfo,
    fontVariant: ['tabular-nums'],
  },
  stopPillName: {
    fontSize: 18,
    fontWeight: '800',
    color: color.white,
    marginTop: 1,
  },
  sosDiamond: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: color.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 8,
  },
  // ── Floating action card ──────────────────────────────────
  card: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    backgroundColor: color.surface,
    borderRadius: 24,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.md,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 20,
    elevation: 14,
  },
  distanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginBottom: space.sm + 2,
  },
  distanceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: color.routeGreen,
  },
  distanceText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: color.sub,
    fontVariant: ['tabular-nums'],
  },
  // Stop-complete transition row (between auto-advances)
  stopDoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingVertical: space.xl,
  },
  stopDoneText: {
    fontSize: 15,
    fontWeight: '700',
    color: color.sub,
  },
  // Student row — photo beside name, not a tall centered column
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  studentPhoto: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    borderColor: color.danfo,
    backgroundColor: color.canvas,
  },
  studentPhotoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  studentPhotoInitials: {
    color: color.ink,
    fontWeight: '800',
    fontSize: 22,
  },
  studentMeta: {
    flex: 1,
    minWidth: 0,
  },
  studentAction: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: color.sub,
  },
  studentName: {
    fontSize: 22,
    fontWeight: '800',
    color: color.ink,
    marginTop: 1,
  },
  studentSub: {
    fontSize: 13,
    fontWeight: '600',
    color: color.sub,
    marginTop: 1,
  },
  // Morning school-wait content inside the card
  sheetHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  sheetHeadIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: color.danfoSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetHeadMeta: {
    flex: 1,
    minWidth: 0,
  },
  sheetHeadTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: color.ink,
  },
  sheetHeadSub: {
    fontSize: 13,
    color: color.sub,
    lineHeight: 18,
    marginTop: 1,
  },
  sheetStatRow: {
    flexDirection: 'row',
    backgroundColor: color.canvas,
    borderRadius: radius.lg,
    paddingVertical: space.md,
    marginTop: space.md,
  },
  sheetStat: {
    flex: 1,
    alignItems: 'center',
  },
  sheetStatDivider: {
    width: 1,
    backgroundColor: color.hairline,
  },
  sheetStatValue: {
    fontSize: 22,
    fontWeight: '800',
    color: color.ink,
    fontVariant: ['tabular-nums'],
  },
  sheetStatLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: color.sub,
    marginTop: 2,
  },
  activePrimary: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    backgroundColor: color.routeGreen,
    borderRadius: radius.md,
    paddingVertical: 18,
    marginTop: space.md,
  },
  activePrimaryText: {
    color: color.white,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  activeSecondary: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.canvas,
    borderRadius: radius.md,
    paddingVertical: 16,
    marginTop: space.sm + 2,
  },
  activeSecondaryText: {
    color: color.ink,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  statValueRed: {
    color: color.stopRed,
  },
  // Next-stop preview — informational only; advancing is automatic.
  nextStopPreview: {
    alignItems: 'center',
    paddingTop: space.md,
    paddingBottom: space.xs,
  },
  nextStopPreviewLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: color.sub,
  },
  nextStopPreviewName: {
    fontSize: 18,
    fontWeight: '800',
    color: color.ink,
    marginTop: 2,
  },
  ctaPressed: {
    transform: [{ scale: 0.97 }],
  },
  // End-trip CTA — full-width, same language as every other action button.
  endTripButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    alignSelf: 'stretch',
    backgroundColor: color.stopRed,
    borderRadius: radius.md,
    paddingVertical: 18,
    marginTop: space.md,
  },
  endTripButtonDisabled: {
    backgroundColor: color.canvas,
  },
  endTripButtonText: {
    color: color.white,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  endTripButtonTextDim: {
    color: color.sub,
  },
  // End-trip confirmation sheet
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(14,27,46,0.5)',
    justifyContent: 'flex-end',
  },
  sheetGrabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.hairline,
    marginBottom: space.sm,
  },
  endSheet: {
    backgroundColor: color.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    paddingBottom: space.xxxl,
    alignItems: 'center',
    overflow: 'hidden',
  },
  // Danfo hazard livery across the top of the sheet — this is a "stop the
  // vehicle" moment and should read like one.
  endSheetStripe: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 7,
    flexDirection: 'row',
    backgroundColor: color.danfo,
    overflow: 'hidden',
  },
  endSheetStripeSegment: {
    width: 20,
    marginRight: 20,
    height: '100%',
    backgroundColor: color.ink,
    transform: [{ skewX: '-30deg' }],
  },
  endIconRing: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: color.stopRedBg,
    borderWidth: 3,
    borderColor: color.stopRed,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.lg,
  },
  endTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: color.ink,
    marginTop: space.lg,
  },
  endSub: {
    fontSize: 14,
    fontWeight: '600',
    color: color.sub,
    marginTop: 2,
  },
  endStatRow: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    backgroundColor: color.canvas,
    borderRadius: radius.lg,
    paddingVertical: space.lg,
    marginTop: space.xl,
  },
  endStat: {
    flex: 1,
    alignItems: 'center',
  },
  endStatDivider: {
    width: 1,
    backgroundColor: color.hairline,
  },
  endStatValue: {
    fontSize: 26,
    fontWeight: '800',
    color: color.ink,
    fontVariant: ['tabular-nums'],
  },
  endStatLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: color.sub,
    marginTop: 3,
  },
  endNote: {
    fontSize: 13,
    color: color.sub,
    textAlign: 'center',
    marginTop: space.lg,
  },
  endConfirmButton: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.stopRed,
    borderRadius: radius.pill,
    borderWidth: 4,
    borderColor: color.white,
    paddingVertical: space.lg + 2,
    marginTop: space.xl,
    shadowColor: color.stopRed,
    shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 8,
  },
  endConfirmText: {
    color: color.white,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 1,
  },
  endCancelButton: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.canvas,
    borderRadius: radius.pill,
    paddingVertical: space.lg,
    marginTop: space.sm + 2,
  },
  endCancelText: {
    color: color.ink,
    fontSize: 16,
    fontWeight: '700',
  },
});
