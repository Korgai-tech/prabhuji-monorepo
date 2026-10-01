package com.prabhuji.ai

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.util.Log
import androidx.core.content.FileProvider
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.io.File

/**
 * Native story/status share handler for the `prabhuji/story_share`
 * MethodChannel. Companion to the Dart [StoryShareLauncher] seam.
 *
 * ## The four targets and what the platform actually supports
 *
 *  * **WhatsApp Status** (`com.whatsapp` / `com.whatsapp.w4b`) — `ACTION_SEND`
 *    targeted at the package. **There is no public/documented intent to post
 *    directly to Status.** WhatsApp deliberately does not expose one; every
 *    third-party "share to WhatsApp Status" flow (ShareChat, Josh, MX
 *    TakaTak, …) works this way. WhatsApp's own recipient picker DOES list
 *    "Status (My status)" at the top, so the user is one tap from posting.
 *
 *  * **Instagram Story** (`com.instagram.android`) — `com.instagram.share.
 *    ADD_TO_STORY` with `setDataAndType(uri, mime)`, per Meta's official
 *    docs: https://developers.facebook.com/docs/instagram-platform/sharing-to-stories/
 *    Opens Instagram directly on the Story composer with the file as the
 *    full-screen background asset. Requires an explicit
 *    `Context.grantUriPermission("com.instagram.android", uri, READ)` — the
 *    intent flag alone is not enough for IG (documented in the same page).
 *
 *  * **Facebook Story** (`com.facebook.katana`) — `com.facebook.stories.
 *    ADD_TO_STORY`, per https://developers.facebook.com/docs/sharing/sharing-to-stories/android-developers/
 *    Requires a Facebook App ID (via the `com.facebook.platform.extra.
 *    APPLICATION_ID` extra). We don't currently provision one, so when
 *    `facebookAppId` is null we fall back to `ACTION_SEND` targeted at the
 *    Facebook app (opens FB's own share sheet, from which the user can
 *    pick "Add to Story"). Provision an app id on developers.facebook.com
 *    to unlock the direct-to-composer path.
 *
 *  * **Snapchat My Story** (`com.snapchat.android`) — `ACTION_SEND` targeted
 *    at the package. Snap's direct-to-Story API is their Creative Kit SDK,
 *    which is a separate library integration; without it, the send intent
 *    opens Snapchat's own send-to sheet where "My Story" is a destination.
 *
 * ## File URI hand-off
 *
 * The rendered composite lives in the app's private cache (see
 * `StatusRenderService`). It's exposed to the receiving app via a
 * FileProvider registered in `AndroidManifest.xml` at the authority
 * `${applicationId}.storyshare.fileprovider`, with:
 *   - the intent flag `FLAG_GRANT_READ_URI_PERMISSION`, AND
 *   - an explicit per-package `Context.grantUriPermission(pkg, uri, READ)`.
 *
 * Belt-and-braces because OEMs like MIUI/HyperOS/FunTouchOS ignore the
 * intent flag on packages that were declared in `<queries>`, and IG's docs
 * require the explicit grant.
 */
class StorySharePlugin(private val context: Context) : MethodChannel.MethodCallHandler {

    companion object {
        const val CHANNEL = "prabhuji/story_share"
        private const val TAG = "StorySharePlugin"

        private const val PKG_WHATSAPP = "com.whatsapp"
        private const val PKG_WHATSAPP_BUSINESS = "com.whatsapp.w4b"
        private const val PKG_INSTAGRAM = "com.instagram.android"
        private const val PKG_FACEBOOK = "com.facebook.katana"
        private const val PKG_SNAPCHAT = "com.snapchat.android"

        private const val ACTION_INSTAGRAM_STORY = "com.instagram.share.ADD_TO_STORY"
        private const val ACTION_FACEBOOK_STORY = "com.facebook.stories.ADD_TO_STORY"
        private const val EXTRA_FACEBOOK_APP_ID =
            "com.facebook.platform.extra.APPLICATION_ID"

        private const val FILE_PROVIDER_AUTHORITY_SUFFIX = ".storyshare.fileprovider"
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "installedTargets" -> result.success(installedTargets())
            "shareTo" -> {
                val target = call.argument<String>("target")
                val filePath = call.argument<String>("filePath")
                val mimeType = call.argument<String>("mimeType") ?: "image/*"
                val caption = call.argument<String>("caption")
                val facebookAppId = call.argument<String>("facebookAppId")
                if (target.isNullOrBlank() || filePath.isNullOrBlank()) {
                    result.success(false)
                    return
                }
                result.success(
                    shareTo(target, filePath, mimeType, caption, facebookAppId)
                )
            }
            else -> result.notImplemented()
        }
    }

    private fun installedTargets(): List<String> {
        val installed = mutableListOf<String>()
        val whatsappInstalled =
            isInstalled(PKG_WHATSAPP) || isInstalled(PKG_WHATSAPP_BUSINESS)
        if (whatsappInstalled) installed += "whatsapp"
        if (isInstalled(PKG_INSTAGRAM)) installed += "instagram"
        if (isInstalled(PKG_FACEBOOK)) installed += "facebook"
        if (isInstalled(PKG_SNAPCHAT)) installed += "snapchat"
        Log.d(TAG, "installedTargets → $installed")
        return installed
    }

    private fun isInstalled(pkg: String): Boolean = try {
        context.packageManager.getPackageInfo(pkg, 0)
        true
    } catch (_: PackageManager.NameNotFoundException) {
        false
    }

    private fun shareTo(
        target: String,
        filePath: String,
        mimeType: String,
        caption: String?,
        facebookAppId: String?,
    ): Boolean {
        Log.d(TAG, "shareTo target=$target mime=$mimeType path=$filePath")
        val file = File(filePath)
        if (!file.exists()) {
            Log.w(TAG, "shareTo: file does not exist at $filePath")
            return false
        }
        val authority = context.packageName + FILE_PROVIDER_AUTHORITY_SUFFIX
        val uri: Uri = try {
            FileProvider.getUriForFile(context, authority, file)
        } catch (e: IllegalArgumentException) {
            Log.e(TAG, "shareTo: FileProvider.getUriForFile threw for " +
                    "authority=$authority path=$filePath", e)
            return false
        }
        Log.d(TAG, "shareTo: content uri = $uri")

        // Build the per-target intent AND note which packages must receive an
        // explicit URI permission grant. For a plain ACTION_SEND targeted at
        // a single package, that package. For the Instagram/Facebook story
        // intents, the destination package.
        val (intent, grantPackages) = when (target) {
            "whatsapp" -> {
                val pkg = if (isInstalled(PKG_WHATSAPP)) PKG_WHATSAPP
                          else PKG_WHATSAPP_BUSINESS
                buildSendIntent(pkg, uri, mimeType, caption) to listOf(pkg)
            }
            "instagram" -> {
                buildInstagramStoryIntent(uri, mimeType) to listOf(PKG_INSTAGRAM)
            }
            "facebook" -> {
                buildFacebookStoryIntent(uri, mimeType, caption, facebookAppId) to
                    listOf(PKG_FACEBOOK)
            }
            "snapchat" -> {
                buildSendIntent(PKG_SNAPCHAT, uri, mimeType, caption) to
                    listOf(PKG_SNAPCHAT)
            }
            else -> {
                Log.w(TAG, "shareTo: unknown target $target")
                return false
            }
        }

        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

        // Belt-and-braces per-package grant — the flag alone is unreliable on
        // some OEM ROMs and Instagram's own docs require this call explicitly.
        for (pkg in grantPackages) {
            try {
                context.grantUriPermission(
                    pkg, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION
                )
            } catch (t: Throwable) {
                Log.w(TAG, "shareTo: grantUriPermission failed for $pkg", t)
            }
        }

        // No `resolveActivity` pre-check: with `setPackage(pkg)` already
        // constraining the intent to a specific app, `resolveActivity` can
        // return null on some OEM ROMs even when `startActivity` would
        // succeed — and the manifest's `<queries>` block still gates
        // visibility either way. Try the launch and catch the exception
        // Android actually raises when nothing handles it.
        return try {
            context.startActivity(intent)
            Log.d(TAG, "shareTo: startActivity OK for $target " +
                    "(action=${intent.action} package=${intent.`package`})")
            true
        } catch (t: android.content.ActivityNotFoundException) {
            Log.w(TAG, "shareTo: no activity for $target — " +
                    "action=${intent.action} package=${intent.`package`} " +
                    "type=${intent.type}. If the app IS installed, the " +
                    "manifest <queries>/<intent> block may not have landed: " +
                    "`adb uninstall ${context.packageName}` and reinstall.")
            false
        } catch (t: Throwable) {
            Log.e(TAG, "shareTo: startActivity threw for $target", t)
            false
        }
    }

    /**
     * Generic ACTION_SEND for apps that accept the standard image/video +
     * caption shape (WhatsApp, Facebook fallback, Snapchat).
     */
    private fun buildSendIntent(
        pkg: String,
        uri: Uri,
        mimeType: String,
        caption: String?,
    ): Intent = Intent(Intent.ACTION_SEND).apply {
        setPackage(pkg)
        type = mimeType
        putExtra(Intent.EXTRA_STREAM, uri)
        if (!caption.isNullOrBlank()) putExtra(Intent.EXTRA_TEXT, caption)
    }

    /**
     * Instagram Story background-asset intent, per Meta's official docs.
     * `setDataAndType(uri, mime)` supplies the full-screen background;
     * `interactive_asset_uri` (which we deliberately do NOT set) is only
     * for a movable sticker overlay.
     */
    private fun buildInstagramStoryIntent(uri: Uri, mimeType: String): Intent =
        Intent(ACTION_INSTAGRAM_STORY).apply {
            setPackage(PKG_INSTAGRAM)
            setDataAndType(uri, mimeType)
        }

    /**
     * Facebook Story ADD_TO_STORY intent. Requires an FB App ID; when we
     * don't have one, fall back to a plain ACTION_SEND targeted at the
     * Facebook app so the user can still reach the Story composer through
     * FB's own share sheet.
     */
    private fun buildFacebookStoryIntent(
        uri: Uri,
        mimeType: String,
        caption: String?,
        facebookAppId: String?,
    ): Intent {
        if (facebookAppId.isNullOrBlank()) {
            Log.d(TAG, "buildFacebookStoryIntent: no app id → ACTION_SEND fallback")
            return buildSendIntent(PKG_FACEBOOK, uri, mimeType, caption)
        }
        return Intent(ACTION_FACEBOOK_STORY).apply {
            setPackage(PKG_FACEBOOK)
            setDataAndType(uri, mimeType)
            putExtra(EXTRA_FACEBOOK_APP_ID, facebookAppId)
        }
    }
}
