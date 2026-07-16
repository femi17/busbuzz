import { useFocusEffect } from '@react-navigation/native';
import {
  Camera,
  LineLayer,
  MapView,
  MarkerView,
  PointAnnotation,
  ShapeSource as ShapeSourceComponent,
  StyleURL,
} from '@rnmapbox/maps';
import { StatusBar } from 'expo-status-bar';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ElementRef,
  type ReactNode,
} from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { estimateETA, haversineDistance } from '../../../../shared/geo';
import { getFirstName } from '../../../../shared/name';
import { supabase } from '../../lib/supabase';
import { getChildColors } from './childColors';
import { BusIcon, CheckIcon, ChevronIcon, PhoneIcon, PinIcon, SchoolIcon } from './components/Icons';
import { ConfirmDialog } from './components/ConfirmDialog';
import { savePickupLocation } from './pickupLocation';
import { useStatusBarBackdrop } from './StatusBarBackdropContext';
import { useStudents, type LinkedStudent } from './StudentContext';
import { color, radius, space, type } from './theme';

const LAGOS_LAT = 6.5244;
const LAGOS_LNG = 3.3792;
const APPROACH_RADIUS_M = 300;
const POLL_INTERVAL_MS = 30000;
const DEFAULT_ZOOM = 13;
const MAX_BREADCRUMB_POINTS = 500;

// @rnmapbox/maps' generated .d.ts for ShapeSource merges two mismatched
// constructor signatures, which breaks JSX prop-checking even for valid
// usage — same workaround already used in HistoryScreen.tsx.
const ShapeSource = ShapeSourceComponent as unknown as ComponentType<{
  id: string;
  shape: GeoJSON.Feature<GeoJSON.LineString>;
  children?: ReactNode;
}>;

function buildTraceFeature(points: Array<{ lat: number; lng: number }>): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: points.map((p) => [p.lng, p.lat]),
    },
  };
}

type StopInfo = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  etaMinutes: number | null;
};

type TripInfo = {
  id: string;
  busId: string;
  routeId: string;
  hasSos: boolean;
};

type AttendanceState = {
  status: 'BOARDED' | 'ABSENT' | 'DROPPED_OFF';
} | null;

type BusInfo = {
  plateNumber: string;
  driverName: string | null;
  driverPhotoUrl: string | null;
  driverPhone: string | null;
};

type RouteType = 'MORNING' | 'AFTERNOON' | 'BOTH' | null;

type StatusChip = {
  label: string;
  bg: string;
  dot: string;
  text: string;
};

function getStatusChip(
  trip: TripInfo | null,
  attendance: AttendanceState,
  busSpeed: number | null,
  isApproaching: boolean,
  routeType: RouteType,
): StatusChip {
  if (trip?.hasSos) {
    return { label: 'Breakdown reported', bg: color.stopRedBg, dot: color.stopRed, text: color.ledger700 };
  }
  if (!trip) {
    return { label: 'Not started', bg: color.paper100, dot: color.ledger400, text: color.ledger700 };
  }
  if (attendance?.status === 'BOARDED') {
    return { label: 'Boarded', bg: color.routeGreenBg, dot: color.routeGreen, text: color.ledger700 };
  }
  if (attendance?.status === 'DROPPED_OFF') {
    const label = routeType === 'AFTERNOON' ? 'Home' : 'In school';
    return { label, bg: color.routeGreenBg, dot: color.routeGreen, text: color.ledger700 };
  }
  if (isApproaching) {
    return { label: 'Picking up', bg: 'rgba(255,201,0,0.16)', dot: color.danfo500, text: color.ledger700 };
  }
  if (busSpeed !== null && busSpeed > 0) {
    return { label: 'On route', bg: 'rgba(255,201,0,0.16)', dot: color.danfo500, text: color.ledger700 };
  }
  return { label: 'Trip started', bg: color.paper100, dot: color.ledger400, text: color.ledger700 };
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// "4:32" style countdown for the ETA column.
function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

// Where a child (not necessarily the selected one) should be pinned:
// their own saved pickup spot, or failing that, their school — no assigned
// stop lookup for non-selected siblings, to avoid an extra query per child.
function resolveChildPin(student: LinkedStudent): [number, number] | null {
  if (student.pickupLat != null && student.pickupLng != null) {
    return [student.pickupLng, student.pickupLat];
  }
  if (student.schoolLat != null && student.schoolLng != null) {
    return [student.schoolLng, student.schoolLat];
  }
  return null;
}

export default function HomeScreen() {
  const {
    students,
    selectedStudent,
    selectStudent,
    isLoading: isLoadingStudents,
    errorMessage: studentsErrorMessage,
    reload: reloadStudents,
  } = useStudents();

  const insets = useSafeAreaInsets();
  const { setColor: setStatusBarBackdropColor } = useStatusBarBackdrop();

  // The Track screen is the one place the map should bleed fully under the
  // status bar — no colored strip at all here, just the map showing through,
  // with dark status bar icons (the app default everywhere else is a solid
  // danfo-yellow strip, which would otherwise cover the top of the map).
  useFocusEffect(
    useCallback(() => {
      setStatusBarBackdropColor('transparent');
      return () => setStatusBarBackdropColor(null);
    }, [setStatusBarBackdropColor]),
  );

  const [stop, setStop] = useState<StopInfo | null>(null);
  const [trip, setTrip] = useState<TripInfo | null>(null);
  const [attendance, setAttendance] = useState<AttendanceState>(null);
  const [busSpeed, setBusSpeed] = useState<number | null>(null);
  const [busPosition, setBusPosition] = useState<{ lat: number; lng: number } | null>(null);
  // When the last GPS ping landed — anchors the ETA countdown so it keeps
  // ticking down between pings instead of jumping every 10 seconds.
  const [busUpdatedAt, setBusUpdatedAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [isApproaching, setIsApproaching] = useState(false);
  const [isLoadingTrip, setIsLoadingTrip] = useState(true);
  const [tripErrorMessage, setTripErrorMessage] = useState<string | null>(null);

  const [busInfo, setBusInfo] = useState<BusInfo | null>(null);
  const [routeType, setRouteType] = useState<RouteType>(null);

  const [childColors, setChildColors] = useState<Record<string, string>>({});

  // "Not going today" — parent-reported absence for the selected child.
  const [absentToday, setAbsentToday] = useState(false);
  const [isTogglingAbsence, setIsTogglingAbsence] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setAbsentToday(false);
    if (!selectedStudent?.id) return;

    const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local
    supabase
      .from('student_absences')
      .select('id')
      .eq('student_id', selectedStudent.id)
      .eq('absence_date', today)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setAbsentToday(!!data);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedStudent?.id]);

  const submitAbsence = useCallback(
    async (action: 'report' | 'cancel') => {
      if (!selectedStudent?.id) return;
      setIsTogglingAbsence(true);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) {
          Alert.alert('Session expired', 'Please sign in again.');
          return;
        }

        const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
        const response = await fetch(`${supabaseUrl}/functions/v1/report-absence`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ studentId: selectedStudent.id, action }),
        });

        if (!response.ok) {
          const errJson = await response.json().catch(() => null);
          Alert.alert('Error', errJson?.error ?? 'Could not update. Please try again.');
          return;
        }

        setAbsentToday(action === 'report');
      } catch {
        Alert.alert('Error', 'Could not update. Please try again.');
      } finally {
        setIsTogglingAbsence(false);
      }
    },
    [selectedStudent?.id],
  );

  const [showAbsenceConfirm, setShowAbsenceConfirm] = useState(false);

  function handleAbsencePress() {
    if (!selectedStudent) return;
    if (absentToday) {
      submitAbsence('cancel');
      return;
    }
    setShowAbsenceConfirm(true);
  }

  // The map journey: the bus's actual traveled path this trip, which stops
  // it's passed (detected purely by GPS proximity — never by reading who
  // boarded, so no other family's child is ever named), and a distinct
  // moment when it reaches this child's own stop.
  const [routeStops, setRouteStops] = useState<StopInfo[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<Array<{ lat: number; lng: number }>>([]);
  const [reachedStops, setReachedStops] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState(false);
  const [showArrivalModal, setShowArrivalModal] = useState(false);
  const arrivalNotifiedTripIdRef = useRef<string | null>(null);
  const currentTripIdRef = useRef<string | null>(null);
  const routeStopsRef = useRef<StopInfo[]>([]);

  // Card expand/collapse: one Animated.Value drives the timeline reveal (its
  // height + opacity) and the header chevron's rotation together, so tapping
  // "View details" slides the whole card up as one motion. Layout height can't
  // run on the native driver, so everything derived from this stays off it.
  const expand = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    routeStopsRef.current = routeStops;
  }, [routeStops]);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (!cancelled) setReduceMotion(on);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Collapse the card whenever the child changes — a fresh context shouldn't
  // inherit the previous child's open journey.
  useEffect(() => {
    setExpanded(false);
    expand.setValue(0);
  }, [selectedStudent?.id, expand]);

  function toggleExpand() {
    const to = expanded ? 0 : 1;
    setExpanded((prev) => !prev);
    if (reduceMotion) {
      expand.setValue(to);
    } else {
      Animated.timing(expand, {
        toValue: to,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    }
  }

  const [draggedPickupPosition, setDraggedPickupPosition] = useState<[number, number] | null>(
    null,
  );
  const [isPickupDirty, setIsPickupDirty] = useState(false);
  const [isSavingPickup, setIsSavingPickup] = useState(false);
  const [pickupSaveError, setPickupSaveError] = useState<string | null>(null);
  const [justSavedPickup, setJustSavedPickup] = useState(false);

  // Re-read on every focus so a color changed on the Profile screen shows up
  // here without needing a global reactive store.
  useFocusEffect(
    useCallback(() => {
      if (students.length > 0) {
        getChildColors(students.map((s) => s.id)).then(setChildColors);
      }
    }, [students]),
  );

  const cameraRef = useRef<ElementRef<typeof Camera> | null>(null);
  const hasAnimatedToBusRef = useRef(false);
  const busAnimatedCoord = useRef(new Animated.ValueXY({ x: LAGOS_LNG, y: LAGOS_LAT })).current;
  const [displayedBusCoord, setDisplayedBusCoord] = useState<[number, number]>([
    LAGOS_LNG,
    LAGOS_LAT,
  ]);

  useEffect(() => {
    const id = busAnimatedCoord.addListener(({ x, y }) => {
      setDisplayedBusCoord([x, y]);
    });
    return () => busAnimatedCoord.removeListener(id);
  }, [busAnimatedCoord]);

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

  // The pin's position: whatever the parent has actively dragged it to, or
  // (if they haven't touched it yet) the saved pickup location, or — if the
  // admin hasn't placed one yet — the assigned stop's location, or — if
  // there's no stop either — the school's location, so there's always a
  // real pin to drag rather than nothing until an admin sets it up.
  // Derived at render time rather than mirrored into an effect-driven state,
  // so there's no dependency array to get wrong.
  const savedOrDefaultPickupPosition: [number, number] | null =
    selectedStudent?.pickupLat != null && selectedStudent?.pickupLng != null
      ? [selectedStudent.pickupLng, selectedStudent.pickupLat]
      : stop
      ? [stop.longitude, stop.latitude]
      : selectedStudent?.schoolLat != null && selectedStudent?.schoolLng != null
      ? [selectedStudent.schoolLng, selectedStudent.schoolLat]
      : null;
  const pickupPosition = draggedPickupPosition ?? savedOrDefaultPickupPosition;

  // The initial camera position, computed straight from data already on
  // hand by the time this renders (StudentContext has already loaded by
  // here — the loading gate above blocks on it). Fed to Camera's
  // defaultSettings, which Mapbox reads once at mount, so the map opens on
  // the child's real location from the very first frame — no waiting on
  // cameraRef to attach and imperatively correct a hardcoded Lagos default,
  // which was racy (the ref isn't guaranteed attached the instant the
  // centering effect below first runs, so the correction could silently
  // no-op and leave the map sitting on the placeholder).
  const initialCameraCenter: [number, number] =
    selectedStudent?.pickupLat != null && selectedStudent?.pickupLng != null
      ? [selectedStudent.pickupLng, selectedStudent.pickupLat]
      : selectedStudent?.schoolLat != null && selectedStudent?.schoolLng != null
      ? [selectedStudent.schoolLng, selectedStudent.schoolLat]
      : [LAGOS_LNG, LAGOS_LAT];
  const hasRealInitialCenter = initialCameraCenter[0] !== LAGOS_LNG || initialCameraCenter[1] !== LAGOS_LAT;

  // Other children riding the same bus (same route) — shown as extra pins
  // alongside the selected child's, since it's genuinely the same physical
  // bus and the parent should see all their kids on it, not just one.
  const routeMates = selectedStudent
    ? students.filter((s) => s.id !== selectedStudent.id && s.routeId && s.routeId === selectedStudent.routeId)
    : [];

  // Only reset the drag override (and any in-flight save UI) when switching
  // to a different child — not on every render where `stop` happens to load.
  useEffect(() => {
    setDraggedPickupPosition(null);
    setIsPickupDirty(false);
    setPickupSaveError(null);
    setJustSavedPickup(false);
  }, [selectedStudent?.id]);

  // Center the map on the child's actual location — home before pickup,
  // school once dropped off there — instead of leaving it on a generic
  // city-wide default. Keyed on primitives only (never the derived
  // pickupPosition array, which changes identity on every drag) so this
  // can't fight the parent mid-drag or fire on unrelated re-renders. Skipped
  // entirely once a trip is active — the bus-following camera takes over.
  useEffect(() => {
    if (trip) return;

    const droppedAtSchool = attendance?.status === 'DROPPED_OFF' && routeType !== 'AFTERNOON';

    const center: [number, number] | null =
      droppedAtSchool && selectedStudent?.schoolLat != null && selectedStudent?.schoolLng != null
        ? [selectedStudent.schoolLng, selectedStudent.schoolLat]
        : selectedStudent?.pickupLat != null && selectedStudent?.pickupLng != null
        ? [selectedStudent.pickupLng, selectedStudent.pickupLat]
        : stop
        ? [stop.longitude, stop.latitude]
        : selectedStudent?.schoolLat != null && selectedStudent?.schoolLng != null
        ? [selectedStudent.schoolLng, selectedStudent.schoolLat]
        : null;

    if (center) {
      cameraRef.current?.setCamera({
        centerCoordinate: center,
        zoomLevel: 15,
        animationDuration: 800,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    !!trip,
    selectedStudent?.id,
    selectedStudent?.pickupLat,
    selectedStudent?.pickupLng,
    selectedStudent?.schoolLat,
    selectedStudent?.schoolLng,
    stop?.latitude,
    stop?.longitude,
    attendance?.status,
    routeType,
  ]);

  function handlePickupDragEnd(payload: { geometry: { coordinates: [number, number] } }) {
    setDraggedPickupPosition(payload.geometry.coordinates);
    setIsPickupDirty(true);
    setPickupSaveError(null);
    setJustSavedPickup(false);
  }

  function handleResetPickup() {
    setDraggedPickupPosition(null);
    setIsPickupDirty(false);
    setPickupSaveError(null);
  }

  async function handleSavePickup() {
    if (!selectedStudent || !pickupPosition) return;

    setIsSavingPickup(true);
    setPickupSaveError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setPickupSaveError('Session expired. Log in again.');
        return;
      }

      const [lng, lat] = pickupPosition;
      const ok = await savePickupLocation(session.access_token, selectedStudent.id, lat, lng);

      if (!ok) {
        setPickupSaveError("Couldn't save — check your connection and try again.");
        return;
      }

      setIsPickupDirty(false);
      setJustSavedPickup(true);
      reloadStudents();
      setTimeout(() => setJustSavedPickup(false), 2500);
    } finally {
      setIsSavingPickup(false);
    }
  }

  // Bus + driver + route stops in ONE round-trip via the get_parent_track_bundle
  // RPC, instead of the old route→bus→driver + stops query waterfall. The live
  // trip subscription below is deliberately left untouched.
  useEffect(() => {
    let isMounted = true;

    async function loadBundle() {
      if (!selectedStudent?.id) {
        if (isMounted) {
          setBusInfo(null);
          setRouteType(null);
          setRouteStops([]);
        }
        return;
      }

      const { data, error } = await supabase.rpc('get_parent_track_bundle', {
        p_student_id: selectedStudent.id,
      });

      if (!isMounted) return;

      if (error || !data) {
        setBusInfo(null);
        setRouteType(null);
        setRouteStops([]);
        return;
      }

      const bundle = data as {
        plateNumber: string | null;
        routeType: RouteType;
        driver: { name: string | null; photoUrl: string | null; phone: string | null } | null;
        stops: Array<{
          id: string;
          name: string;
          latitude: number;
          longitude: number;
          etaMinutes: number | null;
        }>;
      };

      setRouteType(bundle.routeType ?? null);
      setBusInfo(
        bundle.plateNumber
          ? {
              plateNumber: bundle.plateNumber,
              driverName: bundle.driver?.name ?? null,
              driverPhotoUrl: bundle.driver?.photoUrl ?? null,
              driverPhone: bundle.driver?.phone ?? null,
            }
          : null,
      );
      setRouteStops(
        (bundle.stops ?? []).map((s) => ({
          id: s.id,
          name: s.name,
          latitude: s.latitude,
          longitude: s.longitude,
          etaMinutes: s.etaMinutes,
        })),
      );
    }

    loadBundle();

    return () => {
      isMounted = false;
    };
  }, [selectedStudent?.id]);

  useEffect(() => {
    let isMounted = true;
    let pollIntervalId: ReturnType<typeof setInterval> | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    setStop(null);
    setTrip(null);
    setAttendance(null);
    setBusPosition(null);
    setBusSpeed(null);
    setBusUpdatedAt(null);
    setIsApproaching(false);
    setBreadcrumb([]);
    setReachedStops({});
    setShowArrivalModal(false);
    hasAnimatedToBusRef.current = false;
    currentTripIdRef.current = null;
    arrivalNotifiedTripIdRef.current = null;

    if (!selectedStudent) {
      setIsLoadingTrip(false);
      return;
    }

    async function loadStop() {
      if (!selectedStudent!.stopId) return;

      const { data: stopData } = await supabase
        .from('stops')
        .select('id, name, latitude, longitude, eta_minutes')
        .eq('id', selectedStudent!.stopId)
        .single();

      if (stopData && isMounted) {
        setStop({
          id: stopData.id,
          name: stopData.name,
          latitude: stopData.latitude,
          longitude: stopData.longitude,
          etaMinutes: stopData.eta_minutes,
        });
      }
    }

    async function checkForActiveTrip() {
      if (!selectedStudent!.routeId) return;

      const { data: tripData } = await supabase
        .from('trips')
        .select('id, bus_id, route_id, status, started_at, has_sos')
        .eq('route_id', selectedStudent!.routeId)
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
        setBusUpdatedAt(null);
        setIsApproaching(false);
        setBreadcrumb([]);
        setReachedStops({});
        hasAnimatedToBusRef.current = false;
        currentTripIdRef.current = null;
        return;
      }

      const loadedTrip: TripInfo = {
        id: tripData.id,
        busId: tripData.bus_id,
        routeId: tripData.route_id,
        hasSos: tripData.has_sos ?? false,
      };

      setTrip(loadedTrip);
      hasAnimatedToBusRef.current = false;

      // A genuinely new trip (not just this same trip's 30s poll refresh) —
      // seed the breadcrumb trail with whatever's already been recorded, and
      // start this trip's stop-reached log fresh.
      if (currentTripIdRef.current !== loadedTrip.id) {
        currentTripIdRef.current = loadedTrip.id;
        setBreadcrumb([]);
        setReachedStops({});

        const { data: locationRows } = await supabase
          .from('trip_locations')
          .select('latitude, longitude, recorded_at')
          .eq('trip_id', loadedTrip.id)
          .order('recorded_at');

        if (isMounted && locationRows) {
          setBreadcrumb(
            locationRows.slice(-MAX_BREADCRUMB_POINTS).map((p) => ({ lat: p.latitude, lng: p.longitude })),
          );
        }
      }

      const { data: attendanceData } = await supabase
        .from('attendance')
        .select('status, marked_at')
        .eq('trip_id', loadedTrip.id)
        .eq('student_id', selectedStudent!.id)
        .maybeSingle();

      if (isMounted && attendanceData) {
        setAttendance({ status: attendanceData.status });
      }

      subscribeToTrip(loadedTrip);
    }

    function subscribeToTrip(loadedTrip: TripInfo) {
      if (channel) {
        supabase.removeChannel(channel);
        channel = null;
      }

      // Private channel — Realtime Authorization restricts the bus:{busId}
      // topic to this bus's parents/driver/admin, so no anon client can
      // subscribe or spoof GPS. The client's session token authorizes it.
      channel = supabase.channel(`bus:${loadedTrip.busId}`, {
        config: { private: true },
      });

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
          setBusUpdatedAt(Date.now());
          setBreadcrumb((prev) => {
            const next = [...prev, { lat: payload.lat, lng: payload.lng }];
            return next.length > MAX_BREADCRUMB_POINTS ? next.slice(-MAX_BREADCRUMB_POINTS) : next;
          });

          if (!hasAnimatedToBusRef.current) {
            hasAnimatedToBusRef.current = true;
            busAnimatedCoord.setValue({ x: payload.lng, y: payload.lat });
            cameraRef.current?.flyTo([payload.lng, payload.lat], 1000);
          } else {
            Animated.timing(busAnimatedCoord, {
              toValue: { x: payload.lng, y: payload.lat },
              duration: 1000,
              useNativeDriver: false,
            }).start();
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

          // Stop-reached detection — purely geometric (GPS proximity to each
          // stop on the route), never derived from attendance records, so no
          // other family's child is ever named here, only "a stop was
          // reached." The parent's own stop additionally triggers the
          // distinct arrival modal, once per trip.
          for (const routeStop of routeStopsRef.current) {
            const distance = haversineDistance(payload.lat, payload.lng, routeStop.latitude, routeStop.longitude);
            if (distance >= APPROACH_RADIUS_M) continue;

            setReachedStops((prev) => {
              if (prev[routeStop.id]) return prev;
              return { ...prev, [routeStop.id]: new Date().toISOString() };
            });

            if (
              routeStop.id === selectedStudent!.stopId &&
              arrivalNotifiedTripIdRef.current !== currentTripIdRef.current
            ) {
              arrivalNotifiedTripIdRef.current = currentTripIdRef.current;
              setShowArrivalModal(true);
            }
          }
        })
        .on('broadcast', { event: 'student_boarded' }, (msg) => {
          const payload = msg.payload as { studentId: string };
          if (payload.studentId === selectedStudent!.id && isMounted) {
            setAttendance({ status: 'BOARDED' });
          }
        })
        .on('broadcast', { event: 'student_dropped' }, (msg) => {
          const payload = msg.payload as { studentId: string };
          if (payload.studentId === selectedStudent!.id && isMounted) {
            setAttendance({ status: 'DROPPED_OFF' });
          }
        })
        .subscribe();
    }

    async function init() {
      setIsLoadingTrip(true);
      setTripErrorMessage(null);

      try {
        await loadStop();
        await checkForActiveTrip();

        pollIntervalId = setInterval(() => {
          checkForActiveTrip();
        }, POLL_INTERVAL_MS);
      } catch {
        if (isMounted) setTripErrorMessage('Something went wrong. Please try again.');
      } finally {
        if (isMounted) setIsLoadingTrip(false);
      }
    }

    init();

    return () => {
      isMounted = false;
      if (pollIntervalId) clearInterval(pollIntervalId);
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStudent]);

  // Tick once a second while a trip is live so the ETA counts down smoothly
  // between GPS pings.
  useEffect(() => {
    if (!trip) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [!!trip]); // eslint-disable-line react-hooks/exhaustive-deps

  // What the countdown targets: the child's own stop until they've boarded;
  // once boarded on a school-bound run, the school — that's where the bus is
  // taking them, so that's the arrival the parent is waiting on.
  const etaTarget =
    attendance?.status === 'BOARDED' &&
    routeType !== 'AFTERNOON' &&
    selectedStudent?.schoolLat != null &&
    selectedStudent?.schoolLng != null
      ? { latitude: selectedStudent.schoolLat, longitude: selectedStudent.schoolLng }
      : stop;

  const distanceToStop =
    etaTarget && busPosition
      ? haversineDistance(busPosition.lat, busPosition.lng, etaTarget.latitude, etaTarget.longitude)
      : null;

  const etaSeconds =
    distanceToStop !== null && busSpeed !== null
      ? estimateETA(distanceToStop, busSpeed)
      : null;

  // The live countdown: seconds left as of the last ping, minus the time
  // elapsed since that ping.
  const countdownSeconds =
    trip && etaSeconds !== null && Number.isFinite(etaSeconds) && busUpdatedAt !== null
      ? Math.max(0, etaSeconds - (nowTick - busUpdatedAt) / 1000)
      : null;

  const isArriving =
    !!trip &&
    ((etaSeconds !== null && etaSeconds <= 60) ||
      (distanceToStop !== null && distanceToStop < APPROACH_RADIUS_M));
  const isStopped =
    !!trip && busSpeed === 0 && distanceToStop !== null && distanceToStop > APPROACH_RADIUS_M;

  const chip = getStatusChip(trip, attendance, busSpeed, isApproaching, routeType);
  const selectedChildColor = selectedStudent
    ? childColors[selectedStudent.id] ?? color.danfo500
    : color.danfo500;
  const isLoading = isLoadingStudents || (!!selectedStudent && isLoadingTrip);
  const errorMessage = studentsErrorMessage ?? tripErrorMessage;

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  if (errorMessage) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>{errorMessage}</Text>
      </View>
    );
  }

  const reachedCount = routeStops.filter((s) => reachedStops[s.id]).length;
  // The stop the bus is currently heading for = the first one it hasn't reached
  // yet. Highlighted in the timeline so the journey reads as a progression.
  const nextStopIndex = routeStops.findIndex((s) => !reachedStops[s.id]);
  const nextRouteStop = nextStopIndex >= 0 ? routeStops[nextStopIndex] : null;

  // The child's own stop name — from their assigned stop, or (if that query
  // came back empty) looked up on the route itself, so the card never shows
  // a bare dash when the route data knows the answer.
  const myStopName =
    stop?.name ?? routeStops.find((s) => s.id === selectedStudent?.stopId)?.name ?? null;

  // Left column of the card: during a live trip, the stop the bus is heading
  // to right now; otherwise the child's own stop.
  const nextStopText = trip ? nextRouteStop?.name ?? myStopName ?? '—' : myStopName ?? '—';
  const nextStopLabel = trip ? 'Next stop' : 'Your stop';

  // ETA shown in the card's right column — a live m:ss countdown to the
  // child's stop (or the school once they've boarded). Falls back to the
  // stop's scheduled ride time (e.g. before the first GPS ping arrives) so
  // the column is never blank.
  let etaText = '—';
  if (isArriving) etaText = 'Now';
  else if (countdownSeconds !== null) etaText = formatCountdown(countdownSeconds);
  else if (stop?.etaMinutes != null) etaText = `~${stop.etaMinutes} min`;
  else if (trip) etaText = 'En route';

  // Live status sits under the ETA. Only while a trip is running — before that
  // there's deliberately no "not started" label.
  const statusLabel = trip ? chip.label : null;
  const statusColor = trip ? chip.dot : color.ledger400;

  // Drive the card's expand motion from the single `expand` value.
  const timelineMaxHeight = expand.interpolate({ inputRange: [0, 1], outputRange: [0, 300] });
  const timelineOpacity = expand.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const chevronRotate = expand.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      <ConfirmDialog
        visible={showAbsenceConfirm}
        title={`${selectedStudent ? getFirstName(selectedStudent.name) || selectedStudent.name : 'Your child'} isn't going today?`}
        message="The school and the driver will be told not to stop for them today. You can undo this any time before the trip."
        confirmLabel="Yes, not going"
        cancelLabel="Cancel"
        destructive
        onCancel={() => setShowAbsenceConfirm(false)}
        onConfirm={() => {
          setShowAbsenceConfirm(false);
          submitAbsence('report');
        }}
      />

      {/* Full-bleed map — the peace-of-mind surface. The card floats over it. */}
      <View style={StyleSheet.absoluteFill}>
        <MapView
          style={StyleSheet.absoluteFill}
          styleURL={StyleURL.Street}
          scaleBarEnabled={false}
          logoEnabled={false}
          compassEnabled={false}
          attributionPosition={{ bottom: 8, left: 8 }}
        >
          <Camera
            ref={cameraRef}
            defaultSettings={{
              centerCoordinate: initialCameraCenter,
              zoomLevel: hasRealInitialCenter ? 15 : DEFAULT_ZOOM,
            }}
          />

          {trip && breadcrumb.length > 1 ? (
            <ShapeSource id="trip-breadcrumb" shape={buildTraceFeature(breadcrumb)}>
              <LineLayer
                id="trip-breadcrumb-line"
                style={{ lineColor: color.danfo500, lineWidth: 4, lineCap: 'round', lineJoin: 'round' }}
              />
            </ShapeSource>
          ) : null}

          {trip
            ? routeStops
                .filter((routeStop) => routeStop.id !== selectedStudent?.stopId)
                .map((routeStop) => (
                  <PointAnnotation
                    key={routeStop.id}
                    id={`waypoint-${routeStop.id}`}
                    coordinate={[routeStop.longitude, routeStop.latitude]}
                    title={routeStop.name}
                  >
                    <View
                      style={[
                        styles.waypointDot,
                        reachedStops[routeStop.id] && styles.waypointDotReached,
                      ]}
                    />
                  </PointAnnotation>
                ))
            : null}

          {stop ? (
            <PointAnnotation
              id="stop-marker"
              coordinate={[stop.longitude, stop.latitude]}
              title={stop.name}
            >
              <View style={styles.stopMarker}>
                <PinIcon size={22} color={color.stopRed} />
              </View>
            </PointAnnotation>
          ) : null}

          {pickupPosition ? (
            <PointAnnotation
              id="pickup-marker"
              coordinate={pickupPosition}
              draggable
              onDragEnd={handlePickupDragEnd}
              title="Your pickup spot"
              snippet="Drag to fix this if it's in the wrong place"
            >
              <View style={styles.pickupWrap}>
                {isPickupDirty ? <View style={styles.pickupHalo} /> : null}
                <View style={[styles.pickupPuck, { backgroundColor: selectedChildColor }]}>
                  <PinIcon size={16} color={color.ink900} />
                </View>
              </View>
            </PointAnnotation>
          ) : null}

          {routeMates.map((mate) => {
            const pin = resolveChildPin(mate);
            if (!pin) return null;
            const mateColor = childColors[mate.id] ?? color.danfo500;
            return (
              <PointAnnotation key={mate.id} id={`sibling-${mate.id}`} coordinate={pin} title={mate.name}>
                <View style={[styles.siblingPuck, { backgroundColor: mateColor }]}>
                  <Text style={styles.siblingPuckText}>{getInitials(mate.name)}</Text>
                </View>
              </PointAnnotation>
            );
          })}

          {trip && busPosition ? (
            <MarkerView coordinate={displayedBusCoord} anchor={{ x: 0.5, y: 0.5 }}>
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
                  <BusIcon size={22} color={color.danfo500} />
                </View>
              </View>
            </MarkerView>
          ) : null}
        </MapView>

        {/* Top-right row: "not going today" toggle + child switcher — floats
            clear of the status bar. The absence toggle only makes sense
            before a trip starts; the "More details" action already owns
            this spot on the card once a trip is running. */}
        {(selectedStudent && !trip) || students.length > 1 ? (
          <View style={[styles.childSwitcher, { top: insets.top + space.sm }]}>
            {selectedStudent && !trip ? (
              <Pressable
                onPress={handleAbsencePress}
                disabled={isTogglingAbsence}
                accessibilityRole="button"
                accessibilityLabel={
                  absentToday
                    ? `Mark ${getFirstName(selectedStudent.name) || selectedStudent.name} as attending school today`
                    : `Mark ${getFirstName(selectedStudent.name) || selectedStudent.name} as not attending school today`
                }
                style={({ pressed }) => [
                  styles.topIconButton,
                  absentToday && styles.topIconButtonActive,
                  pressed && styles.topIconButtonPressed,
                ]}
              >
                {isTogglingAbsence ? (
                  <ActivityIndicator size="small" color={absentToday ? color.white : color.ink900} />
                ) : (
                  <>
                    {/* Slashed-school glyph in both states — the slash is what
                        says "skip school today", so it can't read as a home
                        button. The label removes any remaining guesswork. */}
                    <SchoolIcon
                      size={16}
                      color={absentToday ? color.white : color.ink900}
                      strikethrough
                    />
                    <Text
                      style={[styles.topIconButtonLabel, absentToday && styles.topIconButtonLabelActive]}
                    >
                      {absentToday ? 'Not going today' : 'Not going?'}
                    </Text>
                  </>
                )}
              </Pressable>
            ) : null}
            {students.length > 1
              ? students.map((student) => {
                  const active = student.id === selectedStudent?.id;
                  const swatch = childColors[student.id] ?? color.danfo500;
                  return (
                    <Pressable
                      key={student.id}
                      onPress={() => selectStudent(student.id)}
                      accessibilityLabel={student.name}
                      style={[
                        styles.childSwitcherIcon,
                        { backgroundColor: swatch },
                        active && styles.childSwitcherIconActive,
                      ]}
                    >
                      <Text style={styles.childSwitcherText}>{getInitials(student.name)}</Text>
                    </Pressable>
                  );
                })
              : null}
          </View>
        ) : null}

        {/* Pickup-editing banner — anchored to the top so it never fights the
            sheet at the bottom */}
        {pickupPosition && (isPickupDirty || isSavingPickup || justSavedPickup || pickupSaveError) ? (
          <View style={[styles.pickupBar, { top: insets.top + space.sm }]}>
            {justSavedPickup ? (
              <Text style={styles.pickupBarSavedText}>Pickup spot saved</Text>
            ) : (
              <>
                <View style={styles.pickupBarTextWrap}>
                  <Text style={styles.pickupBarTitle}>Move the pin to fix your pickup spot</Text>
                  {pickupSaveError ? (
                    <Text style={styles.pickupBarError}>{pickupSaveError}</Text>
                  ) : null}
                </View>
                <Pressable
                  onPress={handleResetPickup}
                  disabled={isSavingPickup}
                  style={({ pressed }) => [styles.pickupResetButton, pressed && styles.pickupButtonPressed]}
                >
                  <Text style={styles.pickupResetText}>Reset</Text>
                </Pressable>
                <Pressable
                  onPress={handleSavePickup}
                  disabled={isSavingPickup}
                  style={({ pressed }) => [styles.pickupSaveButton, pressed && styles.pickupButtonPressed]}
                >
                  {isSavingPickup ? (
                    <ActivityIndicator size="small" color={color.ink900} />
                  ) : (
                    <Text style={styles.pickupSaveText}>Save</Text>
                  )}
                </Pressable>
              </>
            )}
          </View>
        ) : null}
      </View>

      {/* Floating tracking card — one card, three states: default, expanded
          journey, and arrived */}
      {selectedStudent ? (
        <View style={[styles.card, { bottom: insets.bottom + space.md }]}>
          {showArrivalModal ? (
            /* ── Arrived ── */
            <>
              <View style={styles.arrivalHead}>
                <View style={styles.arrivalBadge}>
                  <BusIcon size={30} color={color.ink900} />
                  <View style={styles.arrivalCheck}>
                    <CheckIcon size={13} color={color.white} />
                  </View>
                </View>
                <Text style={styles.arrivalTitle}>Your bus has arrived</Text>
                <Text style={styles.arrivalSubtext} numberOfLines={2}>
                  {stop
                    ? `${busInfo?.driverName ?? 'The driver'} is at ${stop.name}.`
                    : 'The bus is at your stop.'}
                </Text>
              </View>

              <View style={styles.divider} />

              <View style={styles.metaRow}>
                <View style={styles.metaCol}>
                  <Text style={styles.metaLabel}>Stop</Text>
                  <Text style={styles.metaValue} numberOfLines={1}>{stop?.name ?? '—'}</Text>
                </View>
                <View style={styles.metaDivider} />
                <View style={styles.metaCol}>
                  <Text style={styles.metaLabel}>Time</Text>
                  <Text style={styles.metaValueMono}>
                    {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
                <View style={styles.metaDivider} />
                <View style={styles.metaCol}>
                  <Text style={styles.metaLabel}>Status</Text>
                  <Text style={styles.metaValueGreen}>Arrived</Text>
                </View>
              </View>

              <Pressable
                style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
                onPress={() => setShowArrivalModal(false)}
              >
                <Text style={styles.primaryBtnText}>Got it</Text>
              </Pressable>
            </>
          ) : (
            /* ── Default + expanded journey ── */
            <>
              {/* Header: bus plate + expand chevron */}
              <Pressable
                style={styles.cardHeader}
                onPress={trip ? toggleExpand : undefined}
                disabled={!trip}
                accessibilityRole={trip ? 'button' : undefined}
              >
                <View style={styles.headerLeft}>
                  <Text style={styles.headerLabel}>Bus plate</Text>
                  <Text style={styles.plate} numberOfLines={1}>
                    {busInfo?.plateNumber ?? 'No bus assigned'}
                  </Text>
                </View>
                {trip ? (
                  <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
                    <ChevronIcon size={20} color={color.ledger400} />
                  </Animated.View>
                ) : null}
              </Pressable>

              <View style={styles.divider} />

              {/* Driver + school + call */}
              <View style={styles.driverRow}>
                {busInfo?.driverPhotoUrl ? (
                  <Image source={{ uri: busInfo.driverPhotoUrl }} style={styles.driverAvatar} />
                ) : (
                  <View style={styles.driverAvatarFallback}>
                    <Text style={styles.driverAvatarFallbackText}>
                      {busInfo?.driverName ? getInitials(busInfo.driverName) : '—'}
                    </Text>
                  </View>
                )}
                <View style={styles.driverMeta}>
                  <Text style={styles.driverName} numberOfLines={1}>
                    {busInfo?.driverName ?? 'Driver not assigned'}
                  </Text>
                  <Text style={styles.schoolName} numberOfLines={1}>
                    {selectedStudent.schoolName ?? 'School'}
                  </Text>
                </View>
                {busInfo?.driverPhone ? (
                  <Pressable
                    onPress={() => Linking.openURL(`tel:${busInfo.driverPhone}`)}
                    accessibilityLabel={`Call ${busInfo.driverName ?? 'driver'}`}
                    style={({ pressed }) => [styles.callButton, pressed && styles.callButtonPressed]}
                  >
                    <PhoneIcon size={18} color={color.ink900} />
                  </Pressable>
                ) : null}
              </View>

              <View style={styles.divider} />

              {/* Next stop + ETA, with live status under the ETA */}
              <View style={styles.statsRow}>
                <View style={styles.statCol}>
                  <Text style={styles.statLabel}>{nextStopLabel}</Text>
                  <Text style={styles.statValue} numberOfLines={1}>{nextStopText}</Text>
                </View>
                <View style={styles.statColRight}>
                  <Text style={styles.statLabel}>ETA</Text>
                  <Text style={styles.statValue}>{etaText}</Text>
                  {statusLabel ? (
                    <Text style={[styles.statusUnder, { color: statusColor }]} numberOfLines={1}>
                      {statusLabel}
                    </Text>
                  ) : null}
                </View>
              </View>

              {/* The journey — revealed when the card is expanded */}
              {trip ? (
                <Animated.View
                  style={{
                    maxHeight: timelineMaxHeight,
                    opacity: timelineOpacity,
                    overflow: 'hidden',
                  }}
                >
                  <View style={styles.divider} />
                  <View style={styles.journeyHeadRow}>
                    <Text style={styles.journeyHeading}>The journey</Text>
                    <Text style={styles.journeyCount}>
                      {reachedCount}/{routeStops.length} stops
                    </Text>
                  </View>
                  {routeStops.length === 0 ? (
                    <Text style={styles.timelineEmpty}>No stops on this route yet.</Text>
                  ) : (
                    <ScrollView
                      style={styles.timelineScroll}
                      contentContainerStyle={styles.timelineContent}
                      showsVerticalScrollIndicator={false}
                      nestedScrollEnabled
                    >
                      {routeStops.map((routeStop, index) => {
                        const reachedAt = reachedStops[routeStop.id];
                        const isMine = routeStop.id === selectedStudent?.stopId;
                        const isNext = index === nextStopIndex;
                        const isLast = index === routeStops.length - 1;

                        // Right-hand label: arrival time once reached, a live
                        // "Next · ETA" for the stop the bus is heading to, then
                        // "Your stop" / "Upcoming" for the rest.
                        let timeLabel: string;
                        if (reachedAt) {
                          timeLabel = new Date(reachedAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          });
                        } else if (isNext) {
                          timeLabel = isMine ? `Next · ${etaText}` : 'Next stop';
                        } else if (isMine) {
                          timeLabel = 'Your stop';
                        } else {
                          timeLabel = 'Upcoming';
                        }

                        return (
                          <View key={routeStop.id} style={styles.tlRow}>
                            <View style={styles.tlRail}>
                              <View
                                style={[
                                  styles.tlNode,
                                  isMine ? styles.tlNodeMine : null,
                                  !reachedAt && isNext ? styles.tlNodeNext : null,
                                  reachedAt ? styles.tlNodeReached : null,
                                ]}
                              >
                                {reachedAt ? <CheckIcon size={11} color={color.ink900} /> : null}
                                {!reachedAt && isMine ? <PinIcon size={11} color={color.white} /> : null}
                              </View>
                              {!isLast ? (
                                <View
                                  style={[
                                    styles.tlConnector,
                                    reachedAt ? styles.tlConnectorReached : null,
                                  ]}
                                />
                              ) : null}
                            </View>
                            <View style={[styles.tlBody, isLast && styles.tlBodyLast]}>
                              <Text
                                style={[styles.tlName, isMine && styles.tlNameMine]}
                                numberOfLines={1}
                              >
                                {routeStop.name}
                                {isMine ? '  ·  Your stop' : ''}
                              </Text>
                              <Text
                                style={[
                                  styles.tlTime,
                                  reachedAt && styles.tlTimeReached,
                                  !reachedAt && isNext && styles.tlTimeNext,
                                ]}
                              >
                                {timeLabel}
                              </Text>
                            </View>
                          </View>
                        );
                      })}
                    </ScrollView>
                  )}
                </Animated.View>
              ) : null}

              {/* View / hide details — "Not going today" lives as an icon
                  button over the map now, not here (see topRightRow). */}
              {trip ? (
                <Pressable
                  style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
                  onPress={toggleExpand}
                  accessibilityRole="button"
                >
                  <Text style={styles.primaryBtnText}>
                    {expanded ? 'Hide details' : 'More details'}
                  </Text>
                </Pressable>
              ) : absentToday ? (
                <View style={styles.absenceBanner}>
                  <View style={styles.absenceBannerDot} />
                  <Text style={styles.absenceBannerText}>Not going today — driver notified</Text>
                </View>
              ) : null}
            </>
          )}
        </View>
      ) : null}
    </View>
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
    color: color.mist400,
    fontSize: 16,
  },
  errorText: {
    color: color.mist400,
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  childSwitcher: {
    position: 'absolute',
    right: space.md,
    flexDirection: 'row',
    gap: space.xs + 2,
  },
  // "Not going today" toggle — a floating map control, same footprint as the
  // child-switcher avatars it sits beside. White/neutral when the child is
  // attending; flips to red with a struck-through school glyph once marked.
  topIconButton: {
    height: 36,
    borderRadius: 18,
    paddingHorizontal: space.sm + 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: color.white,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.6)',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 4,
  },
  topIconButtonActive: {
    backgroundColor: color.stopRed,
    borderColor: color.white,
  },
  topIconButtonPressed: {
    opacity: 0.85,
  },
  topIconButtonLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: color.ink900,
  },
  topIconButtonLabelActive: {
    color: color.white,
  },
  childSwitcherIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.6)',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 4,
  },
  childSwitcherIconActive: {
    borderColor: color.white,
    borderWidth: 3,
  },
  childSwitcherText: {
    fontSize: 12,
    fontWeight: '800',
    color: color.ink900,
  },
  siblingPuck: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: color.white,
  },
  siblingPuckText: {
    fontSize: 10,
    fontWeight: '800',
    color: color.ink900,
  },
  pickupWrap: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickupHalo: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,201,0,0.35)',
  },
  pickupPuck: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: color.white,
  },
  pickupBar: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.white,
    borderRadius: radius.md,
    paddingVertical: space.sm + 2,
    paddingHorizontal: space.md,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 6,
  },
  pickupBarTextWrap: {
    flex: 1,
    marginRight: space.sm,
  },
  pickupBarTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: color.ledger700,
  },
  pickupBarError: {
    fontSize: 11,
    fontWeight: '600',
    color: color.stopRed,
    marginTop: 2,
  },
  pickupBarSavedText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '800',
    color: color.routeGreen,
  },
  pickupResetButton: {
    paddingHorizontal: space.sm + 2,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    marginRight: space.xs,
  },
  pickupResetText: {
    fontSize: 12,
    fontWeight: '700',
    color: color.ledger400,
  },
  pickupSaveButton: {
    backgroundColor: color.danfo500,
    minWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
  },
  pickupSaveText: {
    fontSize: 12,
    fontWeight: '800',
    color: color.ink900,
  },
  pickupButtonPressed: {
    opacity: 0.7,
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
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: color.ink900,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: color.danfo500,
  },
  stopMarker: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waypointDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: color.mist400,
    borderWidth: 2,
    borderColor: color.white,
  },
  waypointDotReached: {
    backgroundColor: color.routeGreen,
  },
  // Floating tracking card
  card: {
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
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.xs,
  },
  headerLeft: {
    flexShrink: 1,
  },
  headerLabel: {
    ...type.eyebrow,
    fontSize: 10,
    color: color.ledger400,
    marginBottom: 3,
  },
  plate: {
    ...type.data,
    fontSize: 16,
    letterSpacing: 1.5,
    color: color.ink900,
  },
  divider: {
    height: 1,
    backgroundColor: color.paper100,
    marginVertical: space.md,
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  driverAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: color.paper100,
  },
  driverAvatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: color.paper100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverAvatarFallbackText: {
    color: color.ledger400,
    fontWeight: '800',
    fontSize: 15,
  },
  driverMeta: {
    flex: 1,
    marginLeft: space.md,
    gap: 2,
  },
  driverName: {
    fontSize: 16,
    fontWeight: '800',
    color: color.ledger700,
  },
  schoolName: {
    fontSize: 13,
    fontWeight: '600',
    color: color.ledger400,
  },
  callButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: color.danfo500,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: space.md,
  },
  callButtonPressed: {
    backgroundColor: color.danfo600,
  },
  // Next stop / ETA row
  statsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  statCol: {
    flex: 1,
  },
  statColRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  statLabel: {
    ...type.eyebrow,
    fontSize: 10,
    color: color.ledger400,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
    color: color.ink900,
  },
  statusUnder: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  // Journey heading (inside the expandable section)
  journeyHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.sm,
  },
  journeyHeading: {
    ...type.eyebrow,
    fontSize: 11,
    color: color.ledger400,
  },
  journeyCount: {
    ...type.data,
    fontSize: 11,
    color: color.ledger400,
  },
  timelineScroll: {
    maxHeight: 220,
    marginTop: space.xs,
  },
  timelineContent: {
    paddingTop: space.xs,
    paddingBottom: space.sm,
  },
  timelineEmpty: {
    fontSize: 13,
    color: color.ledger400,
    textAlign: 'center',
    paddingVertical: space.md,
  },
  tlRow: {
    flexDirection: 'row',
  },
  tlRail: {
    width: 24,
    alignItems: 'center',
  },
  tlNode: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: color.mist400,
    backgroundColor: color.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tlNodeReached: {
    backgroundColor: color.danfo500,
    borderColor: color.danfo500,
  },
  tlNodeMine: {
    backgroundColor: color.stopRed,
    borderColor: color.stopRed,
  },
  tlNodeNext: {
    borderColor: color.danfo500,
    backgroundColor: '#FFF3C4',
  },
  tlConnector: {
    flex: 1,
    width: 2,
    minHeight: 18,
    backgroundColor: color.paper100,
    marginVertical: 2,
  },
  tlConnectorReached: {
    backgroundColor: color.danfo500,
  },
  tlBody: {
    flex: 1,
    paddingLeft: space.md,
    paddingBottom: space.lg,
  },
  tlBodyLast: {
    paddingBottom: space.xs,
  },
  tlName: {
    fontSize: 14,
    fontWeight: '600',
    color: color.ledger700,
  },
  tlNameMine: {
    fontWeight: '800',
    color: color.ink900,
  },
  tlTime: {
    ...type.data,
    fontSize: 12,
    color: color.ledger400,
    marginTop: 2,
  },
  tlTimeReached: {
    color: color.ledger700,
  },
  tlTimeNext: {
    color: color.danfo600,
    fontWeight: '700',
  },
  // Arrived state (rendered inside the same card)
  arrivalHead: {
    alignItems: 'center',
    paddingTop: space.sm,
  },
  arrivalBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: color.danfo500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrivalCheck: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: color.routeGreen,
    borderWidth: 3,
    borderColor: color.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrivalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: color.ledger700,
    textAlign: 'center',
    marginTop: space.md,
  },
  arrivalSubtext: {
    fontSize: 13,
    color: color.ledger400,
    marginTop: space.xs,
    textAlign: 'center',
    lineHeight: 19,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  metaCol: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: space.xs,
  },
  metaDivider: {
    width: 1,
    height: 28,
    backgroundColor: color.paper100,
  },
  metaLabel: {
    ...type.eyebrow,
    fontSize: 10,
    color: color.ledger400,
    marginBottom: 4,
  },
  metaValue: {
    fontSize: 13,
    fontWeight: '700',
    color: color.ledger700,
  },
  metaValueMono: {
    ...type.data,
    fontSize: 13,
    color: color.ledger700,
  },
  metaValueGreen: {
    fontSize: 13,
    fontWeight: '800',
    color: color.routeGreen,
  },
  // Primary action button (More details / Got it)
  primaryBtn: {
    marginTop: space.md,
    alignSelf: 'stretch',
    alignItems: 'center',
    backgroundColor: color.danfo500,
    borderRadius: radius.md,
    paddingVertical: 14,
  },
  primaryBtnPressed: {
    backgroundColor: color.danfo600,
  },
  primaryBtnText: {
    color: color.ink900,
    fontSize: 15,
    fontWeight: '800',
  },
  // "Not going today" status banner (shown only before a trip starts, once
  // marked via the icon button over the map — see topRightRow / topIconButton)
  absenceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: color.stopRedBg,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    marginTop: space.lg,
  },
  absenceBannerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: color.stopRed,
  },
  absenceBannerText: {
    flex: 1,
    color: color.ledger700,
    fontSize: 13.5,
    fontWeight: '700',
  },
});
