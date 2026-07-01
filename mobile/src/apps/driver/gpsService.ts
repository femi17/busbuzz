import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

export const GPS_TASK_NAME = 'busbuzz-gps-broadcast';

const GPS_CONTEXT_KEY = '@busbuzz_gps_context';
const GPS_QUEUE_KEY = '@busbuzz_gps_queue';
const ACCESS_TOKEN_KEY = '@busbuzz_access_token';
const MAX_QUEUE_SIZE = 100;

type GpsContext = {
  tripId: string;
  busId: string;
  deviceId: string;
};

type GpsPayload = {
  tripId: string;
  busId: string;
  lat: number;
  lng: number;
  speed: number;
  timestamp: string;
  deviceId: string;
};

async function postGpsUpdate(payload: GpsPayload): Promise<boolean> {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return false;
  }

  const accessToken = await AsyncStorage.getItem(ACCESS_TOKEN_KEY);
  if (!accessToken) {
    return false;
  }

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/gps-update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'apikey': anonKey,
      },
      body: JSON.stringify(payload),
    });

    return response.ok;
  } catch {
    return false;
  }
}

async function enqueueFailedPayload(payload: GpsPayload): Promise<void> {
  try {
    const existingRaw = await AsyncStorage.getItem(GPS_QUEUE_KEY);
    const existing: GpsPayload[] = existingRaw ? JSON.parse(existingRaw) : [];
    existing.push(payload);
    const trimmed = existing.slice(-MAX_QUEUE_SIZE);
    await AsyncStorage.setItem(GPS_QUEUE_KEY, JSON.stringify(trimmed));
  } catch {
    // Non-fatal — drop the payload if storage fails
  }
}

async function drainQueue(): Promise<void> {
  try {
    const existingRaw = await AsyncStorage.getItem(GPS_QUEUE_KEY);
    const queue: GpsPayload[] = existingRaw ? JSON.parse(existingRaw) : [];

    if (queue.length === 0) {
      return;
    }

    let remaining = [...queue];

    for (let i = 0; i < queue.length; i++) {
      const success = await postGpsUpdate(queue[i]);
      if (success) {
        remaining = remaining.slice(1);
      } else {
        break;
      }
    }

    await AsyncStorage.setItem(GPS_QUEUE_KEY, JSON.stringify(remaining));
  } catch {
    // Non-fatal
  }
}

TaskManager.defineTask(
  GPS_TASK_NAME,
  async ({
    data,
    error,
  }: {
    data?: { locations: Location.LocationObject[] };
    error?: TaskManager.TaskManagerError | null;
  }) => {
    if (error) {
      console.error('[gpsService] Background task error:', error);
      return;
    }

    const locations = data?.locations;
    if (!locations || locations.length === 0) {
      return;
    }

    const contextRaw = await AsyncStorage.getItem(GPS_CONTEXT_KEY);
    if (!contextRaw) {
      // GPS was stopped but the task is still firing — no-op
      return;
    }

    let context: GpsContext;
    try {
      context = JSON.parse(contextRaw);
    } catch {
      return;
    }

    const location = locations[0];

    const payload: GpsPayload = {
      tripId: context.tripId,
      busId: context.busId,
      lat: location.coords.latitude,
      lng: location.coords.longitude,
      speed: Math.max(0, (location.coords.speed ?? 0) * 3.6),
      timestamp: new Date(location.timestamp).toISOString(),
      deviceId: context.deviceId,
    };

    const success = await postGpsUpdate(payload);

    if (!success) {
      await enqueueFailedPayload(payload);
    } else {
      await drainQueue();
    }
  },
);

export async function startGPSBroadcast(
  tripId: string,
  busId: string,
  deviceId: string,
): Promise<void> {
  const foregroundPermission =
    await Location.requestForegroundPermissionsAsync();
  if (foregroundPermission.status !== 'granted') {
    throw new Error('Foreground location permission denied');
  }

  const backgroundPermission =
    await Location.requestBackgroundPermissionsAsync();
  if (backgroundPermission.status !== 'granted') {
    throw new Error('Background location permission denied');
  }

  const context: GpsContext = { tripId, busId, deviceId };
  await AsyncStorage.setItem(GPS_CONTEXT_KEY, JSON.stringify(context));

  await Location.startLocationUpdatesAsync(GPS_TASK_NAME, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 10000,
    distanceInterval: 0,
    foregroundService: {
      notificationTitle: 'BusBuzz',
      notificationBody: 'Broadcasting GPS location',
      notificationColor: '#2196F3',
    },
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.AutomotiveNavigation,
  });
}

export async function stopGPSBroadcast(): Promise<void> {
  const isRunning = await Location.hasStartedLocationUpdatesAsync(
    GPS_TASK_NAME,
  );
  if (isRunning) {
    await Location.stopLocationUpdatesAsync(GPS_TASK_NAME);
  }

  await AsyncStorage.removeItem(GPS_CONTEXT_KEY);
}
