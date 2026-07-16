import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Camera, MapView, PointAnnotation, StyleURL } from '@rnmapbox/maps';
import { useEffect, useMemo, useRef, useState, type ElementRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
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

  useEffect(() => {
    if (pickupPins.length === 0) return;

    if (pickupPins.length === 1) {
      cameraRef.current?.setCamera({
        centerCoordinate: [pickupPins[0].lng, pickupPins[0].lat],
        zoomLevel: 14,
        animationDuration: 0,
      });
      return;
    }

    const lngs = pickupPins.map((s) => s.lng);
    const lats = pickupPins.map((s) => s.lat);
    cameraRef.current?.fitBounds(
      [Math.max(...lngs), Math.max(...lats)],
      [Math.min(...lngs), Math.min(...lats)],
      40,
      0,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStop?.id]);

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

  // Once every pickup is done on the morning run, watch the phone's own GPS;
  // when the bus is back at the school, reveal the end-trip button and pop a
  // one-time confirmation the driver can dismiss and re-open manually.
  useEffect(() => {
    if (!isMorningSchoolWait || nearSchool) return;
    if (!allAccounted) return;
    if (schoolLat == null || schoolLng == null) return;

    let cancelled = false;
    const check = async () => {
      try {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        const dist = haversineDistance(
          pos.coords.latitude,
          pos.coords.longitude,
          schoolLat,
          schoolLng,
        );
        if (dist <= SCHOOL_ARRIVE_RADIUS_M) {
          setNearSchool(true);
          setShowEndConfirm(true);
        }
      } catch {
        // GPS unavailable — the driver can still end manually once shown.
      }
    };

    check();
    const intervalId = setInterval(check, 30_000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [isMorningSchoolWait, nearSchool, allAccounted, schoolLat, schoolLng]);

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
      <SafeAreaView edges={['top']} style={styles.headerSafe}>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.logoCircle}>
              <BusFrontIcon size={18} color={color.ink} />
            </View>
            <Text style={styles.wordmark}>
              Bus<Text style={styles.wordmarkAccent}>Buzz</Text>
            </Text>
          </View>
          <View style={styles.headerRight}>
            <View style={styles.enRoutePill}>
              <View style={styles.enRouteDot} />
              <Text style={styles.enRouteText}>EN ROUTE</Text>
            </View>
            <Pressable
              style={({ pressed }) => [styles.sosDiamond, pressed && styles.pressed]}
              onPress={() => setShowSosConfirm(true)}
              accessibilityLabel="Send SOS alert"
            >
              <AlertDiamondIcon size={20} color={color.stopRed} />
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {pickupPins.length > 0 && (
          <View style={styles.map}>
            <MapView
              style={StyleSheet.absoluteFill}
              styleURL={StyleURL.Street}
              scrollEnabled
              zoomEnabled
              pitchEnabled={false}
              attributionEnabled={false}
              logoEnabled={false}
            >
              <Camera ref={cameraRef} defaultSettings={{ zoomLevel: 16.5 }} />
              {pickupPins.map((pin) => (
                <PointAnnotation key={pin.id} id={`pin-${pin.id}`} coordinate={[pin.lng, pin.lat]}>
                  <View style={styles.pickupPin}>
                    <Text style={styles.pickupPinText}>{pin.label}</Text>
                  </View>
                </PointAnnotation>
              ))}
            </MapView>
          </View>
        )}

        <View style={styles.stopCard}>
          <Text style={styles.stopEyebrow}>
            {isMorningSchoolWait ? 'Final stop' : 'Current stop'}
          </Text>
          <Text style={styles.stopName} numberOfLines={1}>
            {currentStop?.name}
          </Text>
          <View style={styles.stopMetaRow}>
            <View style={styles.stopMetaPill}>
              <Text style={styles.stopMetaPillText}>
                Stop {currentStopIndex + 1} of {sortedStops.length}
              </Text>
            </View>
            {!isMorningSchoolWait && (
              <Text style={styles.stopMetaCount}>
                {markedCount}/{totalAtStop} marked
              </Text>
            )}
          </View>
        </View>

        {isMorningSchoolWait ? (
          <View style={styles.schoolWaitCard}>
            <View style={styles.schoolWaitIconRing}>
              <BusFrontIcon size={28} color={color.ink} />
            </View>
            <Text style={styles.schoolWaitTitle}>
              {nearSchool ? "You're back at school" : 'Heading to school'}
            </Text>
            <Text style={styles.schoolWaitSub}>
              {nearSchool
                ? 'Tap END TRIP below to notify parents their children are in school.'
                : `All students are accounted for. End the trip once you're back at ${schoolName?.trim() || 'the school'}.`}
            </Text>
            <View style={styles.schoolWaitStatRow}>
              <View style={styles.schoolWaitStat}>
                <Text style={styles.schoolWaitStatValue}>{boardedCount}</Text>
                <Text style={styles.schoolWaitStatLabel}>On board</Text>
              </View>
              <View style={styles.schoolWaitStatDivider} />
              <View style={styles.schoolWaitStat}>
                <Text
                  style={[
                    styles.schoolWaitStatValue,
                    absentCount > 0 && styles.statValueRed,
                  ]}
                >
                  {absentCount}
                </Text>
                <Text style={styles.schoolWaitStatLabel}>Absent</Text>
              </View>
            </View>
          </View>
        ) : activeStudent ? (
          <View style={styles.activeCard}>
            <Text style={styles.sectionLabel}>
              {isBoardStop ? 'Board' : 'Drop off'} · {markedCount}/{totalAtStop} here
            </Text>
            <View style={styles.activeCardPhotoWrap}>
              {activeStudent.photoUrl ? (
                <Image source={{ uri: activeStudent.photoUrl }} style={styles.activeCardPhoto} />
              ) : (
                <View style={[styles.activeCardPhoto, styles.activeCardPhotoFallback]}>
                  <Text style={styles.activeCardPhotoInitials}>
                    {getInitials(activeStudent.name)}
                  </Text>
                </View>
              )}
              <View style={styles.gradeBadge}>
                <Text style={styles.gradeBadgeText}>{activeStudent.className}</Text>
              </View>
            </View>

            <Text style={styles.activeCardName}>{activeStudent.name}</Text>
            <Text style={styles.activeCardSub}>
              {isSchoolPhase && activeStudent.stopId && stopNameById.get(activeStudent.stopId)
                ? stopNameById.get(activeStudent.stopId)
                : `${routeName} · Stop #${currentStopIndex + 1}`}
            </Text>

            <Pressable
              style={({ pressed }) => [styles.activePrimary, pressed && styles.pressed]}
              onPress={() =>
                markStudent(activeStudent.id, isBoardStop ? 'BOARDED' : 'DROPPED_OFF')
              }
              disabled={!!isSubmitting[activeStudent.id]}
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
              >
                <Text style={styles.activeSecondaryText}>ABSENT</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <View style={styles.stopDoneCard}>
            <CheckIcon size={20} color={color.routeGreen} />
            <Text style={styles.stopDoneText}>Stop complete</Text>
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: space.lg + insets.bottom }]}>
        {isLastStop ? (
          <View style={styles.endTripWrap}>
            <View style={[styles.endTripHalo, !endTripReady && styles.endTripHaloDim]} />
            <Pressable
              style={({ pressed }) => [
                styles.endTripCircle,
                !endTripReady && styles.endTripCircleDisabled,
                pressed && endTripReady && styles.ctaPressed,
              ]}
              onPress={() => setShowEndConfirm(true)}
              disabled={!endTripReady || isEndingTrip}
              accessibilityRole="button"
              accessibilityLabel="End trip"
            >
              <BusFrontIcon size={30} color={endTripReady ? color.white : color.sub} />
              <Text
                style={[
                  styles.endTripCircleText,
                  !endTripReady && styles.endTripCircleTextDim,
                ]}
              >
                {isMorningSchoolWait && !nearSchool ? 'ARRIVING…' : 'END TRIP'}
              </Text>
            </Pressable>
          </View>
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
  // Header
  headerSafe: {
    backgroundColor: color.ink,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
    backgroundColor: color.ink,
    borderBottomWidth: 3,
    borderBottomColor: color.danfo,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 2,
  },
  logoCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: color.danfo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: {
    fontSize: 20,
    fontWeight: '800',
    color: color.white,
    letterSpacing: -0.3,
  },
  wordmarkAccent: {
    color: color.danfo,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 2,
  },
  enRoutePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: color.routeGreen,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  enRouteDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: color.white,
  },
  enRouteText: {
    color: color.white,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  sosDiamond: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(225,62,45,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
  // Body
  listContent: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.xl,
  },
  map: {
    // Tall enough to actually navigate by — the old 180px strip was too
    // cramped and read as decoration.
    height: 264,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: color.ink,
    marginBottom: space.md,
  },
  pickupPin: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: color.danfo,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: color.white,
  },
  pickupPinText: {
    color: color.ink,
    fontWeight: '800',
    fontSize: 13,
  },
  // Current-stop card
  stopCard: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    marginBottom: space.lg,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
  },
  stopEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: color.sub,
  },
  stopName: {
    fontSize: 24,
    fontWeight: '800',
    color: color.ink,
    marginTop: 4,
  },
  stopMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.md,
  },
  stopMetaPill: {
    backgroundColor: color.canvas,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  stopMetaPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: color.ink,
  },
  stopMetaCount: {
    fontSize: 13,
    fontWeight: '600',
    color: color.sub,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: color.sub,
    marginBottom: space.md,
    alignSelf: 'flex-start',
  },
  // Stop-complete transition card (between auto-advances)
  stopDoneCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    paddingVertical: space.xxl,
  },
  stopDoneText: {
    fontSize: 15,
    fontWeight: '700',
    color: color.sub,
  },
  // Active student card — the one card shown at a time
  activeCard: {
    backgroundColor: color.surface,
    borderRadius: radius.lg + 6,
    padding: space.xl,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
  },
  activeCardPhotoWrap: {
    alignItems: 'center',
  },
  activeCardPhoto: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    borderColor: color.danfo,
    backgroundColor: color.canvas,
  },
  activeCardPhotoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeCardPhotoInitials: {
    color: color.ink,
    fontWeight: '800',
    fontSize: 32,
  },
  gradeBadge: {
    marginTop: -14,
    backgroundColor: color.ink,
    paddingHorizontal: space.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: color.surface,
  },
  gradeBadgeText: {
    color: color.white,
    fontWeight: '800',
    fontSize: 12,
  },
  activeCardName: {
    fontSize: 24,
    fontWeight: '800',
    color: color.ink,
    marginTop: space.md,
    textAlign: 'center',
  },
  activeCardSub: {
    fontSize: 14,
    fontWeight: '500',
    color: color.sub,
    marginTop: 2,
    textAlign: 'center',
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
    marginTop: space.xl,
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
  // Morning "heading to / back at school" card
  schoolWaitCard: {
    backgroundColor: color.surface,
    borderRadius: radius.lg + 6,
    padding: space.xl,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
  },
  schoolWaitIconRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: color.danfoSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  schoolWaitTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: color.ink,
    marginTop: space.lg,
    textAlign: 'center',
  },
  schoolWaitSub: {
    fontSize: 14,
    color: color.sub,
    textAlign: 'center',
    marginTop: space.xs,
    lineHeight: 20,
  },
  schoolWaitStatRow: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    backgroundColor: color.canvas,
    borderRadius: radius.lg,
    paddingVertical: space.lg,
    marginTop: space.xl,
  },
  schoolWaitStat: {
    flex: 1,
    alignItems: 'center',
  },
  schoolWaitStatDivider: {
    width: 1,
    backgroundColor: color.hairline,
  },
  schoolWaitStatValue: {
    fontSize: 24,
    fontWeight: '800',
    color: color.ink,
    fontVariant: ['tabular-nums'],
  },
  schoolWaitStatLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: color.sub,
    marginTop: 3,
  },
  statValueRed: {
    color: color.stopRed,
  },
  // Footer
  footer: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    backgroundColor: color.surface,
    borderTopWidth: 1,
    borderTopColor: color.hairline,
  },
  // Next-stop preview — replaces the old tappable "NEXT STOP" button now
  // that advancing is automatic; it's informational only.
  nextStopPreview: {
    alignItems: 'center',
    paddingVertical: space.md,
  },
  nextStopPreviewLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: color.sub,
  },
  nextStopPreviewName: {
    fontSize: 20,
    fontWeight: '800',
    color: color.ink,
    marginTop: 2,
  },
  ctaPressed: {
    transform: [{ scale: 0.97 }],
  },
  // End-trip circular CTA — same visual weight as the Start button on Today.
  endTripWrap: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    height: 176,
    marginVertical: space.sm,
  },
  endTripHalo: {
    position: 'absolute',
    width: 176,
    height: 176,
    borderRadius: 88,
    backgroundColor: color.stopRedBg,
  },
  endTripHaloDim: {
    backgroundColor: color.canvas,
  },
  endTripCircle: {
    width: 136,
    height: 136,
    borderRadius: 68,
    backgroundColor: color.stopRed,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 6,
    borderColor: color.white,
    shadowColor: color.stopRed,
    shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 8,
  },
  endTripCircleDisabled: {
    backgroundColor: color.hairline,
    shadowOpacity: 0,
    elevation: 0,
  },
  endTripCircleText: {
    color: color.white,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginTop: space.xs,
  },
  endTripCircleTextDim: {
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
