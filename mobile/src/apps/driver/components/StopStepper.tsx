// A gauge segment, not a progress bar or numbered dots — the same idiom as a
// fuel or signal-strength gauge on a dashboard: a single glance tells you how
// much trip is left, not a sequence to read. The current segment pulses so
// it's findable without reading labels while driving.
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { color, radius, space } from '../theme';

type Props = {
  total: number;
  currentIndex: number;
};

export function StopStepper({ total, currentIndex }: Props) {
  const pulseOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseOpacity, { toValue: 0.45, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseOpacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulseOpacity]);

  return (
    <View style={styles.row}>
      {Array.from({ length: total }).map((_, i) => {
        if (i < currentIndex) {
          return <View key={i} style={[styles.segment, styles.segmentDone]} />;
        }
        if (i === currentIndex) {
          return (
            <Animated.View
              key={i}
              style={[styles.segment, styles.segmentCurrent, { opacity: pulseOpacity }]}
            />
          );
        }
        return <View key={i} style={[styles.segment, styles.segmentUpcoming]} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: space.xs,
  },
  segment: {
    flex: 1,
    height: 8,
    borderRadius: radius.sm / 2,
  },
  segmentDone: {
    backgroundColor: color.danfo,
  },
  segmentCurrent: {
    backgroundColor: color.danfo,
  },
  segmentUpcoming: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: color.inkLine,
  },
});
