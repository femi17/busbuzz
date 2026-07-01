/**
 * AdminReceiver placeholder for Android Device Owner (kiosk mode).
 *
 * Android kiosk mode requires a DeviceAdminReceiver declared in
 * AndroidManifest.xml. In a standard Expo managed workflow, this
 * cannot be configured without a custom native module or config plugin.
 *
 * To enable kiosk mode on BusBuzz driver phones:
 *
 * 1. Eject to bare workflow OR create an Expo config plugin that:
 *    - Adds a DeviceAdminReceiver class to android/app/src/main/java/
 *    - Registers it in AndroidManifest.xml with the
 *      android.app.device_admin intent filter
 *    - Declares device_admin_receiver.xml in res/xml/
 *
 * 2. After installing the APK on the bus phone, run:
 *    adb shell dpm set-device-owner com.busbuzz.driver/.AdminReceiver
 *
 * 3. To lock the app in kiosk mode programmatically, use the
 *    Android Activity.startLockTask() API via a native module.
 *
 * This file is a placeholder. The actual implementation requires
 * native Android code (Java/Kotlin), not TypeScript.
 */

export {};
