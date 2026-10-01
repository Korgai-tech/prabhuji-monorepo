import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/notification_analytics.dart';
import 'package:mobile/core/notification_background_receipt.dart';
import 'package:notification_state/notification_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../support/fake_analytics.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('suppressedReasonFor', () {
    test('shown when nothing blocks it', () {
      expect(suppressedReasonFor(NotificationDeviceState.unknown), isNull);
      expect(
        suppressedReasonFor(const NotificationDeviceState(
          notificationsEnabled: true,
          channelEnabled: true,
          dndActive: false,
        )),
        isNull,
      );
    });

    test('precedence: permission > channel > dnd > foreground', () {
      const all = NotificationDeviceState(
        notificationsEnabled: false,
        channelEnabled: false,
        dndActive: true,
      );
      expect(suppressedReasonFor(all, heldInForeground: true),
          NotificationSuppressedReason.permissionOff);
      expect(
        suppressedReasonFor(const NotificationDeviceState(
          channelEnabled: false,
          dndActive: true,
        )),
        NotificationSuppressedReason.channelOff,
      );
      expect(
        suppressedReasonFor(const NotificationDeviceState(dndActive: true),
            heldInForeground: true),
        NotificationSuppressedReason.dnd,
      );
      expect(
        suppressedReasonFor(NotificationDeviceState.unknown,
            heldInForeground: true),
        NotificationSuppressedReason.inForeground,
      );
    });
  });

  test('notificationIdentityProps reads the data keys, blanks to null', () {
    expect(notificationIdentityProps({'notification_id': 'n1', 'campaign_id': ''}), {
      NotificationEventProps.notificationId: 'n1',
      NotificationEventProps.campaignId: null,
    });
  });

  group('NotificationStateReader', () {
    const channel = MethodChannel('prabhuji/notification_state');
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    tearDown(() => messenger.setMockMethodCallHandler(channel, null));

    test('maps the platform answer', () async {
      Object? args;
      messenger.setMockMethodCallHandler(channel, (call) async {
        args = call.arguments;
        return {'notificationsEnabled': true, 'channelEnabled': false, 'dndActive': true};
      });
      final state =
          await const NotificationStateReader().read(channelId: 'prabhuji_default');
      expect(args, {'channelId': 'prabhuji_default'});
      expect(state.notificationsEnabled, isTrue);
      expect(state.channelEnabled, isFalse);
      expect(state.dndActive, isTrue);
    });

    test('no platform handler → unknown', () async {
      final state = await const NotificationStateReader().read();
      expect(state.notificationsEnabled, isNull);
      expect(state.dndActive, isNull);
    });
  });

  group('drainPendingNotificationReceipts', () {
    test('replays parked receipts once, keeping their ids and time', () async {
      final parked = {
        'event_id': 'e1',
        'event_timestamp': '2026-09-17T04:00:00.000Z',
        NotificationEventProps.notificationId: 'n1',
        NotificationEventProps.appState: NotificationAppState.killed,
      };
      SharedPreferences.setMockInitialValues({
        'notification_received.pending': [jsonEncode(parked), 'not json'],
      });
      final prefs = await SharedPreferences.getInstance();
      final analytics = RecordingAnalytics();

      await drainPendingNotificationReceipts(
        analytics: analytics,
        preferences: prefs,
      );
      await drainPendingNotificationReceipts(
        analytics: analytics,
        preferences: prefs,
      );

      expect(analytics.allProps(NotificationEvents.received), [parked]);
      expect(prefs.getStringList('notification_received.pending'), isNull);
    });
  });
}
