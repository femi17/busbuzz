import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '../../lib/supabase';

const INK = '#0E1B2E';
const DANFO = '#FFC900';
const ROUTE_GREEN = '#1C9D5B';
const STOP_RED = '#E13E2D';
const MUTED = '#6B7280';

type StudentInfo = {
  id: string;
  name: string;
  routeId: string | null;
};

type TripRow = {
  id: string;
  busId: string;
  routeId: string;
  startedAt: string;
  endedAt: string | null;
};

type TripLocationPoint = {
  latitude: number;
  longitude: number;
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function formatDuration(startedAt: string, endedAt: string | null): string {
  if (!endedAt) return '—';
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  const minutes = Math.round(ms / 60000);
  return `${minutes} min`;
}

export default function HistoryScreen() {
  const [student, setStudent] = useState<StudentInfo | null>(null);
  const [routeName, setRouteName] = useState<string>('');
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [selectedTrip, setSelectedTrip] = useState<TripRow | null>(null);
  const [tripLocations, setTripLocations] = useState<TripLocationPoint[]>([]);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  const mapRef = useRef<MapView | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          if (isMounted) {
            setErrorMessage('Session expired. Please log in again.');
            setIsLoading(false);
          }
          return;
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
          return;
        }

        const studentIds = links.map((l) => l.student_id);

        const { data: students, error: studentsError } = await supabase
          .from('students')
          .select('id, name, route_id')
          .in('id', studentIds)
          .eq('is_active', true);

        if (studentsError || !students || students.length === 0) {
          if (isMounted) {
            setErrorMessage('No active child found.');
            setIsLoading(false);
          }
          return;
        }

        const first = students[0];
        const loadedStudent: StudentInfo = {
          id: first.id,
          name: first.name,
          routeId: first.route_id,
        };

        if (isMounted) setStudent(loadedStudent);

        if (!loadedStudent.routeId) {
          if (isMounted) setIsLoading(false);
          return;
        }

        const { data: route } = await supabase
          .from('routes')
          .select('name')
          .eq('id', loadedStudent.routeId)
          .single();

        if (route && isMounted) setRouteName(route.name);

        const { data: tripsData, error: tripsError } = await supabase
          .from('trips')
          .select('id, bus_id, route_id, status, started_at, ended_at')
          .eq('route_id', loadedStudent.routeId)
          .eq('status', 'COMPLETED')
          .order('started_at', { ascending: false })
          .limit(50);

        if (tripsError) {
          if (isMounted) setErrorMessage('Could not load trip history.');
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
        if (isMounted) setErrorMessage('Something went wrong. Please try again.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, []);

  async function openTripDetail(trip: TripRow) {
    setSelectedTrip(trip);
    setIsLoadingDetail(true);
    setTripLocations([]);

    try {
      const { data, error } = await supabase
        .from('trip_locations')
        .select('latitude, longitude, recorded_at')
        .eq('trip_id', trip.id)
        .order('recorded_at');

      if (!error && data) {
        const points = data.map((d) => ({
          latitude: d.latitude,
          longitude: d.longitude,
        }));
        setTripLocations(points);
      }
    } finally {
      setIsLoadingDetail(false);
    }
  }

  function closeDetail() {
    setSelectedTrip(null);
    setTripLocations([]);
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading…</Text>
      </SafeAreaView>
    );
  }

  if (errorMessage) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <Text style={styles.errorText}>{errorMessage}</Text>
      </SafeAreaView>
    );
  }

  if (selectedTrip) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.detailMapContainer}>
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            initialRegion={{
              latitude: tripLocations[0]?.latitude ?? 6.5244,
              longitude: tripLocations[0]?.longitude ?? 3.3792,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            }}
            onLayout={() => {
              if (tripLocations.length > 1 && mapRef.current) {
                mapRef.current.fitToCoordinates(tripLocations, {
                  edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
                  animated: false,
                });
              }
            }}
          >
            {tripLocations.length > 1 ? (
              <Polyline
                coordinates={tripLocations}
                strokeColor={DANFO}
                strokeWidth={3}
              />
            ) : null}

            {tripLocations.length > 0 ? (
              <Marker
                coordinate={tripLocations[0]}
                title="Start"
                pinColor={ROUTE_GREEN}
              />
            ) : null}

            {tripLocations.length > 1 ? (
              <Marker
                coordinate={tripLocations[tripLocations.length - 1]}
                title="End"
                pinColor={STOP_RED}
              />
            ) : null}
          </MapView>

          <Pressable style={styles.backButton} onPress={closeDetail}>
            <Text style={styles.backButtonText}>← Back</Text>
          </Pressable>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryDate}>{formatDate(selectedTrip.startedAt)}</Text>
          <Text style={styles.summaryRoute}>{routeName}</Text>
          <Text style={styles.summaryDuration}>
            {formatDuration(selectedTrip.startedAt, selectedTrip.endedAt)}
          </Text>
          {student ? (
            <Text style={styles.summaryChild}>{student.name}</Text>
          ) : null}
          {isLoadingDetail ? (
            <Text style={styles.summaryLoading}>Loading route…</Text>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Trip History</Text>
      </View>

      {trips.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>No trip history yet</Text>
        </View>
      ) : (
        <FlatList<TripRow>
          data={trips}
          keyExtractor={(item: TripRow) => item.id}
          renderItem={({ item }: { item: TripRow }) => (
            <Pressable style={styles.tripRow} onPress={() => openTripDetail(item)}>
              <View style={styles.tripRowTop}>
                <Text style={styles.tripDate}>{formatDate(item.startedAt)}</Text>
                <Text style={styles.tripRouteName}>{routeName}</Text>
                <Text style={styles.tripDuration}>
                  {formatDuration(item.startedAt, item.endedAt)}
                </Text>
              </View>
              <View style={styles.statusBadge}>
                <Text style={styles.statusBadgeText}>Completed</Text>
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
  header: {
    backgroundColor: INK,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateText: {
    color: MUTED,
    fontSize: 15,
  },
  tripRow: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  tripRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  tripDate: {
    fontSize: 15,
    fontWeight: '600',
    color: INK,
  },
  tripRouteName: {
    fontSize: 14,
    color: MUTED,
  },
  tripDuration: {
    fontSize: 14,
    color: MUTED,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(28,157,91,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: ROUTE_GREEN,
  },
  detailMapContainer: {
    height: '80%',
  },
  backButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  backButtonText: {
    color: INK,
    fontWeight: '700',
  },
  summaryCard: {
    height: '20%',
    padding: 20,
    backgroundColor: '#fff',
  },
  summaryDate: {
    fontSize: 18,
    fontWeight: '700',
    color: INK,
  },
  summaryRoute: {
    fontSize: 14,
    color: MUTED,
    marginTop: 2,
  },
  summaryDuration: {
    fontSize: 14,
    color: MUTED,
    marginTop: 2,
  },
  summaryChild: {
    fontSize: 14,
    color: INK,
    fontWeight: '600',
    marginTop: 4,
  },
  summaryLoading: {
    fontSize: 12,
    color: MUTED,
    marginTop: 4,
  },
});
