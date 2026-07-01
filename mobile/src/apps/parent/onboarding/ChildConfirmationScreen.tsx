import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { supabase } from '../../../lib/supabase';
import { BORDER, DANFO, INK, MUTED, STOP } from './constants';
import type { OnboardingStackParamList } from './OnboardingNavigator';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'ChildConfirmation'>;

type ChildRecord = {
  id: string;
  name: string;
  class_name: string;
  photo_url: string | null;
  schools: { name: string } | null;
  routes: { name: string } | null;
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function ChildConfirmationScreen({ navigation }: Props) {
  const [children, setChildren] = useState<ChildRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showWrongMessage, setShowWrongMessage] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchChildren = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setIsLoading(false);
        return;
      }

      const { data, error: queryError } = await supabase
        .from('student_parents')
        .select(
          'students(id, name, class_name, photo_url, schools(name), routes(name))',
        )
        .eq('parent_id', user.id);

      if (queryError) {
        setError('Something went wrong loading your child. Please try again.');
        setIsLoading(false);
        return;
      }

      const records = (data ?? [])
        .map((row: any) => row.students)
        .filter(Boolean) as ChildRecord[];

      setChildren(records);
      setIsLoading(false);
    } catch {
      setError('Something went wrong loading your child. Please try again.');
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChildren();
  }, [fetchChildren]);

  async function handleConfirm() {
    setError(null);
    setIsSubmitting(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setError('Your session has expired. Please log in again.');
        setIsSubmitting(false);
        return;
      }

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const response = await fetch(
        `${supabaseUrl}/functions/v1/complete-onboarding`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        setError('Something went wrong. Please try again.');
        setIsSubmitting(false);
        return;
      }

      setIsSubmitting(false);
      navigation.navigate('NotificationPermission');
    } catch {
      setError('Something went wrong. Please try again.');
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={DANFO} />
      </View>
    );
  }

  if (children.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyContent}>
          <Text style={styles.emptyText}>
            Your school hasn't linked a child to your account yet. Please
            contact your school's office.
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.refreshButton,
              pressed && styles.refreshButtonPressed,
            ]}
            onPress={fetchChildren}
          >
            <Text style={styles.refreshButtonText}>Refresh</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const headline =
    children.length === 1 ? 'Is this your child?' : 'Are these your children?';

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.headline}>{headline}</Text>

        {children.map((child) => (
          <View key={child.id} style={styles.card}>
            {child.photo_url ? (
              <View style={styles.avatarPhoto} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{getInitials(child.name)}</Text>
              </View>
            )}
            <View style={styles.cardInfo}>
              <Text style={styles.childName}>{child.name}</Text>
              <Text style={styles.childMeta}>{child.class_name}</Text>
              <Text style={styles.childMeta}>
                {child.schools?.name ?? 'Unknown school'}
              </Text>
              <Text style={styles.childMeta}>
                {child.routes?.name ?? 'No route assigned'}
              </Text>
            </View>
          </View>
        ))}

        {showWrongMessage ? (
          <Text style={styles.wrongMessage}>
            Please contact your school's office to correct this information.
          </Text>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={({ pressed }) => [
            styles.confirmButton,
            pressed && styles.confirmButtonPressed,
            isSubmitting && styles.confirmButtonDisabled,
          ]}
          onPress={handleConfirm}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color={INK} />
          ) : (
            <Text style={styles.confirmButtonText}>Yes, this is correct</Text>
          )}
        </Pressable>

        <Pressable onPress={() => setShowWrongMessage(true)}>
          <Text style={styles.wrongButtonText}>Something's wrong</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: INK,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 28,
    paddingTop: 64,
    paddingBottom: 24,
  },
  headline: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 24,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161F33',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: DANFO,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  avatarPhoto: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: BORDER,
    marginRight: 16,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: INK,
  },
  cardInfo: {
    flex: 1,
  },
  childName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  childMeta: {
    fontSize: 14,
    color: MUTED,
    marginBottom: 2,
  },
  wrongMessage: {
    fontSize: 14,
    color: MUTED,
    textAlign: 'center',
    marginTop: 12,
  },
  error: {
    color: STOP,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 12,
  },
  footer: {
    paddingHorizontal: 28,
    paddingBottom: 32,
    paddingTop: 12,
  },
  confirmButton: {
    backgroundColor: DANFO,
    borderRadius: 10,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  confirmButtonPressed: {
    backgroundColor: '#E0AD00',
  },
  confirmButtonDisabled: {
    opacity: 0.6,
  },
  confirmButtonText: {
    color: INK,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 1,
  },
  wrongButtonText: {
    fontSize: 14,
    color: MUTED,
    textAlign: 'center',
  },
  emptyContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  emptyText: {
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  refreshButton: {
    borderWidth: 1,
    borderColor: DANFO,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshButtonPressed: {
    backgroundColor: 'rgba(255,201,0,0.1)',
  },
  refreshButtonText: {
    color: DANFO,
    fontSize: 15,
    fontWeight: '700',
  },
});
