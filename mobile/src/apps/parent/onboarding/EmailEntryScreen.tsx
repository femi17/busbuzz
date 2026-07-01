import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { otpRequestSchema } from '../../../../../shared/schemas';
import { supabase } from '../../../lib/supabase';
import { BORDER, DANFO, INK, MUTED, STOP } from './constants';
import type { OnboardingStackParamList } from './OnboardingNavigator';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'EmailEntry'>;

const GENERIC_ERROR =
  "We couldn't find an account for this email. Please check with your school to confirm they've added you to BusBuzz, or verify you entered the correct email.";

export default function EmailEntryScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSendCode() {
    setError(null);

    const trimmedEmail = email.trim();
    const parseResult = otpRequestSchema.safeParse({ email: trimmedEmail });

    if (!parseResult.success) {
      setError('Please enter a valid email address');
      return;
    }

    setIsLoading(true);

    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: trimmedEmail,
        options: { shouldCreateUser: false },
      });

      if (otpError) {
        setError(GENERIC_ERROR);
        setIsLoading(false);
        return;
      }

      setIsLoading(false);
      navigation.navigate('CodeVerification', { email: trimmedEmail });
    } catch {
      setError(GENERIC_ERROR);
      setIsLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Pressable style={styles.backButton} onPress={() => navigation.navigate('Welcome')}>
        <Text style={styles.backArrow}>←</Text>
      </Pressable>

      <View style={styles.content}>
        <Text style={styles.headline}>What's your email?</Text>
        <Text style={styles.helper}>
          Enter the email your school used to invite you to BusBuzz.
        </Text>

        <TextInput
          style={styles.input}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          placeholder="you@example.com"
          placeholderTextColor="#6B7280"
          value={email}
          onChangeText={setEmail}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
            isLoading && styles.buttonDisabled,
          ]}
          onPress={handleSendCode}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color={INK} />
          ) : (
            <Text style={styles.buttonText}>Send Code</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: INK,
    paddingHorizontal: 28,
  },
  backButton: {
    marginTop: 56,
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  backArrow: {
    fontSize: 24,
    color: '#fff',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    marginTop: -56,
  },
  headline: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  helper: {
    fontSize: 14,
    color: MUTED,
    marginBottom: 28,
    lineHeight: 20,
  },
  input: {
    backgroundColor: INK,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 18,
    color: '#fff',
    marginBottom: 16,
  },
  error: {
    color: STOP,
    fontWeight: '600',
    marginBottom: 16,
  },
  button: {
    backgroundColor: DANFO,
    borderRadius: 10,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    backgroundColor: '#E0AD00',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: INK,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
