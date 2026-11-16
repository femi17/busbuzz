# BusBuzz Driver — Kiosk Mode (Android Device Owner + Lock Task)

The driver phone IS the tracker, so it must run only the BusBuzz Driver app and
never be navigable away from. This is done with **Android Device Owner + Lock
Task** — a true kiosk (no nav bar, no notification shade, no recents, no escape),
not the escapable "screen pinning" a normal app can trigger.

No Play Store is involved — we own and provision the phones.

## How it's wired

- **Local Expo module `mobile/modules/kiosk/`** provides the native bridge:
  - `BusBuzzDeviceAdminReceiver` — the Device Admin component we provision against.
  - `KioskModule` (Kotlin) — `isDeviceOwner()`, `enterKiosk()`, `exitKiosk()`,
    `setKeepAwake()`.
  - Its `AndroidManifest.xml` + `res/xml/device_admin.xml` merge into the app
    at build time. Inert until a phone is provisioned as Device Owner.
- **`DriverApp.tsx`** auto-locks on launch **only if `isDeviceOwner()` is true**,
  and re-locks whenever the app returns to the foreground. Dev phones and the
  parent app no-op, so you can never trap a developer's device.
- **Exit for maintenance**: long-press the "BusBuzz" wordmark on the Today
  screen (800ms) → confirm → unlocks. Relaunching the app re-locks it. Device
  Owner status is unaffected.

## 1. Build the driver APK

A cloud EAS build needs the `APP_VARIANT=driver` profile (added to `eas.json`):

```bash
cd mobile
eas build -p android --profile driver        # installable internal APK
# or, for a store-track/versioned build:
eas build -p android --profile production:driver
```

Push notifications also require FCM credentials on this (faceflyer) project —
see CLAUDE.md "Android FCM setup". Kiosk itself does not need FCM.

## 2. Provision each phone as Device Owner (one-time, ~5 min)

Device Owner can **only** be set on a phone with **no accounts added** (no Google
sign-in). On a factory-fresh phone, skip all account setup in the wizard.

```bash
# a. Enable Developer Options: Settings → About → tap Build Number 7×
# b. Enable USB debugging, connect the phone over USB
# c. Install the driver APK
adb install busbuzz-driver.apk

# d. Promote the app to Device Owner (THE key step)
adb shell dpm set-device-owner com.busbuzz.driver/expo.modules.kiosk.BusBuzzDeviceAdminReceiver
```

Expected: `Success: Device owner set to package com.busbuzz.driver`.

Common failure: `not allowed to set the device owner because there are already
some accounts on the device` → factory reset, and this time add no accounts.

After this, launching the app locks it into kiosk automatically.

### Alternative: QR provisioning (no laptop/adb per phone)

On the factory-reset welcome screen, tap the screen 6× to open QR enrolment, then
scan a provisioning QR encoding the Device Admin component
(`com.busbuzz.driver/expo.modules.kiosk.BusBuzzDeviceAdminReceiver`) and the APK
download URL. Useful at scale; adb is simpler for a handful of phones.

## 3. Verify

- Relaunch the app → status bar and nav bar should be gone; Back/Home/Recents do
  nothing.
- Long-press the "BusBuzz" wordmark → the unlock prompt appears (confirms the
  Device-Owner path is live).

## 4. Un-provision (decommission a phone)

Lock Task + Device Owner can't be removed by adb once set; clear it from within
an app build, or factory reset the phone. For a managed decommission flow we can
add a `clearDeviceOwner()` function (calls `dpm.clearDeviceOwnerApp`) behind the
maintenance screen — not built yet.

## Status / caveats

- The native module and manifest are committed but **have not been compiled in an
  EAS build yet** — the first `eas build --profile driver` is the real
  validation of the Kotlin + the local-module `build.gradle`.
- If the module fails to compile, regenerate a known-good skeleton with
  `npx create-expo-module@latest --local kiosk` and drop the committed
  `KioskModule.kt` / `BusBuzzDeviceAdminReceiver.kt` / manifest / `res` into it.
- Not yet built (fast follow-ups): set the app as the HOME launcher + auto-start
  on boot (so a reboot lands straight in the app), a PIN gate on the maintenance
  exit, and `clearDeviceOwner()`.
