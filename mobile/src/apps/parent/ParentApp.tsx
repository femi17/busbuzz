import {
  BottomTabBar,
  createBottomTabNavigator,
  type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import {
  NavigationContainer,
  useNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import '../../lib/mapbox';

import { configureForegroundNotifications } from '../../lib/notifications';
import { supabase } from '../../lib/supabase';

// Registered at module load, before any notification can arrive — makes
// foreground pushes show a banner and play sound instead of arriving silently.
configureForegroundNotifications();
import { AnimatedSplash } from './components/AnimatedSplash';
import { BusIcon, ClockIcon, PersonIcon } from './components/Icons';
import { DanfoStripe } from './components/Stripe';
import HistoryScreen from './HistoryScreen';
import HomeScreen from './HomeScreen';
import { getLastParentEmail } from './lastParentEmail';
import NotificationsScreen from './NotificationsScreen';
import OnboardingNavigator from './onboarding/OnboardingNavigator';
import type { OnboardingStackParamList } from './onboarding/OnboardingNavigator';
import ProfileScreen from './ProfileScreen';
import { registerForPushNotifications } from './pushNotifications';
import { StatusBarBackdropContext } from './StatusBarBackdropContext';
import { StudentProvider } from './StudentContext';
import { color } from './theme';

export type ParentTabParamList = {
  Track: undefined;
  History: undefined;
  Profile: undefined;
};

export type MainStackParamList = {
  Tabs: undefined;
  Notifications: undefined;
};

export type ParentStackParamList = {
  Onboarding: { screen?: keyof OnboardingStackParamList };
  Main: undefined;
};

const Tab = createBottomTabNavigator<ParentTabParamList>();
const Stack = createNativeStackNavigator<ParentStackParamList>();
const MainStack = createNativeStackNavigator<MainStackParamList>();

// Android no longer lets apps paint a solid status bar background (edge-to-edge
// is enforced) — expo-status-bar in this SDK only controls icon color. To get a
// uniform danfo-yellow status bar on every screen, we paint our own bar over the
// top safe-area inset at the app root, above the navigator, once.
function StatusBarBackdrop({ color: backdropColor }: { color: string }) {
  const insets = useSafeAreaInsets();

  if (insets.top === 0) return null;

  return (
    <View
      pointerEvents="none"
      style={[styles.statusBarBackdrop, { height: insets.top, backgroundColor: backdropColor }]}
    />
  );
}

function ParentTabs() {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: [
          styles.tabBar,
          { height: 60 + insets.bottom, paddingBottom: insets.bottom + 10 },
        ],
        tabBarActiveTintColor: color.danfo500,
        tabBarInactiveTintColor: color.mist400,
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem,
        tabBarIconStyle: styles.tabIcon,
      }}
      tabBar={(props: BottomTabBarProps) => (
        <View>
          <DanfoStripe />
          <BottomTabBar {...props} />
        </View>
      )}
    >
      <Tab.Screen
        name="Track"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Track',
          tabBarIcon: ({ color: tint }) => <BusIcon size={22} color={tint} />,
        }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{
          tabBarLabel: 'History',
          tabBarIcon: ({ color: tint }) => <ClockIcon size={22} color={tint} />,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color: tint }) => <PersonIcon size={22} color={tint} />,
        }}
      />
    </Tab.Navigator>
  );
}

function MainNavigator() {
  return (
    <StudentProvider>
      <MainStack.Navigator>
        <MainStack.Screen
          name="Tabs"
          component={ParentTabs}
          options={{ headerShown: false }}
        />
        <MainStack.Screen
          name="Notifications"
          component={NotificationsScreen}
          options={{
            headerTitle: 'Notifications',
            headerTintColor: color.white,
            headerStyle: { backgroundColor: color.ink900 },
            headerShadowVisible: false,
          }}
        />
      </MainStack.Navigator>
    </StudentProvider>
  );
}

// A cold app launch can start executing JS before the OS has network ready,
// so a stalled auth/profile request must never be able to strand the app on
// the loading spinner forever — resolve to a safe fallback instead.
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      () => { clearTimeout(timer); resolve(fallback); },
    );
  });
}

const STARTUP_TIMEOUT_MS = 8000;

async function getOnboardingCompleted(userId: string): Promise<boolean> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_completed')
    .eq('id', userId)
    .single();

  return Boolean(profile?.onboarding_completed);
}

// A returning user (no active session, but they've verified an email on this
// device before) skips the marketing Welcome screen entirely and lands
// straight on EmailEntry with their email prefilled — still requires a fresh
// OTP code, just without retyping the email or sitting through the intro.
async function resolveNoSessionRoute(): Promise<{
  route: keyof OnboardingStackParamList;
  prefillEmail?: string;
}> {
  const rememberedEmail = await getLastParentEmail();
  if (rememberedEmail) {
    return { route: 'EmailEntry', prefillEmail: rememberedEmail };
  }
  return { route: 'Welcome' };
}

export default function ParentApp() {
  const [isLoading, setIsLoading] = useState(true);
  const [initialRouteName, setInitialRouteName] =
    useState<keyof ParentStackParamList>('Onboarding');
  const [onboardingInitialRoute, setOnboardingInitialRoute] =
    useState<keyof OnboardingStackParamList>('Welcome');
  const [emailEntryPrefill, setEmailEntryPrefill] = useState<string | undefined>();
  const [backdropColor, setBackdropColor] = useState<string>(color.danfo500);
  const statusBarBackdropValue = useMemo(
    () => ({ setColor: (next: string | null) => setBackdropColor(next ?? color.danfo500) }),
    [],
  );
  const navigationRef = useNavigationContainerRef<ParentStackParamList>();

  useEffect(() => {
    async function handleDeepLink(url: string) {
      const fragment = url.split('#')[1];
      if (!fragment) return;
      const params = new URLSearchParams(fragment);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      if (accessToken && refreshToken) {
        await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      }
    }

    Linking.getInitialURL().then((url) => { if (url) handleDeepLink(url); });
    const linkSub = Linking.addEventListener('url', ({ url }) => handleDeepLink(url));

    return () => { linkSub.remove(); };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function init() {
      const {
        data: { session },
      } = await withTimeout(
        supabase.auth.getSession(),
        STARTUP_TIMEOUT_MS,
        { data: { session: null } } as Awaited<ReturnType<typeof supabase.auth.getSession>>,
      );

      if (!isMounted) return;

      if (session?.access_token) {
        // If this can't resolve either, assume the common case for a
        // returning user (already onboarded) rather than spin forever —
        // Main's own screens surface their own errors if data can't load.
        const onboardingCompleted = await withTimeout(
          getOnboardingCompleted(session.user.id),
          STARTUP_TIMEOUT_MS,
          true,
        );

        if (!isMounted) return;

        if (onboardingCompleted) {
          setInitialRouteName('Main');
          // Never await this — a hung permission dialog or FCM registration
          // must not be able to block the app from ever finishing loading.
          registerForPushNotifications(session.access_token);
        } else {
          setInitialRouteName('Onboarding');
          setOnboardingInitialRoute('ChildConfirmation');
        }
      } else {
        const { route, prefillEmail } = await resolveNoSessionRoute();
        setInitialRouteName('Onboarding');
        setOnboardingInitialRoute(route);
        setEmailEntryPrefill(prefillEmail);
      }

      if (isMounted) {
        setIsLoading(false);
      }
    }

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Never call other supabase methods synchronously inside this callback —
      // it runs while the auth lock is held, so an awaited supabase.from()/query
      // here can deadlock. Defer the work to the next tick to release the lock
      // first. https://github.com/supabase/supabase-js/issues/992
      if (event === 'SIGNED_IN' && session?.access_token) {
        const { access_token, user } = session;
        setTimeout(async () => {
          const onboardingCompleted = await getOnboardingCompleted(user.id);

          if (onboardingCompleted) {
            registerForPushNotifications(access_token);
            navigationRef.reset({ index: 0, routes: [{ name: 'Main' }] });
          } else {
            navigationRef.reset({
              index: 0,
              routes: [
                { name: 'Onboarding', params: { screen: 'ChildConfirmation' } },
              ],
            });
          }
        }, 0);
      } else if (event === 'SIGNED_OUT') {
        setTimeout(async () => {
          const { route, prefillEmail } = await resolveNoSessionRoute();
          setOnboardingInitialRoute(route);
          setEmailEntryPrefill(prefillEmail);
          navigationRef.reset({
            index: 0,
            routes: [{ name: 'Onboarding', params: { screen: route } }],
          });
        }, 0);
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
        <StatusBar style="light" />
        <AnimatedSplash />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBarBackdropContext.Provider value={statusBarBackdropValue}>
        <StatusBar style="dark" />
        <NavigationContainer ref={navigationRef}>
          <Stack.Navigator
            initialRouteName={initialRouteName}
            screenOptions={{ headerShown: false }}
          >
            <Stack.Screen name="Onboarding">
              {() => (
                <OnboardingNavigator
                  initialRouteName={onboardingInitialRoute}
                  emailEntryPrefill={emailEntryPrefill}
                />
              )}
            </Stack.Screen>
            <Stack.Screen name="Main" component={MainNavigator} />
          </Stack.Navigator>
        </NavigationContainer>
        <StatusBarBackdrop color={backdropColor} />
      </StatusBarBackdropContext.Provider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  statusBarBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  tabBar: {
    backgroundColor: color.ink900,
    borderTopWidth: 0,
    paddingTop: 10,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginTop: 4,
  },
  tabItem: {
    paddingVertical: 4,
  },
  tabIcon: {
    marginBottom: 2,
  },
});
