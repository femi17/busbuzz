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
import { BackpackIcon } from '../components/Icons';
import { TicketCard } from '../components/TicketCard';
import { color, radius, space, type } from '../theme';
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
        setError('We couldn’t load your child’s details. Try again.');
        setIsLoading(false);
        return;
      }

      const records = (data ?? [])
        .map((row: any) => row.students)
        .filter(Boolean) as ChildRecord[];

      setChildren(records);
      setIsLoading(false);
    } catch {
      setError('We couldn’t load your child’s details. Try again.');
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
        setError('Your session has expired. Log in again to continue.');
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
        setError('That didn’t go through. Try again.');
        setIsSubmitting(false);
        return;
      }

      setIsSubmitting(false);
      navigation.navigate('NotificationPermission');
    } catch {
      setError('That didn’t go through. Try again.');
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={color.danfo500} />
      </View>
    );
  }

  if (children.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyContent}>
          <BackpackIcon size={48} color={color.danfo500} />
          <Text style={styles.emptyText}>
            Your school hasn't linked a child to your account yet. Contact
            your school's office to get set up.
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.refreshButton,
              pressed && styles.refreshButtonPressed,
            ]}
            onPress={fetchChildren}
          >
            <Text style={styles.refreshButtonText}>Check again</Text>
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
        <Text style={styles.eyebrow}>Almost there</Text>
        <Text style={styles.headline}>{headline}</Text>
        <Text style={styles.subhead}>
          Your school's boarding pass for BusBuzz tracking.
        </Text>

        {children.map((child) => (
          <View key={child.id} style={styles.cardWrap}>
            <TicketCard notchColor={color.ink900}>
              <View style={styles.mainRow}>
                {child.photo_url ? (
                  <View style={styles.avatarPhoto} />
                ) : (
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{getInitials(child.name)}</Text>
                  </View>
                )}
                <View style={styles.cardInfo}>
                  <Text style={styles.passLabel}>Student</Text>
                  <Text style={styles.childName}>{child.name}</Text>
                  <Text style={styles.childMeta}>{child.class_name}</Text>
                </View>
              </View>
              <View style={styles.stubRow}>
                <View style={styles.stubColumn}>
                  <Text style={styles.stubLabel}>School</Text>
                  <Text style={styles.stubValue}>
                    {child.schools?.name ?? 'Not yet assigned'}
                  </Text>
                </View>
                <View style={styles.stubColumn}>
                  <Text style={styles.stubLabel}>Route</Text>
                  <Text style={styles.stubValue}>
                    {child.routes?.name ?? 'Not yet assigned'}
                  </Text>
                </View>
              </View>
            </TicketCard>
          </View>
        ))}

        {showWrongMessage ? (
          <Text style={styles.wrongMessage}>
            Contact your school's office to correct this information.
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
            <ActivityIndicator color={color.ink900} />
          ) : (
            <Text style={styles.confirmButtonText}>
              {children.length === 1 ? "Yes, that's my child" : "Yes, that's correct"}
            </Text>
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
    backgroundColor: color.ink900,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: color.ink900,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: space.xxl,
    paddingTop: 64,
    paddingBottom: space.xxl,
  },
  eyebrow: {
    ...type.eyebrow,
    color: color.danfo500,
    marginBottom: space.sm,
  },
  headline: {
    ...type.displayMd,
    color: color.white,
  },
  subhead: {
    ...type.bodyMd,
    color: color.mist400,
    marginTop: space.xs,
    marginBottom: space.xxl,
  },
  cardWrap: {
    marginBottom: space.xl,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    elevation: 6,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: color.danfo500,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.lg,
  },
  avatarPhoto: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: color.paper100,
    marginRight: space.lg,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '800',
    color: color.ink900,
  },
  cardInfo: {
    flex: 1,
  },
  passLabel: {
    ...type.eyebrow,
    fontSize: 10,
    color: color.ledger400,
    marginBottom: 2,
  },
  childName: {
    fontSize: 19,
    fontWeight: '800',
    color: color.ledger700,
  },
  childMeta: {
    fontSize: 14,
    color: color.ledger400,
    marginTop: 2,
  },
  stubRow: {
    flexDirection: 'row',
  },
  stubColumn: {
    flex: 1,
  },
  stubLabel: {
    ...type.eyebrow,
    fontSize: 10,
    color: color.ledger400,
    marginBottom: 4,
  },
  stubValue: {
    fontSize: 14,
    fontWeight: '700',
    color: color.ledger700,
  },
  wrongMessage: {
    ...type.bodyMd,
    color: color.mist400,
    textAlign: 'center',
    marginTop: space.md,
  },
  error: {
    color: color.stopRed,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: space.md,
  },
  footer: {
    paddingHorizontal: space.xxl,
    paddingBottom: space.xxxl,
    paddingTop: space.md,
  },
  confirmButton: {
    backgroundColor: color.danfo500,
    borderRadius: radius.md,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.lg,
  },
  confirmButtonPressed: {
    backgroundColor: color.danfo600,
  },
  confirmButtonDisabled: {
    opacity: 0.6,
  },
  confirmButtonText: {
    color: color.ink900,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  wrongButtonText: {
    fontSize: 14,
    color: color.mist400,
    textAlign: 'center',
  },
  emptyContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xxl,
  },
  emptyText: {
    ...type.bodyLg,
    color: color.white,
    textAlign: 'center',
    marginTop: space.xl,
    marginBottom: space.xxl,
  },
  refreshButton: {
    borderWidth: 1.5,
    borderColor: color.danfo500,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: space.xxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshButtonPressed: {
    backgroundColor: 'rgba(255,201,0,0.1)',
  },
  refreshButtonText: {
    color: color.danfo500,
    fontSize: 15,
    fontWeight: '700',
  },
});
