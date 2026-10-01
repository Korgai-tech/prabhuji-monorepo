import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/firebase_notifications.dart';
import 'package:mobile/core/notification_analytics.dart';
import 'package:mobile/core/notification_tap_handler.dart';

import '../../support/fake_analytics.dart';

void main() {
  final now = DateTime.utc(2026, 9, 17, 10);
  late RecordingAnalytics analytics;
  late List<List<String>> navigations;
  late String location;
  late bool loggedIn;
  late bool pro;
  late int paywallOpens;
  late bool paywallGrantsPro;
  late NotificationTapHandler handler;

  setUp(() {
    analytics = RecordingAnalytics();
    navigations = [];
    location = '/splash';
    loggedIn = true;
    pro = true;
    paywallOpens = 0;
    paywallGrantsPro = false;
    handler = NotificationTapHandler(
      analytics: analytics,
      navigate: (stack) {
        navigations.add(stack);
        location = stack.last;
      },
      currentLocation: () => location,
      isLoggedIn: () => loggedIn,
      isProUser: () => pro,
      openPaywall: () async {
        paywallOpens++;
        navigations.add(['+/paywall']);
        if (paywallGrantsPro) pro = true;
        location = '/home';
      },
      settle: () async {},
      clock: () => now,
    );
  });

  NotificationTap tap(Map<String, dynamic> data, {DateTime? sentAt}) =>
      NotificationTap(
        data: data,
        source: TapSource.messageOpened,
        sentAt: sentAt,
      );

  const ids = {'notification_id': 'n1', 'campaign_id': 'c1'};

  test('click fires at once with ids, target and time to click', () {
    handler.handle(tap(
      {...ids, 'type': 'aarti_audio', 'id': 'a9'},
      sentAt: now.subtract(const Duration(seconds: 42, milliseconds: 500)),
    ));

    final props = analytics.propsFor(NotificationEvents.clicked);
    expect(props[NotificationEventProps.notificationId], 'n1');
    expect(props[NotificationEventProps.campaignId], 'c1');
    expect(props[NotificationEventProps.deeplinkTarget], '/aarti-bhajans/audio/a9');
    expect(props[NotificationEventProps.timeToClickSec], 42.5);
  });

  test('missing ids and send time are sent as null', () {
    handler.handle(tap({'type': 'mantras'}));

    final props = analytics.propsFor(NotificationEvents.clicked);
    expect(props.containsKey(NotificationEventProps.notificationId), isTrue);
    expect(props[NotificationEventProps.notificationId], isNull);
    expect(props[NotificationEventProps.timeToClickSec], isNull);
  });

  test('a tap before Home is parked, then routed when Home is reached',
      () async {
    handler.handle(tap({...ids, 'type': 'mantras'}));

    expect(navigations, isEmpty);
    expect(handler.parkedTap, isNotNull);
    expect(analytics.fired(NotificationEvents.clicked), isTrue);
    expect(analytics.fired(NotificationEvents.destinationOpened), isFalse);

    handler.onHomeReached();
    await pumpEventQueue();

    expect(navigations.single, ['/home', '/mantras']);
    expect(handler.parkedTap, isNull);
    final props = analytics.propsFor(NotificationEvents.destinationOpened);
    expect(props[NotificationEventProps.actualDestination], '/mantras');
    expect(props[NotificationEventProps.routingStatus],
        NotificationRoutingStatus.success);
    expect(props[NotificationEventProps.failureReason], isNull);
    expect(props[NotificationEventProps.notificationId], 'n1');
  });

  test('after Home, taps route immediately', () async {
    handler.onHomeReached();
    handler.handle(tap({'type': 'status'}));
    await pumpEventQueue();

    expect(navigations.single, ['/status']);
  });

  test('a logged-out tap parks even after Home was reached', () async {
    handler.onHomeReached();
    loggedIn = false;
    handler.handle(tap({'type': 'status'}));
    await pumpEventQueue();

    expect(navigations, isEmpty);
    expect(handler.parkedTap, isNotNull);
  });

  test('logout re-arms the Home gate', () async {
    handler.onHomeReached();
    handler.onLoggedOut();
    handler.handle(tap({'type': 'status'}));
    await pumpEventQueue();

    expect(navigations, isEmpty);
  });

  test('an unknown type falls back to Home', () async {
    handler.onHomeReached();
    handler.handle(tap({'type': 'something_new'}));
    await pumpEventQueue();

    expect(navigations.single, ['/home']);
    expect(analytics.propsFor(NotificationEvents.clicked)
        [NotificationEventProps.deeplinkTarget], 'something_new');
    final props = analytics.propsFor(NotificationEvents.destinationOpened);
    expect(props[NotificationEventProps.routingStatus],
        NotificationRoutingStatus.fallbackToHome);
    expect(props[NotificationEventProps.failureReason],
        NotificationRoutingFailure.unknownRoute);
    expect(props[NotificationEventProps.actualDestination], '/home');
  });

  test('a payload with no target falls back with missing_target', () async {
    handler.onHomeReached();
    handler.handle(tap(ids));
    await pumpEventQueue();

    expect(analytics.propsFor(NotificationEvents.clicked)
        [NotificationEventProps.deeplinkTarget], isNull);
    expect(
      analytics.propsFor(NotificationEvents.destinationOpened)
          [NotificationEventProps.failureReason],
      NotificationRoutingFailure.missingTarget,
    );
  });

  test('a guard redirect is reported with the real destination', () async {
    handler = NotificationTapHandler(
      analytics: analytics,
      navigate: (_) => location = '/paywall',
      currentLocation: () => location,
      isLoggedIn: () => true,
      isProUser: () => true,
      openPaywall: () async {},
      settle: () async {},
      clock: () => now,
    );
    handler.onHomeReached();
    handler.handle(tap({'type': 'ringtone', 'id': 'r1'}));
    await pumpEventQueue();

    final props = analytics.propsFor(NotificationEvents.destinationOpened);
    expect(props[NotificationEventProps.actualDestination], '/paywall');
    expect(props[NotificationEventProps.routingStatus],
        NotificationRoutingStatus.success);
    expect(props[NotificationEventProps.failureReason],
        NotificationRoutingFailure.redirected);
  });

  test('query strings do not count as a redirect', () async {
    handler.onHomeReached();
    handler.handle(tap({'path': '/wallpaper?highlight=w1'}));
    await pumpEventQueue();

    expect(
      analytics.propsFor(NotificationEvents.destinationOpened)
          [NotificationEventProps.failureReason],
      isNull,
    );
  });

  group('Pro gate', () {
    setUp(() {
      pro = false;
      handler.onHomeReached();
    });

    test('non-Pro: Home, then paywall; dismissed → stays on Home', () async {
      handler.handle(tap({...ids, 'type': 'mantras'}));
      await pumpEventQueue();

      expect(navigations, [
        ['/home'],
        ['+/paywall'],
      ]);
      final props = analytics.propsFor(NotificationEvents.destinationOpened);
      expect(props[NotificationEventProps.actualDestination], '/home');
      expect(props[NotificationEventProps.routingStatus],
          NotificationRoutingStatus.fallbackToHome);
      expect(props[NotificationEventProps.failureReason],
          NotificationRoutingFailure.notPro);
      expect(props[NotificationEventProps.notificationId], 'n1');
    });

    test('non-Pro who buys Pro on the paywall reaches the target over Home',
        () async {
      paywallGrantsPro = true;
      handler.handle(tap({'type': 'aarti_audio', 'id': 'a1'}));
      await pumpEventQueue();

      expect(navigations, [
        ['/home'],
        ['+/paywall'],
        ['/home', '/aarti-bhajans/audio/a1'],
      ]);
      final props = analytics.propsFor(NotificationEvents.destinationOpened);
      expect(props[NotificationEventProps.routingStatus],
          NotificationRoutingStatus.success);
      expect(props[NotificationEventProps.failureReason], isNull);
    });

    test('Home, the paywall itself and unknown targets are not gated',
        () async {
      handler.handle(tap({'type': 'home'}));
      handler.handle(tap({'type': 'paywall'}));
      handler.handle(tap({'type': 'something_new'}));
      await pumpEventQueue();

      expect(paywallOpens, 0);
      expect(navigations, [
        ['/home'],
        ['/home', '/paywall'],
        ['/home'],
      ]);
    });

    test('a parked tap is gated when it replays', () async {
      handler.onLoggedOut();
      handler.handle(tap({'type': 'status'}));
      handler.onHomeReached();
      await pumpEventQueue();

      expect(paywallOpens, 1);
      expect(navigations.last, ['+/paywall']);
    });
  });
}
