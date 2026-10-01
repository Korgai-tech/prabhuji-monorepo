import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/app_config.dart';
import 'package:mobile/core/secrets.dart';
import 'package:mobile/core/services/clarity_service.dart';

/// Unit tests for [ClarityService] (TAM-127).
///
/// The seam's contract:
///
///   1. `flutter test` runs in debug mode ⇒ the `kReleaseMode` gate must
///      short-circuit BEFORE any SDK method is called. This is the primary
///      test-mode branch — every CI run through `flutter test` exercises it.
///   2. A fresh dev clone / a placeholder secrets file ⇒ the
///      `clarityEnabled` gate must short-circuit BEFORE any SDK method is
///      called.
///
/// We deliberately do NOT try to drive a real Clarity SDK boot from a
/// widget test — the SDK reaches for a `MediaQuery` ancestor, a bundled
/// `PackageInfo` platform channel, and an application cache directory,
/// none of which are cleanly available under `flutter test`. The gate
/// contract is the interesting property; the SDK's own initialisation
/// behaviour is the SDK's own concern.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    ClarityService.debugResetInstance();
    AppConfig.debugSetInstance(AppConfig.forTest(environment: 'test'));
  });

  tearDown(() {
    Secrets.debugSetInstance(null);
  });

  group('ClarityService — release-mode gate (primary test-mode branch)', () {
    testWidgets(
      'initialize is a no-op in debug (widget-test) mode — placeholder key',
      (tester) async {
        Secrets.debugSetInstance(Secrets.forTest(
          clarityProjectId: 'REPLACE_ME_CLARITY_PROJECT_ID',
        ));
        final service = ClarityService();
        await _initializeUnderContext(tester, service, userId: 'user-a');
        expect(service.isInitialized, isFalse);
        expect(service.initializedUserId, isNull);
      },
    );

    testWidgets(
      'initialize is a no-op in debug mode even with a real project id',
      (tester) async {
        // Even when a dev has a REAL project id on their machine, the
        // release-mode gate must fire FIRST — no local `flutter run`
        // (debug) or `flutter test` traffic can ever reach the Clarity
        // dashboard. This is the load-bearing guarantee of the whole
        // "release builds only" AC.
        Secrets.debugSetInstance(Secrets.forTest(
          clarityProjectId: 'real-looking-project-id',
        ));
        final service = ClarityService();
        await _initializeUnderContext(tester, service, userId: 'user-a');
        expect(service.isInitialized, isFalse);
        expect(service.initializedUserId, isNull);
      },
    );

    testWidgets(
      'a second initialize call with a different user is still a no-op '
      'in debug mode',
      (tester) async {
        Secrets.debugSetInstance(Secrets.forTest(
          clarityProjectId: 'real-looking-project-id',
        ));
        final service = ClarityService();
        await _initializeUnderContext(tester, service, userId: 'user-a');
        await _initializeUnderContext(tester, service, userId: 'user-b');
        expect(service.isInitialized, isFalse);
        expect(service.initializedUserId, isNull);
      },
    );
  });

  group('ClarityService — verbs short-circuit before init', () {
    test('setTag / event / setCurrentScreen / setSubscription are no-ops',
        () {
      Secrets.debugSetInstance(Secrets.forTest());
      final service = ClarityService();
      // None of these should throw or call into the SDK — they all gate
      // on `_isInitialized`, which is false on a fresh instance.
      expect(() => service.setTag('foo', 'bar'), returnsNormally);
      expect(() => service.setTag('', ''), returnsNormally); // empties too
      expect(() => service.event('hello'), returnsNormally);
      expect(() => service.event(''), returnsNormally); // empties too
      expect(() => service.setCurrentScreen('home'), returnsNormally);
      expect(() => service.setCurrentScreen(''), returnsNormally);
      expect(() => service.setSubscription(isPro: true), returnsNormally);
      expect(() => service.setSubscription(isPro: false), returnsNormally);
      expect(service.isInitialized, isFalse);
    });
  });

  group('ClarityService — reset()', () {
    test('reset is safe on a fresh instance and leaves flags clear', () {
      final service = ClarityService();
      expect(() => service.reset(), returnsNormally);
      expect(service.isInitialized, isFalse);
      expect(service.initializedUserId, isNull);
    });
  });

  group('ClarityService — singleton', () {
    test('same instance across factory calls', () {
      final a = ClarityService();
      final b = ClarityService();
      expect(identical(a, b), isTrue);
    });

    test('debugResetInstance swaps for a fresh instance', () {
      final before = ClarityService();
      ClarityService.debugResetInstance();
      final after = ClarityService();
      expect(identical(before, after), isFalse);
    });
  });

  group('Secrets.clarityEnabled — the gate consumed by initialize()', () {
    test('false when clarityProjectId is null', () {
      Secrets.debugSetInstance(Secrets.forTest(clarityProjectId: null));
      expect(Secrets.instance.clarityEnabled, isFalse);
    });

    test('false when clarityProjectId is REPLACE_ME_* placeholder', () {
      Secrets.debugSetInstance(Secrets.forTest(
        clarityProjectId: 'REPLACE_ME_CLARITY_PROJECT_ID',
      ));
      expect(Secrets.instance.clarityEnabled, isFalse);
    });

    test('false when clarityProjectId is empty', () {
      Secrets.debugSetInstance(Secrets.forTest(clarityProjectId: ''));
      expect(Secrets.instance.clarityEnabled, isFalse);
    });

    test('true when clarityProjectId is a real value', () {
      Secrets.debugSetInstance(Secrets.forTest(clarityProjectId: 'p1a2b3c4'));
      expect(Secrets.instance.clarityEnabled, isTrue);
    });
  });
}

/// Pumps a minimal widget tree so [ClarityService.initialize] has a real
/// [BuildContext] to work with. In debug mode (which every widget test is)
/// the release-mode gate fires first, so the SDK's own MediaQuery /
/// PackageInfo hoops are never actually reached.
Future<void> _initializeUnderContext(
  WidgetTester tester,
  ClarityService service, {
  String? userId,
}) async {
  late BuildContext capturedContext;
  await tester.pumpWidget(MaterialApp(
    home: Builder(
      builder: (context) {
        capturedContext = context;
        return const SizedBox.shrink();
      },
    ),
  ));
  await service.initialize(capturedContext, userId: userId);
}
