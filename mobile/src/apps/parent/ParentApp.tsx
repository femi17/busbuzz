import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  NavigationContainer,
  useNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { supabase } from '../../lib/supabase';
import HistoryScreen from './HistoryScreen';
import HomeScreen from './HomeScreen';
import OnboardingNavigator from './onboarding/OnboardingNavigator';
import type { OnboardingStackParamList } from './onboarding/OnboardingNavigator';

const INK = '#0E1B2E';
const ASPHALT = '#23262B';
const DANFO = '#FFC900';

export type ParentTabParamList = {
  Track: undefined;
  History: undefined;
};

export type ParentStackParamList = {
  Onboarding: { screen?: keyof OnboardingStackParamList };
  Main: undefined;
};

const Tab = createBottomTabNavigator<ParentTabParamList>();
const Stack = createNativeStackNavigator<ParentStackParamList>();

function ParentTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: INK },
        tabBarActiveTintColor: DANFO,
        tabBarInactiveTintColor: '#6B7280',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tab.Screen
        name="Track"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ color }) => <Text style={{ color }}>📍</Text>,
        }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{
          tabBarIcon: ({ color }) => <Text style={{ color }}>📋</Text>,
        }}
      />
    </Tab.Navigator>
  );
}

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

async function getOnboardingCompleted(userId: string): Promise<boolean> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_completed')
    .eq('id', userId)
    .single();

  return Boolean(profile?.onboarding_completed);
}

export default function ParentApp() {
  const [isLoading, setIsLoading] = useState(true);
  const [initialRouteName, setInitialRouteName] =
    useState<keyof ParentStackParamList>('Onboarding');
  const [onboardingInitialRoute, setOnboardingInitialRoute] =
    useState<keyof OnboardingStackParamList>('Welcome');
  const navigationRef = useNavigationContainerRef<ParentStackParamList>();

  useEffect(() => {
    let isMounted = true;

    async function init() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!isMounted) return;

      if (session?.access_token) {
        const onboardingCompleted = await getOnboardingCompleted(
          session.user.id,
        );

        if (!isMounted) return;

        if (onboardingCompleted) {
          setInitialRouteName('Main');
          await registerForPushNotifications(session.access_token);
        } else {
          setInitialRouteName('Onboarding');
          setOnboardingInitialRoute('ChildConfirmation');
        }
      } else {
        setInitialRouteName('Onboarding');
        setOnboardingInitialRoute('Welcome');
      }

      if (isMounted) {
        setIsLoading(false);
      }
    }

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.access_token) {
        const onboardingCompleted = await getOnboardingCompleted(
          session.user.id,
        );

        if (onboardingCompleted) {
          await registerForPushNotifications(session.access_token);
          navigationRef.reset({ index: 0, routes: [{ name: 'Main' }] });
        } else {
          navigationRef.reset({
            index: 0,
            routes: [
              { name: 'Onboarding', params: { screen: 'ChildConfirmation' } },
            ],
          });
        }
      } else if (event === 'SIGNED_OUT') {
        navigationRef.reset({
          index: 0,
          routes: [{ name: 'Onboarding', params: { screen: 'Welcome' } }],
        });
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
        <ActivityIndicator size="large" color={DANFO} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer ref={navigationRef}>
        <Stack.Navigator
          initialRouteName={initialRouteName}
          screenOptions={{ headerShown: false }}
        >
          <Stack.Screen name="Onboarding">
            {() => (
              <OnboardingNavigator initialRouteName={onboardingInitialRoute} />
            )}
          </Stack.Screen>
          <Stack.Screen name="Main" component={ParentTabs} />
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
    backgroundColor: ASPHALT,
  },
});
