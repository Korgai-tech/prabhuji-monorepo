plugins {
    id("com.android.application")
    // Firebase: applies the Google Services plugin so google-services.json is
    // read into a generated values resource that FirebaseApp.initializeApp
    // consumes at runtime. Version is pinned in android/settings.gradle.kts.
    id("com.google.gms.google-services")
    // Firebase Crashlytics (mapping-file upload). Version pinned in
    // android/settings.gradle.kts; the SDK itself arrives via the
    // firebase_crashlytics Flutter plugin.
    id("com.google.firebase.crashlytics")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Meta / Facebook App Events credentials. The Facebook Android SDK auto-inits
// from AndroidManifest <meta-data> BEFORE Dart runs, so we can't pass these
// through Secrets.load() the way the Dart side does. Instead we read the same
// gitignored `env/prabhujiSecrets.json` at build time and inject the values
// as string resources referenced by the manifest. Missing file / placeholder
// values → empty strings; Dart's Secrets.metaEnabled gate keeps FacebookAppEvents
// unconstructed in that case, so the native SDK is never invoked with empties.
val metaSecrets: Pair<String, String> = run {
    val secretsFile = file("../../env/prabhujiSecrets.json")
    if (!secretsFile.exists()) return@run "" to ""
    try {
        @Suppress("UNCHECKED_CAST")
        val json = groovy.json.JsonSlurper().parse(secretsFile) as Map<String, Any?>
        val appId = (json["metaAppId"] as? String).orEmpty()
        val clientToken = (json["metaClientToken"] as? String).orEmpty()
        val realAppId = if (appId.startsWith("REPLACE_ME_")) "" else appId
        val realClientToken = if (clientToken.startsWith("REPLACE_ME_")) "" else clientToken
        realAppId to realClientToken
    } catch (_: Exception) {
        "" to ""
    }
}

android {
    // Kotlin package + R class root — must match the `package` declaration in
    // every .kt under `src/main/kotlin/`. Kept stable across build types (the
    // per-variant application id is diverged via `applicationIdSuffix` below).
    namespace = "com.prabhuji.ai"
    // Bumped past `flutter.compileSdkVersion` (Flutter default in this repo
    // was 33) because android_play_install_referrer's transitive androidx
    // deps (fragment 1.7.1, activity 1.8.1, lifecycle 2.7.0, core 1.13.1,
    // etc. — added TAM-124) require compileSdk 34+ per AAR metadata.
    // Pinned to 36 (Android 16) because Flutter itself now requires it —
    // 13 first-party plugins (app_links, flutter_local_notifications,
    // flutter_secure_storage, share_plus, sqflite_android, video_player,
    // webview_flutter, …) refuse to build against a lower compileSdk as of
    // their current pinned versions. `targetSdk` stays on Flutter's default
    // (runtime-behavior opt-in — bump independently).
    compileSdk = 36
    ndkVersion = flutter.ndkVersion

    // AGP 8+ turns the resValue build feature OFF by default. We inject the
    // Facebook SDK's ApplicationId / ClientToken as string resources via
    // `resValue(...)` in defaultConfig, so it must be re-enabled here.
    buildFeatures {
        resValues = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        // Required by flutter_local_notifications 22.x — it uses Java 8 time
        // APIs (java.time.ZonedDateTime, etc.) directly, and our minSdk still
        // ships to devices below 26 where those APIs don't exist natively.
        // Desugaring backports them into the APK.
        isCoreLibraryDesugaringEnabled = true
    }

    defaultConfig {
        applicationId = "com.prabhuji.ai"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName

        // Facebook SDK reads these string resources from the manifest at
        // native init time — see the `metaSecrets` block above and the two
        // <meta-data> entries in AndroidManifest.xml.
        resValue("string", "facebook_app_id", metaSecrets.first)
        resValue("string", "facebook_client_token", metaSecrets.second)
    }

    signingConfigs {
        create("release") {
            storePassword = "krutyug2026"
            keyPassword = "krutyug2026"
            keyAlias = "upload"
            storeFile = file("prabhuji-upload-keystore.jks")
        }
    }

    buildTypes {
        debug {
            // Debug installs as `com.prabhuji.ai.debug` so a debug build can be
            // installed alongside a release build without one replacing the other.
            applicationIdSuffix = ".debug"
        }
        release {
            // TODO: Add your own signing config for the release build.
            // Signing with the debug keys for now, so `flutter run --release` works.
            signingConfig = signingConfigs.getByName("release")
            // AGP 9 turns R8 on by default but doesn't apply the AGP-default
            // proguard rules unless we ask for them — without the "keep native
            // methods" rule, ffmpeg-kit's JNI bindings get stripped and the
            // whole GeneratedPluginRegistrant chain collapses at boot. See
            // proguard-rules.pro for the full story.
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

dependencies {
    // Backport of java.time / stream APIs for pre-API-26 devices. Required by
    // flutter_local_notifications 22.x (see the `isCoreLibraryDesugaringEnabled`
    // flag under compileOptions above).
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}
