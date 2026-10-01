package com.prabhuji.notificationstate;

import android.app.NotificationChannel;
import android.app.NotificationChannelGroup;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;

import java.util.HashMap;
import java.util.Map;

import io.flutter.embedding.engine.plugins.FlutterPlugin;
import io.flutter.plugin.common.MethodCall;
import io.flutter.plugin.common.MethodChannel;

/**
 * `prabhuji/notification_state` — answers "would a notification posted right
 * now actually be shown?" for the `notification_received` analytics event.
 *
 * A real plugin (not a channel registered in MainActivity) because the FCM
 * background handler runs in a separate FlutterEngine that never goes through
 * `MainActivity.configureFlutterEngine`; only pub plugins are registered there.
 *
 * None of the reads need a permission: `areNotificationsEnabled`,
 * `getNotificationChannel` and `getCurrentInterruptionFilter` are all open to
 * the calling app.
 */
public class NotificationStatePlugin implements FlutterPlugin, MethodChannel.MethodCallHandler {
    private static final String CHANNEL = "prabhuji/notification_state";

    private MethodChannel channel;
    private Context context;

    @Override
    public void onAttachedToEngine(FlutterPluginBinding binding) {
        context = binding.getApplicationContext();
        channel = new MethodChannel(binding.getBinaryMessenger(), CHANNEL);
        channel.setMethodCallHandler(this);
    }

    @Override
    public void onDetachedFromEngine(FlutterPluginBinding binding) {
        channel.setMethodCallHandler(null);
        channel = null;
        context = null;
    }

    @Override
    public void onMethodCall(MethodCall call, MethodChannel.Result result) {
        if (!"getState".equals(call.method)) {
            result.notImplemented();
            return;
        }
        try {
            result.success(readState((String) call.argument("channelId")));
        } catch (Throwable t) {
            result.error("notification_state_failed", t.getMessage(), null);
        }
    }

    private Map<String, Object> readState(String channelId) {
        NotificationManager manager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        Map<String, Object> state = new HashMap<>();
        if (manager == null) return state;

        // App-level switch. On Android 13+ this is also false until
        // POST_NOTIFICATIONS is granted.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            state.put("notificationsEnabled", manager.areNotificationsEnabled());
        }

        // Channel-level switch. A missing channel is left out (unknown), not
        // reported as off — Android falls back to its own default channel.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && channelId != null) {
            NotificationChannel ch = manager.getNotificationChannel(channelId);
            if (ch != null) {
                boolean enabled = ch.getImportance() != NotificationManager.IMPORTANCE_NONE;
                if (enabled && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && ch.getGroup() != null) {
                    NotificationChannelGroup group = manager.getNotificationChannelGroup(ch.getGroup());
                    if (group != null && group.isBlocked()) enabled = false;
                }
                state.put("channelEnabled", enabled);
            }
        }

        // Do Not Disturb: anything stricter than "all" (priority only, alarms
        // only, total silence) can hold back a normal-priority notification.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            int filter = manager.getCurrentInterruptionFilter();
            state.put("dndActive",
                    filter != NotificationManager.INTERRUPTION_FILTER_ALL
                            && filter != NotificationManager.INTERRUPTION_FILTER_UNKNOWN);
        }
        return state;
    }
}
