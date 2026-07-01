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
  owner: "femioduola",
  scheme: IS_DRIVER ? "busbuzz-driver" : "busbuzz",
  version: "1.0.0",
  orientation: "portrait",
  icon: IS_DRIVER
    ? "./assets/icon-driver.png"
    : "./assets/icon-parent.png",
  userInterfaceStyle: "light",
  splash: {
    image: IS_DRIVER ? "./assets/icon-driver.png" : "./assets/icon-parent.png",
    resizeMode: "contain",
    backgroundColor: "#0A1F44",
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: IS_DRIVER
      ? "com.busbuzz.driver"
      : "com.busbuzz.parent",
  },
  android: {
    package: IS_DRIVER ? "com.busbuzz.driver" : "com.busbuzz.parent",
    adaptiveIcon: {
      backgroundColor: "#0A1F44",
      foregroundImage: IS_DRIVER
        ? "./assets/adaptive-icon-driver.png"
        : "./assets/adaptive-icon-parent.png",
    },
    permissions: [
      "ACCESS_FINE_LOCATION",
      "ACCESS_BACKGROUND_LOCATION",
      "FOREGROUND_SERVICE",
      "FOREGROUND_SERVICE_LOCATION",
    ],
  },
  extra: {
    appVariant: process.env.APP_VARIANT ?? "parent",
    eas: {
      projectId: IS_DRIVER
        ? "8a8035bf-1853-4821-808d-f7a61ec9fe97"
        : "3b68d5bd-672e-4d7a-8855-b8f5fc50c455",
    },
  },
};

export default ({ config: _config }: ConfigContext): ExpoConfig =>
  config as ExpoConfig;
