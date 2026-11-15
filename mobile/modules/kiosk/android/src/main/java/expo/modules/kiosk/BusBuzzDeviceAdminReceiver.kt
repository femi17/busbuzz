package expo.modules.kiosk

import android.app.admin.DeviceAdminReceiver

/**
 * The Device Admin component BusBuzz is provisioned against as Device Owner.
 * Its fully-qualified name is what you pass to `dpm set-device-owner`:
 *   com.busbuzz.driver/expo.modules.kiosk.BusBuzzDeviceAdminReceiver
 * No callbacks are overridden — we only need the component to exist so the app
 * can hold Device-Owner privileges (Lock Task whitelisting, lock-task features).
 */
class BusBuzzDeviceAdminReceiver : DeviceAdminReceiver()
