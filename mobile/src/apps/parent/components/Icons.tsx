// Hand-built icon glyphs from plain Views — no SVG dependency.
// Deliberately geometric and a little blunt, matching hand-painted danfo
// signage rather than a slick generic icon set.
import { View } from 'react-native';

type IconProps = {
  size?: number;
  color?: string;
};

export function BusIcon({ size = 24, color = '#0E1B2E' }: IconProps) {
  // Flat-roofed and low-slung on purpose — buses are long rectangles with
  // wheels peeking out from underneath, not tall domes. The previous build
  // (heavy corner radius, wheels flush with the body's bottom edge, no
  // distinct window) read as a tortoise shell rather than a vehicle.
  const bodyW = size * 0.92;
  const bodyH = size * 0.46;
  const bodyX = (size - bodyW) / 2;
  const bodyTop = size * 0.18;
  const wheelSize = size * 0.22;
  const wheelY = bodyTop + bodyH - wheelSize * 0.5;
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          position: 'absolute',
          left: bodyX,
          top: bodyTop,
          width: bodyW,
          height: bodyH,
          borderRadius: size * 0.08,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: bodyX + bodyW * 0.14,
          top: bodyTop + bodyH * 0.2,
          width: bodyW * 0.72,
          height: bodyH * 0.36,
          borderRadius: size * 0.025,
          backgroundColor: 'rgba(14,27,46,0.55)',
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: bodyX + bodyW * 0.12,
          top: wheelY,
          width: wheelSize,
          height: wheelSize,
          borderRadius: wheelSize / 2,
          backgroundColor: '#15171C',
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: bodyX + bodyW * 0.88 - wheelSize,
          top: wheelY,
          width: wheelSize,
          height: wheelSize,
          borderRadius: wheelSize / 2,
          backgroundColor: '#15171C',
        }}
      />
    </View>
  );
}

export function ClockIcon({ size = 24, color = '#0E1B2E' }: IconProps) {
  const stroke = Math.max(1.5, size * 0.09);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          position: 'absolute',
          width: size - stroke,
          height: size - stroke,
          borderRadius: (size - stroke) / 2,
          borderWidth: stroke,
          borderColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: stroke,
          height: size * 0.32,
          borderRadius: stroke / 2,
          backgroundColor: color,
          top: size * 0.5 - size * 0.32,
          transform: [{ translateY: size * 0.16 }, { rotate: '-25deg' }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: stroke,
          height: size * 0.24,
          borderRadius: stroke / 2,
          backgroundColor: color,
          top: size * 0.5 - size * 0.24,
          transform: [{ translateY: size * 0.12 }, { rotate: '70deg' }],
        }}
      />
    </View>
  );
}

export function PinIcon({ size = 24, color = '#0E1B2E' }: IconProps) {
  const circle = size * 0.62;
  return (
    <View style={{ width: size, height: size, alignItems: 'center' }}>
      <View
        style={{
          width: circle,
          height: circle,
          borderRadius: circle / 2,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: circle * 0.62,
          width: circle * 0.62,
          height: circle * 0.62,
          backgroundColor: color,
          transform: [{ rotate: '45deg' }],
        }}
      />
    </View>
  );
}

export function BellIcon({ size = 24, color = '#0E1B2E' }: IconProps) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center' }}>
      <View
        style={{
          width: size * 0.16,
          height: size * 0.12,
          borderTopLeftRadius: size * 0.08,
          borderTopRightRadius: size * 0.08,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          width: size * 0.72,
          height: size * 0.56,
          borderTopLeftRadius: size * 0.36,
          borderTopRightRadius: size * 0.36,
          borderBottomLeftRadius: size * 0.06,
          borderBottomRightRadius: size * 0.06,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          width: size * 0.86,
          height: size * 0.07,
          borderRadius: size * 0.035,
          backgroundColor: color,
          marginTop: size * 0.02,
        }}
      />
      <View
        style={{
          width: size * 0.16,
          height: size * 0.16,
          borderRadius: size * 0.08,
          backgroundColor: color,
          marginTop: size * 0.05,
        }}
      />
    </View>
  );
}

export function CheckIcon({ size = 24, color = '#0E1B2E' }: IconProps) {
  const stroke = Math.max(2, size * 0.12);
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          position: 'absolute',
          left: size * 0.16,
          top: size * 0.48,
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
          left: size * 0.36,
          top: size * 0.34,
          width: size * 0.52,
          height: stroke,
          borderRadius: stroke / 2,
          backgroundColor: color,
          transform: [{ rotate: '-48deg' }],
        }}
      />
    </View>
  );
}

export function ChevronIcon({ size = 24, color = '#0E1B2E' }: IconProps) {
  // A down-caret built from two bars meeting at the bottom centre. Rotate the
  // wrapping View 180° to point it up.
  const stroke = Math.max(2, size * 0.11);
  const arm = size * 0.34;
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          position: 'absolute',
          left: size * 0.5 - arm * 0.72,
          top: size * 0.42,
          width: arm,
          height: stroke,
          borderRadius: stroke / 2,
          backgroundColor: color,
          transform: [{ rotate: '45deg' }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          right: size * 0.5 - arm * 0.72,
          top: size * 0.42,
          width: arm,
          height: stroke,
          borderRadius: stroke / 2,
          backgroundColor: color,
          transform: [{ rotate: '-45deg' }],
        }}
      />
    </View>
  );
}

export function PhoneIcon({ size = 24, color = '#0E1B2E' }: IconProps) {
  // A classic telephone handset, abstracted as a rotated dumbbell: two solid
  // round pads (earpiece + mouthpiece) joined by a solid bar — reads
  // unmistakably as "call" even at the small sizes used in a button, unlike
  // the previous border-only version which was too faint to identify.
  const knob = size * 0.36;
  const barLength = size * 0.5;
  const barWidth = size * 0.22;
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          position: 'absolute',
          left: size / 2 - barLength / 2,
          top: size / 2 - barWidth / 2,
          width: barLength,
          height: barWidth,
          borderRadius: barWidth / 2,
          backgroundColor: color,
          transform: [{ rotate: '-45deg' }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: size * 0.06,
          top: size * 0.06,
          width: knob,
          height: knob,
          borderRadius: knob / 2,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          right: size * 0.06,
          bottom: size * 0.06,
          width: knob,
          height: knob,
          borderRadius: knob / 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

export function BackpackIcon({ size = 24, color = '#0E1B2E' }: IconProps) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center' }}>
      <View
        style={{
          position: 'absolute',
          top: 0,
          width: size * 0.5,
          height: size * 0.22,
          borderRadius: size * 0.1,
          borderWidth: size * 0.06,
          borderColor: color,
          borderBottomWidth: 0,
        }}
      />
      <View
        style={{
          marginTop: size * 0.14,
          width: size * 0.78,
          height: size * 0.72,
          borderRadius: size * 0.16,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: size * 0.14,
          width: size * 0.22,
          height: size * 0.3,
          borderRadius: size * 0.04,
          backgroundColor: 'rgba(0,0,0,0.25)',
        }}
      />
    </View>
  );
}

export function PersonIcon({ size = 24, color = '#0E1B2E' }: IconProps) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', overflow: 'hidden' }}>
      <View
        style={{
          width: size * 0.4,
          height: size * 0.4,
          borderRadius: size * 0.2,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          marginTop: size * 0.08,
          width: size * 0.82,
          height: size * 0.42,
          borderTopLeftRadius: size * 0.41,
          borderTopRightRadius: size * 0.41,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

// `strikethrough` renders the "not going today" state — a diagonal slash over
// the school silhouette, the same visual language as camera-off/mic-off icons.
export function SchoolIcon({
  size = 24,
  color = '#0E1B2E',
  strikethrough = false,
}: IconProps & { strikethrough?: boolean }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center' }}>
      <View
        style={{
          width: 0,
          height: 0,
          borderLeftWidth: size * 0.4,
          borderRightWidth: size * 0.4,
          borderBottomWidth: size * 0.28,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderBottomColor: color,
        }}
      />
      <View
        style={{
          width: size * 0.72,
          height: size * 0.44,
          backgroundColor: color,
        }}
      />
      {strikethrough ? (
        <View
          style={{
            position: 'absolute',
            left: size * 0.08,
            top: size * 0.46,
            width: size * 0.84,
            height: Math.max(2, size * 0.13),
            borderRadius: size * 0.065,
            backgroundColor: color,
            transform: [{ rotate: '-45deg' }],
          }}
        />
      ) : null}
    </View>
  );
}
