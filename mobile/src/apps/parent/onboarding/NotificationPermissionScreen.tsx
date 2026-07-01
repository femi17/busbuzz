import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Notifications from 'expo-notifications';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { supabase } from '../../../lib/supabase';
import { DANFO, INK, MUTED } from './constants';
import type { OnboardingStackParamList } from './OnboardingNavigator';

type Props = NativeStackScreenProps<
  OnboardingStackParamList,
  'NotificationPermission'
>;

const ROWS = [
  { icon: '🚌', text: 'Know when the bus is near your stop' },
  { icon: '🎒', text: 'Get notified the moment your child boards' },
  { icon: '🏫', text: 'Get notified when they arrive safely at school' },
];

async function registerPushToken() {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) return;

    const tokenResponse = await Notifications.getExpoPushTokenAsync();
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;

    if (!supabaseUrl) return;

    await fetch(`${supabaseUrl}/functions/v1/update-push-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ expoPushToken: tokenResponse.data }),
    });
  } catch {
    // Non-fatal — push registration failure should not block onboarding
  }
}

export default function NotificationPermissionScreen({ navigation }: Props) {
  const [isLoading, setIsLoading] = useState(false);

  async function handleEnableNotifications() {
    setIsLoading(true);

    try {
      const { status } = await Notifications.requestPermissionsAsync();

      if (status === 'granted') {
        await registerPushToken();
      }
    } catch {
      // Non-fatal — proceed to main app regardless
    }

    setIsLoading(false);
    navigation.getParent()?.reset({
      index: 0,
      routes: [{ name: 'Main' }],
    });
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.bellIcon}>🔔</Text>
        <Text style={styles.headline}>Stay updated, automatically</Text>

        <View style={styles.rows}>
          {ROWS.map((row) => (
            <View key={row.text} style={styles.row}>
              <Text style={styles.rowIcon}>{row.icon}</Text>
              <Text style={styles.rowText}>{row.text}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.footer}>
        <Pressable
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
            isLoading && styles.buttonDisabled,
          ]}
          onPress={handleEnableNotifications}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color={INK} />
          ) : (
            <Text style={styles.buttonText}>Enable Notifications</Text>
          )}
        </Pressable>
        <Text style={styles.footerNote}>
          You can change this anytime in Settings
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: INK,
    paddingHorizontal: 28,
    justifyContent: 'space-between',
    paddingVertical: 64,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bellIcon: {
    fontSize: 56,
    marginBottom: 20,
  },
  headline: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 32,
  },
  rows: {
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  rowIcon: {
    fontSize: 22,
    marginRight: 14,
  },
  rowText: {
    fontSize: 16,
    color: '#fff',
    flex: 1,
  },
  footer: {
    alignItems: 'center',
  },
  button: {
    backgroundColor: DANFO,
    borderRadius: 10,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  buttonPressed: {
    backgroundColor: '#E0AD00',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: INK,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 1,
  },
  footerNote: {
    fontSize: 13,
    color: MUTED,
    marginTop: 14,
  },
});
