import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getFirstName } from '../../../../shared/name';
import type { Stop } from '../../../../shared/types';
import { supabase } from '../../lib/supabase';
import {
  AlertDiamondIcon,
  BusFrontIcon,
  PinIcon,
  RouteIcon,
  UsersIcon,
} from './components/Icons';
import type { DriverStackParamList } from './DriverApp';
import { startGPSBroadcast } from './gpsService';
import { color, radius, space } from './theme';

type Props = NativeStackScreenProps<DriverStackParamList, 'Today'>;

type StudentSummary = {
  id: string;
  name: string;
  className: string;
  photoUrl: string | null;
  stopId: string | null;
  pickupLat: number | null;
  pickupLng: number | null;
};

type LoadedState = {
  driverName: string | null;
  busId: string;
  plateNumber: string;
  deviceId: string | null;
  routeId: string;
  routeName: string;
  routeType: 'MORNING' | 'AFTERNOON' | 'BOTH';
  // The single run the driver can start right now. A BOTH route follows the
  // clock — morning runs its course, then the afternoon run takes over. Never
  // "BOTH": one journey at a time.
  runDirection: 'MORNING' | 'AFTERNOON';
  schoolName: string | null;
  studentCount: number;
  stopCount: number;
  activeTrip: {
    id: string;
    stops: Stop[];
    students: StudentSummary[];
    direction: 'MORNING' | 'AFTERNOON';
    routeType: 'MORNING' | 'AFTERNOON' | 'BOTH';
    routeName: string;
  } | null;
};

export default function TodayScreen({ navigation }: Props) {
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [state, setState] = useState<LoadedState | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        setErrorMessage('Session expired. Please log in again.');
        setIsLoading(false);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('name, school_id, schools(name)')
        .eq('id', session.user.id)
        .single();

      if (profileError || !profile?.school_id) {
        setErrorMessage('Could not load your profile.');
        setIsLoading(false);
        return;
      }

      const schoolRow = profile.schools as { name: string } | { name: string }[] | null;
      const schoolName = Array.isArray(schoolRow) ? schoolRow[0]?.name ?? null : schoolRow?.name ?? null;

      const { data: buses, error: busesError } = await supabase
        .from('buses')
        .select('id, plate_number, device_id, school_id')
        .eq('school_id', profile.school_id)
        .eq('status', 'ACTIVE');

      if (busesError || !buses || buses.length === 0) {
        setErrorMessage('No active bus assigned to your school.');
        setIsLoading(false);
        return;
      }

      const bus = buses[0];

      const { data: routes, error: routesError } = await supabase
        .from('routes')
        .select('id, name, type, bus_id')
        .eq('bus_id', bus.id);

      if (routesError || !routes || routes.length === 0) {
        setErrorMessage('No route assigned to this bus.');
        setIsLoading(false);
        return;
      }

      const isBeforeNoon = new Date().getHours() < 12;
      const preferredType = isBeforeNoon ? 'MORNING' : 'AFTERNOON';
      const route =
        routes.find((r) => r.type === preferredType) ??
        routes.find((r) => r.type === 'BOTH') ??
        routes[0];

      // One run at a time: a BOTH route follows the clock, a dedicated route
      // is always its own direction.
      const runDirection: 'MORNING' | 'AFTERNOON' =
        route.type === 'MORNING' || route.type === 'AFTERNOON'
          ? route.type
          : preferredType;

      // Only count students riding THIS journey.
      const { count: studentCount } = await supabase
        .from('students')
        .select('id', { count: 'exact', head: true })
        .eq('route_id', route.id)
        .eq('is_active', true)
        .in('trip_type', [runDirection, 'BOTH']);

      const { count: stopCount } = await supabase
        .from('stops')
        .select('id', { count: 'exact', head: true })
        .eq('route_id', route.id);

      const { data: existingTrip, error: tripError } = await supabase
        .from('trips')
        .select('id, bus_id, route_id, driver_id, status, started_at')
        .eq('bus_id', bus.id)
        .eq('status', 'ACTIVE')
        .maybeSingle();

      if (tripError) {
        setErrorMessage('Could not check for active trips.');
        setIsLoading(false);
        return;
      }

      let activeTrip: LoadedState['activeTrip'] = null;

      if (existingTrip) {
        // The active trip may be on a different route than today's preferred
        // one — resolve its own route for name/type, and derive the run
        // direction from when the trip started (a BOTH route runs twice).
        const tripRoute =
          routes.find((r) => r.id === existingTrip.route_id) ?? route;
        const tripDirection: 'MORNING' | 'AFTERNOON' =
          tripRoute.type === 'MORNING' || tripRoute.type === 'AFTERNOON'
            ? tripRoute.type
            : new Date(existingTrip.started_at).getHours() < 12
              ? 'MORNING'
              : 'AFTERNOON';

        const { data: stops } = await supabase
          .from('stops')
          .select('id, route_id, name, latitude, longitude, sequence, eta_minutes')
          .eq('route_id', existingTrip.route_id)
          .order('sequence');

        const { data: students } = await supabase
          .from('students')
          .select('id, name, class_name, photo_url, stop_id, pickup_lat, pickup_lng')
          .eq('route_id', existingTrip.route_id)
          .eq('is_active', true)
          .in('trip_type', [tripDirection, 'BOTH'])
          .order('pickup_sequence', {
            ascending: tripDirection === 'MORNING',
            nullsFirst: false,
          })
          .order('name');

        activeTrip = {
          id: existingTrip.id,
          stops: (stops ?? []).map((s) => ({
            id: s.id,
            routeId: s.route_id,
            name: s.name,
            latitude: s.latitude,
            longitude: s.longitude,
            sequence: s.sequence,
            etaMinutes: s.eta_minutes ?? undefined,
          })),
          students: (students ?? []).map((s) => ({
            id: s.id,
            name: s.name,
            className: s.class_name,
            photoUrl: s.photo_url,
            stopId: s.stop_id,
            pickupLat: s.pickup_lat,
            pickupLng: s.pickup_lng,
          })),
          direction: tripDirection,
          routeType: tripRoute.type,
          routeName: tripRoute.name,
        };
      }

      setState({
        driverName: profile.name ?? null,
        busId: bus.id,
        plateNumber: bus.plate_number,
        deviceId: bus.device_id,
        routeId: route.id,
        routeName: route.name,
        routeType: route.type,
        runDirection,
        schoolName,
        studentCount: studentCount ?? 0,
        stopCount: stopCount ?? 0,
        activeTrip,
      });
    } catch {
      setErrorMessage('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    // Refresh when returning from Pickup Order (or a finished trip) so the
    // dashboard reflects the latest arrangement and trip state.
    const unsubscribe = navigation.addListener('focus', loadData);
    return unsubscribe;
  }, [loadData, navigation]);

  async function handleStartTrip() {
    if (!state) return;

    setIsStarting(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        Alert.alert('Error', 'Session expired. Please log in again.');
        setIsStarting(false);
        return;
      }

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/start-trip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          busId: state.busId,
          routeId: state.routeId,
          direction: state.runDirection,
        }),
      });

      if (response.status === 409) {
        await loadData();
        setIsStarting(false);
        return;
      }

      if (!response.ok) {
        const errJson = await response.json().catch(() => null);
        Alert.alert('Error', errJson?.error ?? 'Failed to start trip.');
        setIsStarting(false);
        return;
      }

      const json = await response.json();
      const trip = json.data;

      await startGPSBroadcast(trip.id, state.busId, state.deviceId ?? '');

      navigation.navigate('Attendance', {
        tripId: trip.id,
        stops: trip.route.stops,
        students: trip.students,
        busId: trip.busId,
        routeName: trip.route.name,
        direction: trip.direction ?? state.runDirection,
        routeType: trip.route.type ?? state.routeType,
      });
    } catch {
      Alert.alert('Error', 'Failed to start trip.');
    } finally {
      setIsStarting(false);
    }
  }

  async function handleResumeTrip() {
    if (!state?.activeTrip) return;

    try {
      await startGPSBroadcast(
        state.activeTrip.id,
        state.busId,
        state.deviceId ?? '',
      );

      navigation.navigate('Attendance', {
        tripId: state.activeTrip.id,
        stops: state.activeTrip.stops,
        students: state.activeTrip.students,
        busId: state.busId,
        routeName: state.activeTrip.routeName,
        direction: state.activeTrip.direction,
        routeType: state.activeTrip.routeType,
      });
    } catch {
      Alert.alert('Error', 'Failed to resume trip GPS broadcast.');
    }
  }

  function handleSOS() {
    if (!state) return;

    Alert.alert(
      'SOS Alert',
      'This will alert all school administrators. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send SOS',
          style: 'destructive',
          onPress: async () => {
            try {
              const {
                data: { session },
              } = await supabase.auth.getSession();

              if (!session?.access_token) return;

              const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
              const response = await fetch(
                `${supabaseUrl}/functions/v1/sos-alert`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                  },
                  body: JSON.stringify({ busId: state.busId }),
                },
              );

              if (response.ok) {
                Alert.alert('SOS alert sent to administrators');
              } else {
                Alert.alert(
                  'Failed to send SOS. Please call the school directly.',
                );
              }
            } catch {
              Alert.alert(
                'Failed to send SOS. Please call the school directly.',
              );
            }
          },
        },
      ],
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={color.danfoDim} />
      </SafeAreaView>
    );
  }

  if (errorMessage || !state) {
    return (
      <SafeAreaView style={styles.errorScreen}>
        <View style={styles.errorCard}>
          <View style={styles.errorIcon}>
            <AlertDiamondIcon size={28} color={color.stopRed} />
          </View>
          <Text style={styles.errorTitle}>Can&apos;t start yet</Text>
          <Text style={styles.errorText}>{errorMessage ?? 'Something went wrong.'}</Text>
          <Pressable
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
            onPress={loadData}
          >
            <Text style={styles.retryButtonText}>Try again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = state.driverName ? getFirstName(state.driverName) : undefined;
  const ctaLabel = state.activeTrip ? 'RESUME ROUTE' : `START ${state.runDirection} ROUTE`;
  const onCta = state.activeTrip ? handleResumeTrip : handleStartTrip;
  const schoolInitial = (state.schoolName ?? 'B').trim()[0]?.toUpperCase() ?? 'B';

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.headerSafe}>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoInitial}>{schoolInitial}</Text>
            </View>
            <Text style={styles.wordmark}>
              Bus<Text style={styles.wordmarkAccent}>Buzz</Text>
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.sosDiamond, pressed && styles.pressed]}
            onPress={handleSOS}
            accessibilityLabel="Send SOS alert"
          >
            <AlertDiamondIcon size={22} color={color.stopRed} />
          </Pressable>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.greetingEyebrow}>
          {greeting}
          {firstName ? `, ${firstName}` : ''}
        </Text>
        <Text style={styles.greetingTitle}>
          {state.activeTrip ? 'Trip in progress' : 'Ready to roll?'}
        </Text>

        {/* Hero — the one thing the driver taps to begin the run */}
        <View style={styles.ctaWrap}>
          <View style={styles.ctaHalo} />
          <Pressable
            onPress={onCta}
            disabled={isStarting}
            accessibilityRole="button"
            accessibilityLabel={ctaLabel}
            style={({ pressed }) => [styles.ctaCircle, pressed && styles.ctaPressed]}
          >
            {isStarting ? (
              <ActivityIndicator color={color.ink} size="large" />
            ) : (
              <>
                <BusFrontIcon size={44} color={color.ink} />
                <Text style={styles.ctaLabel}>{ctaLabel}</Text>
              </>
            )}
          </Pressable>
        </View>

        {/* At-a-glance readiness */}
        <View style={styles.statRow}>
          <View style={[styles.statCard, styles.statCardAmber]}>
            <View style={styles.statTop}>
              <UsersIcon size={20} color={color.ink} />
              <Text style={styles.statTitle}>Students</Text>
            </View>
            <Text style={styles.statNumber}>{state.studentCount}</Text>
            <Text style={styles.statSub}>Confirmed for pickup</Text>
          </View>
          <View style={[styles.statCard, styles.statCardNavy]}>
            <View style={styles.statTop}>
              <RouteIcon size={20} color={color.ink} />
              <Text style={styles.statTitle}>Stops</Text>
            </View>
            <Text style={styles.statNumber}>{state.stopCount}</Text>
            <Text style={styles.statSub} numberOfLines={1}>
              {state.routeName}
            </Text>
          </View>
        </View>

        {/* Assigned bus */}
        <View style={styles.locCard}>
          <View style={styles.locIcon}>
            <PinIcon size={20} color={color.ink} />
          </View>
          <View style={styles.locMeta}>
            <Text style={styles.locLabel}>Assigned bus</Text>
            <Text style={styles.locValue}>{state.plateNumber}</Text>
          </View>
          <View style={styles.readyDot} />
        </View>

        {/* Pickup order — arranged once, kept until the road changes */}
        {!state.activeTrip && (
          <Pressable
            style={({ pressed }) => [styles.locCard, pressed && styles.pressed]}
            onPress={() =>
              navigation.navigate('PickupOrder', {
                routeId: state.routeId,
                routeName: state.routeName,
              })
            }
            accessibilityRole="button"
            accessibilityLabel="Arrange pickup order"
          >
            <View style={styles.locIcon}>
              <RouteIcon size={20} color={color.ink} />
            </View>
            <View style={styles.locMeta}>
              <Text style={styles.locLabel}>Pickup order</Text>
              <Text style={styles.locValue}>Arrange who you pick first</Text>
            </View>
            <Text style={styles.cardChevron}>›</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const CTA_SIZE = 220;
const HALO_SIZE = 296;

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
  logoInitial: {
    color: color.ink,
    fontWeight: '800',
    fontSize: 16,
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
  sosDiamond: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(225,62,45,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Body
  body: {
    paddingHorizontal: space.xl,
    paddingTop: space.xxl,
    paddingBottom: space.xxxl + space.lg,
  },
  greetingEyebrow: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: color.sub,
    textAlign: 'center',
  },
  greetingTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: color.ink,
    textAlign: 'center',
    marginTop: space.xs,
  },
  // Hero CTA
  ctaWrap: {
    height: HALO_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: space.lg,
  },
  ctaHalo: {
    position: 'absolute',
    width: HALO_SIZE,
    height: HALO_SIZE,
    borderRadius: HALO_SIZE / 2,
    backgroundColor: color.danfoSoft,
  },
  ctaCircle: {
    width: CTA_SIZE,
    height: CTA_SIZE,
    borderRadius: CTA_SIZE / 2,
    backgroundColor: color.danfo,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 8,
    borderColor: color.white,
    paddingHorizontal: space.lg,
    shadowColor: color.danfoDim,
    shadowOpacity: 0.45,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 20,
    elevation: 10,
  },
  ctaPressed: {
    transform: [{ scale: 0.97 }],
  },
  ctaLabel: {
    color: color.ink,
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: 0.5,
    textAlign: 'center',
    lineHeight: 24,
    marginTop: space.sm + 2,
  },
  // Stat cards
  statRow: {
    flexDirection: 'row',
    gap: space.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
  },
  statCardAmber: {
    borderLeftColor: color.danfo,
  },
  statCardNavy: {
    borderLeftColor: color.ink,
  },
  statTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginBottom: space.sm,
  },
  statTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: color.ink,
  },
  statNumber: {
    fontSize: 30,
    fontWeight: '800',
    color: color.ink,
    fontVariant: ['tabular-nums'],
  },
  statSub: {
    fontSize: 12,
    fontWeight: '500',
    color: color.sub,
    marginTop: 2,
  },
  // Assigned-bus card
  locCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    marginTop: space.md,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
  },
  locIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: color.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.md,
  },
  locMeta: {
    flex: 1,
  },
  locLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: color.sub,
  },
  locValue: {
    fontSize: 16,
    fontWeight: '800',
    color: color.ink,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  readyDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: color.routeGreen,
  },
  cardChevron: {
    fontSize: 28,
    lineHeight: 30,
    fontWeight: '600',
    color: color.sub,
    marginLeft: space.sm,
  },
  // Error state
  errorScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.canvas,
    padding: space.xxl,
  },
  errorCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: color.surface,
    borderRadius: radius.lg + 6,
    padding: space.xxl + 4,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 3,
  },
  errorIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: color.stopRedBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.lg,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: color.ink,
    marginBottom: space.xs + 2,
  },
  errorText: {
    fontSize: 14,
    color: color.sub,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: space.xl,
  },
  retryButton: {
    alignSelf: 'stretch',
    alignItems: 'center',
    backgroundColor: color.danfo,
    borderRadius: radius.md,
    paddingVertical: space.md + 2,
  },
  retryButtonText: {
    color: color.ink,
    fontWeight: '800',
    fontSize: 15,
  },
  pressed: {
    opacity: 0.85,
  },
});
