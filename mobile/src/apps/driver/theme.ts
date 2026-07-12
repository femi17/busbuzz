// BusBuzz Driver App — design tokens
// This phone is bolted to a dashboard, not held in a hand — the palette reads
// as vehicle instrumentation (hazard-stripe yellow, indicator-light colors)
// rather than the parent app's paper-ticket material.
import type { TextStyle } from 'react-native';

export const color = {
  asphalt: '#23262B',
  ink: '#0E1B2E',
  inkLine: '#33394A',

  danfo: '#FFC900',
  danfoDim: '#E0AD00',
  // Pale amber halo behind the primary circular action.
  danfoSoft: '#FBE5B0',

  // Status semantics shared with the parent app for cross-app consistency
  routeGreen: '#1C9D5B',
  routeGreenBg: 'rgba(28,157,91,0.16)',
  stopRed: '#E13E2D',
  stopRedBg: 'rgba(225,62,45,0.16)',

  mist: '#9CA3AF',
  white: '#FFFFFF',

  // Light-surface tokens — the redesigned driver screens read as a bright
  // dashboard (better in sunlight glare than the old dark panels), with the
  // navy reserved for the top bar and headings.
  canvas: '#F4F4F6',
  surface: '#FFFFFF',
  hairline: '#E7E7EC',
  sub: '#6B7280',
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 10,
  lg: 14,
  pill: 999,
} as const;

export const type = {
  eyebrow: {
    fontSize: 13,
    fontWeight: '700' as const,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
  },
  gaugeNumber: {
    fontSize: 22,
    fontWeight: '800' as const,
    letterSpacing: 0.3,
    fontVariant: ['tabular-nums'] as NonNullable<TextStyle['fontVariant']>,
  },
} as const;
