import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Stop } from '../../../../shared/types';
import { supabase } from '../../lib/supabase';
import type { DriverStackParamList } from './DriverApp';
import { startGPSBroadcast } from './gpsService';

type Props = NativeStackScreenProps<DriverStackParamList, 'Today'>;

type StudentSummary = {
  id: string;
  name: string;
  className: string;
  photoUrl: string | null;
  stopId: string | null;
};

type LoadedState = {
  busId: string;
  plateNumber: string;
  deviceId: string | null;
  routeId: string;
  routeName: string;
  routeType: 'MORNING' | 'AFTERNOON';
  activeTrip: {
    id: string;
    stops: Stop[];
    students: StudentSummary[];
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
        .select('school_id')
        .eq('id', session.user.id)
        .single();

      if (profileError || !profile?.school_id) {
        setErrorMessage('Could not load your profile.');
        setIsLoading(false);
        return;
      }

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
        routes.find((r) => r.type === preferredType) ?? routes[0];

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
        const { data: stops } = await supabase
          .from('stops')
          .select('id, route_id, name, latitude, longitude, sequence, eta_minutes')
          .eq('route_id', existingTrip.route_id)
          .order('sequence');

        const { data: students } = await supabase
          .from('students')
          .select('id, name, class_name, photo_url, stop_id')
          .eq('route_id', existingTrip.route_id)
          .eq('is_active', true)
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
          })),
        };
      }

      setState({
        busId: bus.id,
        plateNumber: bus.plate_number,
        deviceId: bus.device_id,
        routeId: route.id,
        routeName: route.name,
        routeType: route.type,
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
  }, [loadData]);

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
        body: JSON.stringify({ busId: state.busId, routeId: state.routeId }),
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
        routeName: state.routeName,
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
      <SafeAreaView style={styles.centerContainer}>
        <ActivityIndicator size="large" color={DANFO} />
      </SafeAreaView>
    );
  }

  if (errorMessage || !state) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <Text style={styles.errorText}>
          {errorMessage ?? 'Something went wrong.'}
        </Text>
        <Pressable style={styles.retryButton} onPress={loadData}>
          <Text style={styles.retryButtonText}>RETRY</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          Bus<Text style={styles.headerAccent}>Buzz</Text>
        </Text>
        <Pressable style={styles.sosButton} onPress={handleSOS}>
          <Text style={styles.sosButtonText}>SOS</Text>
        </Pressable>
      </View>

      <View style={styles.content}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{state.routeType}</Text>
        </View>
        <Text style={styles.routeName}>{state.routeName}</Text>
        <Text style={styles.plateNumber}>{state.plateNumber}</Text>

        {state.activeTrip ? (
          <Pressable
            style={({ pressed }) => [
              styles.actionButton,
              styles.resumeButton,
              pressed && styles.actionButtonPressed,
            ]}
            onPress={handleResumeTrip}
          >
            <Text style={styles.actionButtonText}>RESUME TRIP</Text>
          </Pressable>
        ) : (
          <Pressable
            style={({ pressed }) => [
              styles.actionButton,
              styles.startButton,
              pressed && styles.actionButtonPressed,
            ]}
            onPress={handleStartTrip}
            disabled={isStarting}
          >
            {isStarting ? (
              <ActivityIndicator color={INK} />
            ) : (
              <Text style={styles.actionButtonText}>START TRIP</Text>
            )}
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const INK = '#0E1B2E';
const ASPHALT = '#23262B';
const DANFO = '#FFC900';
const ROUTE_GREEN = '#1C9D5B';
const STOP_RED = '#E13E2D';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: ASPHALT,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ASPHALT,
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 3,
    borderBottomColor: DANFO,
    backgroundColor: INK,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.3,
  },
  headerAccent: {
    color: DANFO,
  },
  sosButton: {
    backgroundColor: STOP_RED,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  sosButtonText: {
    color: '#fff',
    fontWeight: '700',
    letterSpacing: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  routeName: {
    fontSize: 30,
    fontWeight: '700',
    textAlign: 'center',
    color: '#fff',
    marginBottom: 6,
  },
  plateNumber: {
    fontSize: 18,
    fontWeight: '600',
    color: '#9CA3AF',
    letterSpacing: 1,
    marginBottom: 28,
  },
  badge: {
    backgroundColor: 'rgba(255,201,0,0.15)',
    borderWidth: 1,
    borderColor: DANFO,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 16,
  },
  badgeText: {
    color: DANFO,
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 1,
  },
  actionButton: {
    paddingVertical: 22,
    paddingHorizontal: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 260,
  },
  actionButtonPressed: {
    opacity: 0.85,
  },
  startButton: {
    backgroundColor: DANFO,
  },
  resumeButton: {
    backgroundColor: ROUTE_GREEN,
  },
  actionButtonText: {
    color: INK,
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: 1,
  },
  errorText: {
    fontSize: 16,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: DANFO,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: INK,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
