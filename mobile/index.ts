import { registerRootComponent } from "expo";
import Constants from "expo-constants";
import type { ComponentType } from "react";

const appVariant = Constants.expoConfig?.extra?.appVariant ?? "parent";

let App: ComponentType;

if (appVariant === "driver") {
  App = require("./src/apps/driver/DriverApp").default;
} else {
  App = require("./src/apps/parent/ParentApp").default;
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
