import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

// Supabase's token auto-refresh must be driven by app foreground state on
// React Native. Left to its own timer, the refresh loop starts the moment the
// client is created — before the OS has network on a cold boot — and can hold
// the internal auth lock that getSession() waits on, stranding startup until it
// times out (which then wrongly drops the user back to the login screen).
// Gating it on AppState is the setup Supabase documents for Expo. See:
// https://supabase.com/docs/guides/auth/quickstarts/react-native
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
