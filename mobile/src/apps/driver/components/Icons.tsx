// Driver-app icon glyphs, hand-built from Views (no SVG dep), matching the
// blunt, high-contrast instrumentation feel the dashboard phone needs.
import { View } from 'react-native';

type IconProps = {
  size?: number;
  color?: string;
};

// Front-on bus — reads clearly at a glance on the circular Start button.
export function BusFrontIcon({ size = 24, color = '#0E1B2E' }: IconProps) {
  const bodyW = size * 0.7;
  const bodyH = size * 0.8;
  const bodyX = (size - bodyW) / 2;
  const wheel = size * 0.14;
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          position: 'absolute',
          left: bodyX,
          top: size * 0.06,
          width: bodyW,
          height: bodyH,
          borderRadius: size * 0.18,
          backgroundColor: color,
        }}
      />
      {/* windscreen */}
      <View
        style={{
          position: 'absolute',
          left: bodyX + bodyW * 0.16,
          top: size * 0.2,
          width: bodyW * 0.68,
          height: bodyH * 0.28,
          borderRadius: size * 0.05,
          backgroundColor: 'rgba(255,255,255,0.9)',
        }}
      />
      {/* headlights */}
      <View
        style={{
          position: 'absolute',
          left: bodyX + bodyW * 0.16,
          top: size * 0.62,
          width: size * 0.1,
          height: size * 0.1,
          borderRadius: size * 0.05,
          backgroundColor: 'rgba(255,255,255,0.85)',
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: bodyX + bodyW * 0.62,
          top: size * 0.62,
          width: size * 0.1,
          height: size * 0.1,
          borderRadius: size * 0.05,
          backgroundColor: 'rgba(255,255,255,0.85)',
        }}
      />
      {/* wheels peeking below */}
      <View
        style={{
          position: 'absolute',
          left: bodyX - wheel * 0.3,
          top: size * 0.06 + bodyH - wheel * 0.5,
          width: wheel,
          height: wheel,
          borderRadius: wheel / 2,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: bodyX + bodyW - wheel * 0.7,
          top: size * 0.06 + bodyH - wheel * 0.5,
          width: wheel,
          height: wheel,
          borderRadius: wheel / 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

export function UsersIcon({ size = 24, color = '#0E1B2E' }: IconProps) {
  const head = size * 0.26;
  const body = size * 0.5;
  return (
    <View style={{ width: size, height: size }}>
      {/* back person */}
      <View
        style={{
          position: 'absolute',
          right: size * 0.06,
          top: size * 0.16,
          width: head * 0.9,
          height: head * 0.9,
          borderRadius: head,
          backgroundColor: color,
          opacity: 0.45,
        }}
      />
      <View
        style={{
          position: 'absolute',
          right: 0,
          top: size * 0.44,
          width: body * 0.8,
          height: body * 0.6,
          borderTopLeftRadius: body,
          borderTopRightRadius: body,
          backgroundColor: color,
          opacity: 0.45,
        }}
      />
      {/* front person */}
      <View
        style={{
          position: 'absolute',
          left: size * 0.08,
          top: size * 0.12,
          width: head,
          height: head,
          borderRadius: head,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 0,
          top: size * 0.44,
          width: body,
          height: body * 0.62,
          borderTopLeftRadius: body,
          borderTopRightRadius: body,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

// A winding route: two stop nodes joined by an L-bend, echoing the tab glyph.
export function RouteIcon({ size = 24, color = '#0E1B2E' }: IconProps) {
  const node = size * 0.26;
  const stroke = Math.max(2, size * 0.1);
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          position: 'absolute',
          left: size * 0.06,
          top: size * 0.06,
          width: node,
          height: node,
          borderRadius: node / 2,
          borderWidth: stroke,
          borderColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: size * 0.06 + node / 2 - stroke / 2,
          top: size * 0.06 + node,
          width: stroke,
          height: size * 0.4,
          borderRadius: stroke / 2,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: size * 0.06 + node / 2 - stroke / 2,
          top: size * 0.6,
          width: size * 0.5,
          height: stroke,
          borderRadius: stroke / 2,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          right: size * 0.06,
          bottom: size * 0.06,
          width: node,
          height: node,
          borderRadius: node / 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

export function PinIcon({ size = 24, color = '#0E1B2E' }: IconProps) {
  const circle = size * 0.6;
  return (
    <View style={{ width: size, height: size, alignItems: 'center' }}>
      <View
        style={{
          width: circle,
          height: circle,
          borderRadius: circle / 2,
          borderWidth: Math.max(2, size * 0.11),
          borderColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: circle * 0.5,
          width: circle * 0.5,
          height: circle * 0.5,
          backgroundColor: color,
          transform: [{ rotate: '45deg' }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: circle * 0.24,
          width: circle * 0.28,
          height: circle * 0.28,
          borderRadius: circle * 0.14,
          backgroundColor: '#fff',
        }}
      />
    </View>
  );
}

export function CheckIcon({ size = 24, color = '#FFFFFF' }: IconProps) {
  const stroke = Math.max(2, size * 0.12);
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          position: 'absolute',
          left: size * 0.14,
          top: size * 0.5,
          width: size * 0.32,
          height: stroke,
          borderRadius: stroke / 2,
          backgroundColor: color,
          transform: [{ rotate: '45deg' }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: size * 0.34,
          top: size * 0.36,
          width: size * 0.54,
          height: stroke,
          borderRadius: stroke / 2,
          backgroundColor: color,
          transform: [{ rotate: '-48deg' }],
        }}
      />
    </View>
  );
}

export function CloseIcon({ size = 24, color = '#0E1B2E' }: IconProps) {
  const stroke = Math.max(2, size * 0.1);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          position: 'absolute',
          width: size * 0.7,
          height: stroke,
          borderRadius: stroke / 2,
          backgroundColor: color,
          transform: [{ rotate: '45deg' }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: size * 0.7,
          height: stroke,
          borderRadius: stroke / 2,
          backgroundColor: color,
          transform: [{ rotate: '-45deg' }],
        }}
      />
    </View>
  );
}

// SOS / hazard — a diamond outline with an exclamation, matching the mockups.
export function AlertDiamondIcon({ size = 24, color = '#FFFFFF' }: IconProps) {
  const inner = size * 0.62;
  const stroke = Math.max(2, size * 0.09);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: inner,
          height: inner,
          borderRadius: size * 0.14,
          borderWidth: stroke,
          borderColor: color,
          transform: [{ rotate: '45deg' }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: stroke,
          height: size * 0.24,
          borderRadius: stroke / 2,
          backgroundColor: color,
          marginTop: -size * 0.04,
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: stroke,
          height: stroke,
          borderRadius: stroke / 2,
          backgroundColor: color,
          marginTop: size * 0.18,
        }}
      />
    </View>
  );
}

// Chevron built from a rotated bordered square — up/down reorder controls on
// the pickup-order screen. Big and blunt, like the rest of the set.
export function ChevronIcon({
  size = 24,
  color = '#0E1B2E',
  direction = 'up',
}: IconProps & { direction?: 'up' | 'down' }) {
  const leg = size * 0.42;
  const stroke = Math.max(2.5, size * 0.12);
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: leg,
          height: leg,
          borderTopWidth: stroke,
          borderLeftWidth: stroke,
          borderColor: color,
          borderTopLeftRadius: stroke * 0.6,
          transform: [
            { translateY: direction === 'up' ? size * 0.08 : -size * 0.08 },
            { rotate: direction === 'up' ? '45deg' : '225deg' },
          ],
        }}
      />
    </View>
  );
}
