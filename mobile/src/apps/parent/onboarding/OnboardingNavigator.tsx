import { createNativeStackNavigator } from '@react-navigation/native-stack';

import ChildConfirmationScreen from './ChildConfirmationScreen';
import CodeVerificationScreen from './CodeVerificationScreen';
import EmailEntryScreen from './EmailEntryScreen';
import NotificationPermissionScreen from './NotificationPermissionScreen';
import WelcomeScreen from './WelcomeScreen';

export type OnboardingStackParamList = {
  Welcome: undefined;
  EmailEntry: undefined;
  CodeVerification: { email: string };
  ChildConfirmation: undefined;
  NotificationPermission: undefined;
};

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

type Props = {
  initialRouteName?: keyof OnboardingStackParamList;
};

export default function OnboardingNavigator({
  initialRouteName = 'Welcome',
}: Props) {
  return (
    <Stack.Navigator
      initialRouteName={initialRouteName}
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="EmailEntry" component={EmailEntryScreen} />
      <Stack.Screen name="CodeVerification" component={CodeVerificationScreen} />
      <Stack.Screen name="ChildConfirmation" component={ChildConfirmationScreen} />
      <Stack.Screen
        name="NotificationPermission"
        component={NotificationPermissionScreen}
      />
    </Stack.Navigator>
  );
}
