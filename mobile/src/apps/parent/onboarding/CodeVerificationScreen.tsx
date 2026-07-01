import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { supabase } from '../../../lib/supabase';
import { BORDER, DANFO, INK, MUTED, STOP } from './constants';
import type { OnboardingStackParamList } from './OnboardingNavigator';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'CodeVerification'>;

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 30;

export default function CodeVerificationScreen({ navigation, route }: Props) {
  const { email } = route.params;
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [resendFeedback, setResendFeedback] = useState<string | null>(null);
  const inputRefs = useRef<Array<TextInput | null>>([]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  function clearAllAndFocusFirst() {
    setDigits(Array(CODE_LENGTH).fill(''));
    inputRefs.current[0]?.focus();
  }

  async function handleVerify(code: string) {
    setError(null);
    setIsVerifying(true);

    try {
      const { data: verifyData, error: verifyError } =
        await supabase.auth.verifyOtp({
          email,
          token: code,
          type: 'email',
        });

      if (verifyError || !verifyData.user) {
        setError(
          'That code is incorrect or has expired. Try again or resend a new code.',
        );
        clearAllAndFocusFirst();
        setIsVerifying(false);
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarding_completed')
        .eq('id', verifyData.user.id)
        .single();

      setIsVerifying(false);

      if (profile?.onboarding_completed) {
        navigation.getParent()?.reset({
          index: 0,
          routes: [{ name: 'Main' }],
        });
      } else {
        navigation.navigate('ChildConfirmation');
      }
    } catch {
      setError(
        'That code is incorrect or has expired. Try again or resend a new code.',
      );
      clearAllAndFocusFirst();
      setIsVerifying(false);
    }
  }

  function handleDigitChange(text: string, index: number) {
    const filtered = text.replace(/[^0-9]/g, '');
    if (!filtered) {
      const next = [...digits];
      next[index] = '';
      setDigits(next);
      return;
    }

    const next = [...digits];
    next[index] = filtered[filtered.length - 1];
    setDigits(next);

    if (index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    const joined = next.join('');
    if (joined.length === CODE_LENGTH && !next.includes('')) {
      handleVerify(joined);
    }
  }

  function handleKeyPress(
    e: { nativeEvent: { key: string } },
    index: number,
  ) {
    if (e.nativeEvent.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  async function handleResend() {
    if (resendCooldown > 0) return;

    setError(null);
    setResendFeedback(null);

    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      });

      if (!otpError) {
        setResendFeedback('Code sent!');
        setResendCooldown(RESEND_COOLDOWN_SECONDS);
        clearAllAndFocusFirst();
      }
    } catch {
      // Non-fatal — user can try resending again after cooldown
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.headline}>We sent a code to</Text>
        <Text style={styles.email}>{email}</Text>

        <View style={styles.boxRow}>
          {digits.map((digit, index) => (
            <TextInput
              key={index}
              ref={(ref: TextInput | null) => {
                inputRefs.current[index] = ref;
              }}
              style={styles.box}
              keyboardType="number-pad"
              maxLength={1}
              value={digit}
              editable={!isVerifying}
              onChangeText={(text: string) => handleDigitChange(text, index)}
              onKeyPress={(e: { nativeEvent: { key: string } }) =>
                handleKeyPress(e, index)
              }
            />
          ))}
        </View>

        {isVerifying ? (
          <ActivityIndicator color={DANFO} style={styles.spinner} />
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.resendRow}>
          {resendCooldown > 0 ? (
            <Text style={styles.resendDisabled}>
              Resend code ({resendCooldown}s)
            </Text>
          ) : (
            <Pressable onPress={handleResend}>
              <Text style={styles.resendActive}>Resend code</Text>
            </Pressable>
          )}
        </View>

        {resendFeedback ? (
          <Text style={styles.resendFeedback}>{resendFeedback}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: INK,
    paddingHorizontal: 28,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  headline: {
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
  },
  email: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 32,
  },
  boxRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  box: {
    width: 48,
    height: 56,
    backgroundColor: INK,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  spinner: {
    marginTop: 24,
  },
  error: {
    color: STOP,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 20,
  },
  resendRow: {
    alignItems: 'center',
    marginTop: 28,
  },
  resendActive: {
    fontSize: 14,
    color: DANFO,
    fontWeight: '600',
  },
  resendDisabled: {
    fontSize: 14,
    color: MUTED,
    fontWeight: '600',
  },
  resendFeedback: {
    fontSize: 13,
    color: MUTED,
    textAlign: 'center',
    marginTop: 8,
  },
});
