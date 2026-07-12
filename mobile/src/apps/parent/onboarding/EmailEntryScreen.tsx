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
import { clearLastParentEmail } from '../lastParentEmail';
import { color, radius, space, type } from '../theme';
import type { OnboardingStackParamList } from './OnboardingNavigator';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'EmailEntry'>;

const GENERIC_ERROR =
  "We couldn't find an account for this email. Check with your school that they've added you to BusBuzz, or try the email address they have on file.";

export default function EmailEntryScreen({ navigation, route }: Props) {
  const prefillEmail = route.params?.prefillEmail;
  const [email, setEmail] = useState(prefillEmail ?? '');
  const [isReturningUser, setIsReturningUser] = useState(Boolean(prefillEmail));
  const [isFocused, setIsFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  function handleNotYou() {
    setIsReturningUser(false);
    setEmail('');
    clearLastParentEmail();
  }

  async function handleSendCode() {
    setError(null);

    const trimmedEmail = email.trim();
    const parseResult = otpRequestSchema.safeParse({ email: trimmedEmail });

    if (!parseResult.success) {
      setError('Enter a valid email address to continue.');
      return;
    }

    setIsLoading(true);

    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: trimmedEmail,
        options: {
          shouldCreateUser: false,
        },
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
        <Text style={styles.eyebrow}>{isReturningUser ? 'Welcome back' : 'Step 1 of 2'}</Text>
        <Text style={styles.headline}>
          {isReturningUser ? 'Confirm your email' : "What's your email?"}
        </Text>
        <Text style={styles.helper}>
          {isReturningUser
            ? "We'll send a fresh code to sign you back in."
            : 'Use the email your school gave BusBuzz — that’s how we find your child.'}
        </Text>

        <TextInput
          style={[styles.input, isFocused && styles.inputFocused]}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          placeholder="you@example.com"
          placeholderTextColor={color.mist400}
          value={email}
          editable={!isReturningUser}
          onChangeText={setEmail}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        />

        {isReturningUser ? (
          <Pressable style={styles.notYouRow} onPress={handleNotYou}>
            <Text style={styles.notYouText}>Not you? Use a different email</Text>
          </Pressable>
        ) : null}

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
            <ActivityIndicator color={color.ink900} />
          ) : (
            <Text style={styles.buttonText}>Send code</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.ink900,
    paddingHorizontal: space.xxl,
  },
  backButton: {
    marginTop: 56,
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  backArrow: {
    fontSize: 24,
    color: color.white,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    marginTop: -56,
  },
  eyebrow: {
    ...type.eyebrow,
    color: color.danfo500,
    marginBottom: space.sm,
  },
  headline: {
    ...type.displayMd,
    color: color.white,
    marginBottom: space.sm,
  },
  helper: {
    ...type.bodyMd,
    color: color.mist400,
    marginBottom: space.xxl + space.xs,
  },
  input: {
    backgroundColor: color.ink700,
    borderWidth: 1.5,
    borderColor: color.border,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
    fontSize: 18,
    color: color.white,
    marginBottom: space.lg,
  },
  inputFocused: {
    borderColor: color.danfo500,
  },
  notYouRow: {
    marginTop: -space.sm,
    marginBottom: space.lg,
  },
  notYouText: {
    ...type.bodyMd,
    color: color.danfo500,
    fontWeight: '700',
  },
  error: {
    color: color.stopRed,
    fontWeight: '600',
    marginBottom: space.lg,
  },
  button: {
    backgroundColor: color.danfo500,
    borderRadius: radius.md,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    backgroundColor: color.danfo600,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: color.ink900,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
