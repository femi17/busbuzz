// The launch moment for the driver app — the same danfo-drives-forward splash
// the parent app uses, in the driver palette. Shown in place of a bare spinner
// while the session resolves. Road dashes scroll under a fixed bus so it reads
// as forward motion regardless of load time; reduced-motion shows a still frame.
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { color, space } from '../theme';
import { BusFrontIcon } from './Icons';

const DASH_WIDTH = 22;
const DASH_GAP = 18;
const DASH_STEP = DASH_WIDTH + DASH_GAP;
const DASH_COUNT = 24;

export function AnimatedSplash() {
  const scroll = useRef(new Animated.Value(0)).current;
  const bob = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (!cancelled) setReduceMotion(on);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) return;

    const road = Animated.loop(
      Animated.timing(scroll, {
        toValue: 1,
        duration: 520,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    const bounce = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, {
          toValue: 1,
          duration: 420,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(bob, {
          toValue: 0,
          duration: 420,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    road.start();
    bounce.start();
    return () => {
      road.stop();
      bounce.stop();
    };
  }, [reduceMotion, scroll, bob]);

  const translateX = scroll.interpolate({ inputRange: [0, 1], outputRange: [0, -DASH_STEP] });
  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -5] });

  return (
    <View style={styles.container}>
      <View style={styles.stage}>
        <Animated.View style={[styles.badge, { transform: [{ translateY }] }]}>
          <BusFrontIcon size={40} color={color.ink} />
        </Animated.View>
        <View style={styles.road}>
          <Animated.View style={[styles.dashes, { transform: [{ translateX }] }]}>
            {Array.from({ length: DASH_COUNT }).map((_, i) => (
              <View key={i} style={styles.dash} />
            ))}
          </Animated.View>
        </View>
      </View>

      <Text style={styles.wordmark}>
        Bus<Text style={styles.wordmarkAccent}>Buzz</Text>
      </Text>
      <Text style={styles.tagline}>Driver</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stage: {
    width: 200,
    height: 96,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  badge: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: color.danfo,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.md,
  },
  road: {
    height: 4,
    alignSelf: 'stretch',
    overflow: 'hidden',
  },
  dashes: {
    flexDirection: 'row',
    marginLeft: -DASH_STEP,
  },
  dash: {
    width: DASH_WIDTH,
    height: 4,
    borderRadius: 2,
    marginRight: DASH_GAP,
    backgroundColor: color.danfo,
    opacity: 0.5,
  },
  wordmark: {
    fontSize: 40,
    lineHeight: 44,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: color.white,
    marginTop: space.xxl,
  },
  wordmarkAccent: {
    color: color.danfo,
  },
  tagline: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: color.mist,
    marginTop: space.xs,
  },
});
