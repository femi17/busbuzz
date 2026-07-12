import { createNativeStackNavigator } from '@react-navigation/native-stack';

import ChildConfirmationScreen from './ChildConfirmationScreen';
import CodeVerificationScreen from './CodeVerificationScreen';
import EmailEntryScreen from './EmailEntryScreen';
import NotificationPermissionScreen from './NotificationPermissionScreen';
import WelcomeScreen from './WelcomeScreen';

export type OnboardingStackParamList = {
  Welcome: undefined;
  EmailEntry: { prefillEmail?: string } | undefined;
  CodeVerification: { email: string };
  ChildConfirmation: undefined;
  NotificationPermission: undefined;
};

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

type Props = {
  initialRouteName?: keyof OnboardingStackParamList;
  // Returning users who've signed out land straight on EmailEntry with this
  // prefilled, instead of retyping their email after the Welcome intro.
  emailEntryPrefill?: string;
};

export default function OnboardingNavigator({
  initialRouteName = 'Welcome',
  emailEntryPrefill,
}: Props) {
  return (
    <Stack.Navigator
      initialRouteName={initialRouteName}
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen
        name="EmailEntry"
        component={EmailEntryScreen}
        initialParams={{ prefillEmail: emailEntryPrefill }}
      />
      <Stack.Screen name="CodeVerification" component={CodeVerificationScreen} />
      <Stack.Screen name="ChildConfirmation" component={ChildConfirmationScreen} />
      <Stack.Screen
        name="NotificationPermission"
        component={NotificationPermissionScreen}
      />
    </Stack.Navigator>
  );
}
