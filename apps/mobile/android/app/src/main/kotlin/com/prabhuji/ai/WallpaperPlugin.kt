package com.prabhuji.ai

import android.app.WallpaperManager
import android.content.Context
import android.graphics.BitmapFactory
import android.os.Build
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * Native set-as-wallpaper handler for the `prabhuji/wallpaper` MethodChannel
 * (TAM-70). Owns the `WallpaperManager` work behind the Dart
 * [SetWallpaperService] boundary. Every method replies with a tri-state STRING:
 *   "success" | "failed" | "unsupported"
 * so the Dart state machine can branch to the exact PRD copy (PRD §6.12).
 *
 * Methods:
 *  * setHomeStatic(imageUrl)  → WallpaperManager.setBitmap(bmp, null, true, FLAG_SYSTEM)
 *  * setLockStatic(imageUrl)  → …FLAG_LOCK (API 24+; older OEMs → "unsupported")
 *  * setBoth(imageUrl)        → FLAG_SYSTEM or FLAG_LOCK (API 24+); base setBitmap pre-24
 *  * setLiveWallpaper(frameImageUrl) → Phase-1 fallback: set the representative
 *    STILL FRAME as the HOME wallpaper (the "rendered-video-as-wallpaper" path,
 *    spec q1). A true animated live wallpaper needs a `WallpaperService`, which
 *    is out of Phase-1 scope and DEFERRED to the device sweep — the Dart layer
 *    documents this and treats the result identically (home-screen only).
 *
 * NOTE: not runtime-verified in CI (no Android emulator in this environment) —
 * on-device verification is deferred to the epic device sweep (spec Evidence).
 */
class WallpaperPlugin(private val context: Context) : MethodChannel.MethodCallHandler {

    companion object {
        const val CHANNEL = "prabhuji/wallpaper"
        private const val RESULT_SUCCESS = "success"
        private const val RESULT_FAILED = "failed"
        private const val RESULT_UNSUPPORTED = "unsupported"
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "setHomeStatic",
            "setLockStatic",
            "setBoth" -> {
                val imageUrl = call.argument<String>("imageUrl")
                runOffThread(result) { setStatic(imageUrl, call.method) }
            }
            "setLiveWallpaper" -> {
                val frameUrl = call.argument<String>("frameImageUrl")
                // Phase-1 live fallback: apply the representative still as the
                // HOME wallpaper (home-screen only, PRD §6.7).
                runOffThread(result) { setStatic(frameUrl, "setHomeStatic") }
            }
            else -> result.notImplemented()
        }
    }

    /** Run [work] on a background thread (blocking network + WallpaperManager I/O),
     *  then reply the tri-state string on the main thread. */
    private fun runOffThread(result: MethodChannel.Result, work: () -> String) {
        thread {
            val reply = try {
                work()
            } catch (_: Throwable) {
                RESULT_FAILED
            }
            android.os.Handler(context.mainLooper).post { result.success(reply) }
        }
    }

    private fun setStatic(imageUrl: String?, method: String): String {
        if (imageUrl.isNullOrBlank()) return RESULT_FAILED

        val manager = WallpaperManager.getInstance(context)
        if (!manager.isWallpaperSupported) return RESULT_UNSUPPORTED

        // Lock-screen targeting (FLAG_LOCK) is API 24+; older OEMs can't do it.
        val needsFlags = method == "setLockStatic" || method == "setBoth"
        if (needsFlags && Build.VERSION.SDK_INT < Build.VERSION_CODES.N) {
            return if (method == "setLockStatic") RESULT_UNSUPPORTED
            else setBaseBitmap(manager, imageUrl) // "both" pre-24 → the single system wallpaper
        }

        val bytes = download(imageUrl) ?: return RESULT_FAILED
        val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
            ?: return RESULT_FAILED

        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            val flags = when (method) {
                "setLockStatic" -> WallpaperManager.FLAG_LOCK
                "setBoth" -> WallpaperManager.FLAG_SYSTEM or WallpaperManager.FLAG_LOCK
                else -> WallpaperManager.FLAG_SYSTEM
            }
            val applied = manager.setBitmap(bitmap, null, true, flags)
            if (applied > 0) RESULT_SUCCESS else RESULT_FAILED
        } else {
            setBaseBitmap(manager, imageUrl)
        }
    }

    /** Pre-24 fallback: the single (home) wallpaper via the flag-less setBitmap. */
    private fun setBaseBitmap(manager: WallpaperManager, imageUrl: String): String {
        val bytes = download(imageUrl) ?: return RESULT_FAILED
        val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
            ?: return RESULT_FAILED
        manager.setBitmap(bitmap)
        return RESULT_SUCCESS
    }

    private fun download(url: String): ByteArray? {
        val conn = URL(url).openConnection() as HttpURLConnection
        return try {
            conn.connectTimeout = 15000
            conn.readTimeout = 15000
            conn.instanceFollowRedirects = true
            conn.connect()
            if (conn.responseCode !in 200..299) return null
            conn.inputStream.use { it.readBytes() }
        } finally {
            conn.disconnect()
        }
    }
}
