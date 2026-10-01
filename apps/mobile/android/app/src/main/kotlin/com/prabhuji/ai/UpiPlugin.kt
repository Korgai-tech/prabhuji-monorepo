package com.prabhuji.ai

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ResolveInfo
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.net.Uri
import android.util.Base64
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.io.ByteArrayOutputStream

/**
 * Native UPI app discovery + targeted launch for the `prabhuji/upi`
 * MethodChannel.
 *
 * Exists because the paywall's "PAY USING" control is a real chooser: it lists
 * the UPI apps actually installed on THIS device, with their real names and
 * icons, rather than hardcoding a single PSP the user may not have.
 *
 * ## Package visibility (the thing that breaks silently)
 *
 * On Android 11+ (API 30) `queryIntentActivities` returns an EMPTY list unless
 * the manifest declares what we're looking for. `AndroidManifest.xml` carries:
 *
 *     <queries><intent>
 *       <action android:name="android.intent.action.VIEW"/>
 *       <data android:scheme="upi"/>
 *     </intent></queries>
 *
 * Without it there is no error and no permission prompt — the list is just
 * empty, and the user is told they have no UPI app while staring at GPay. If
 * this ever regresses, that is the first place to look.
 *
 * We query by SCHEME rather than by a package allowlist so every UPI app
 * qualifies, including ones that did not exist when this shipped. Hardcoding
 * `com.google.android.apps.nbu.paisa.user` and friends would quietly exclude
 * whatever the user actually banks with.
 */
class UpiPlugin(private val context: Context) : MethodChannel.MethodCallHandler {

    companion object {
        const val CHANNEL = "prabhuji/upi"

        /**
         * A minimal, syntactically valid UPI mandate URI used ONLY to resolve
         * which activities can handle the scheme. Never launched — the real URI
         * comes from the payment provider.
         */
        private const val PROBE_URI = "upi://mandate?pa=probe@upi&pn=probe&am=1.00&cu=INR"

        /** Icons are rendered into the Flutter list; 96px covers 3x density. */
        private const val ICON_PX = 96
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "listUpiApps" -> result.success(listUpiApps())
            "launchUpiApp" -> launchUpiApp(call, result)
            else -> result.notImplemented()
        }
    }

    /**
     * Every installed activity that can handle a `upi://` intent.
     *
     * Sorted by display name so the list is stable across calls — the system's
     * resolve order is not guaranteed, and a chooser whose rows move between
     * openings is its own usability bug.
     */
    private fun listUpiApps(): List<Map<String, Any?>> {
        val pm = context.packageManager
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(PROBE_URI))

        val resolved: List<ResolveInfo> = try {
            pm.queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY)
        } catch (e: Exception) {
            // Never let discovery crash the paywall: an empty list degrades to
            // the plain "open whichever app handles this" flow.
            emptyList()
        }

        return resolved
            .mapNotNull { info ->
                val activity = info.activityInfo ?: return@mapNotNull null
                val packageName = activity.packageName ?: return@mapNotNull null
                val label = info.loadLabel(pm)?.toString() ?: packageName
                mapOf(
                    "packageName" to packageName,
                    "appName" to label,
                    // Base64 PNG rather than a file path: the icon is a Drawable
                    // owned by another app, so there is no path we could hand to
                    // Flutter's Image.file.
                    "iconPngBase64" to encodeIcon(runCatching { info.loadIcon(pm) }.getOrNull()),
                )
            }
            .distinctBy { it["packageName"] }
            .sortedBy { (it["appName"] as? String)?.lowercase() ?: "" }
    }

    /**
     * Launch [uri] in a SPECIFIC package.
     *
     * `setPackage` is what makes the user's choice stick — without it Android
     * shows its own chooser again, which defeats the point of having asked.
     * Returns false rather than throwing when the app cannot handle it (it was
     * uninstalled between listing and tapping), so Dart renders a normal error.
     */
    private fun launchUpiApp(call: MethodCall, result: MethodChannel.Result) {
        val uri = call.argument<String>("uri")
        val packageName = call.argument<String>("packageName")
        if (uri.isNullOrBlank()) {
            result.error("INVALID_ARGS", "uri is required", null)
            return
        }

        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).apply {
            // Launched from an application context, so a new task is required.
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            if (!packageName.isNullOrBlank()) setPackage(packageName)
        }

        try {
            context.startActivity(intent)
            result.success(true)
        } catch (e: Exception) {
            result.success(false)
        }
    }

    /** Render a Drawable to a base64 PNG, or null if it cannot be rasterised. */
    private fun encodeIcon(drawable: Drawable?): String? {
        if (drawable == null) return null
        return try {
            val bitmap = if (drawable is BitmapDrawable && drawable.bitmap != null) {
                Bitmap.createScaledBitmap(drawable.bitmap, ICON_PX, ICON_PX, true)
            } else {
                // Adaptive icons have no backing bitmap — draw them instead.
                Bitmap.createBitmap(ICON_PX, ICON_PX, Bitmap.Config.ARGB_8888).also { bmp ->
                    val canvas = Canvas(bmp)
                    drawable.setBounds(0, 0, canvas.width, canvas.height)
                    drawable.draw(canvas)
                }
            }
            ByteArrayOutputStream().use { out ->
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
                Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
            }
        } catch (e: Exception) {
            // An icon is decoration — a failure here must not remove an
            // otherwise-usable payment app from the list.
            null
        }
    }
}
