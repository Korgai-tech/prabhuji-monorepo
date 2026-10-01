import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/api/generated/openapi.dart';
import 'package:get_it/get_it.dart';
import 'package:mobile/core/auth_store.dart';
import 'package:mobile/core/entitlement.dart';
import 'package:mobile/features/paywall/data/subscription_repository.dart';

import 'support/fake_auth_store.dart';
import 'support/fake_repositories.dart';

/// In-memory replacement for `SecureEntitlementStorage` — persistence is now
/// baked into the notifier (secure storage-backed), so every test that
/// touches `seed()` / `clear()` needs to override the provider with a
/// storage seam that doesn't hit the platform channel.
class _FakeEntitlementStorage implements EntitlementStorage {
  Entitlement? value;

  @override
  Future<Entitlement?> read() async => value;

  @override
  Future<void> write(Entitlement e) async => value = e;

  @override
  Future<void> delete() async => value = null;
}

/// The cached entitlement decision, and the deadline that bounds it.
///
/// `refresh()` deliberately keeps the previous value on a network error —
/// revoking a paying user's UI on a dropped packet is hostile. The cost used to
/// be that a `true` never expired: a user whose trial ended while the app was
/// backgrounded kept a Pro UI indefinitely, and every failed refresh renewed it.
///
/// Carrying the server's deadline fixes that without giving the client the rule.
/// The asymmetry asserted below is the whole design: it may REVOKE, never GRANT.
SubscriptionSnapshot _snap({required bool pro, DateTime? until}) =>
    SubscriptionSnapshot(
      status: pro ? SubscriptionStatusEnum.active : SubscriptionStatusEnum.free,
      isPro: pro,
      activePlanId: null,
      activeProductId: null,
      provider: null,
      expiresAt: null,
      trialEndsAt: null,
      entitledUntil: until,
    );

void main() {
  group('Entitlement', () {
    test('a grant with no deadline stays Pro', () {
      // Null means "nothing to expire" — a lifetime grant, which is exactly
      // what devtools writes. It must not read as "expired".
      const e = Entitlement(granted: true, until: null);
      expect(e.isPro, isTrue);
    });

    test('a grant whose deadline has passed is no longer Pro', () {
      final e = Entitlement(
        granted: true,
        until: DateTime.now().subtract(const Duration(seconds: 1)),
      );
      expect(e.isPro, isFalse);
    });

    test('a grant with a future deadline is Pro', () {
      final e = Entitlement(
        granted: true,
        until: DateTime.now().add(const Duration(hours: 1)),
      );
      expect(e.isPro, isTrue);
    });

    test('a future deadline cannot make a non-grant Pro', () {
      // The direction that matters: the client may only ever narrow the
      // server's answer. A deadline is not permission.
      final e = Entitlement(
        granted: false,
        until: DateTime.now().add(const Duration(days: 30)),
      );
      expect(e.isPro, isFalse);
    });

    test('the free constructor is not Pro', () {
      expect(const Entitlement.free().isPro, isFalse);
    });
  });

  group('EntitlementNotifier', () {
    late ProviderContainer container;
    late _FakeEntitlementStorage storage;

    setUp(() {
      storage = _FakeEntitlementStorage();
      container = ProviderContainer(overrides: [
        // Notifier is now persistence-backed — inject an in-memory storage
        // so tests don't hit the real flutter_secure_storage platform
        // channel (which throws under `flutter test`).
        entitlementStateProvider
            .overrideWith(() => EntitlementNotifier(storage)),
      ]);
    });
    tearDown(() => container.dispose());

    EntitlementNotifier notifier() =>
        container.read(entitlementStateProvider.notifier);

    test('seed carries the deadline from the snapshot', () {
      final until = DateTime.now().add(const Duration(days: 1));
      notifier().seed(_snap(pro: true, until: until));

      expect(container.read(entitlementStateProvider).until, until);
      // The derived bool provider is what ~10 widgets read.
      expect(container.read(entitlementProvider), isTrue);
    });

    test('seeding a snapshot whose deadline has passed is not Pro', () {
      notifier().seed(_snap(
        pro: true,
        until: DateTime.now().subtract(const Duration(minutes: 1)),
      ));
      // The server said `isEntitled: true` at fetch time; the deadline has since
      // gone by. The client narrows without needing to be told again.
      expect(container.read(entitlementProvider), isFalse);
    });

    test('clear drops to free', () {
      notifier().seed(_snap(pro: true, until: null));
      notifier().clear();
      expect(container.read(entitlementProvider), isFalse);
      expect(container.read(entitlementStateProvider).until, isNull);
    });

    // ---- persistence contract (post-payment resilience) -------------------

    test(
        'seed() writes to storage — a subsequent hydrate on a fresh notifier '
        'restores the same Pro decision', () async {
      // This is the whole point of persistence: user pays → seed fires →
      // decision hits secure storage → app is killed → next launch's boot
      // hydrate reads it back and PaywallGate sees Pro=true BEFORE the
      // orchestrator's /subscription/status round-trip completes.
      final until = DateTime.now().add(const Duration(days: 7));
      notifier().seed(_snap(pro: true, until: until));

      // Give the fire-and-forget persist microtask a chance to run.
      await Future<void>.delayed(Duration.zero);
      expect(storage.value?.granted, isTrue);
      expect(storage.value?.until, until);

      // Simulate a fresh app launch: new container reading from the same
      // storage. hydrate() must flip state to the persisted decision.
      final freshContainer = ProviderContainer(overrides: [
        entitlementStateProvider
            .overrideWith(() => EntitlementNotifier(storage)),
      ]);
      addTearDown(freshContainer.dispose);
      freshContainer.read(entitlementStateProvider); // trigger build()
      await freshContainer
          .read(entitlementStateProvider.notifier)
          .hydrate();

      expect(freshContainer.read(entitlementProvider), isTrue,
          reason: 'Pro flag should survive an app kill / cold restart');
    });

    test('clear() wipes the persisted cache (logout cleanup)', () async {
      notifier().seed(_snap(pro: true, until: null));
      await Future<void>.delayed(Duration.zero);
      expect(storage.value, isNotNull);

      notifier().clear();
      await Future<void>.delayed(Duration.zero);
      expect(storage.value, isNull,
          reason:
              'a subsequent hydrate must return null so the next user starts free');
    });

    test('hydrate() with empty storage is a safe no-op (leaves free)',
        () async {
      await notifier().hydrate();
      expect(container.read(entitlementProvider), isFalse);
    });

    test(
        'hydrate() restoring a grant whose deadline has already passed reads '
        'as not-Pro (deadline enforced client-side)', () async {
      // Populate storage directly with a stale entry (as if written days
      // ago before the deadline lapsed while the app was closed).
      storage.value = Entitlement(
        granted: true,
        until: DateTime.now().subtract(const Duration(days: 1)),
      );

      await notifier().hydrate();
      // Persisted `granted=true` is honoured but `isPro` respects `until`.
      // The client can revoke by itself; it never extends a stale grant.
      expect(container.read(entitlementProvider), isFalse);
    });
  });

  group('EntitlementNotifier.refresh — auth gate', () {
    // `/subscription/status` is authenticated. It used to be called with no
    // token every time a logged-out user resumed the app (switching to
    // Messages for the OTP, returning from the browser), via
    // `refreshIfStale` on app resume. Observed on device:
    //   [Dio→] GET /subscription/status token=NONE
    late ProviderContainer container;
    late FakeSubscriptionRepository repo;
    final getIt = GetIt.instance;

    Future<void> register({required String? token}) async {
      await getIt.reset();
      repo = FakeSubscriptionRepository(
        snapshot: _snap(
          pro: true,
          until: DateTime.now().add(const Duration(days: 1)),
        ),
      );
      getIt
        ..registerSingleton<AuthStore>(FakeAuthStore(token: token))
        ..registerSingleton<SubscriptionRepository>(repo);
    }

    setUp(() {
      container = ProviderContainer(overrides: [
        entitlementStateProvider.overrideWith(
          () => EntitlementNotifier(_FakeEntitlementStorage()),
        ),
      ]);
    });
    tearDown(() async {
      container.dispose();
      await getIt.reset();
    });

    EntitlementNotifier notifier() =>
        container.read(entitlementStateProvider.notifier);

    test('logged out: refresh makes no request', () async {
      await register(token: null);

      await notifier().refresh();

      expect(repo.getStatusCalls, 0);
      expect(container.read(entitlementProvider), isFalse);
    });

    test('logged out: the app-resume path makes no request either', () async {
      await register(token: null);

      await notifier().refreshIfStale(const Duration(minutes: 30));

      expect(repo.getStatusCalls, 0);
    });

    test('logged in: refresh still asks the server', () async {
      await register(token: 'a.jwt.token');

      await notifier().refresh();

      expect(repo.getStatusCalls, 1);
      expect(container.read(entitlementProvider), isTrue);
    });
  });
}
