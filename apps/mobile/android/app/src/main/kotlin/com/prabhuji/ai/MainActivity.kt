package com.prabhuji.ai

import android.content.Context
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

/**
 * Keeps the FlutterEngine alive when Android recreates this activity for a
 * configuration change it will not let us opt out of in the manifest. The main
 * case is a theme-overlay change: setting a wallpaper re-derives the system's
 * dynamic colours and Android relaunches every foreground activity.
 *
 * Default FlutterActivity behaviour destroys the engine with the activity. That
 * (a) restarts the Dart app from scratch mid-flow, and (b) crashed the app with
 * "FlutterJNI is not attached to native": media_kit's libmpv kept rendering into
 * the destroyed engine's video surface. Now the first activity creates the
 * engine as usual (plugins and debug shell args included) and we keep a
 * reference to it. A recreated activity reattaches to that engine, Dart keeps
 * running, and plugins get the config-change detach/reattach callbacks. A real
 * exit (finish, or the OS reclaiming the activity) still destroys the engine.
 */
class MainActivity : FlutterActivity() {
    companion object {
        /** Engine carried over to the activity instance recreated for a config change. */
        private var retainedEngine: FlutterEngine? = null
    }

    override fun provideFlutterEngine(context: Context): FlutterEngine? =
        // null → FlutterActivity builds its default engine (first launch).
        retainedEngine

    override fun shouldDestroyEngineWithHost(): Boolean = !isChangingConfigurations

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        // For a reattached engine, super skips plugin registration (already done).
        super.configureFlutterEngine(flutterEngine)
        if (retainedEngine !== flutterEngine) {
            retainedEngine = flutterEngine
            flutterEngine.addEngineLifecycleListener(object : FlutterEngine.EngineLifecycleListener {
                override fun onPreEngineRestart() {}

                override fun onEngineWillDestroy() {
                    if (retainedEngine === flutterEngine) retainedEngine = null
                }
            })
        }
        // Native set-as-phone-ringtone channel (TAM-68).
        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            RingtonePlugin.CHANNEL,
        ).setMethodCallHandler(RingtonePlugin(applicationContext))
        // Native set-as-wallpaper channel (TAM-70).
        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            WallpaperPlugin.CHANNEL,
        ).setMethodCallHandler(WallpaperPlugin(applicationContext))
        // UPI app discovery + targeted launch for the paywall's payment picker.
        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            UpiPlugin.CHANNEL,
        ).setMethodCallHandler(UpiPlugin(applicationContext))
        // Story/status direct-share launcher — powers the "Share to WhatsApp
        // Status / Instagram Story / …" sheet on the status card.
        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            StorySharePlugin.CHANNEL,
        ).setMethodCallHandler(StorySharePlugin(applicationContext))
        // Mobile carrier name — read once at Analytics.init and threaded
        // onto every event as the top-level Amplitude `carrier` field.
        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            CarrierPlugin.CHANNEL,
        ).setMethodCallHandler(CarrierPlugin(applicationContext))
    }
}
