# AGP 9.x enables R8 minification by default for release builds. The rules
# below are required to prevent R8 from stripping code that JNI/reflection
# resolves by name at runtime — Java source shows the symbol as "unused".

# Keep every native method + its declaring class. Standard "safe" rule that
# lives in proguard-android-optimize.txt; we redeclare it because we don't
# pull in the AGP-default proguard files.
-keepclasseswithmembernames class * {
    native <methods>;
}

# ffmpeg_kit_flutter_new ships no consumer-proguard rules. Its libffmpegkit
# .so binds JNI methods on classes under com.antonkarpenko.ffmpegkit at load
# time; if R8 renames or strips any of them JNI_OnLoad returns 0 and the
# plugin's static init throws java.lang.Error — which propagates out of
# GeneratedPluginRegistrant.registerWith and blocks every plugin after it
# in alphabetical order (flutter_secure_storage, flutter_tts, image_picker,
# share_plus, sqflite, url_launcher, video_player, webview_flutter, …).
-keep class com.antonkarpenko.ffmpegkit.** { *; }

# smart_auth (TAM-123) — Onboarding auto-fill on Android. Its Kotlin plugin
# bridges to Google Identity Services (Phone Number Hint) and Google Play
# services (SMS Retriever). R8 strips these classes because Flutter never
# imports them directly — they're resolved via GoogleApiClient at runtime.
-keep class com.google.android.gms.auth.api.identity.** { *; }
-keep class com.google.android.gms.auth.api.phone.** { *; }
-keep class fman.ge.smart_auth.** { *; }

# app_links (TAM-124) — Android App Links + prabhuji:// custom scheme. The
# plugin's Kotlin classes are registered via GeneratedPluginRegistrant at
# process boot; if R8 strips or renames them, `AppLinks().getInitialLink()`
# throws in _MobileAppState.initState and — because plugin registration
# runs alphabetically — every plugin whose class-load order comes AFTER
# `app_links` (basically everything) never registers. The visible symptom
# is exactly this: the Flutter engine boots, splash paints, and then
# nothing (orchestrator's UsersRepository dep is un-registered → AppStarted
# handler throws silently in release).
-keep class com.llfbandit.app_links.** { *; }

# android_play_install_referrer (TAM-124) — reads the Play Store install-
# referrer parameter for deferred deep linking. Wraps Google's
# `com.android.installreferrer` library, which resolves classes via the
# Play Services binder at runtime. R8 stripping either the plugin's Kotlin
# wrapper OR the underlying `com.android.installreferrer.**` classes
# produces the same "stuck at splash" symptom via the registrant-chain
# cascade documented above.
-keep class io.github.lschmierer.androidplayinstallreferrer.** { *; }
-keep class de.lschmierer.android_play_install_referrer.** { *; }
-keep class com.android.installreferrer.** { *; }
-keep interface com.android.installreferrer.** { *; }

# firebase_crashlytics — Firebase discovers each SDK's components through
# ComponentRegistrar classes named in AndroidManifest <meta-data>, i.e. purely
# by reflection. R8 sees no caller and strips them. Losing the Crashlytics
# registrar does NOT degrade to "no crash reporting": Firebase.initializeApp()
# itself throws
#     NullPointerException: FirebaseCrashlytics component is not present.
# so `firebaseReady` stays false in main.dart and the whole Firebase block is
# skipped — no Analytics (every event ships with an empty `pseudo_id`), no
# Crashlytics, no FCM token sync or notifications. Debug builds hide it
# because R8 is off, and the catch in main.dart is kDebugMode-gated.
-keep class * implements com.google.firebase.components.ComponentRegistrar { *; }
-keep class com.google.firebase.crashlytics.** { *; }
-dontwarn com.google.firebase.crashlytics.**
