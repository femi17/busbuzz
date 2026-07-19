import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useRef, useState } from 'react';
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

import Constants from 'expo-constants';
import * as Location from 'expo-location';

import {
  bearingDegrees,
  bearingDiff,
  haversineDistance,
} from '../../../../shared/geo';
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
// Retargeting hysteresis: another stop must beat the current target by this
// margin before the app switches to it, so GPS jitter can't bounce the card
// between two nearby stops.
const RETARGET_MARGIN_M = 60;
// A stop more than this far off the direction of travel counts as "behind
// the bus" and is deprioritised when choosing the next target.
const BEHIND_BEARING_DEG = 100;
const BEHIND_PENALTY = 1.6;

// Expo Go doesn't ship the Mapbox native module — a top-level
// @rnmapbox/maps import there crashes the whole bundle, so the map lives in
// its own module required only inside a real build. Expo Go gets a
// placeholder and everything else on this screen still works.
const IS_EXPO_GO = Constants.appOwnership === 'expo';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const AttendanceMapModule = IS_EXPO_GO
  ? null
  : (require('./AttendanceMap') as typeof import('./AttendanceMap'));

type Props = NativeStackScreenProps<DriverStackParamList, 'Attendance'>;

type AttendanceStudent = DriverStackParamList['Attendance']['students'][number];

type RunStop = {
  id: string;
  routeId: string;
  name: string;
  latitude: number;
  longitude: number;
  sequence: number;
};

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
  // Direction of travel (degrees from north) — from the GPS fix while the
  // bus is actually moving; stale headings from a parked bus are ignored.
  const [heading, setHeading] = useState<number | null>(null);
  // The stop the driver is currently being routed to — kept across renders
  // so retargeting only happens when another stop is decisively better.
  const lastTargetIdRef = useRef<string | null>(null);

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
  const sortedStops = useMemo<RunStop[]>(() => {
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

    const schoolStop: RunStop = {
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

  const schoolStop = sortedStops.find((s) => s.id === SCHOOL_STOP_ID)!;
  const streetStops = sortedStops.filter((s) => s.id !== SCHOOL_STOP_ID);

  // Morning: board at every street, drop everyone at the school.
  // Afternoon: board everyone at the school, drop at each street.
  const isSchoolStop = (stop: RunStop) => stop.id === SCHOOL_STOP_ID;
  function isBoardStopFor(stop: RunStop): boolean {
    return direction === 'MORNING' ? !isSchoolStop(stop) : isSchoolStop(stop);
  }

  function studentsFor(stop: RunStop): AttendanceStudent[] {
    // The school end of the run involves every student: morning's school
    // drops everyone off; afternoon's school boards everyone.
    if (isSchoolStop(stop)) return students;
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

  function isStopDone(stop: RunStop): boolean {
    const board = isBoardStopFor(stop);
    return studentsFor(stop).every((s) => isDoneAtStop(attendanceMap[s.id], board));
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
        }
      } finally {
        setIsLoadingExisting(false);
      }
    }

    loadExisting();
  }, [tripId]);

  // Follow the phone's own GPS while this screen is up — this is what moves
  // the bus puck, drives the distance readout, and steers stop targeting.
  // Permissions were already granted when the background broadcast started.
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;

    const takeFix = (pos: Location.LocationObject) => {
      if (cancelled) return;
      setBusPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      const h = pos.coords.heading;
      const speed = pos.coords.speed ?? 0;
      // Heading is only meaningful while moving — a parked bus reports noise.
      if (h != null && h >= 0 && speed > 1.5) setHeading(h);
    };

    (async () => {
      try {
        const first = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        takeFix(first);
        sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 5000,
            distanceInterval: 15,
          },
          takeFix,
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

  // A synthetic school stop only has real coordinates when the school has
  // been geocoded — guard so (0,0) never leaks onto the map.
  const stopHasCoords = (s: RunStop) =>
    s.id !== SCHOOL_STOP_ID || (schoolLat != null && schoolLng != null);

  // ── Dynamic stop targeting ─────────────────────────────────
  // The saved pickup order is a default, not a contract. If the driver takes
  // a different road, the run follows the bus: among stops still needing
  // action, target whichever one the bus is closest to and actually heading
  // toward — stops behind the direction of travel are deprioritised.
  const streetCandidates = streetStops.filter((s) => !isStopDone(s));
  const schoolDone = students.every((s) => !!attendanceMap[s.id]);
  const inSchoolPhase =
    direction === 'MORNING' ? streetCandidates.length === 0 : !schoolDone;

  const currentStop: RunStop | null = useMemo(() => {
    if (inSchoolPhase) return schoolStop;
    if (streetCandidates.length === 0) return null; // afternoon: everyone dropped
    if (streetCandidates.length === 1 || !busPosition) {
      const keep = streetCandidates.find((s) => s.id === lastTargetIdRef.current);
      const pick = keep ?? streetCandidates[0];
      lastTargetIdRef.current = pick.id;
      return pick;
    }

    const scored = streetCandidates.map((s) => {
      const d = haversineDistance(
        busPosition.lat,
        busPosition.lng,
        s.latitude,
        s.longitude,
      );
      let score = d;
      if (heading != null) {
        const toStop = bearingDegrees(
          busPosition.lat,
          busPosition.lng,
          s.latitude,
          s.longitude,
        );
        if (bearingDiff(heading, toStop) > BEHIND_BEARING_DEG) {
          score *= BEHIND_PENALTY;
        }
      }
      return { stop: s, score };
    });
    scored.sort((a, b) => a.score - b.score);

    const best = scored[0];
    const prev = scored.find((x) => x.stop.id === lastTargetIdRef.current);
    // Hysteresis: keep the current target unless the challenger is decisively
    // better, so jitter never bounces the card between two stops.
    const pick =
      prev && best.stop.id !== prev.stop.id && best.score + RETARGET_MARGIN_M > prev.score
        ? prev.stop
        : best.stop;
    lastTargetIdRef.current = pick.id;
    return pick;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inSchoolPhase, attendanceMap, busPosition?.lat, busPosition?.lng, heading, sortedStops]);

  const isSchoolPhase = currentStop != null && isSchoolStop(currentStop);
  const isMorningSchoolWait = direction === 'MORNING' && inSchoolPhase;
  // Afternoon only: every street drop is done — nothing left but ending.
  const runComplete = direction === 'AFTERNOON' && !inSchoolPhase && streetCandidates.length === 0;

  const currentStopStudents = currentStop ? studentsFor(currentStop) : [];
  const isBoardStop = currentStop ? isBoardStopFor(currentStop) : false;

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

  // Stops still to visit after the current target, in authored order — the
  // rest of the road ahead.
  const upcomingStreetStops = streetCandidates.filter((s) => s.id !== currentStop?.id);
  const upcomingStops: RunStop[] = [
    ...upcomingStreetStops,
    ...(direction === 'MORNING' && !inSchoolPhase && stopHasCoords(schoolStop)
      ? [schoolStop]
      : []),
  ];

  const routeLinePoints = useMemo(() => {
    const pts: Array<{ lat: number; lng: number }> = [];
    if (busPosition) pts.push(busPosition);
    if (currentStop && stopHasCoords(currentStop)) {
      pts.push({ lat: currentStop.latitude, lng: currentStop.longitude });
    }
    for (const s of upcomingStops) pts.push({ lat: s.latitude, lng: s.longitude });
    return pts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busPosition?.lat, busPosition?.lng, currentStop?.id, attendanceMap]);

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

  // The trip can end once every student is accounted for (boarded, dropped,
  // or absent) and the run has nothing left. Students still on board when the
  // trip ends at school are marked DROPPED_OFF automatically — that's what
  // physically happened.
  const pendingDropCount = students.filter(
    (s) => attendanceMap[s.id] === 'BOARDED',
  ).length;
  const allAccounted = students.every((s) => !!attendanceMap[s.id]);
  // Morning's end trip is additionally gated on GPS proximity — the driver
  // shouldn't be able to tap it until the bus is actually back at school.
  const endTripReady = isMorningSchoolWait
    ? allAccounted && nearSchool
    : runComplete && allAccounted;

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

  // Stop ordinal for the pill: how many streets are done, plus the school's
  // place in this direction's order.
  const totalStops = streetStops.length + 1;
  const doneStreets = streetStops.length - streetCandidates.length;
  const pillEyebrow = isMorningSchoolWait
    ? 'FINAL STOP'
    : runComplete
    ? 'RUN COMPLETE'
    : isSchoolPhase
    ? `STOP 1 OF ${totalStops}${totalAtStop > 0 ? ` · ${markedCount}/${totalAtStop} MARKED` : ''}`
    : `STOP ${direction === 'MORNING' ? doneStreets + 1 : doneStreets + 2} OF ${totalStops}${
        totalAtStop > 0 ? ` · ${markedCount}/${totalAtStop} MARKED` : ''
      }`;

  const nextStopPreviewName =
    upcomingStreetStops[0]?.name ??
    (direction === 'MORNING' ? schoolName?.trim() || 'School' : 'This is the last stop');

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
      {AttendanceMapModule ? (
        <AttendanceMapModule.AttendanceMap
          initialCenter={initialCenter}
          routeLinePoints={routeLinePoints}
          upcomingStops={upcomingStops}
          currentStop={currentStop && stopHasCoords(currentStop) ? currentStop : null}
          pickupPins={pickupPins}
          busPosition={busPosition}
        />
      ) : (
        <View style={styles.mapPlaceholder}>
          <BusFrontIcon size={34} color={color.sub} />
          <Text style={styles.mapPlaceholderText}>
            The live map shows in the installed app{'\n'}(not available in Expo Go)
          </Text>
        </View>
      )}

      {/* Floating top row: stop context pill + SOS */}
      <SafeAreaView edges={['top']} pointerEvents="box-none" style={styles.topOverlay}>
        <View style={styles.topRow} pointerEvents="box-none">
          <View style={styles.stopPill}>
            <Text style={styles.stopPillEyebrow}>{pillEyebrow}</Text>
            <Text style={styles.stopPillName} numberOfLines={1}>
              {currentStop?.name ?? 'All students dropped off'}
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
        {distanceToStop !== null && !nearSchool && !runComplete && (
          <View style={styles.distanceRow}>
            <View style={styles.distanceDot} />
            <Text style={styles.distanceText}>
              {formatDistance(distanceToStop)} to {currentStop?.name}
            </Text>
          </View>
        )}

        {isMorningSchoolWait || runComplete ? (
          <>
            <View style={styles.sheetHeadRow}>
              <View style={styles.sheetHeadIcon}>
                <BusFrontIcon size={22} color={color.ink} />
              </View>
              <View style={styles.sheetHeadMeta}>
                <Text style={styles.sheetHeadTitle}>
                  {runComplete
                    ? 'All students dropped off'
                    : nearSchool
                    ? "You're back at school"
                    : 'Heading to school'}
                </Text>
                <Text style={styles.sheetHeadSub} numberOfLines={2}>
                  {runComplete
                    ? 'End the trip to finish the run.'
                    : nearSchool
                    ? 'End the trip to notify parents their children are in school.'
                    : `End the trip once you're back at ${schoolName?.trim() || 'the school'}.`}
                </Text>
              </View>
            </View>
            <View style={styles.sheetStatRow}>
              <View style={styles.sheetStat}>
                <Text style={styles.sheetStatValue}>
                  {runComplete ? droppedCount : boardedCount}
                </Text>
                <Text style={styles.sheetStatLabel}>
                  {runComplete ? 'Dropped off' : 'On board'}
                </Text>
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
        ) : null}

        {isMorningSchoolWait || runComplete ? (
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
              {nextStopPreviewName}
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
  // ── Expo Go map placeholder ───────────────────────────────
  mapPlaceholder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    backgroundColor: color.canvas,
  },
  mapPlaceholderText: {
    fontSize: 13,
    fontWeight: '600',
    color: color.sub,
    textAlign: 'center',
    lineHeight: 19,
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
  // Morning school-wait / run-complete content inside the card
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
