package com.prabhuji.ai

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.provider.Settings
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * Native set-as-phone-ringtone handler for the `prabhuji/ringtone` MethodChannel
 * (TAM-68). Owns the `RingtoneManager` + `MediaStore` work behind the Dart
 * [SetRingtoneService] boundary.
 *
 * `WRITE_SETTINGS` is a special (AppOps) permission granted only from the system
 * settings screen (`ACTION_MANAGE_WRITE_SETTINGS`), NOT via a runtime dialog —
 * so [openWriteSettings] deep-links there and the Dart state machine re-checks
 * [hasWriteSettingsPermission] on app resume before attempting the set.
 *
 * NOTE: not runtime-verified in CI (no Android emulator in this environment) —
 * on-device verification is deferred to the epic device sweep (spec Evidence).
 */
class RingtonePlugin(private val context: Context) : MethodChannel.MethodCallHandler {

    companion object {
        const val CHANNEL = "prabhuji/ringtone"
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "hasWriteSettingsPermission" -> result.success(canWrite())
            "openWriteSettings" -> {
                openWriteSettings()
                result.success(null)
            }
            "setPhoneRingtone" -> {
                val audioUrl = call.argument<String>("audioUrl")
                val title = call.argument<String>("title") ?: "Prabhuji Ringtone"
                if (audioUrl.isNullOrBlank()) {
                    result.success(false)
                    return
                }
                // Download + MediaStore write is blocking I/O — off the platform
                // thread; reply on the main thread.
                thread {
                    val ok = try {
                        setPhoneRingtone(audioUrl, title)
                    } catch (_: Throwable) {
                        false
                    }
                    android.os.Handler(context.mainLooper).post { result.success(ok) }
                }
            }
            else -> result.notImplemented()
        }
    }

    private fun canWrite(): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Settings.System.canWrite(context)
        } else {
            true
        }

    private fun openWriteSettings() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val intent = Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS).apply {
                data = Uri.parse("package:${context.packageName}")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        }
    }

    /**
     * Download [audioUrl] into the app cache, publish it to `MediaStore` as a
     * ringtone, then set it as the default phone ringtone via [RingtoneManager].
     * Returns true only if the set call resolves without error.
     */
    private fun setPhoneRingtone(audioUrl: String, title: String): Boolean {
        if (!canWrite()) return false

        val cacheFile = File(context.cacheDir, "prabhuji_ringtone.mp3")
        (URL(audioUrl).openConnection() as HttpURLConnection).run {
            connectTimeout = 15000
            readTimeout = 15000
            instanceFollowRedirects = true
            connect()
            if (responseCode !in 200..299) {
                disconnect()
                return false
            }
            inputStream.use { input ->
                cacheFile.outputStream().use { input.copyTo(it) }
            }
            disconnect()
        }

        val resolver = context.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.TITLE, title)
            put(MediaStore.MediaColumns.MIME_TYPE, "audio/mpeg")
            put(MediaStore.Audio.Media.IS_RINGTONE, true)
            put(MediaStore.Audio.Media.IS_NOTIFICATION, false)
            put(MediaStore.Audio.Media.IS_ALARM, false)
            put(MediaStore.Audio.Media.IS_MUSIC, false)
        }

        val uri: Uri? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, "prabhuji_ringtone.mp3")
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, "Ringtones")
            val collection =
                MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
            val item = resolver.insert(collection, values) ?: return false
            resolver.openOutputStream(item)?.use { out ->
                cacheFile.inputStream().use { it.copyTo(out) }
            }
            item
        } else {
            @Suppress("DEPRECATION")
            values.put(MediaStore.MediaColumns.DATA, cacheFile.absolutePath)
            resolver.insert(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, values)
        }

        if (uri == null) return false

        RingtoneManager.setActualDefaultRingtoneUri(
            context,
            RingtoneManager.TYPE_RINGTONE,
            uri,
        )
        return true
    }
}
