/**
 * Scoped tests for EAS build configuration (app.config.ts / eas.json / index.ts variant selection).
 * No Jest/RNTL infra installed in mobile/ (confirmed in prior pipeline runs). Run directly with:
 *   node mobile/__tests__/eas-build-config.test.js
 *
 * These tests:
 *   1. Validate eas.json is valid JSON and matches the expected EAS schema shape.
 *   2. Re-implement the variant-selection branching logic from app.config.ts / index.ts
 *      as pure functions and assert against it (the actual files are TS using import.meta /
 *      expo/config types that can't be required directly under plain Node).
 *   3. Cross-check eas.json's per-profile APP_VARIANT env values against what app.config.ts
 *      would resolve for that profile (parent vs driver), using real `npx expo config` output
 *      captured separately by the Tester (see test-results.md) for the live verification.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`PASS: ${name}`);
    passed++;
  } catch (e) {
    console.log(`FAIL: ${name}`);
    console.log(`  ${e.message}`);
    failed++;
  }
}

// --- 1. eas.json shape validation ---

const easJsonPath = path.join(__dirname, '..', 'eas.json');
const easJsonRaw = fs.readFileSync(easJsonPath, 'utf8');
let eas;

test('eas.json is valid JSON', () => {
  eas = JSON.parse(easJsonRaw);
});

test('eas.json has cli.version and cli.appVersionSource', () => {
  assert.ok(eas.cli, 'missing cli block');
  assert.ok(typeof eas.cli.version === 'string', 'cli.version missing');
  assert.strictEqual(eas.cli.appVersionSource, 'remote');
});

test('eas.json has all four required build profiles', () => {
  const required = ['preview', 'driver', 'production', 'production:driver'];
  for (const profile of required) {
    assert.ok(eas.build[profile], `missing profile: ${profile}`);
  }
});

test('preview profile: internal APK distribution for parent variant', () => {
  const p = eas.build.preview;
  assert.strictEqual(p.distribution, 'internal');
  assert.strictEqual(p.android.buildType, 'apk');
  assert.strictEqual(p.env.APP_VARIANT, 'parent');
});

test('driver profile: internal APK distribution for driver variant', () => {
  const p = eas.build.driver;
  assert.strictEqual(p.distribution, 'internal');
  assert.strictEqual(p.android.buildType, 'apk');
  assert.strictEqual(p.env.APP_VARIANT, 'driver');
});

test('production profile: app-bundle for parent variant', () => {
  const p = eas.build.production;
  assert.strictEqual(p.android.buildType, 'app-bundle');
  assert.strictEqual(p.env.APP_VARIANT, 'parent');
});

test('production:driver profile: app-bundle for driver variant', () => {
  const p = eas.build['production:driver'];
  assert.strictEqual(p.android.buildType, 'app-bundle');
  assert.strictEqual(p.env.APP_VARIANT, 'driver');
});

test('android.buildType is nested under build.<profile>.android, not top-level', () => {
  // Per EAS schema: https://docs.expo.dev/eas/json/ — buildType lives under
  // build.<profile>.platform-specific config (android/ios), not at the profile root.
  for (const [name, profile] of Object.entries(eas.build)) {
    assert.ok(!('buildType' in profile), `${name}: buildType should not be at profile root`);
    assert.ok(profile.android && 'buildType' in profile.android, `${name}: android.buildType missing`);
  }
});

// --- 2. Variant-selection logic (mirrors app.config.ts / index.ts) ---

function resolveAppVariant(envValue) {
  // Mirrors: Constants.expoConfig?.extra?.appVariant ?? "parent"
  return envValue ?? 'parent';
}

function resolveConfigForVariant(appVariantEnv) {
  // Mirrors app.config.ts: const IS_DRIVER = process.env.APP_VARIANT === "driver"
  const IS_DRIVER = appVariantEnv === 'driver';
  return {
    name: IS_DRIVER ? 'BusBuzz Driver' : 'BusBuzz',
    slug: IS_DRIVER ? 'busbuzz-driver' : 'busbuzz-parent',
    icon: IS_DRIVER ? './assets/icon-driver.png' : './assets/icon-parent.png',
    androidPackage: IS_DRIVER ? 'com.busbuzz.driver' : 'com.busbuzz.parent',
    iosBundleId: IS_DRIVER ? 'com.busbuzz.driver' : 'com.busbuzz.parent',
    extraAppVariant: appVariantEnv ?? 'parent',
  };
}

function resolveEntryComponent(appVariant) {
  // Mirrors index.ts branching
  return appVariant === 'driver' ? 'DriverApp' : 'ParentApp';
}

test('app.config.ts logic: undefined APP_VARIANT resolves to parent config', () => {
  const c = resolveConfigForVariant(undefined);
  assert.strictEqual(c.name, 'BusBuzz');
  assert.strictEqual(c.slug, 'busbuzz-parent');
  assert.strictEqual(c.androidPackage, 'com.busbuzz.parent');
  assert.strictEqual(c.extraAppVariant, 'parent');
});

test('app.config.ts logic: APP_VARIANT=driver resolves to driver config', () => {
  const c = resolveConfigForVariant('driver');
  assert.strictEqual(c.name, 'BusBuzz Driver');
  assert.strictEqual(c.slug, 'busbuzz-driver');
  assert.strictEqual(c.androidPackage, 'com.busbuzz.driver');
  assert.strictEqual(c.extraAppVariant, 'driver');
});

test('app.config.ts logic: any other APP_VARIANT value falls back to parent (only "driver" is special-cased)', () => {
  const c = resolveConfigForVariant('typo-drvier');
  assert.strictEqual(c.name, 'BusBuzz', 'unexpected variant string should not silently produce driver config');
  assert.strictEqual(c.androidPackage, 'com.busbuzz.parent');
});

test('android.package and ios.bundleIdentifier are valid reverse-DNS and distinct between variants', () => {
  const pkgRegex = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/i;
  const parent = resolveConfigForVariant(undefined);
  const driver = resolveConfigForVariant('driver');
  assert.ok(pkgRegex.test(parent.androidPackage), 'parent package not valid reverse-DNS');
  assert.ok(pkgRegex.test(driver.androidPackage), 'driver package not valid reverse-DNS');
  assert.notStrictEqual(parent.androidPackage, driver.androidPackage, 'packages must differ between variants');
});

test('index.ts logic: resolveEntryComponent selects ParentApp by default', () => {
  assert.strictEqual(resolveEntryComponent(resolveAppVariant(undefined)), 'ParentApp');
});

test('index.ts logic: resolveEntryComponent selects DriverApp when extra.appVariant is "driver"', () => {
  assert.strictEqual(resolveEntryComponent(resolveAppVariant('driver')), 'DriverApp');
});

// --- 3. eas.json env.APP_VARIANT values match the variant intended by profile name ---

test('every eas.json profile env.APP_VARIANT produces the correct app.config.ts variant', () => {
  const expectations = {
    preview: 'parent',
    driver: 'driver',
    production: 'parent',
    'production:driver': 'driver',
  };
  for (const [profileName, expectedVariant] of Object.entries(expectations)) {
    const envVal = eas.build[profileName].env.APP_VARIANT;
    assert.strictEqual(envVal, expectedVariant, `${profileName} env.APP_VARIANT mismatch`);
    const resolved = resolveConfigForVariant(envVal);
    assert.strictEqual(resolved.extraAppVariant, expectedVariant);
  }
});

// --- 4. Android permissions present for both variants ---

test('android.permissions includes required location + foreground service permissions', () => {
  // Re-reads app.config.ts source as text since it cannot be `require()`d under plain Node
  // (uses `expo/config` ESM types not resolvable here). This is a static source check.
  const configSrc = fs.readFileSync(path.join(__dirname, '..', 'app.config.ts'), 'utf8');
  const required = [
    'ACCESS_FINE_LOCATION',
    'ACCESS_BACKGROUND_LOCATION',
    'FOREGROUND_SERVICE',
  ];
  for (const perm of required) {
    assert.ok(configSrc.includes(perm), `app.config.ts missing permission: ${perm}`);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
