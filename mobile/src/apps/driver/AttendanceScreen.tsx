import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { AttendanceStatus } from '../../../../shared/types';
import { supabase } from '../../lib/supabase';
import type { DriverStackParamList } from './DriverApp';
import { stopGPSBroadcast } from './gpsService';

type Props = NativeStackScreenProps<DriverStackParamList, 'Attendance'>;

type AttendanceStudent = DriverStackParamList['Attendance']['students'][number];

const AVATAR_COLORS = [
  '#F44336',
  '#2196F3',
  '#4CAF50',
  '#FF9800',
  '#9C27B0',
  '#00BCD4',
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

const STATUS_COLORS: Record<AttendanceStatus, string> = {
  BOARDED: '#4CAF50',
  ABSENT: '#F44336',
  DROPPED_OFF: '#FF9800',
};

export default function AttendanceScreen({ navigation, route }: Props) {
  const { tripId, stops, students, busId, routeName } = route.params;

  const [currentStopIndex, setCurrentStopIndex] = useState(0);
  const [attendanceMap, setAttendanceMap] = useState<
    Record<string, AttendanceStatus>
  >({});
  const [isSubmitting, setIsSubmitting] = useState<Record<string, boolean>>(
    {},
  );
  const [isLoadingExisting, setIsLoadingExisting] = useState(true);
  const [isEndingTrip, setIsEndingTrip] = useState(false);

  const sortedStops = useMemo(
    () => [...stops].sort((a, b) => a.sequence - b.sequence),
    [stops],
  );

  const isLastStop = currentStopIndex === sortedStops.length - 1;
  const currentStop = sortedStops[currentStopIndex];

  function studentsForStop(stopId: string | undefined): AttendanceStudent[] {
    if (!stopId) return [];
    return students.filter(
      (s) => s.stopId === stopId || s.stopId === null,
    );
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

          // Determine currentStopIndex: first stop with unmarked students
          let resumeIndex = sortedStops.length - 1;
          for (let i = 0; i < sortedStops.length; i++) {
            const stopStudents = studentsForStop(sortedStops[i]?.id);
            const allMarked = stopStudents.every((s) => map[s.id]);
            if (!allMarked) {
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

  async function markStudent(studentId: string, status: AttendanceStatus) {
    setIsSubmitting((prev) => ({ ...prev, [studentId]: true }));

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        Alert.alert('Error', 'Session expired. Please log in again.');
        return;
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
        return;
      }

      setAttendanceMap((prev) => ({ ...prev, [studentId]: status }));
    } catch {
      Alert.alert('Error', 'Failed to mark attendance.');
    } finally {
      setIsSubmitting((prev) => ({ ...prev, [studentId]: false }));
    }
  }

  function handleSOS() {
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
                  body: JSON.stringify({ busId }),
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

  function handleNextStop() {
    setCurrentStopIndex((i) => i + 1);
  }

  function handleEndTrip() {
    Alert.alert('End this trip?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End Trip',
        style: 'destructive',
        onPress: async () => {
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

            const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
            const response = await fetch(
              `${supabaseUrl}/functions/v1/end-trip`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ tripId }),
              },
            );

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
        },
      },
    ]);
  }

  const currentStopStudents = studentsForStop(currentStop?.id);

  const allCurrentMarked = currentStopStudents.every(
    (s) => !!attendanceMap[s.id],
  );

  const allDroppedOff =
    isLastStop &&
    currentStopStudents.every(
      (s) =>
        attendanceMap[s.id] === 'DROPPED_OFF' ||
        attendanceMap[s.id] === 'ABSENT',
    );

  if (isLoadingExisting) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{routeName}</Text>
        <Pressable style={styles.sosButton} onPress={handleSOS}>
          <Text style={styles.sosButtonText}>SOS</Text>
        </Pressable>
      </View>

      <View style={styles.progressSection}>
        <Text style={styles.progressText}>
          Stop {currentStopIndex + 1} of {sortedStops.length}
        </Text>
        <Text style={styles.stopName}>{currentStop?.name}</Text>
      </View>

      <FlatList<AttendanceStudent>
        data={currentStopStudents}
        keyExtractor={(item: AttendanceStudent) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }: { item: AttendanceStudent }) => {
          const status = attendanceMap[item.id];
          const submitting = !!isSubmitting[item.id];

          return (
            <View style={styles.studentRow}>
              {item.photoUrl ? (
                <Image
                  source={{ uri: item.photoUrl }}
                  style={styles.avatarImage}
                />
              ) : (
                <View
                  style={[
                    styles.avatarPlaceholder,
                    { backgroundColor: getAvatarColor(item.name) },
                  ]}
                >
                  <Text style={styles.avatarInitials}>
                    {getInitials(item.name)}
                  </Text>
                </View>
              )}

              <View style={styles.studentInfo}>
                <Text style={styles.studentName}>{item.name}</Text>
                <Text style={styles.studentClass}>{item.className}</Text>
              </View>

              {status ? (
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: STATUS_COLORS[status] },
                  ]}
                >
                  <Text style={styles.statusBadgeText}>
                    {'✓'} {status}
                  </Text>
                </View>
              ) : isLastStop ? (
                <Pressable
                  style={[styles.actionButton, styles.droppedOffButton]}
                  onPress={() => markStudent(item.id, 'DROPPED_OFF')}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.actionButtonText}>DROPPED OFF</Text>
                  )}
                </Pressable>
              ) : (
                <View style={styles.buttonGroup}>
                  <Pressable
                    style={[styles.actionButton, styles.boardedButton]}
                    onPress={() => markStudent(item.id, 'BOARDED')}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.actionButtonText}>BOARDED</Text>
                    )}
                  </Pressable>
                  <Pressable
                    style={[styles.actionButton, styles.absentButton]}
                    onPress={() => markStudent(item.id, 'ABSENT')}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.actionButtonText}>ABSENT</Text>
                    )}
                  </Pressable>
                </View>
              )}
            </View>
          );
        }}
      />

      <View style={styles.footer}>
        {isLastStop ? (
          <Pressable
            style={[
              styles.footerButton,
              styles.endTripButton,
              (!allDroppedOff || isEndingTrip) && styles.footerButtonDisabled,
            ]}
            onPress={handleEndTrip}
            disabled={!allDroppedOff || isEndingTrip}
          >
            {isEndingTrip ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.footerButtonText}>End Trip</Text>
            )}
          </Pressable>
        ) : (
          <Pressable
            style={[
              styles.footerButton,
              styles.nextStopButton,
              !allCurrentMarked && styles.footerButtonDisabled,
            ]}
            onPress={handleNextStop}
            disabled={!allCurrentMarked}
          >
            <Text style={styles.footerButtonText}>Next Stop</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    flexShrink: 1,
  },
  sosButton: {
    backgroundColor: '#F44336',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  sosButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  progressSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  progressText: {
    fontSize: 14,
    color: '#777',
    marginBottom: 4,
  },
  stopName: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  studentInfo: {
    flex: 1,
    marginLeft: 12,
  },
  studentName: {
    fontSize: 16,
    fontWeight: '600',
  },
  studentClass: {
    fontSize: 13,
    color: '#888',
  },
  buttonGroup: {
    flexDirection: 'row',
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    marginLeft: 8,
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boardedButton: {
    backgroundColor: '#4CAF50',
  },
  absentButton: {
    backgroundColor: '#F44336',
  },
  droppedOffButton: {
    backgroundColor: '#FF9800',
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusBadgeText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  footerButton: {
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerButtonDisabled: {
    opacity: 0.4,
  },
  nextStopButton: {
    backgroundColor: '#2196F3',
  },
  endTripButton: {
    backgroundColor: '#F44336',
  },
  footerButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
