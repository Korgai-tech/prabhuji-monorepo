import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/audio/application/audio_providers.dart';
import 'package:mobile/features/audio/domain/audio_item.dart';
import 'package:mobile/features/paywall/data/payment_repository.dart';
import 'package:mobile/features/profile/application/subscription_cancel_providers.dart';
import 'package:mobile/features/profile/application/subscription_cancel_api.dart';
import 'package:mobile/features/profile/application/subscription_cancel_types.dart';
import 'package:mobile/features/status/data/status_models.dart';
import 'package:mobile/features/status/data/status_repository.dart';
import 'package:mobile/features/status/status_providers.dart';
import 'package:mobile/state/providers.dart';

import '../support/fake_audio_engine.dart';
import '../support/fake_auth_store.dart';
import '../support/profile_harness.dart';

/// Regression suite for the logout→login identity leak.
///
/// The app's `ProviderScope` is created once in `main()` and SURVIVES logout
/// — `handleLogout` only navigates to `/phone-input`. Every user-scoped
/// provider here is keepAlive (the legacy Riverpod constructors default to
/// `isAutoDispose: false`), so without an identity dependency their cached
/// value outlived the session that produced it and the NEXT user on the same
/// device read the previous user's row. These tests pin the dependency.
void main() {
  group('authIdentityProvider', () {
    test('is the JWT sub claim, and null when logged out', () {
      expect(AuthIdentityNotifier.identityOf(null), isNull);
      expect(AuthIdentityNotifier.identityOf(jwtFor('user-a')), 'user-a');
    });

    test('falls back to the raw token when the JWT cannot be decoded', () {
      // "Unparseable" must NOT collapse to one shared identity — that would
      // let two users with malformed tokens share a cache.
      expect(AuthIdentityNotifier.identityOf('garbage'), 'garbage');
      expect(AuthIdentityNotifier.identityOf('other'), 'other');
    });

    test('tracks login and logout on AuthStore.changes', () async {
      final auth = FakeAuthStore(token: jwtFor('user-a'));
      final container = ProviderContainer(
        overrides: [authStoreProvider.overrideWithValue(auth)],
      );
      addTearDown(container.dispose);
      // Keep the notifier alive so its subscription stays open.
      container.listen(authIdentityProvider, (_, _) {});

      expect(container.read(authIdentityProvider), 'user-a');

      await auth.clear();
      expect(container.read(authIdentityProvider), isNull);

      await auth.write(jwtFor('user-b'));
      expect(container.read(authIdentityProvider), 'user-b');
    });
  });

  group('statusProfileProvider is scoped to the signed-in user', () {
    test('refetches when a different user signs in on the same scope',
        () async {
      final auth = FakeAuthStore(token: jwtFor('user-a'));
      final repo = _IdentityStatusRepository(auth);
      final container = ProviderContainer(
        overrides: [
          authStoreProvider.overrideWithValue(auth),
          statusRepositoryProvider.overrideWithValue(repo),
        ],
      );
      addTearDown(container.dispose);
      container.listen(statusProfileProvider, (_, _) {});

      final first = await container.read(statusProfileProvider.future);
      expect(first.personalDisplayName, 'Name of user-a');
      expect(repo.fetchCalls, 1);

      // Logout → login as someone else, WITHOUT tearing down the scope —
      // exactly what `handleLogout` + a fresh OTP verify do.
      await auth.clear();
      await auth.write(jwtFor('user-b'));

      final second = await container.read(statusProfileProvider.future);
      expect(second.personalDisplayName, 'Name of user-b',
          reason: 'user B must not inherit user A cached display name');
      expect(repo.fetchCalls, greaterThan(1));
    });

    test('returns the empty row without hitting the API when logged out',
        () async {
      final auth = FakeAuthStore(token: null);
      final repo = _IdentityStatusRepository(auth);
      final container = ProviderContainer(
        overrides: [
          authStoreProvider.overrideWithValue(auth),
          statusRepositoryProvider.overrideWithValue(repo),
        ],
      );
      addTearDown(container.dispose);

      final profile = await container.read(statusProfileProvider.future);
      expect(profile.personalDisplayName, isNull);
      expect(repo.fetchCalls, 0,
          reason: 'a logged-out fetch would only earn a 401');
    });
  });

  group('billing providers are scoped to the signed-in user', () {
    test('mandateSnapshotProvider refetches on user change and short-circuits '
        'when logged out', () async {
      final auth = FakeAuthStore(token: jwtFor('user-a'));
      final repo = _CountingPaymentRepository();
      final container = ProviderContainer(
        overrides: [
          authStoreProvider.overrideWithValue(auth),
          paymentRepositoryProvider.overrideWithValue(repo),
        ],
      );
      addTearDown(container.dispose);
      container.listen(mandateSnapshotProvider, (_, _) {});

      await container.read(mandateSnapshotProvider.future);
      expect(repo.getMandateCalls, 1);

      await auth.clear();
      expect(await container.read(mandateSnapshotProvider.future), isNull);
      expect(repo.getMandateCalls, 1,
          reason: 'logged out must not fire a mandate fetch');

      await auth.write(jwtFor('user-b'));
      await container.read(mandateSnapshotProvider.future);
      expect(repo.getMandateCalls, 2,
          reason: 'user B must not inherit user A mandate snapshot');
    });

    test('latestCancelRequestProvider refetches on user change', () async {
      final auth = FakeAuthStore(token: jwtFor('user-a'));
      final api = _CountingCancelApi();
      final container = ProviderContainer(
        overrides: [
          authStoreProvider.overrideWithValue(auth),
          subscriptionCancelApiProvider.overrideWithValue(api),
        ],
      );
      addTearDown(container.dispose);
      container.listen(latestCancelRequestProvider, (_, _) {});

      await container.read(latestCancelRequestProvider.future);
      expect(api.getLatestCalls, 1);

      await auth.clear();
      await auth.write(jwtFor('user-b'));

      await container.read(latestCancelRequestProvider.future);
      expect(api.getLatestCalls, 2);
    });
  });

  group('audio playback does not outlive the session that started it', () {
    test('logging out stops the engine and dismisses the mini-player',
        () async {
      final auth = FakeAuthStore(token: jwtFor('user-a'));
      final engine = FakeAudioEngine();
      final container = ProviderContainer(
        overrides: [
          authStoreProvider.overrideWithValue(auth),
          audioEngineProvider.overrideWithValue(engine),
        ],
      );
      addTearDown(container.dispose);
      container.listen(audioControllerProvider, (_, _) {});

      await container.read(audioControllerProvider.notifier).play(
            const AudioItem(
              id: 'aarti-1',
              title: 'Om Jai Jagdish Hare',
              audioUrl: 'https://cdn.example/aarti-1.mp3',
            ),
          );
      expect(container.read(audioControllerProvider).currentItem, isNotNull);
      expect(engine.loadedUrl, isNotNull);

      await auth.clear();
      // `stop()` is fired unawaited from the identity listener.
      await Future<void>.delayed(Duration.zero);

      expect(engine.calls, contains('stop'));
      expect(container.read(audioControllerProvider).currentItem, isNull,
          reason: 'the mini-player must not survive into the next session');
    });

    test('a login transition with nothing loaded never touches the engine',
        () async {
      final auth = FakeAuthStore(token: null);
      final engine = FakeAudioEngine();
      final container = ProviderContainer(
        overrides: [
          authStoreProvider.overrideWithValue(auth),
          audioEngineProvider.overrideWithValue(engine),
        ],
      );
      addTearDown(container.dispose);
      container.listen(audioControllerProvider, (_, _) {});

      await auth.write(jwtFor('user-a'));
      await Future<void>.delayed(Duration.zero);

      expect(engine.calls, isEmpty);
    });
  });

  group('Profile v2 renders the signed-in user', () {
    testWidgets('display name switches when a new user logs in on the same '
        'app session', (tester) async {
      final auth = FakeAuthStore(token: jwtFor('user-a'));
      await pumpProfileScreenV2(
        tester,
        authStore: auth,
        repository: _IdentityStatusRepository(auth),
        liveStatusProfile: true,
        me: meUserFixture(name: 'Account Name'),
      );
      expect(find.text('Name of user-a'), findsOneWidget);

      await auth.clear();
      await auth.write(jwtFor('user-b'));
      await tester.pumpAndSettle();

      expect(find.text('Name of user-b'), findsOneWidget);
      expect(find.text('Name of user-a'), findsNothing);
    });
  });
}

/// A JWT whose payload is `{"sub": <id>}` — the shape our api mints. The
/// signature is never verified client-side (see `lib/core/jwt.dart`), so a
/// placeholder is enough.
String jwtFor(String userId) {
  String enc(Object o) =>
      base64Url.encode(utf8.encode(jsonEncode(o))).replaceAll('=', '');
  return '${enc({'alg': 'HS256'})}.${enc({'sub': userId})}.sig';
}

/// Returns a profile whose display name is derived from the CURRENT token, so
/// a stale cache is visible as a stale name.
class _IdentityStatusRepository implements StatusRepository {
  _IdentityStatusRepository(this._auth);

  final FakeAuthStore _auth;
  int fetchCalls = 0;

  @override
  Future<StatusProfileData> fetchProfile() async {
    fetchCalls++;
    final identity = AuthIdentityNotifier.identityOf(_auth.read()) ?? 'nobody';
    return StatusProfileData(
      activeProfileType: StatusProfileType.personal,
      personalDisplayName: 'Name of $identity',
    );
  }

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnimplementedError('${invocation.memberName} not stubbed');
}

class _CountingPaymentRepository implements PaymentRepository {
  int getMandateCalls = 0;

  @override
  Future<MandateSnapshot?> getMandate() async {
    getMandateCalls++;
    return null;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnimplementedError('${invocation.memberName} not stubbed');
}

class _CountingCancelApi implements SubscriptionCancelApi {
  int getLatestCalls = 0;

  @override
  Future<CancellationRequestData?> getLatestCancelRequest() async {
    getLatestCalls++;
    return null;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnimplementedError('${invocation.memberName} not stubbed');
}
