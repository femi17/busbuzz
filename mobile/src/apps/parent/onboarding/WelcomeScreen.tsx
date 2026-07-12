import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { BusIcon } from '../components/Icons';
import { DanfoStripe } from '../components/Stripe';
import { color, radius, space, type } from '../theme';
import type { OnboardingStackParamList } from './OnboardingNavigator';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'Welcome'>;

// The route as a line of stops, home to school — the same object the Track
// screen's timeline draws. It says plainly what the app does: it watches the
// bus at every stop along the way, not just the two endpoints.
function RouteRibbon() {
  return (
    <View style={styles.routeWrap}>
      <View style={styles.routeTrack}>
        <View style={[styles.node, styles.nodeEnd]} />
        <View style={styles.seg} />
        <View style={styles.node} />
        <View style={styles.seg} />
        <View style={styles.node} />
        <View style={styles.seg} />
        <View style={styles.node} />
        <View style={styles.seg} />
        <View style={[styles.node, styles.nodeEnd]} />
      </View>
      <View style={styles.routeLabels}>
        <Text style={styles.routeLabel}>Home</Text>
        <Text style={styles.routeLabel}>School</Text>
      </View>
      <Text style={styles.routeCaption}>Tracked at every stop, both ways</Text>
    </View>
  );
}

// The bus drives in along the road stripe and comes to rest just above the
// button that starts tracking — a small page-load moment, not a loop.
function BusOnTheRoad() {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 700,
      delay: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [progress]);

  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [-56, 0] });

  return (
    <View style={styles.roadWrap}>
      <DanfoStripe />
      <Animated.View style={[styles.busOnRoad, { opacity: progress, transform: [{ translateX }] }]}>
        <BusIcon size={40} color={color.danfo500} />
      </Animated.View>
    </View>
  );
}

export default function WelcomeScreen({ navigation }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>Daily school runs, tracked live</Text>
        <Text style={styles.logo}>
          Bus<Text style={styles.logoAccent}>Buzz</Text>
        </Text>
        <Text style={styles.tagline}>
          Know exactly where your child is — every stop, every day.
        </Text>

        <RouteRibbon />
      </View>

      <View style={styles.footer}>
        <BusOnTheRoad />
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          onPress={() => navigation.navigate('EmailEntry')}
        >
          <Text style={styles.buttonText}>Find my child's bus</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.ink900,
    justifyContent: 'space-between',
    paddingHorizontal: space.xxl,
    paddingTop: 80,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    ...type.eyebrow,
    color: color.danfo500,
    marginBottom: space.md,
  },
  logo: {
    ...type.displayHero,
    fontSize: 44,
    lineHeight: 46,
    textAlign: 'center',
    color: color.white,
  },
  logoAccent: {
    color: color.danfo500,
  },
  tagline: {
    ...type.bodyLg,
    color: color.mist400,
    textAlign: 'center',
    marginTop: space.lg,
    maxWidth: 280,
  },
  routeWrap: {
    alignSelf: 'stretch',
    marginTop: space.huge + space.lg,
    paddingHorizontal: space.sm,
  },
  routeTrack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  seg: {
    flex: 1,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: color.danfo500,
  },
  node: {
    width: 11,
    height: 11,
    borderRadius: 5.5,
    backgroundColor: color.danfo500,
  },
  nodeEnd: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 3,
    borderColor: color.danfo500,
    backgroundColor: color.ink900,
  },
  routeLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: space.sm + 2,
  },
  routeLabel: {
    ...type.eyebrow,
    fontSize: 12,
    color: color.white,
  },
  routeCaption: {
    ...type.caption,
    color: color.mist400,
    textAlign: 'center',
    marginTop: space.md,
  },
  roadWrap: {
    marginBottom: space.xxl,
    justifyContent: 'center',
  },
  busOnRoad: {
    position: 'absolute',
    left: '50%',
    marginLeft: -20,
    bottom: 0,
  },
  footer: {
    marginHorizontal: -space.xxl,
  },
  button: {
    backgroundColor: color.danfo500,
    borderRadius: radius.md,
    marginHorizontal: space.xxl,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xxxl + space.xxl,
  },
  buttonPressed: {
    backgroundColor: color.danfo600,
  },
  buttonText: {
    color: color.ink900,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
