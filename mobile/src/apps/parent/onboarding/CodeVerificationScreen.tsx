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
import { saveLastParentEmail } from '../lastParentEmail';
import { color, radius, space, type } from '../theme';
import type { OnboardingStackParamList } from './OnboardingNavigator';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'CodeVerification'>;

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 30;

export default function CodeVerificationScreen({ navigation, route }: Props) {
  const { email } = route.params;
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
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

      await saveLastParentEmail(email);

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
    const previous = digits[index];

    // Plain overtype: this box already held a digit and the user typed one
    // more on top of it, so the field now reads "old+new" — keep just the
    // new one. (No maxLength on the box anymore, since that's what was
    // truncating a real paste down to a single character.)
    const isOvertype = filtered.length === 2 && !!previous && filtered[0] === previous;

    if (filtered.length > 1 && !isOvertype) {
      // A paste or SMS autofill delivering the whole code in one change
      // event — spread it across the remaining boxes starting here.
      let cursor = index;
      for (const digit of filtered) {
        if (cursor >= CODE_LENGTH) break;
        next[cursor] = digit;
        cursor += 1;
      }
      setDigits(next);
      inputRefs.current[Math.min(cursor, CODE_LENGTH - 1)]?.focus();
    } else {
      next[index] = isOvertype ? filtered[1] : filtered[filtered.length - 1];
      setDigits(next);
      if (index < CODE_LENGTH - 1) {
        inputRefs.current[index + 1]?.focus();
      }
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
        setResendFeedback('New code sent.');
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
        <Text style={styles.eyebrow}>Step 2 of 2</Text>
        <Text style={styles.headline}>Enter the 6-digit code</Text>
        <Text style={styles.email}>sent to {email}</Text>

        <View style={styles.boxRow}>
          {digits.map((digit, index) => (
            <TextInput
              key={index}
              ref={(ref: TextInput | null) => {
                inputRefs.current[index] = ref;
              }}
              style={[
                styles.box,
                (focusedIndex === index || (!!digit && focusedIndex === null)) &&
                  styles.boxFocused,
              ]}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              value={digit}
              editable={!isVerifying}
              onFocus={() => setFocusedIndex(index)}
              onBlur={() => setFocusedIndex(null)}
              onChangeText={(text: string) => handleDigitChange(text, index)}
              onKeyPress={(e: { nativeEvent: { key: string } }) =>
                handleKeyPress(e, index)
              }
            />
          ))}
        </View>

        {isVerifying ? (
          <ActivityIndicator color={color.danfo500} style={styles.spinner} />
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.resendRow}>
          {resendCooldown > 0 ? (
            <Text style={styles.resendDisabled}>
              Resend code in {resendCooldown}s
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
    backgroundColor: color.ink900,
    paddingHorizontal: space.xxl,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  eyebrow: {
    ...type.eyebrow,
    color: color.danfo500,
    textAlign: 'center',
    marginBottom: space.sm,
  },
  headline: {
    ...type.displayMd,
    fontSize: 22,
    color: color.white,
    textAlign: 'center',
  },
  email: {
    ...type.bodyMd,
    color: color.mist400,
    textAlign: 'center',
    marginTop: space.xs,
    marginBottom: space.xxxl,
  },
  boxRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: space.sm + 2,
  },
  box: {
    width: 48,
    height: 58,
    backgroundColor: color.ink700,
    borderWidth: 1.5,
    borderColor: color.border,
    borderRadius: radius.md,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '700',
    color: color.white,
  },
  boxFocused: {
    borderColor: color.danfo500,
  },
  spinner: {
    marginTop: space.xxl,
  },
  error: {
    color: color.stopRed,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: space.xl,
  },
  resendRow: {
    alignItems: 'center',
    marginTop: space.xxl + space.xs,
  },
  resendActive: {
    fontSize: 14,
    color: color.danfo500,
    fontWeight: '700',
  },
  resendDisabled: {
    fontSize: 14,
    color: color.mist400,
    fontWeight: '600',
  },
  resendFeedback: {
    fontSize: 13,
    color: color.mist400,
    textAlign: 'center',
    marginTop: space.sm,
  },
});
