import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase } from '../../lib/supabase';
import { ChevronIcon, CloseIcon } from './components/Icons';
import type { DriverStackParamList } from './DriverApp';
import { color, radius, space } from './theme';

type Props = NativeStackScreenProps<DriverStackParamList, 'PickupOrder'>;

type OrderStudent = {
  id: string;
  name: string;
  className: string;
  photoUrl: string | null;
  tripType: 'MORNING' | 'AFTERNOON' | 'BOTH';
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

// One arrangement per route: the order students are picked up along the road
// in the morning. The afternoon run drops them off in reverse automatically.
export default function PickupOrderScreen({ navigation, route }: Props) {
  const { routeId, routeName, routeType } = route.params;
  const insets = useSafeAreaInsets();
  // A dedicated AFTERNOON route's saved order IS the drop-off order — it's
  // never reversed. A MORNING or BOTH route's order is the pickup order
  // (BOTH reverses it automatically for the afternoon run).
  const isDropoffOrder = routeType === 'AFTERNOON';

  const [students, setStudents] = useState<OrderStudent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadStudents = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const { data, error } = await supabase
        .from('students')
        .select('id, name, class_name, photo_url, trip_type, pickup_sequence')
        .eq('route_id', routeId)
        .eq('is_active', true)
        .order('pickup_sequence', { ascending: true, nullsFirst: false })
        .order('name');

      if (error) {
        setErrorMessage('Could not load students.');
        return;
      }

      setStudents(
        (data ?? []).map((s) => ({
          id: s.id,
          name: s.name,
          className: s.class_name,
          photoUrl: s.photo_url,
          tripType: (s.trip_type ?? 'BOTH') as OrderStudent['tripType'],
        })),
      );
      setIsDirty(false);
    } catch {
      setErrorMessage('Could not load students.');
    } finally {
      setIsLoading(false);
    }
  }, [routeId]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  function move(index: number, delta: -1 | 1) {
    setStudents((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setIsDirty(true);
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        Alert.alert('Error', 'Session expired. Please log in again.');
        return;
      }

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/set-pickup-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          routeId,
          studentIds: students.map((s) => s.id),
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => null);
        Alert.alert('Error', errJson?.error ?? 'Failed to save order.');
        return;
      }

      navigation.goBack();
    } catch {
      Alert.alert('Error', 'Failed to save order.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.headerSafe}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.headerEyebrow}>
              {isDropoffOrder ? 'DROP-OFF ORDER' : 'PICKUP ORDER'}
            </Text>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {routeName}
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Close"
          >
            <CloseIcon size={16} color={color.white} />
          </Pressable>
        </View>
      </SafeAreaView>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={color.danfoDim} />
        </View>
      ) : errorMessage ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{errorMessage}</Text>
          <Pressable
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
            onPress={loadStudents}
          >
            <Text style={styles.retryButtonText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList<OrderStudent>
          data={students}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text style={styles.hint}>
              {isDropoffOrder
                ? 'Arrange students in the order you drop them off in the afternoon. This is saved once and remembered for every run.'
                : 'Arrange students in the order you pick them up in the morning. This is saved once — the afternoon drop-off uses the reverse order automatically.'}
            </Text>
          }
          renderItem={({ item, index }) => (
            <View style={styles.row}>
              <View style={styles.orderBadge}>
                <Text style={styles.orderBadgeText}>{index + 1}</Text>
              </View>
              {item.photoUrl ? (
                <Image source={{ uri: item.photoUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarInitials}>{getInitials(item.name)}</Text>
                </View>
              )}
              <View style={styles.rowInfo}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.rowSub}>
                  {item.className}
                  {item.tripType !== 'BOTH'
                    ? ` · ${item.tripType === 'MORNING' ? 'Morning only' : 'Afternoon only'}`
                    : ''}
                </Text>
              </View>
              <View style={styles.moveControls}>
                <Pressable
                  style={({ pressed }) => [
                    styles.moveButton,
                    index === 0 && styles.moveButtonDisabled,
                    pressed && index !== 0 && styles.movePressed,
                  ]}
                  onPress={() => move(index, -1)}
                  disabled={index === 0}
                  accessibilityLabel={`Move ${item.name} earlier`}
                >
                  <ChevronIcon size={20} direction="up" color={index === 0 ? color.hairline : color.ink} />
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.moveButton,
                    index === students.length - 1 && styles.moveButtonDisabled,
                    pressed && index !== students.length - 1 && styles.movePressed,
                  ]}
                  onPress={() => move(index, 1)}
                  disabled={index === students.length - 1}
                  accessibilityLabel={`Move ${item.name} later`}
                >
                  <ChevronIcon size={20} direction="down" color={index === students.length - 1 ? color.hairline : color.ink} />
                </Pressable>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No students on this route yet.</Text>
          }
        />
      )}

      {!isLoading && !errorMessage && students.length > 0 && (
        <View style={[styles.footer, { paddingBottom: space.lg + insets.bottom }]}>
          <Pressable
            style={({ pressed }) => [
              styles.saveButton,
              (!isDirty || isSaving) && styles.saveButtonDisabled,
              pressed && styles.pressed,
            ]}
            onPress={handleSave}
            disabled={!isDirty || isSaving}
          >
            {isSaving ? (
              <ActivityIndicator color={color.ink} />
            ) : (
              <Text style={styles.saveButtonText}>
                {isDirty
                  ? isDropoffOrder
                    ? 'SAVE DROP-OFF ORDER'
                    : 'SAVE PICKUP ORDER'
                  : 'ORDER SAVED'}
              </Text>
            )}
          </Pressable>
        </View>
      )}
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
    padding: space.xxl,
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
  headerText: {
    flex: 1,
    marginRight: space.md,
  },
  headerEyebrow: {
    color: color.danfo,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  headerTitle: {
    color: color.white,
    fontSize: 19,
    fontWeight: '800',
    marginTop: 2,
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // List
  listContent: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.xl,
  },
  hint: {
    fontSize: 13,
    lineHeight: 19,
    color: color.sub,
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderLeftWidth: 4,
    borderLeftColor: color.danfo,
    padding: space.lg,
    marginBottom: space.lg,
  },
  row: {
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
  orderBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.md,
  },
  orderBadgeText: {
    color: color.danfo,
    fontSize: 14,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: color.canvas,
  },
  avatarFallback: {
    backgroundColor: color.danfo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    color: color.ink,
    fontWeight: '800',
    fontSize: 15,
  },
  rowInfo: {
    flex: 1,
    marginLeft: space.md,
    marginRight: space.sm,
  },
  rowName: {
    fontSize: 16,
    fontWeight: '700',
    color: color.ink,
  },
  rowSub: {
    fontSize: 12.5,
    color: color.sub,
    marginTop: 1,
  },
  moveControls: {
    flexDirection: 'row',
    gap: space.sm,
  },
  moveButton: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: color.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moveButtonDisabled: {
    opacity: 0.45,
  },
  movePressed: {
    backgroundColor: color.danfoSoft,
  },
  emptyText: {
    fontSize: 14,
    color: color.sub,
    textAlign: 'center',
    paddingVertical: space.xxl,
  },
  // Footer
  footer: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    backgroundColor: color.surface,
    borderTopWidth: 1,
    borderTopColor: color.hairline,
  },
  saveButton: {
    paddingVertical: space.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.danfo,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: color.ink,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  // Error state
  errorText: {
    fontSize: 14,
    color: color.sub,
    textAlign: 'center',
    marginBottom: space.lg,
  },
  retryButton: {
    backgroundColor: color.danfo,
    borderRadius: radius.md,
    paddingVertical: space.md + 2,
    paddingHorizontal: space.xxl,
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
