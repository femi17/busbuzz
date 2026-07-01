import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { AnimatedRegion, Marker, MarkerAnimated } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { estimateETA, haversineDistance } from '../../../../shared/geo';
import { supabase } from '../../lib/supabase';

const INK = '#0E1B2E';
const DANFO = '#FFC900';
const ROUTE_GREEN = '#1C9D5B';
const STOP_RED = '#E13E2D';
const MUTED = '#6B7280';

const LAGOS_LAT = 6.5244;
const LAGOS_LNG = 3.3792;
const APPROACH_RADIUS_M = 300;
const POLL_INTERVAL_MS = 30000;

type StudentInfo = {
  id: string;
  name: string;
  className: string;
  photoUrl: string | null;
  routeId: string | null;
  stopId: string | null;
};

type StopInfo = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
};

type TripInfo = {
  id: string;
  busId: string;
  routeId: string;
};

type AttendanceState = {
  status: 'BOARDED' | 'ABSENT' | 'DROPPED_OFF';
} | null;

type StatusChip = {
  label: string;
  bg: string;
  color: string;
};

function getStatusChip(
  trip: TripInfo | null,
  attendance: AttendanceState,
  busSpeed: number | null,
): StatusChip {
  if (!trip) {
    return { label: 'No Active Trip', bg: '#F3F4F6', color: MUTED };
  }
  if (attendance?.status === 'BOARDED') {
    return {
      label: 'On Board',
      bg: 'rgba(28,157,91,0.15)',
      color: ROUTE_GREEN,
    };
  }
  if (attendance?.status === 'DROPPED_OFF') {
    return {
      label: 'Arrived',
      bg: 'rgba(28,157,91,0.15)',
      color: ROUTE_GREEN,
    };
  }
  if (busSpeed !== null && busSpeed > 0) {
    return {
      label: 'En Route',
      bg: 'rgba(255,201,0,0.15)',
      color: '#B8860B',
    };
  }
  return { label: 'Waiting', bg: '#F3F4F6', color: MUTED };
}

export default function HomeScreen() {
  const [student, setStudent] = useState<StudentInfo | null>(null);
  const [stop, setStop] = useState<StopInfo | null>(null);
  const [trip, setTrip] = useState<TripInfo | null>(null);
  const [attendance, setAttendance] = useState<AttendanceState>(null);
  const [busSpeed, setBusSpeed] = useState<number | null>(null);
  const [busPosition, setBusPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [isApproaching, setIsApproaching] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mapRef = useRef<MapView | null>(null);
  const hasAnimatedToBusRef = useRef(false);
  const animatedRegionRef = useRef(
    new AnimatedRegion({
      latitude: LAGOS_LAT,
      longitude: LAGOS_LNG,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    }),
  );

  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.6)).current;
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (isApproaching) {
      pulseLoopRef.current = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(pulseScale, {
              toValue: 1.8,
              duration: 1200,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(pulseScale, {
              toValue: 1,
              duration: 0,
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(pulseOpacity, {
              toValue: 0,
              duration: 1200,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(pulseOpacity, {
              toValue: 0.6,
              duration: 0,
              useNativeDriver: true,
            }),
          ]),
        ]),
      );
      pulseLoopRef.current.start();
    } else {
      pulseLoopRef.current?.stop();
      pulseScale.setValue(1);
      pulseOpacity.setValue(0.6);
    }

    return () => {
      pulseLoopRef.current?.stop();
    };
  }, [isApproaching, pulseScale, pulseOpacity]);

  useEffect(() => {
    let isMounted = true;
    let pollIntervalId: ReturnType<typeof setInterval> | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function loadStudentAndStop() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (isMounted) {
          setErrorMessage('Session expired. Please log in again.');
          setIsLoading(false);
        }
        return null;
      }

      const { data: links, error: linksError } = await supabase
        .from('student_parents')
        .select('student_id')
        .eq('parent_id', user.id);

      if (linksError || !links || links.length === 0) {
        if (isMounted) {
          setErrorMessage('No children linked to your account.');
          setIsLoading(false);
        }
        return null;
      }

      const studentIds = links.map((l) => l.student_id);

      const { data: students, error: studentsError } = await supabase
        .from('students')
        .select('id, name, class_name, photo_url, route_id, stop_id, school_id')
        .in('id', studentIds)
        .eq('is_active', true);

      if (studentsError || !students || students.length === 0) {
        if (isMounted) {
          setErrorMessage('No active child found.');
          setIsLoading(false);
        }
        return null;
      }

      const first = students[0];
      const loadedStudent: StudentInfo = {
        id: first.id,
        name: first.name,
        className: first.class_name,
        photoUrl: first.photo_url,
        routeId: first.route_id,
        stopId: first.stop_id,
      };

      if (isMounted) setStudent(loadedStudent);

      if (loadedStudent.stopId) {
        const { data: stopData } = await supabase
          .from('stops')
          .select('id, name, latitude, longitude, sequence, eta_minutes, route_id')
          .eq('id', loadedStudent.stopId)
          .single();

        if (stopData && isMounted) {
          setStop({
            id: stopData.id,
            name: stopData.name,
            latitude: stopData.latitude,
            longitude: stopData.longitude,
          });
        }
      }

      return loadedStudent;
    }

    async function checkForActiveTrip(loadedStudent: StudentInfo) {
      if (!loadedStudent.routeId) return;

      const { data: tripData } = await supabase
        .from('trips')
        .select('id, bus_id, route_id, status, started_at')
        .eq('route_id', loadedStudent.routeId)
        .eq('status', 'ACTIVE')
        .maybeSingle();

      if (!isMounted) return;

      if (!tripData) {
        if (channel) {
          supabase.removeChannel(channel);
          channel = null;
        }
        setTrip(null);
        setAttendance(null);
        setBusPosition(null);
        setBusSpeed(null);
        setIsApproaching(false);
        hasAnimatedToBusRef.current = false;
        return;
      }

      const loadedTrip: TripInfo = {
        id: tripData.id,
        busId: tripData.bus_id,
        routeId: tripData.route_id,
      };

      setTrip(loadedTrip);
      hasAnimatedToBusRef.current = false;

      const { data: attendanceData } = await supabase
        .from('attendance')
        .select('status, marked_at')
        .eq('trip_id', loadedTrip.id)
        .eq('student_id', loadedStudent.id)
        .maybeSingle();

      if (isMounted && attendanceData) {
        setAttendance({ status: attendanceData.status });
      }

      subscribeToTrip(loadedTrip, loadedStudent);
    }

    function subscribeToTrip(loadedTrip: TripInfo, loadedStudent: StudentInfo) {
      if (channel) {
        supabase.removeChannel(channel);
        channel = null;
      }

      channel = supabase.channel(`bus:${loadedTrip.busId}`);

      channel
        .on('broadcast', { event: 'location_update' }, (msg) => {
          const payload = msg.payload as {
            lat: number;
            lng: number;
            speed: number;
            timestamp: string;
            busId: string;
          };

          if (!isMounted) return;

          setBusPosition({ lat: payload.lat, lng: payload.lng });
          setBusSpeed(payload.speed);

          animatedRegionRef.current
            .timing({
              latitude: payload.lat,
              longitude: payload.lng,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
              duration: 1000,
              useNativeDriver: false,
            } as never)
            .start();

          if (!hasAnimatedToBusRef.current && mapRef.current) {
            hasAnimatedToBusRef.current = true;
            mapRef.current.animateToRegion(
              {
                latitude: payload.lat,
                longitude: payload.lng,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
              },
              1000,
            );
          }

          setStop((currentStop) => {
            if (currentStop) {
              const distance = haversineDistance(
                payload.lat,
                payload.lng,
                currentStop.latitude,
                currentStop.longitude,
              );
              setIsApproaching(distance < APPROACH_RADIUS_M);
            }
            return currentStop;
          });
        })
        .on('broadcast', { event: 'student_boarded' }, (msg) => {
          const payload = msg.payload as { studentId: string };
          if (payload.studentId === loadedStudent.id && isMounted) {
            setAttendance({ status: 'BOARDED' });
          }
        })
        .on('broadcast', { event: 'student_dropped' }, (msg) => {
          const payload = msg.payload as { studentId: string };
          if (payload.studentId === loadedStudent.id && isMounted) {
            setAttendance({ status: 'DROPPED_OFF' });
          }
        })
        .subscribe();
    }

    async function init() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const loadedStudent = await loadStudentAndStop();
        if (!loadedStudent || !isMounted) {
          if (isMounted) setIsLoading(false);
          return;
        }

        await checkForActiveTrip(loadedStudent);

        pollIntervalId = setInterval(() => {
          checkForActiveTrip(loadedStudent);
        }, POLL_INTERVAL_MS);
      } catch {
        if (isMounted) setErrorMessage('Something went wrong. Please try again.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    init();

    return () => {
      isMounted = false;
      if (pollIntervalId) clearInterval(pollIntervalId);
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const distanceToStop =
    stop && busPosition
      ? haversineDistance(busPosition.lat, busPosition.lng, stop.latitude, stop.longitude)
      : null;

  const etaSeconds =
    distanceToStop !== null && busSpeed !== null
      ? estimateETA(distanceToStop, busSpeed)
      : null;

  function renderEtaText() {
    if (!trip) return null;

    if (
      (etaSeconds !== null && etaSeconds <= 60) ||
      (distanceToStop !== null && distanceToStop < APPROACH_RADIUS_M)
    ) {
      return <Text style={[styles.etaText, { color: ROUTE_GREEN }]}>Arriving soon</Text>;
    }

    if (busSpeed === 0 && distanceToStop !== null && distanceToStop > APPROACH_RADIUS_M) {
      return <Text style={[styles.etaText, { color: MUTED }]}>Bus is stopped</Text>;
    }

    if (etaSeconds !== null && etaSeconds > 60 && Number.isFinite(etaSeconds)) {
      const minutes = Math.round(etaSeconds / 60);
      return <Text style={styles.etaText}>~{minutes} minutes away</Text>;
    }

    return null;
  }

  const chip = getStatusChip(trip, attendance, busSpeed);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['top']}>
        <Text style={styles.loadingText}>Loading…</Text>
      </SafeAreaView>
    );
  }

  if (errorMessage) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['top']}>
        <Text style={styles.errorText}>{errorMessage}</Text>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={{
            latitude: LAGOS_LAT,
            longitude: LAGOS_LNG,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          }}
        >
          {stop ? (
            <Marker
              coordinate={{ latitude: stop.latitude, longitude: stop.longitude }}
              title={stop.name}
              pinColor={STOP_RED}
            />
          ) : null}

          {trip && busPosition ? (
            <MarkerAnimated
              coordinate={animatedRegionRef.current as never}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={styles.markerWrapper}>
                {isApproaching ? (
                  <Animated.View
                    style={[
                      styles.pulse,
                      {
                        opacity: pulseOpacity,
                        transform: [{ scale: pulseScale }],
                      },
                    ]}
                  />
                ) : null}
                <View style={styles.busMarker}>
                  <Text style={styles.busMarkerText}>🚌</Text>
                </View>
              </View>
            </MarkerAnimated>
          ) : null}
        </MapView>
      </View>

      <View style={styles.card}>
        {student ? (
          <>
            <View style={styles.row}>
              {student.photoUrl ? (
                <View style={styles.photoCircle} />
              ) : (
                <View style={styles.initialsCircle}>
                  <Text style={styles.initialsText}>
                    {student.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={styles.nameBlock}>
                <Text style={styles.studentName}>{student.name}</Text>
                <Text style={styles.studentClass}>{student.className}</Text>
              </View>
            </View>

            <View style={[styles.chip, { backgroundColor: chip.bg }]}>
              <Text style={[styles.chipText, { color: chip.color }]}>{chip.label}</Text>
            </View>

            {stop ? (
              <Text style={styles.stopName}>📍 {stop.name}</Text>
            ) : null}

            {renderEtaText()}

            {!trip ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>No bus tracking right now</Text>
              </View>
            ) : null}
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  loadingText: {
    color: MUTED,
    fontSize: 16,
  },
  errorText: {
    color: MUTED,
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  mapContainer: {
    height: '65%',
  },
  markerWrapper: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulse: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,201,0,0.6)',
  },
  busMarker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: DANFO,
    alignItems: 'center',
    justifyContent: 'center',
  },
  busMarkerText: {
    fontSize: 20,
  },
  card: {
    height: '35%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    marginTop: -24,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: -2 },
    shadowRadius: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  photoCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
  },
  initialsCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: DANFO,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsText: {
    color: INK,
    fontWeight: '700',
    fontSize: 16,
  },
  nameBlock: {
    marginLeft: 12,
  },
  studentName: {
    fontSize: 20,
    fontWeight: '700',
    color: INK,
  },
  studentClass: {
    fontSize: 14,
    color: MUTED,
  },
  chip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    marginBottom: 10,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
  },
  stopName: {
    fontSize: 14,
    color: MUTED,
    marginBottom: 4,
  },
  etaText: {
    fontSize: 16,
    fontWeight: '600',
    color: INK,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 16,
  },
  emptyStateText: {
    color: MUTED,
    fontSize: 15,
    textAlign: 'center',
  },
});
