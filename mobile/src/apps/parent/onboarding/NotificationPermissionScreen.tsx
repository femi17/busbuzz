import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Notifications from 'expo-notifications';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { supabase } from '../../../lib/supabase';
import { BackpackIcon, BellIcon, BusIcon, SchoolIcon } from '../components/Icons';
import { color, radius, space, type } from '../theme';
import type { OnboardingStackParamList } from './OnboardingNavigator';

type Props = NativeStackScreenProps<
  OnboardingStackParamList,
  'NotificationPermission'
>;

const ROWS = [
  { Icon: BusIcon, text: 'Know when the bus is near your stop' },
  { Icon: BackpackIcon, text: 'Get notified the moment your child boards' },
  { Icon: SchoolIcon, text: 'Get notified when they arrive safely at school' },
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
        <View style={styles.bellWrap}>
          <BellIcon size={40} color={color.ink900} />
        </View>
        <Text style={styles.headline}>Stay updated, automatically</Text>

        <View style={styles.rows}>
          {ROWS.map((row) => (
            <View key={row.text} style={styles.row}>
              <View style={styles.rowIconWrap}>
                <row.Icon size={20} color={color.danfo500} />
              </View>
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
            <ActivityIndicator color={color.ink900} />
          ) : (
            <Text style={styles.buttonText}>Turn on notifications</Text>
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
    backgroundColor: color.ink900,
    paddingHorizontal: space.xxl,
    justifyContent: 'space-between',
    paddingVertical: 64,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bellWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: color.danfo500,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xxl,
  },
  headline: {
    ...type.displayMd,
    color: color.white,
    textAlign: 'center',
    marginBottom: space.xxl + space.xs,
  },
  rows: {
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: space.lg + 2,
  },
  rowIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: color.ink700,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.lg,
  },
  rowText: {
    ...type.bodyLg,
    color: color.white,
    flex: 1,
  },
  footer: {
    alignItems: 'center',
  },
  button: {
    backgroundColor: color.danfo500,
    borderRadius: radius.md,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  buttonPressed: {
    backgroundColor: color.danfo600,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: color.ink900,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  footerNote: {
    fontSize: 13,
    color: color.mist400,
    marginTop: space.lg,
  },
});
