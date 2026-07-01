import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DANFO, INK } from './constants';
import type { OnboardingStackParamList } from './OnboardingNavigator';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'Welcome'>;

export default function WelcomeScreen({ navigation }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.logo}>
          Bus<Text style={styles.logoAccent}>Buzz</Text>
        </Text>
        <Text style={styles.tagline}>
          Know exactly where your child is. Every stop. Every day.
        </Text>
      </View>

      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        onPress={() => navigation.navigate('EmailEntry')}
      >
        <Text style={styles.buttonText}>Get Started</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: INK,
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingVertical: 64,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    fontSize: 40,
    fontWeight: '700',
    textAlign: 'center',
    color: '#fff',
    letterSpacing: -0.5,
  },
  logoAccent: {
    color: DANFO,
  },
  tagline: {
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 22,
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
  buttonText: {
    color: INK,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
