// Notification loudness setup, shared by the parent and driver apps.
//
// Without this, pushes land silently in the tray: no heads-up banner, no
// sound, no vibration — parents simply never noticed them. This module makes
// BusBuzz behave like every other messaging app:
//  - foreground notifications show a banner and play sound
//  - Android channels are MAX importance (heads-up/floating) with vibration
//  - the arrival channel is alarm-like: long vibration pattern, bypasses DND
//
// The server picks the channel per message (send-push `channelId`): geofence
// "bus approaching your stop" and SOS use `arrival-alarm`; boarding/drop-off
// updates use `trip-updates`.
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export const CHANNEL_TRIP_UPDATES = 'trip-updates';
export const CHANNEL_ARRIVAL_ALARM = 'arrival-alarm';

// Foreground presentation — must be registered once at app start, before any
// notification arrives.
export function configureForegroundNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

// Android requires channels for sound/vibration/heads-up. iOS ignores this
// (loudness there comes from the push payload's sound + interruption level).
export async function ensureNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(CHANNEL_TRIP_UPDATES, {
    name: 'Trip updates',
    description: 'Boarding, drop-off, and trip status updates',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    enableVibrate: true,
    vibrationPattern: [0, 300, 200, 300],
    lightColor: '#FFC900',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });

  await Notifications.setNotificationChannelAsync(CHANNEL_ARRIVAL_ALARM, {
    name: 'Bus arrival alarm',
    description: 'The bus is arriving at your stop — do not miss it',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    enableVibrate: true,
    // Long, insistent triple-buzz — reads as an alarm, not a chat ping.
    vibrationPattern: [0, 600, 250, 600, 250, 800],
    lightColor: '#FFC900',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    // Best-effort: only honoured if the user grants DND access, harmless otherwise.
    bypassDnd: true,
  });
}
