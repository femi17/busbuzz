import { Platform } from 'react-native';

// Kiosk is Android-only (Device Owner + Lock Task). The parent app can run on
// iOS, which has no programmable kiosk — so the native module is only linked on
// Android (see expo-module.config.json `platforms`). Everything here degrades to
// a safe no-op anywhere the native module isn't present, so importing it from
// shared code never crashes.

export type KioskLock = 'hard' | 'pinned' | 'none';

type KioskNative = {
  isDeviceOwner(): boolean;
  enterKiosk(): KioskLock;
  exitKiosk(): boolean;
  setKeepAwake(enabled: boolean): boolean;
};

let native: KioskNative | null = null;
if (Platform.OS === 'android') {
  try {
    // Lazy require so non-Android bundles never reach into the native registry.
    const { requireNativeModule } = require('expo-modules-core');
    native = requireNativeModule('Kiosk') as KioskNative;
  } catch {
    // Module not in this build (e.g. Expo Go, or an older APK) — stay no-op.
    native = null;
  }
}

/** True only on a phone where this app has been set as Android Device Owner. */
export function isDeviceOwner(): boolean {
  try {
    return native?.isDeviceOwner() ?? false;
  } catch {
    return false;
  }
}

/**
 * Lock the app to the foreground.
 * - 'hard'   — Device Owner lock-task: unescapable, status/nav bars suppressed.
 * - 'pinned' — plain screen-pinning fallback (escapable); when not Device Owner.
 * - 'none'   — no activity available / not supported.
 */
export function enterKiosk(): KioskLock {
  try {
    return native?.enterKiosk() ?? 'none';
  } catch {
    return 'none';
  }
}

/** Release the lock (maintenance). Device Owner status is unaffected. */
export function exitKiosk(): boolean {
  try {
    return native?.exitKiosk() ?? false;
  } catch {
    return false;
  }
}

/** Keep the screen on while mounted on the dashboard (bus phone is charging). */
export function setKeepAwake(enabled: boolean): boolean {
  try {
    return native?.setKeepAwake(enabled) ?? false;
  } catch {
    return false;
  }
}
