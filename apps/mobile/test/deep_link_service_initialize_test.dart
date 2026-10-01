import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/app_config.dart';
import 'package:mobile/core/deep_link_service.dart';
import 'package:mobile/core/install_referrer_reader.dart';
import 'package:mobile/core/pending_intent_store.dart';
import 'package:mobile/core/shared_analytics.dart';

/// Coverage matrix (TAM-124):
///   - initialize() reads the initial (cold-start) URI once and dispatches it
///   - subsequent URIs on the stream dispatch with source='warm_resume'
///   - install-referrer read fires and parks a pending intent when the
///     recovered path is a /app/* URL
///   - install-referrer read is ignored when the recovered value isn't /app/*
///   - percent-encoded referrer values are decoded then routed
///   - initialize() is idempotent (second call no-ops)
///   - a cold-start exception on getInitialLink doesn't crash boot
///   - dispose() cancels the stream subscription

class _FakeStorage implements PendingIntentStorage {
  String? value;
  @override
  Future<String?> read() async => value;
  @override
  Future<void> write(String v) async => value = v;
  @override
  Future<void> delete() async => value = null;
}

class _FakeInstallReferrer implements InstallReferrerReader {
  _FakeInstallReferrer(this.value);
  final String? value;
  int reads = 0;
  @override
  bool get lastReadFailed => false;
  @override
  Future<InstallReferrerData?> read() async {
    reads++;
    if (value == null) return null;
    return InstallReferrerData(
      raw: value!,
      attribution: PlayInstallReferrerReader.parseAttribution(value!),
    );
  }
}

class _Spy {
  /// Stacks, not single paths — see `navigation_stack.dart`. [navigated]
  /// exposes just the destination of each, which is all this suite asserts.
  final List<List<String>> stacks = [];
  List<String> get navigated => [for (final s in stacks) s.last];

  int pushPaywallCount = 0;
  final List<({String name, Map<String, Object?> properties})> events = [];

  DeepLinkService build({
    required PendingIntentStore store,
    required Future<Uri?> Function() initialUri,
    required Stream<Uri> uriStream,
    InstallReferrerReader? referrer,
    bool loggedIn = true,
    bool pro = true,
  }) {
    return DeepLinkService(
      pendingIntentStore: store,
      isLoggedIn: () => loggedIn,
      isProUser: () => pro,
      navigateToStack: stacks.add,
      pushPaywall: () => pushPaywallCount++,
      trackEvent: (n, p) => events.add((name: n, properties: p)),
      initialUri: initialUri,
      uriStream: uriStream,
      installReferrerReader: referrer,
    );
  }
}

void main() {
  setUpAll(() {
    // The install-referrer path reconstructs `<shareHost>/<referrer path>`;
    // seed a deterministic host so the reconstructed URI is stable.
    AppConfig.debugSetInstance(
      AppConfig.forTest(shareHost: 'https://share.test.invalid'),
    );
  });

  group('DeepLinkService.initialize — cold-start URI', () {
    test('dispatches the initial URI once', () async {
      final store = PendingIntentStore(storage: _FakeStorage());
      final spy = _Spy();
      final svc = spy.build(
        store: store,
        initialUri: () async => Uri.parse('prabhuji://aarti/audio-1'),
        uriStream: const Stream<Uri>.empty(),
      );

      await svc.initialize();
      // Give any queued microtasks a chance to run.
      await Future<void>.delayed(Duration.zero);

      expect(spy.navigated, ['/aarti-bhajans/audio/audio-1']);
      final received = spy.events.firstWhere(
          (e) => e.name == SharedAnalyticsEvents.deepLinkReceived);
      expect(received.properties['source'], 'cold_start');
    });

    test('null initial URI is a no-op', () async {
      final store = PendingIntentStore(storage: _FakeStorage());
      final spy = _Spy();
      final svc = spy.build(
        store: store,
        initialUri: () async => null,
        uriStream: const Stream<Uri>.empty(),
      );

      await svc.initialize();

      expect(spy.navigated, isEmpty);
      expect(spy.events, isEmpty);
    });

    test('a cold-start throw does NOT crash initialize', () async {
      final store = PendingIntentStore(storage: _FakeStorage());
      final spy = _Spy();
      final svc = spy.build(
        store: store,
        initialUri: () async => throw StateError('platform channel down'),
        uriStream: const Stream<Uri>.empty(),
      );

      // Would throw if initialize didn't swallow the platform error.
      await svc.initialize();

      expect(spy.navigated, isEmpty);
    });
  });

  group('DeepLinkService.initialize — warm-resume stream', () {
    test('subsequent URIs dispatch with source=warm_resume', () async {
      final store = PendingIntentStore(storage: _FakeStorage());
      final controller = StreamController<Uri>.broadcast();
      final spy = _Spy();
      final svc = spy.build(
        store: store,
        initialUri: () async => null,
        uriStream: controller.stream,
      );

      await svc.initialize();
      controller.add(Uri.parse('prabhuji://book/geeta'));
      await Future<void>.delayed(Duration.zero);

      expect(spy.navigated, ['/books/geeta/contents']);
      expect(
        spy.events
            .firstWhere(
                (e) => e.name == SharedAnalyticsEvents.deepLinkReceived)
            .properties['source'],
        'warm_resume',
      );

      await controller.close();
      await svc.dispose();
    });
  });

  group('DeepLinkService.initialize — Install Referrer', () {
    test('recovers /app/* path and parks a pending intent', () async {
      final storage = _FakeStorage();
      final store = PendingIntentStore(storage: storage);
      final spy = _Spy();
      final svc = spy.build(
        store: store,
        initialUri: () async => null,
        uriStream: const Stream<Uri>.empty(),
        referrer: _FakeInstallReferrer('/app/horoscope/leo'),
      );

      await svc.initialize();
      await Future<void>.delayed(Duration.zero);

      expect(storage.value, isNotNull,
          reason: 'referrer path should be parked as a pending intent');
      // The pending intent's URI is the reconstructed full URL.
      final consumed = await store.consumeOnce();
      expect(consumed, Uri.parse('https://share.test.invalid/app/horoscope/leo'));
    });

    test('percent-encoded referrer is decoded before routing', () async {
      final storage = _FakeStorage();
      final store = PendingIntentStore(storage: storage);
      final spy = _Spy();
      final svc = spy.build(
        store: store,
        initialUri: () async => null,
        uriStream: const Stream<Uri>.empty(),
        referrer: _FakeInstallReferrer('%2Fapp%2Faarti%2Fa1'),
      );

      await svc.initialize();
      await Future<void>.delayed(Duration.zero);

      final consumed = await store.consumeOnce();
      expect(consumed, Uri.parse('https://share.test.invalid/app/aarti/a1'));
    });

    test('non-/app referrer (ad-campaign UTM) is ignored', () async {
      final storage = _FakeStorage();
      final store = PendingIntentStore(storage: storage);
      final spy = _Spy();
      final svc = spy.build(
        store: store,
        initialUri: () async => null,
        uriStream: const Stream<Uri>.empty(),
        referrer: _FakeInstallReferrer(
            'utm_source=googleadwords&utm_medium=cpc&campaign=diwali'),
      );

      await svc.initialize();
      await Future<void>.delayed(Duration.zero);

      expect(storage.value, isNull);
    });

    test('null / empty referrer is ignored', () async {
      final store = PendingIntentStore(storage: _FakeStorage());
      final spy = _Spy();
      final svc = spy.build(
        store: store,
        initialUri: () async => null,
        uriStream: const Stream<Uri>.empty(),
        referrer: _FakeInstallReferrer(null),
      );

      await svc.initialize();
      // Doesn't blow up; no side effects.
      expect(spy.navigated, isEmpty);
    });
  });

  group('DeepLinkService.initialize — idempotence + lifecycle', () {
    test('a second initialize() call no-ops (no double-dispatch)', () async {
      final store = PendingIntentStore(storage: _FakeStorage());
      var initialReads = 0;
      final spy = _Spy();
      final svc = spy.build(
        store: store,
        initialUri: () async {
          initialReads++;
          return Uri.parse('prabhuji://aarti/audio-1');
        },
        uriStream: const Stream<Uri>.empty(),
      );

      await svc.initialize();
      await svc.initialize(); // second call

      expect(initialReads, 1);
      expect(spy.navigated, ['/aarti-bhajans/audio/audio-1'],
          reason: 'target is dispatched exactly once');
    });

    test('dispose() cancels the URI stream subscription', () async {
      final store = PendingIntentStore(storage: _FakeStorage());
      final controller = StreamController<Uri>.broadcast();
      final spy = _Spy();
      final svc = spy.build(
        store: store,
        initialUri: () async => null,
        uriStream: controller.stream,
      );

      await svc.initialize();
      await svc.dispose();

      // After dispose, a URI on the stream must NOT reach handleUri.
      controller.add(Uri.parse('prabhuji://aarti/audio-99'));
      await Future<void>.delayed(Duration.zero);

      expect(spy.navigated, isEmpty);
      await controller.close();
    });
  });
}
