import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Stop } from '../../../../shared/types';
import { supabase } from '../../lib/supabase';
import AttendanceScreen from './AttendanceScreen';
import LoginScreen from './LoginScreen';
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
    }>;
    busId: string;
    routeName: string;
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
  } catch {
    // Non-fatal — push registration failure should not block app usage
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
        await registerForPushNotifications(session.access_token);
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
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
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
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
});
