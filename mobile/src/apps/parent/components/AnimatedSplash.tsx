// The launch moment: a danfo drives forward down the road while the app
// resolves the session behind it. Shown in place of a bare spinner on every
// cold start. The road dashes scroll beneath a fixed bus so the motion reads
// as "moving forward" no matter how long loading takes; a gentle bob keeps it
// alive. Reduced-motion falls back to a still frame.
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { color, space, type } from '../theme';
import { BusIcon } from './Icons';

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
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (!cancelled) setReduceMotion(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) return;

    // Road dashes slide left by exactly one dash step, then snap back — a
    // seamless loop that reads as continuous forward travel.
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
          <BusIcon size={46} color={color.ink900} />
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
      <Text style={styles.tagline}>Every stop, tracked live</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.ink900,
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
    backgroundColor: color.danfo500,
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
    // Start one step to the left so the leftward slide never exposes an edge.
    marginLeft: -DASH_STEP,
  },
  dash: {
    width: DASH_WIDTH,
    height: 4,
    borderRadius: 2,
    marginRight: DASH_GAP,
    backgroundColor: color.danfo500,
    opacity: 0.5,
  },
  wordmark: {
    ...type.displayLg,
    fontSize: 40,
    lineHeight: 44,
    color: color.white,
    marginTop: space.xxl,
  },
  wordmarkAccent: {
    color: color.danfo500,
  },
  tagline: {
    ...type.caption,
    color: color.mist400,
    marginTop: space.xs,
    letterSpacing: 0.4,
  },
});
