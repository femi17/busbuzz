// TODO: Replace placeholder icons in assets/ with final designs:
//   icon-parent.png — navy (#0A1F44) square with amber (#F5A623) bus icon
//   icon-driver.png — navy (#0A1F44) square with amber (#F5A623) steering wheel icon
//   adaptive-icon-parent.png — same bus icon, transparent background, centered for adaptive icon safe zone
//   adaptive-icon-driver.png — same steering wheel icon, transparent background, centered for adaptive icon safe zone

import { ExpoConfig, ConfigContext } from "expo/config";

const IS_DRIVER = process.env.APP_VARIANT === "driver";

const config = {
  name: IS_DRIVER ? "BusBuzz Driver" : "BusBuzz",
  slug: IS_DRIVER ? "busbuzz-driver" : "busbuzz-parent",
  owner: "longbrain",
  scheme: IS_DRIVER ? "busbuzz-driver" : "busbuzz",
  version: "1.0.0",
  orientation: "portrait",
  icon: IS_DRIVER
    ? "./assets/icon-driver.png"
    : "./assets/icon-parent.png",
  userInterfaceStyle: "light",
  ios: {
    supportsTablet: false,
    bundleIdentifier: IS_DRIVER
      ? "com.busbuzz.driver"
      : "com.busbuzz.parent",
    // Only the driver app uses device location (to broadcast the bus's
    // position). Purpose strings are required or iOS crashes/rejects; the
    // parent app declares none because it never reads device location.
    ...(IS_DRIVER
      ? {
          infoPlist: {
            NSLocationWhenInUseUsageDescription:
              "BusBuzz shares this bus's live location with the parents of children on this route while a trip is active.",
            NSLocationAlwaysAndWhenInUseUsageDescription:
              "BusBuzz broadcasts this bus's location in the background during an active school run so parents can track the bus in real time.",
            UIBackgroundModes: ["location"],
          },
        }
      : {}),
  },
  android: {
    package: IS_DRIVER ? "com.busbuzz.driver" : "com.busbuzz.parent",
    adaptiveIcon: {
      backgroundColor: "#0A1F44",
      foregroundImage: IS_DRIVER
        ? "./assets/adaptive-icon-driver.png"
        : "./assets/adaptive-icon-parent.png",
    },
    // Location + background/foreground-service permissions belong to the DRIVER
    // app only. Declaring background location on the parent app (which doesn't
    // use it) is an automatic Google Play rejection.
    // VIBRATE powers the notification channels' buzz patterns (both apps).
    permissions: IS_DRIVER
      ? [
          "ACCESS_FINE_LOCATION",
          "ACCESS_COARSE_LOCATION",
          "ACCESS_BACKGROUND_LOCATION",
          "FOREGROUND_SERVICE",
          "FOREGROUND_SERVICE_LOCATION",
          "VIBRATE",
        ]
      : ["VIBRATE"],
  },
  extra: {
    appVariant: process.env.APP_VARIANT ?? "parent",
    eas: {
      projectId: IS_DRIVER
        ? "8a1aa25c-11d8-45cd-a1bf-cfe8ee54c52e"
        : "fdb02b0b-b99c-4abc-abf3-5ba1bc99fa48",
    },
  },
  // Only the parent app renders a map — @rnmapbox/maps needs a native build
  // either way (no Expo Go support), so the plugin is harmless to include
  // for the driver variant too.
  //
  // expo-splash-screen must be configured via this plugin in SDK 56 — the
  // legacy top-level `splash` key is ignored, which is why Android fell back
  // to its default system splash (the grey circle-in-a-grid).
  //
  // The OS always shows a native splash before JS loads. To avoid a *second*
  // distinct splash, the native layer is just the ink-navy background (a
  // transparent 1x1 image) — the animated bus (JS AnimatedSplash, same navy)
  // is then the only splash the user actually sees, in both apps.
  plugins: [
    "@rnmapbox/maps",
    "expo-notifications",
    [
      "expo-splash-screen",
      {
        backgroundColor: "#0E1B2E",
        image: "./assets/splash-blank.png",
        imageWidth: 1,
        resizeMode: "contain",
      },
    ],
    // Driver-only: declares the location permissions with purpose strings and
    // enables the background + foreground-service location setup Google/Apple
    // require. The parent app never gets these.
    ...(IS_DRIVER
      ? [
          [
            "expo-location",
            {
              locationWhenInUsePermission:
                "BusBuzz shares this bus's live location with parents while a trip is active.",
              locationAlwaysAndWhenInUsePermission:
                "BusBuzz broadcasts this bus's location during an active school run so parents can track it in real time.",
              isAndroidBackgroundLocationEnabled: true,
              isAndroidForegroundServiceEnabled: true,
            },
          ],
        ]
      : []),
  ],
};

export default ({ config: _config }: ConfigContext): ExpoConfig =>
  config as ExpoConfig;
