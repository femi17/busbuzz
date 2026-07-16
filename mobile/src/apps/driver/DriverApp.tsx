import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Stop } from '../../../../shared/types';
import '../../lib/mapbox';
import {
  configureForegroundNotifications,
  ensureNotificationChannels,
} from '../../lib/notifications';
import { supabase } from '../../lib/supabase';

configureForegroundNotifications();
import { AnimatedSplash } from './components/AnimatedSplash';
import AttendanceScreen from './AttendanceScreen';
import LoginScreen from './LoginScreen';
import PickupOrderScreen from './PickupOrderScreen';
import TodayScreen from './TodayScreen';

const ACCESS_TOKEN_KEY = '@busbuzz_access_token';

export type DriverStackParamList = {
  Login: undefined;
  Today: undefined;
  Attendance: {
    tripId: string;
    stops: Stop[];
    students: Array<{
      id: string;
      name: string;
      className: string;
      photoUrl: string | null;
      stopId: string | null;
      pickupLat: number | null;
      pickupLng: number | null;
    }>;
    busId: string;
    routeName: string;
    // Which run this is — drives board/drop semantics and, for BOTH routes,
    // reverses the stop order on the afternoon run.
    direction: 'MORNING' | 'AFTERNOON';
    routeType: 'MORNING' | 'AFTERNOON' | 'BOTH';
    // The school itself — used to synthesize the school end of the run
    // (morning: final drop-everyone; afternoon: initial board-everyone) so
    // street stops never show drop-off UI mid-morning.
    schoolName: string | null;
    schoolLat: number | null;
    schoolLng: number | null;
  };
  PickupOrder: {
    routeId: string;
    routeName: string;
    // A dedicated AFTERNOON route's order IS the drop-off order (no
    // reversal happens) — drives the screen's wording.
    routeType: 'MORNING' | 'AFTERNOON' | 'BOTH';
  };
};

const Stack = createNativeStackNavigator<DriverStackParamList>();

async function registerForPushNotifications(accessToken: string) {
  try {
    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      return;
    }

    await ensureNotificationChannels();

    const tokenResponse = await Notifications.getExpoPushTokenAsync();
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;

    if (!supabaseUrl) {
      return;
    }

    await fetch(`${supabaseUrl}/functions/v1/update-push-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ expoPushToken: tokenResponse.data }),
    });
  } catch (err) {
    // Non-fatal — push registration failure should not block app usage.
    // Visible warning: on Android this throws when the build lacks FCM
    // credentials (missing google-services.json).
    console.warn('[push] registration failed:', err);
  }
}

export default function DriverApp() {
  const [isLoading, setIsLoading] = useState(true);
  const [initialRouteName, setInitialRouteName] =
    useState<keyof DriverStackParamList>('Login');

  useEffect(() => {
    let isMounted = true;

    async function init() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!isMounted) return;

      if (session?.access_token) {
        await AsyncStorage.setItem(ACCESS_TOKEN_KEY, session.access_token);
        setInitialRouteName('Today');
        // Never await this — a hung permission dialog or FCM registration
        // must not be able to block the app from ever finishing loading.
        registerForPushNotifications(session.access_token);
      } else {
        setInitialRouteName('Login');
      }

      if (isMounted) {
        setIsLoading(false);
      }
    }

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        await AsyncStorage.removeItem(ACCESS_TOKEN_KEY);
      } else if (session?.access_token) {
        await AsyncStorage.setItem(ACCESS_TOKEN_KEY, session.access_token);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (isLoading) {
    return (
      <SafeAreaProvider>
        <AnimatedSplash />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName={initialRouteName}
          screenOptions={{ headerShown: false }}
        >
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Today" component={TodayScreen} />
          <Stack.Screen name="Attendance" component={AttendanceScreen} />
          <Stack.Screen name="PickupOrder" component={PickupOrderScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
