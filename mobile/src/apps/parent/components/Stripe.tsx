// The danfo stripe — the yellow-over-black double bar lifted straight from
// Lagos danfo bus livery. Used as a hand-off divider (map → info card) and
// as a quiet section marker, never as pure decoration.
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { color } from '../theme';

export function DanfoStripe({ style }: { style?: ViewStyle }) {
  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.yellow} />
      <View style={styles.black} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
  yellow: {
    height: 5,
    backgroundColor: color.danfo500,
  },
  black: {
    height: 2,
    backgroundColor: color.stripeBlack,
  },
});
