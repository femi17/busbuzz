import * as Notifications from 'expo-notifications';

import { ensureNotificationChannels } from '../../lib/notifications';

export type PushPermissionStatus = 'granted' | 'denied' | 'undetermined';

export async function getPushPermissionStatus(): Promise<PushPermissionStatus> {
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

export async function registerForPushNotifications(accessToken: string): Promise<boolean> {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      return false;
    }

    // Channels must exist before a push arrives, or Android falls back to a
    // silent default channel.
    await ensureNotificationChannels();

    const tokenResponse = await Notifications.getExpoPushTokenAsync();
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;

    if (!supabaseUrl) {
      return false;
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/update-push-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ expoPushToken: tokenResponse.data }),
    });

    if (!response.ok) {
      console.warn(
        '[push] update-push-token failed:',
        response.status,
        await response.text().catch(() => ''),
      );
      return false;
    }

    return true;
  } catch (err) {
    // Non-fatal — push registration failure should not block app usage.
    // But it MUST be visible: on Android this throws when the build has no
    // FCM credentials (missing google-services.json), which otherwise
    // silently leaves expo_push_token null and every push undelivered.
    console.warn('[push] registration failed:', err);
    return false;
  }
}
