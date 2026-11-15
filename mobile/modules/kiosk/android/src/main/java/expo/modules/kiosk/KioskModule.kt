package expo.modules.kiosk

import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.view.WindowManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class KioskModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context unavailable" }

  private val currentActivity: Activity?
    get() = appContext.activityProvider?.currentActivity

  private val dpm: DevicePolicyManager
    get() = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager

  private val adminComponent: ComponentName
    get() = ComponentName(context, BusBuzzDeviceAdminReceiver::class.java)

  override fun definition() = ModuleDefinition {
    Name("Kiosk")

    // True only once `dpm set-device-owner` has run against this package. The
    // driver app uses this to decide whether to auto-lock on launch — so a dev
    // build (or the parent app) never traps itself.
    Function("isDeviceOwner") {
      dpm.isDeviceOwnerApp(context.packageName)
    }

    // Lock the app to the foreground. As Device Owner this whitelists the
    // package and strips all system UI (true kiosk). Without Device Owner it
    // still calls startLockTask(), which Android downgrades to escapable
    // screen-pinning — reported back so JS can tell the difference.
    Function("enterKiosk") {
      val activity = currentActivity ?: return@Function "none"
      val pkg = context.packageName
      val owner = dpm.isDeviceOwnerApp(pkg)

      if (owner) {
        dpm.setLockTaskPackages(adminComponent, arrayOf(pkg))
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
          // 0 == LOCK_TASK_FEATURE_NONE: no home, recents, notifications,
          // status bar, or global actions — nothing to escape through.
          dpm.setLockTaskFeatures(adminComponent, DevicePolicyManager.LOCK_TASK_FEATURE_NONE)
        }
      }

      activity.runOnUiThread {
        try {
          activity.startLockTask()
        } catch (_: IllegalStateException) {
          // Already in lock task, or activity not resumed — safe to ignore.
        }
      }
      if (owner) "hard" else "pinned"
    }

    Function("exitKiosk") {
      val activity = currentActivity ?: return@Function false
      activity.runOnUiThread {
        try {
          activity.stopLockTask()
        } catch (_: IllegalStateException) {
          // Not in lock task — nothing to release.
        }
      }
      true
    }

    // Keep the screen on while the dashboard is mounted. The bus phone is
    // permanently on a car charger, so this is always safe; done natively to
    // avoid pulling in expo-keep-awake.
    Function("setKeepAwake") { enabled: Boolean ->
      val activity = currentActivity ?: return@Function false
      activity.runOnUiThread {
        if (enabled) {
          activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } else {
          activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
      }
      true
    }
  }
}
