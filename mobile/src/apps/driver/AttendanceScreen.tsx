import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Camera, MapView, PointAnnotation, StyleURL } from '@rnmapbox/maps';
import { useEffect, useMemo, useRef, useState, type ElementRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
  CloseIcon,
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

type Props = NativeStackScreenProps<DriverStackParamList, 'Attendance'>;

type AttendanceStudent = DriverStackParamList['Attendance']['students'][number];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  BOARDED: 'Boarded',
  ABSENT: 'Absent',
  DROPPED_OFF: 'Dropped off',
};

const STATUS_COLOR: Record<AttendanceStatus, string> = {
  BOARDED: color.routeGreen,
  ABSENT: color.stopRed,
  DROPPED_OFF: color.routeGreen,
};

const STATUS_BG: Record<AttendanceStatus, string> = {
  BOARDED: color.routeGreenBg,
  ABSENT: color.stopRedBg,
  DROPPED_OFF: color.routeGreenBg,
};

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
  const [sheetStudentId, setSheetStudentId] = useState<string | null>(null);
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

  async function markFromSheet(studentId: string, status: AttendanceStatus) {
    const ok = await markStudent(studentId, status);
    if (ok) setSheetStudentId(null);
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

  function handleNextStop() {
    setCurrentStopIndex((i) => i + 1);
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

  // Each student's own street (their assigned stop) — shown at the school
  // phase where the whole bus is listed, so rows aren't all captioned with
  // one street name.
  const stopNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of stops) map.set(s.id, s.name);
    return map;
  }, [stops]);

  // Only students with a real saved pickup location get a pin — showing a
  // fallback here (e.g. the school) would send the driver to the wrong door.
  const pickupPins = currentStopStudents.filter(
    (s): s is AttendanceStudent & { pickupLat: number; pickupLng: number } =>
      s.pickupLat != null && s.pickupLng != null,
  );

  useEffect(() => {
    if (pickupPins.length === 0) return;

    if (pickupPins.length === 1) {
      cameraRef.current?.setCamera({
        centerCoordinate: [pickupPins[0].pickupLng, pickupPins[0].pickupLat],
        // Street level — close enough to recognise the actual house/junction.
        zoomLevel: 16.3,
        animationDuration: 0,
      });
      return;
    }

    const lngs = pickupPins.map((s) => s.pickupLng);
    const lats = pickupPins.map((s) => s.pickupLat);
    cameraRef.current?.fitBounds(
      [Math.max(...lngs), Math.max(...lats)],
      [Math.min(...lngs), Math.min(...lats)],
      56,
      0,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStop?.id]);

  const allCurrentMarked = currentStopStudents.every((s) =>
    isDoneAtStop(attendanceMap[s.id], isBoardStop),
  );

  // The trip can end once every student is accounted for (boarded, dropped,
  // or absent) and the driver is at the run's final stop. Students still on
  // board when the trip ends at school are marked DROPPED_OFF automatically —
  // that's what physically happened.
  const pendingDropCount = students.filter(
    (s) => attendanceMap[s.id] === 'BOARDED',
  ).length;
  const allAccounted = students.every((s) => !!attendanceMap[s.id]);
  const canEndTrip = isLastStop && allAccounted;

  // Forgot to end the trip? Once every pickup is done on the morning run,
  // watch the phone's own GPS; when the bus is back at the school, jump to
  // the school phase and offer to end the trip on the driver's behalf
  // (remaining riders are marked dropped off on confirm).
  const autoEndPromptedRef = useRef(false);
  useEffect(() => {
    if (direction !== 'MORNING' || autoEndPromptedRef.current) return;
    if (!allAccounted || showEndConfirm) return;
    if (schoolLat == null || schoolLng == null) return;

    let cancelled = false;
    const check = async () => {
      try {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled || autoEndPromptedRef.current) return;
        const dist = haversineDistance(
          pos.coords.latitude,
          pos.coords.longitude,
          schoolLat,
          schoolLng,
        );
        if (dist <= SCHOOL_ARRIVE_RADIUS_M) {
          autoEndPromptedRef.current = true;
          setCurrentStopIndex(sortedStops.length - 1);
          setShowEndConfirm(true);
        }
      } catch {
        // GPS unavailable — the driver can still end manually.
      }
    };

    check();
    const intervalId = setInterval(check, 30_000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direction, allAccounted, showEndConfirm, schoolLat, schoolLng, sortedStops.length]);

  const droppedCount = students.filter(
    (s) => attendanceMap[s.id] === 'DROPPED_OFF',
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

  const sheetStudent = currentStopStudents.find((s) => s.id === sheetStudentId) ?? null;
  const markedCount = currentStopStudents.filter((s) => !!attendanceMap[s.id]).length;
  const totalAtStop = currentStopStudents.length;
  const progressPct = totalAtStop ? Math.round((markedCount / totalAtStop) * 100) : 0;

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

      <FlatList<AttendanceStudent>
        data={currentStopStudents}
        keyExtractor={(item: AttendanceStudent) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
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
                  <Camera ref={cameraRef} defaultSettings={{ zoomLevel: 15.5 }} />
                  {pickupPins.map((student) => (
                    <PointAnnotation
                      key={student.id}
                      id={`pickup-${student.id}`}
                      coordinate={[student.pickupLng, student.pickupLat]}
                    >
                      <View style={styles.pickupPin}>
                        <Text style={styles.pickupPinText}>
                          {student.name[0]?.toUpperCase()}
                        </Text>
                      </View>
                    </PointAnnotation>
                  ))}
                </MapView>
              </View>
            )}

            <View style={styles.stopCard}>
              <Text style={styles.stopEyebrow}>Current stop</Text>
              <Text style={styles.stopName} numberOfLines={1}>
                {currentStop?.name}
              </Text>
              <View style={styles.stopMetaRow}>
                <View style={styles.stopMetaPill}>
                  <Text style={styles.stopMetaPillText}>
                    Stop {currentStopIndex + 1} of {sortedStops.length}
                  </Text>
                </View>
                <Text style={styles.stopMetaCount}>
                  {markedCount}/{totalAtStop} marked
                </Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
              </View>
            </View>

            <Text style={styles.sectionLabel}>
              {isBoardStop ? 'Board' : 'Drop off'} · {totalAtStop} student
              {totalAtStop === 1 ? '' : 's'}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>No students at this stop.</Text>
        }
        renderItem={({ item }: { item: AttendanceStudent }) => {
          const status = attendanceMap[item.id];
          // A boarded student still needs marking at a drop stop.
          const canMark =
            !status || (status === 'BOARDED' && !isBoardStop);
          return (
            <Pressable
              style={({ pressed }) => [
                styles.studentCard,
                pressed && canMark && styles.studentCardPressed,
              ]}
              onPress={() => {
                if (canMark) setSheetStudentId(item.id);
              }}
              disabled={!canMark}
            >
              {item.photoUrl ? (
                <Image source={{ uri: item.photoUrl }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarInitials}>{getInitials(item.name)}</Text>
                </View>
              )}
              <View style={styles.studentInfo}>
                <Text style={styles.studentName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.studentClass} numberOfLines={1}>
                  {isSchoolPhase && item.stopId && stopNameById.get(item.stopId)
                    ? `${item.className} · ${stopNameById.get(item.stopId)}`
                    : item.className}
                </Text>
              </View>
              {canMark ? (
                <View style={styles.markCue}>
                  <Text style={styles.markCueText}>
                    {status === 'BOARDED' ? 'Drop off' : 'Mark'}
                  </Text>
                </View>
              ) : status ? (
                <View style={[styles.statusChip, { backgroundColor: STATUS_BG[status] }]}>
                  <Text style={[styles.statusChipText, { color: STATUS_COLOR[status] }]}>
                    {STATUS_LABEL[status]}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        }}
      />

      <View style={[styles.footer, { paddingBottom: space.lg + insets.bottom }]}>
        {isLastStop ? (
          <Pressable
            style={({ pressed }) => [
              styles.footerButton,
              styles.endTripButton,
              !canEndTrip && styles.footerButtonDisabled,
              pressed && canEndTrip && styles.ctaPressed,
            ]}
            onPress={() => setShowEndConfirm(true)}
            disabled={!canEndTrip || isEndingTrip}
            accessibilityRole="button"
            accessibilityLabel="End trip"
          >
            <BusFrontIcon size={24} color={color.white} />
            <Text style={styles.footerButtonText}>END TRIP</Text>
          </Pressable>
        ) : (
          <Pressable
            style={({ pressed }) => [
              styles.footerButton,
              styles.nextStopButton,
              !allCurrentMarked && styles.footerButtonDisabled,
              pressed && allCurrentMarked && styles.ctaPressed,
            ]}
            onPress={handleNextStop}
            disabled={!allCurrentMarked}
          >
            <Text style={styles.footerButtonTextDark}>NEXT STOP</Text>
          </Pressable>
        )}
      </View>

      {/* Student sheet — tap a student to mark boarded / absent */}
      <Modal
        visible={!!sheetStudent}
        transparent
        animationType="slide"
        onRequestClose={() => setSheetStudentId(null)}
      >
        <View style={styles.sheetOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSheetStudentId(null)} />
          {sheetStudent ? (
            <View style={styles.sheet}>
              <View style={styles.sheetGrabber} />
              <Pressable
                style={styles.sheetClose}
                onPress={() => setSheetStudentId(null)}
                accessibilityLabel="Close"
              >
                <CloseIcon size={16} color={color.sub} />
              </Pressable>

              <View style={styles.sheetPhotoWrap}>
                {sheetStudent.photoUrl ? (
                  <Image source={{ uri: sheetStudent.photoUrl }} style={styles.sheetPhoto} />
                ) : (
                  <View style={[styles.sheetPhoto, styles.sheetPhotoFallback]}>
                    <Text style={styles.sheetPhotoInitials}>
                      {getInitials(sheetStudent.name)}
                    </Text>
                  </View>
                )}
                <View style={styles.gradeBadge}>
                  <Text style={styles.gradeBadgeText}>{sheetStudent.className}</Text>
                </View>
              </View>

              <Text style={styles.sheetName}>{sheetStudent.name}</Text>
              <Text style={styles.sheetSub}>
                {routeName} · Stop #{currentStopIndex + 1}
              </Text>

              <View style={styles.sheetStatRow}>
                <View style={styles.sheetStat}>
                  <Text style={styles.sheetStatLabel}>Stop</Text>
                  <Text style={styles.sheetStatValue} numberOfLines={1}>
                    {(sheetStudent.stopId && stopNameById.get(sheetStudent.stopId)) ||
                      currentStop?.name}
                  </Text>
                </View>
                <View style={styles.sheetStat}>
                  <Text style={styles.sheetStatLabel}>Class</Text>
                  <Text style={styles.sheetStatValue}>{sheetStudent.className}</Text>
                </View>
              </View>

              <Pressable
                style={({ pressed }) => [styles.sheetPrimary, pressed && styles.pressed]}
                onPress={() =>
                  markFromSheet(sheetStudent.id, isBoardStop ? 'BOARDED' : 'DROPPED_OFF')
                }
                disabled={!!isSubmitting[sheetStudent.id]}
              >
                {isSubmitting[sheetStudent.id] ? (
                  <ActivityIndicator color={color.white} />
                ) : (
                  <>
                    <CheckIcon size={20} color={color.white} />
                    <Text style={styles.sheetPrimaryText}>
                      {isBoardStop ? 'BOARDED' : 'DROPPED OFF'}
                    </Text>
                  </>
                )}
              </Pressable>
              {/* A student already on the bus can't be absent — only offer it
                  while they still haven't boarded. */}
              {attendanceMap[sheetStudent.id] !== 'BOARDED' && (
                <Pressable
                  style={({ pressed }) => [styles.sheetSecondary, pressed && styles.pressed]}
                  onPress={() => markFromSheet(sheetStudent.id, 'ABSENT')}
                  disabled={!!isSubmitting[sheetStudent.id]}
                >
                  <Text style={styles.sheetSecondaryText}>ABSENT</Text>
                </Pressable>
              )}
            </View>
          ) : null}
        </View>
      </Modal>

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
                <Text style={[styles.endStatValue, absentCount > 0 && styles.endStatValueRed]}>
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
  // List
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
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: color.canvas,
    marginTop: space.md,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: color.danfo,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: color.sub,
    marginBottom: space.sm,
    marginLeft: 2,
  },
  emptyText: {
    fontSize: 14,
    color: color.sub,
    textAlign: 'center',
    paddingVertical: space.xl,
  },
  // Student row
  studentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    padding: space.md,
    marginBottom: space.sm + 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 1,
  },
  studentCardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  avatarImage: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: color.canvas,
  },
  avatarPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.danfo,
  },
  avatarInitials: {
    color: color.ink,
    fontWeight: '800',
    fontSize: 17,
  },
  studentInfo: {
    flex: 1,
    marginLeft: space.md,
  },
  studentName: {
    fontSize: 17,
    fontWeight: '700',
    color: color.ink,
  },
  studentClass: {
    fontSize: 13,
    color: color.sub,
    marginTop: 1,
  },
  statusChip: {
    paddingHorizontal: space.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  statusChipText: {
    fontWeight: '800',
    fontSize: 12,
  },
  markCue: {
    backgroundColor: color.danfo,
    paddingHorizontal: space.lg,
    paddingVertical: 9,
    borderRadius: radius.pill,
  },
  markCueText: {
    color: color.ink,
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.3,
  },
  // Footer
  footer: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    backgroundColor: color.surface,
    borderTopWidth: 1,
    borderTopColor: color.hairline,
  },
  // Footer actions carry the same visual weight as the circular Start button:
  // pill shape, thick white ring, deep colored shadow.
  footerButton: {
    flexDirection: 'row',
    gap: space.sm + 2,
    paddingVertical: space.lg + 2,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: color.white,
  },
  footerButtonDisabled: {
    opacity: 0.4,
  },
  nextStopButton: {
    backgroundColor: color.danfo,
    shadowColor: color.danfoDim,
    shadowOpacity: 0.45,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 8,
  },
  endTripButton: {
    backgroundColor: color.stopRed,
    shadowColor: color.stopRed,
    shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 8,
  },
  ctaPressed: {
    transform: [{ scale: 0.97 }],
  },
  footerButtonText: {
    color: color.white,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 1,
  },
  footerButtonTextDark: {
    color: color.ink,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 1,
  },
  // Student sheet
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(14,27,46,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: color.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    paddingBottom: space.xxxl,
    alignItems: 'center',
  },
  sheetGrabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.hairline,
    marginBottom: space.sm,
  },
  sheetClose: {
    position: 'absolute',
    right: space.lg,
    top: space.lg,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: color.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetPhotoWrap: {
    alignItems: 'center',
    marginTop: space.sm,
  },
  sheetPhoto: {
    width: 116,
    height: 116,
    borderRadius: 58,
    borderWidth: 4,
    borderColor: color.danfo,
    backgroundColor: color.canvas,
  },
  sheetPhotoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetPhotoInitials: {
    color: color.ink,
    fontWeight: '800',
    fontSize: 36,
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
  sheetName: {
    fontSize: 26,
    fontWeight: '800',
    color: color.ink,
    marginTop: space.md,
    textAlign: 'center',
  },
  sheetSub: {
    fontSize: 14,
    fontWeight: '500',
    color: color.sub,
    marginTop: 2,
  },
  sheetStatRow: {
    flexDirection: 'row',
    gap: space.md,
    alignSelf: 'stretch',
    marginTop: space.xl,
  },
  sheetStat: {
    flex: 1,
    backgroundColor: color.canvas,
    borderRadius: radius.lg,
    paddingVertical: space.lg,
    paddingHorizontal: space.md,
    alignItems: 'center',
  },
  sheetStatLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: color.sub,
    marginBottom: 4,
  },
  sheetStatValue: {
    fontSize: 16,
    fontWeight: '800',
    color: color.ink,
  },
  sheetPrimary: {
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
  sheetPrimaryText: {
    color: color.white,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  sheetSecondary: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.canvas,
    borderRadius: radius.md,
    paddingVertical: 16,
    marginTop: space.sm + 2,
  },
  sheetSecondaryText: {
    color: color.ink,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  // End-trip confirmation sheet
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
  endStatValueRed: {
    color: color.stopRed,
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
