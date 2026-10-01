package com.prabhuji.ai

import android.content.Context
import android.telephony.TelephonyManager
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

/**
 * Native carrier-name reader for the `prabhuji/carrier` MethodChannel.
 *
 * Exposes `getCarrierName()` which returns the name of the mobile network the
 * device is currently registered on (e.g. "Jio", "Airtel", "Vi"). Threaded onto
 * every analytics event as the top-level Amplitude `carrier` field via
 * `lib/core/carrier_service.dart` -> `Analytics._sharedEventOptions`.
 *
 * ## Why a platform channel and not the `carrier_info` pub package
 *
 * `device_info_plus` has no carrier field and there is no widely-adopted
 * lightweight Flutter package that reads only the operator name. Existing
 * pub-side options either request `READ_PHONE_STATE` (a runtime dangerous
 * permission Play flags for a declaration form) or add ~200 KB of iOS-side
 * dead weight for a field iOS 16+ has deprecated anyway. A small platform
 * channel matches how this app already handles native Android features
 * (`RingtonePlugin`, `WallpaperPlugin`, `UpiPlugin`) and needs zero manifest
 * permissions.
 *
 * ## Permission model
 *
 * `TelephonyManager.getNetworkOperatorName()` is unrestricted — it is safe
 * to call without `READ_PHONE_STATE` and without any runtime prompt. Google
 * documents it under "no permissions required":
 * https://developer.android.com/reference/android/telephony/TelephonyManager#getNetworkOperatorName()
 *
 * ## Return contract
 *
 * Returns a non-empty carrier name string on success, or `null` when:
 *  - the device has no telephony hardware (Wi-Fi-only tablets, emulator
 *    without a modem image),
 *  - the SIM is absent / the modem is unregistered (airplane mode, no signal),
 *  - `TelephonyManager` is unavailable for any other reason.
 *
 * Dart side must handle `null` gracefully — a null carrier simply omits the
 * `carrier` field on the wire (the tracker's `_stripNulls` drops it).
 *
 * ## Android-only by design
 *
 * There is no iOS handler registered; iOS calls resolve to
 * `MissingPluginException` at the Dart layer, which `CarrierService.resolve()`
 * catches and treats as null. This is intentional — Apple deprecated
 * `CTCarrier.carrierName` in iOS 16 and it returns `"--"` on modern iOS, so
 * a real iOS handler would ship a hardcoded placeholder to the warehouse.
 */
class CarrierPlugin(private val context: Context) : MethodChannel.MethodCallHandler {

    companion object {
        const val CHANNEL = "prabhuji/carrier"
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "getCarrierName" -> result.success(getCarrierName())
            else -> result.notImplemented()
        }
    }

    private fun getCarrierName(): String? {
        return try {
            val telephony = context.getSystemService(Context.TELEPHONY_SERVICE)
                as? TelephonyManager ?: return null
            // `networkOperatorName` = the name of the currently registered
            // operator; `simOperatorName` would give the SIM issuer. We use
            // the network name because roaming users see it match what their
            // status bar shows. Empty string is the "unregistered / no
            // service" signal from the framework — normalise to null.
            val name = telephony.networkOperatorName?.trim().orEmpty()
            name.ifEmpty { null }
        } catch (t: Throwable) {
            null
        }
    }
}
