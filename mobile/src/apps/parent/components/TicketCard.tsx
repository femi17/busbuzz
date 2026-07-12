// The danfo ticket — a torn paper bus-ticket shape used for trip records and
// the child "boarding pass." The signature element of the parent app: two
// punched notches and a perforation break between the main stub and the
// detail stub, exactly like a real Lagos bus ticket.
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { color, radius, space } from '../theme';

const NOTCH_SIZE = 18;
const DOT_COUNT = 14;

type Props = {
  children: ReactNode;
  stub?: ReactNode;
  notchColor: string;
  cardColor?: string;
};

export function TicketCard({ children, stub, notchColor, cardColor = color.paper50 }: Props) {
  return (
    <View style={[styles.card, { backgroundColor: cardColor }]}>
      <View style={styles.section}>{children}</View>

      {stub ? (
        <>
          <View style={styles.perforationRow}>
            <View
              style={[
                styles.notch,
                { backgroundColor: notchColor, marginLeft: -NOTCH_SIZE / 2 },
              ]}
            />
            <View style={styles.dotsRow}>
              {Array.from({ length: DOT_COUNT }).map((_, i) => (
                <View key={i} style={styles.dot} />
              ))}
            </View>
            <View
              style={[
                styles.notch,
                { backgroundColor: notchColor, marginRight: -NOTCH_SIZE / 2 },
              ]}
            />
          </View>
          <View style={styles.section}>{stub}</View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
  },
  section: {
    paddingHorizontal: space.xl,
    paddingVertical: space.lg,
  },
  perforationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: NOTCH_SIZE,
  },
  notch: {
    width: NOTCH_SIZE,
    height: NOTCH_SIZE,
    borderRadius: NOTCH_SIZE / 2,
  },
  dotsRow: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.paper100,
  },
});
