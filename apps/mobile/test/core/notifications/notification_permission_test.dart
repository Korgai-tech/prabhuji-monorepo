import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/notification_analytics.dart';
import 'package:mobile/core/notification_permission.dart';
import 'package:permission_handler/permission_handler.dart';

import '../../support/fake_analytics.dart';

void main() {
  /// A permission whose dialog "takes" [dialogTime] and ends in [result],
  /// with rationale moving from [rationaleBefore] to [rationaleAfter].
  NotificationPermission permission({
    PermissionStatus before = PermissionStatus.denied,
    PermissionStatus result = PermissionStatus.denied,
    bool rationaleBefore = false,
    bool rationaleAfter = false,
    int? sdk = 34,
    Duration dialogTime = const Duration(seconds: 2),
    List<String>? calls,
  }) {
    var now = DateTime(2026);
    var requested = false;
    return NotificationPermission(
      status: () async => requested ? result : before,
      request: () async {
        calls?.add('request');
        requested = true;
        now = now.add(dialogTime);
        return result;
      },
      shouldShowRationale: () async =>
          requested ? rationaleAfter : rationaleBefore,
      androidSdkInt: () async => sdk,
      requestNonAndroid: () async => calls?.add('non_android'),
      clock: () => now,
    );
  }

  group('requestAndClassify', () {
    test('allow → granted', () async {
      expect(
        await permission(result: PermissionStatus.granted).requestAndClassify(),
        PushPermissionValue.granted,
      );
    });

    test('first Don\'t allow flips rationale → denied', () async {
      expect(
        await permission(rationaleAfter: true).requestAndClassify(),
        PushPermissionValue.denied,
      );
    });

    test('second Don\'t allow comes back permanently denied → denied', () async {
      expect(
        await permission(
          rationaleBefore: true,
          result: PermissionStatus.permanentlyDenied,
        ).requestAndClassify(),
        PushPermissionValue.denied,
      );
    });

    test('backing out leaves rationale unchanged → dismissed', () async {
      expect(await permission().requestAndClassify(), PushPermissionValue.dismissed);
      expect(
        await permission(rationaleBefore: true, rationaleAfter: true)
            .requestAndClassify(),
        PushPermissionValue.dismissed,
      );
    });

    test('no dialog when already granted or permanently denied', () async {
      final calls = <String>[];
      expect(
        await permission(before: PermissionStatus.granted, calls: calls)
            .requestAndClassify(),
        isNull,
      );
      expect(
        await permission(before: PermissionStatus.permanentlyDenied, calls: calls)
            .requestAndClassify(),
        isNull,
      );
      expect(calls, isEmpty);
    });

    test('an instant answer showed no dialog → null', () async {
      expect(
        await permission(dialogTime: const Duration(milliseconds: 50))
            .requestAndClassify(),
        isNull,
      );
    });

    test('below Android 13 there is no dialog', () async {
      final calls = <String>[];
      expect(await permission(sdk: 31, calls: calls).requestAndClassify(), isNull);
      expect(calls, isEmpty);
    });

    test('off Android the ask is delegated and not classified', () async {
      final calls = <String>[];
      expect(await permission(sdk: null, calls: calls).requestAndClassify(), isNull);
      expect(calls, ['non_android']);
    });

    test('a throwing platform never escapes', () async {
      final p = NotificationPermission(
        status: () async => throw Exception('channel'),
        androidSdkInt: () async => 34,
      );
      expect(await p.requestAndClassify(), isNull);
    });
  });

  group('askNotificationPermission', () {
    test('dismissed → result(dismissed) + dismissed event', () async {
      final analytics = RecordingAnalytics();
      await askNotificationPermission(permission(), analytics);

      expect(analytics.names, [
        NotificationEvents.permissionResult,
        NotificationEvents.permissionDismissed,
      ]);
      expect(
        analytics.propsFor(NotificationEvents.permissionResult)
            [NotificationEventProps.permissionStatus],
        PushPermissionValue.dismissed,
      );
    });

    test('granted / denied → result only', () async {
      final analytics = RecordingAnalytics();
      await askNotificationPermission(
          permission(result: PermissionStatus.granted), analytics);
      await askNotificationPermission(
          permission(rationaleAfter: true), analytics);

      expect(analytics.names, [
        NotificationEvents.permissionResult,
        NotificationEvents.permissionResult,
      ]);
      expect(
        analytics.allProps(NotificationEvents.permissionResult)
            .map((p) => p[NotificationEventProps.permissionStatus]),
        [PushPermissionValue.granted, PushPermissionValue.denied],
      );
    });

    test('no dialog → nothing', () async {
      final analytics = RecordingAnalytics();
      await askNotificationPermission(
          permission(before: PermissionStatus.granted), analytics);
      expect(analytics.events, isEmpty);
    });
  });
}
