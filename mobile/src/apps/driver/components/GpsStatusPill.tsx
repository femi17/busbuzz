// Indicator-light style status, the same idiom as a dashboard seatbelt or
// check-engine light: a small colored dot and one word. Steady = nominal,
// pulsing = something's actively being retried. Hidden entirely when there's
// no trip broadcasting — nothing to report, so nothing shown.
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { getGpsStatus, type GpsStatus } from '../gpsService';
import { color, radius, space } from '../theme';

const POLL_INTERVAL_MS = 5000;

export function GpsStatusPill() {
  const [status, setStatus] = useState<GpsStatus>('stopped');
  const pulseOpacity = useRef(new Animated.Value(1)).current;
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function poll() {
      const next = await getGpsStatus();
      if (isMounted) setStatus(next);
    }

    poll();
    const intervalId = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (status === 'syncing') {
      pulseLoopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseOpacity, { toValue: 0.3, duration: 450, useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 1, duration: 450, useNativeDriver: true }),
        ]),
      );
      pulseLoopRef.current.start();
    } else {
      pulseLoopRef.current?.stop();
      pulseOpacity.setValue(1);
    }

    return () => {
      pulseLoopRef.current?.stop();
    };
  }, [status, pulseOpacity]);

  if (status === 'stopped') return null;

  const isLive = status === 'live';

  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: isLive ? color.routeGreenBg : 'rgba(255,201,0,0.16)' },
      ]}
    >
      <Animated.View
        style={[
          styles.dot,
          {
            backgroundColor: isLive ? color.routeGreen : color.danfo,
            opacity: isLive ? 1 : pulseOpacity,
          },
        ]}
      />
      <Text style={[styles.label, { color: isLive ? color.routeGreen : color.danfo }]}>
        {isLive ? 'Live' : 'Syncing'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.sm + 2,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: space.xs + 2,
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
