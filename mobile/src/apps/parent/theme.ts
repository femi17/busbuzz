// BusBuzz Parent App — design tokens
// Grounded in the Lagos danfo bus livery (yellow-over-black stripe) and the
// paper bus ticket as the app's two recurring material references.
import type { TextStyle } from 'react-native';

export const color = {
  // Night route — primary dark surfaces
  ink900: '#0E1B2E',
  ink700: '#16233A',
  ink600: '#1D2C46',
  border: '#2B3650',

  // Danfo yellow — primary accent
  danfo500: '#FFC900',
  danfo600: '#E0AD00',

  // The stripe motif is a true near-black, deliberately distinct from ink900
  // so it reads as a graphic element (livery) rather than background.
  stripeBlack: '#15171C',

  // Status
  routeGreen: '#1C9D5B',
  routeGreenBg: 'rgba(28,157,91,0.14)',
  stopRed: '#FF6B5E',
  stopRedBg: 'rgba(255,107,94,0.14)',

  // Muted text on dark surfaces
  mist400: '#93A0B4',

  // Paper — light surfaces (tickets, cards, list screens)
  paper50: '#F7F5F0',
  paper100: '#EFEBE2',
  ledger700: '#2A2F3A',
  ledger400: '#767B87',

  white: '#FFFFFF',
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

// Type scale — system font only (no bundled typefaces), personality carried
// by weight, tracking, and scale rather than a custom display face.
export const type = {
  displayHero: {
    fontSize: 56,
    lineHeight: 58,
    fontWeight: '800' as const,
    letterSpacing: -1.5,
  },
  displayLg: {
    fontSize: 32,
    lineHeight: 36,
    fontWeight: '800' as const,
    letterSpacing: -0.5,
  },
  displayMd: {
    fontSize: 23,
    lineHeight: 28,
    fontWeight: '700' as const,
    letterSpacing: -0.3,
  },
  eyebrow: {
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '700' as const,
    letterSpacing: 1.6,
    textTransform: 'uppercase' as const,
  },
  bodyLg: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '500' as const,
  },
  bodyMd: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500' as const,
  },
  data: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700' as const,
    letterSpacing: 0.2,
    fontVariant: ['tabular-nums'] as NonNullable<TextStyle['fontVariant']>,
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600' as const,
  },
} as const;
