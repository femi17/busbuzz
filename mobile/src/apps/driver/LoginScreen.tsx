import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

import { supabase } from '../../lib/supabase';
import type { DriverStackParamList } from './DriverApp';
import { color } from './theme';

const ACCESS_TOKEN_KEY = '@busbuzz_access_token';

type Props = NativeStackScreenProps<DriverStackParamList, 'Login'>;

function formatPhone(rawPhone: string): string {
  const stripped = rawPhone.replace(/^0+/, '');
  return `+234${stripped}`;
}

export default function LoginScreen({ navigation }: Props) {
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogin() {
    setError(null);

    const strippedPhone = phone.replace(/^0+/, '');
    if (strippedPhone.length < 10) {
      setError('Please enter a valid phone number');
      return;
    }

    if (pin.length !== 4) {
      setError('PIN must be exactly 4 digits');
      return;
    }

    const formattedPhone = formatPhone(phone);

    setIsLoading(true);

    try {
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const response = await fetch(
        `${supabaseUrl}/functions/v1/driver-login`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: formattedPhone, pin }),
        },
      );

      if (response.status === 401) {
        setError('Invalid phone number or PIN');
        setIsLoading(false);
        return;
      }

      if (response.status === 429) {
        setError('Too many login attempts. Try again in 15 minutes.');
        setIsLoading(false);
        return;
      }

      if (!response.ok) {
        setError('Something went wrong. Please try again.');
        setIsLoading(false);
        return;
      }

      const json = await response.json();
      const { accessToken, refreshToken } = json.data;

      await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      await AsyncStorage.setItem(ACCESS_TOKEN_KEY, accessToken);

      navigation.reset({ index: 0, routes: [{ name: 'Today' }] });
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.hazardStripe} />

      <Text style={styles.logo}>
        Bus<Text style={styles.logoAccent}>Buzz</Text>
      </Text>
      <Text style={styles.logoSub}>DRIVER</Text>

      <View style={styles.field}>
        <Text style={styles.label}>PHONE NUMBER</Text>
        <View style={styles.phoneRow}>
          <Text style={styles.phonePrefix}>+234</Text>
          <TextInput
            style={styles.phoneInput}
            keyboardType="phone-pad"
            maxLength={11}
            placeholder="080 1234 5678"
            placeholderTextColor="#6B7280"
            value={phone}
            onChangeText={setPhone}
          />
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>PIN</Text>
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          maxLength={4}
          secureTextEntry
          placeholder="----"
          placeholderTextColor="#6B7280"
          value={pin}
          onChangeText={setPin}
        />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={({ pressed }) => [
          styles.button,
          pressed && styles.buttonPressed,
          isLoading && styles.buttonDisabled,
        ]}
        onPress={handleLogin}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color={color.ink} />
        ) : (
          <Text style={styles.buttonText}>LOG IN</Text>
        )}
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.asphalt,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  hazardStripe: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 10,
    backgroundColor: color.danfo,
  },
  logo: {
    fontSize: 36,
    fontWeight: '700',
    textAlign: 'center',
    color: '#fff',
    letterSpacing: -0.5,
  },
  logoAccent: {
    color: color.danfo,
  },
  logoSub: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 4,
    textAlign: 'center',
    color: '#9CA3AF',
    marginBottom: 48,
    marginTop: 4,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    color: '#9CA3AF',
    marginBottom: 8,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.ink,
    borderWidth: 1,
    borderColor: color.inkLine,
    borderRadius: 10,
    paddingHorizontal: 14,
  },
  phonePrefix: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginRight: 8,
  },
  phoneInput: {
    flex: 1,
    fontSize: 18,
    color: '#fff',
    paddingVertical: 16,
  },
  input: {
    backgroundColor: color.ink,
    borderWidth: 1,
    borderColor: color.inkLine,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 16,
    fontSize: 18,
    color: '#fff',
    letterSpacing: 4,
  },
  error: {
    color: color.stopRed,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  button: {
    backgroundColor: color.danfo,
    borderRadius: 10,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    backgroundColor: color.danfoDim,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: color.ink,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
