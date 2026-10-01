import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/deep_link_parser.dart';
import 'package:mobile/core/deep_link_service.dart';
import 'package:mobile/core/pending_intent_store.dart';
import 'package:mobile/core/shared_analytics.dart';

/// Coverage matrix (TAM-124):
///   - Unknown URI → navigateToPath('/home'), no pending intent
///   - Logged-out user → pending intent written, no direct nav, no paywall
///   - Logged-in non-Pro → paywall pushed, pending intent written,
///     deep_link_paywall_shown emitted
///   - Logged-in Pro → direct nav to the target's path
///   - Analytics `deep_link_received` fires with type + target_id +
///     attribution on every URI receipt
///   - pathForTarget maps every typed target to a router path
///   - consumePendingIntent replays through the same decision tree
///
/// Deliberately does NOT drive `app_links` (that's the platform channel);
/// we exercise the pure dispatch by calling `handleUri` directly.

class _FakeStorage implements PendingIntentStorage {
  String? value;

  @override
  Future<String?> read() async => value;

  @override
  Future<void> write(String v) async => value = v;

  @override
  Future<void> delete() async => value = null;
}

/// Captures every call so the test can assert on order/args without touching
/// GoRouter or Riverpod.
class _Spy {
  /// Every stack the service asked for, in order. The service navigates a
  /// STACK now (base to `go` + pages to `push`), not a single path — see
  /// `navigation_stack.dart`.
  final List<List<String>> stacks = [];

  /// Where each navigation LANDS — the top of each stack. Most assertions
  /// care only about the destination; the ones that care what sits
  /// underneath read [stacks].
  List<String> get navigated => [for (final s in stacks) s.last];

  int pushPaywallCount = 0;
  final List<({String name, Map<String, Object?> properties})> events = [];
  final List<Map<String, String>> paymentReturns = [];
  String currentPath = '/home';

  DeepLinkService build({
    required PendingIntentStore store,
    bool loggedIn = true,
    bool pro = true,
    bool wirePaymentReturn = false,
    bool wireCurrentLocation = false,
  }) {
    return DeepLinkService(
      pendingIntentStore: store,
      isLoggedIn: () => loggedIn,
      isProUser: () => pro,
      navigateToStack: stacks.add,
      pushPaywall: () => pushPaywallCount++,
      trackEvent: (name, props) => events.add((name: name, properties: props)),
      currentLocation: wireCurrentLocation ? () => currentPath : null,
      onPaymentReturn:
          wirePaymentReturn ? (attribution) => paymentReturns.add(attribution) : null,
    );
  }
}

void main() {
  group('DeepLinkService.openLanding (TAM-259)', () {
    DeepLinkService svcWith(_Spy spy, {bool pro = true}) =>
        spy.build(store: PendingIntentStore(storage: _FakeStorage()), pro: pro);

    test('a bare module landing navigates, Home underneath where needed', () {
      final spy = _Spy();
      expect(svcWith(spy).openLanding('prabhuji://ringtone'), isTrue);
      expect(spy.stacks, [
        ['/home', '/ringtones'],
      ]);
    });

    test('a shell-branch landing selects the tab', () {
      final spy = _Spy();
      expect(svcWith(spy).openLanding('prabhuji://status'), isTrue);
      expect(spy.stacks, [
        ['/status'],
      ]);
    });

    test('an item landing opens that item', () {
      final spy = _Spy();
      expect(svcWith(spy).openLanding('prabhuji://ringtone/rt-9'), isTrue);
      expect(spy.stacks, [
        ['/home', '/ringtones/preview/rt-9'],
      ]);
    });

    /// THE regression this method exists to avoid. `handleUri` pushes the
    /// paywall for any non-Pro user whose target is not Home — and a landing
    /// fires for someone who has JUST come through the orchestrator's paywall
    /// step. Routing it through that path would show them the paywall twice in
    /// a row. `consumePendingIntent` bypasses the same gate for the same
    /// reason; this is the same situation.
    test('a NON-PRO user is never shown the paywall by a landing', () {
      final spy = _Spy();
      expect(svcWith(spy, pro: false).openLanding('prabhuji://ringtone'), isTrue);
      expect(spy.pushPaywallCount, 0);
      expect(spy.stacks, [
        ['/home', '/ringtones'],
      ]);
    });

    test('a landing fires no deep_link_received — nobody tapped a link', () {
      final spy = _Spy();
      svcWith(spy).openLanding('prabhuji://status');
      expect(spy.events, isEmpty);
    });

    test('an empty landing does nothing at all', () {
      final spy = _Spy();
      expect(svcWith(spy).openLanding(''), isFalse);
      expect(spy.stacks, isEmpty);
    });

    /// A destination this release predates. The orchestrator has already left
    /// the user on Home, so do NOTHING rather than navigate there — a redundant
    /// `go('/home')` would reset a stack somebody else built.
    test('a slug this build does not know does not navigate', () {
      final spy = _Spy();
      expect(svcWith(spy).openLanding('prabhuji://newthing'), isFalse);
      expect(spy.stacks, isEmpty);
    });

    test('an unparseable string does not navigate or throw', () {
      final spy = _Spy();
      expect(svcWith(spy).openLanding('::::'), isFalse);
      expect(spy.stacks, isEmpty);
    });
  });

  group('DeepLinkService.consumePendingIntent — reports whether it consumed', () {
    /// The landing hook keys off this boolean, so it is load-bearing: a wrong
    /// `true` swallows an experiment's landing, a wrong `false` lets the
    /// landing navigate on top of a share the user actually tapped.
    test('false when nothing is parked, true when something was', () async {
      final store = PendingIntentStore(storage: _FakeStorage());
      final svc = _Spy().build(store: store);

      expect(await svc.consumePendingIntent(), isFalse);

      await store.write(Uri.parse('prabhuji://aarti/a1'));
      expect(await svc.consumePendingIntent(), isTrue);

      // consumeOnce — the second call finds an empty store.
      expect(await svc.consumePendingIntent(), isFalse);
    });
  });

  group('DeepLinkService.handleUri — Unknown', () {
    test('unknown URI routes to /home, no pending intent stored', () async {
      final storage = _FakeStorage();
      final store = PendingIntentStore(storage: storage);
      final spy = _Spy();
      final svc = spy.build(store: store);

      await svc.handleUri(Uri.parse('prabhuji://nonsense/x'),
          source: 'cold_start');

      expect(spy.navigated, ['/home']);
      expect(spy.pushPaywallCount, 0);
      expect(storage.value, isNull);
    });
  });

  group('DeepLinkService.handleUri — logged-out user', () {
    test('writes pending intent and does NOT navigate directly', () async {
      final storage = _FakeStorage();
      final store = PendingIntentStore(storage: storage);
      final spy = _Spy();
      final svc = spy.build(store: store, loggedIn: false);

      await svc.handleUri(Uri.parse('prabhuji://aarti/audio-42'),
          source: 'cold_start');

      expect(spy.navigated, isEmpty,
          reason:
              'the auth redirect in the router owns navigation; the service just parks the intent');
      expect(spy.pushPaywallCount, 0);
      expect(storage.value, isNotNull);
    });
  });

  group('DeepLinkService.handleUri — logged-in non-Pro (paywall interstitial)',
      () {
    test('pushes paywall, writes session-only pending intent, emits paywall_shown event',
        () async {
      final storage = _FakeStorage();
      final store = PendingIntentStore(storage: storage);
      final spy = _Spy();
      final svc = spy.build(store: store, pro: false);

      await svc.handleUri(Uri.parse('prabhuji://aarti/audio-42'),
          source: 'warm_resume');

      expect(spy.pushPaywallCount, 1);
      expect(spy.navigated, isEmpty,
          reason: 'target is replayed after paywall pop, not navigated to here');
      // Paywall interstitial writes sessionOnly — persistent storage stays
      // empty so a mid-paywall app-kill can't resurrect this share on a
      // future launch. The intent still lives in the in-memory session
      // cache and consumeOnce returns it.
      expect(await storage.read(), isNull,
          reason:
              'paywall interstitial must NOT persist across app kill');
      expect(await store.consumeOnce(),
          Uri.parse('prabhuji://aarti/audio-42'),
          reason: 'session cache still holds the intent for in-session replay');
      expect(spy.events.map((e) => e.name),
          contains(SharedAnalyticsEvents.deepLinkPaywallShown));
    });
  });

  group('DeepLinkService.handleUri — logged-in Pro (direct route)', () {
    test('routes aarti to /aarti-bhajans/audio/:audioId', () async {
      final storage = _FakeStorage();
      final store = PendingIntentStore(storage: storage);
      final spy = _Spy();
      final svc = spy.build(store: store);

      await svc.handleUri(Uri.parse('prabhuji://aarti/audio-42'),
          source: 'cold_start');

      expect(spy.navigated, ['/aarti-bhajans/audio/audio-42']);
      // …and it arrives as a STACK with Home underneath, so the system
      // back button returns to Home instead of exiting the app. Module
      // routes are flat in `router.dart`, so a bare `go` would leave
      // nothing to pop.
      expect(spy.stacks.single, ['/home', '/aarti-bhajans/audio/audio-42']);
      expect(spy.pushPaywallCount, 0);
      expect(storage.value, isNull, reason: 'no gating, nothing to park');
    });

    test('paywall URL goes to /paywall (Pro users too — they asked for it)',
        () async {
      final storage = _FakeStorage();
      final store = PendingIntentStore(storage: storage);
      final spy = _Spy();
      final svc = spy.build(store: store);

      await svc.handleUri(Uri.parse('prabhuji://pro'), source: 'cold_start');

      expect(spy.navigated, ['/paywall']);
    });

    test('home URL goes to /home for Pro users', () async {
      final store = PendingIntentStore(storage: _FakeStorage());
      final spy = _Spy();
      final svc = spy.build(store: store);

      await svc.handleUri(Uri.parse('https://krutyug.ai/app/home'),
          source: 'cold_start');

      expect(spy.navigated, ['/home']);
      expect(spy.pushPaywallCount, 0);
    });
  });

  group('DeepLinkService.handleUri — home (free target, paywall-exempt)', () {
    test('non-Pro user routes DIRECTLY to /home, no paywall interstitial',
        () async {
      // Home is the app's free discovery surface (PRD §5). The paywall
      // interstitial exists to gate Pro content — pushing it in front of a
      // free target is a UX bug AND leaves a session-only pending intent
      // hanging on paywall dismiss.
      final storage = _FakeStorage();
      final store = PendingIntentStore(storage: storage);
      final spy = _Spy();
      final svc = spy.build(store: store, pro: false);

      await svc.handleUri(Uri.parse('https://krutyug.ai/app/home'),
          source: 'cold_start');

      expect(spy.navigated, ['/home']);
      expect(spy.pushPaywallCount, 0,
          reason: 'home is free — must skip the paywall interstitial');
      expect(storage.value, isNull, reason: 'no gating, nothing to park');
      expect(
        spy.events.map((e) => e.name),
        isNot(contains(SharedAnalyticsEvents.deepLinkPaywallShown)),
        reason: 'paywall_shown must NOT fire for a free target',
      );
    });

    test(
        'logged-out user parks the intent (onboarding replay), does NOT navigate directly',
        () async {
      // Regression guard for the reported bug: `/app/home` used to be
      // UnknownDeepLink, which short-circuited to /home BEFORE the login
      // gate — unauthenticated users landed on /home with no session and
      // saw the home surface fail its API calls.
      final storage = _FakeStorage();
      final store = PendingIntentStore(storage: storage);
      final spy = _Spy();
      final svc = spy.build(store: store, loggedIn: false);

      await svc.handleUri(Uri.parse('https://krutyug.ai/app/home'),
          source: 'cold_start');

      expect(spy.navigated, isEmpty,
          reason:
              'auth redirect owns navigation; service just parks the intent for onboarding replay');
      expect(spy.pushPaywallCount, 0);
      expect(storage.value, isNotNull);
    });
  });

  group('DeepLinkService.handleUri — analytics', () {
    test('deep_link_received emitted with source, type, target_id, attribution',
        () async {
      final store = PendingIntentStore(storage: _FakeStorage());
      final spy = _Spy();
      final svc = spy.build(store: store);

      await svc.handleUri(
        Uri.parse('prabhuji://aarti/audio-42?ref=user_x&utm_source=whatsapp'),
        source: 'warm_resume',
      );

      final received = spy.events.firstWhere(
          (e) => e.name == SharedAnalyticsEvents.deepLinkReceived);
      expect(received.properties['source'], 'warm_resume');
      expect(received.properties['type'], 'aarti');
      expect(received.properties['target_id'], 'audio-42');
      expect(received.properties['ref'], 'user_x');
      expect(received.properties['utm_source'], 'whatsapp');
    });
  });

  group('DeepLinkService.pathForTarget', () {
    // The router + pending-intent consumer share this static mapping.
    // Locking it prevents drift between the two consumers.
    test('status → /status?highlight=:id', () {
      expect(
        DeepLinkService.pathForTarget(const StatusDeepLink(id: 'abc')),
        '/status?highlight=abc',
      );
    });
    test('aarti → /aarti-bhajans/audio/:audioId', () {
      expect(
        DeepLinkService.pathForTarget(const AartiDeepLink(audioId: 'x')),
        '/aarti-bhajans/audio/x',
      );
    });
    test('mantra → /mantras/audio/:audioId (module deep-link resolver)', () {
      expect(
        DeepLinkService.pathForTarget(const MantraDeepLink(audioId: 'm-7')),
        '/mantras/audio/m-7',
      );
    });
    test('book → /books/:id/contents', () {
      expect(
        DeepLinkService.pathForTarget(const BookDeepLink(contentId: 'geeta')),
        '/books/geeta/contents',
      );
    });
    test('horoscope → /horoscope/result/:zodiacId', () {
      expect(
        DeepLinkService.pathForTarget(const HoroscopeDeepLink(zodiacId: 'leo')),
        '/horoscope/result/leo',
      );
    });
    test('ringtone → /ringtones/preview/:id (plural, matches existing route)', () {
      expect(
        DeepLinkService.pathForTarget(const RingtoneDeepLink(id: 'rt')),
        '/ringtones/preview/rt',
      );
    });
    test('wallpaper → /wallpaper?highlight=:id (v1: single-item preview route not built)', () {
      expect(
        DeepLinkService.pathForTarget(const WallpaperDeepLink(id: 'wp')),
        '/wallpaper?highlight=wp',
      );
    });
    test('paywall → /paywall', () {
      expect(
        DeepLinkService.pathForTarget(const PaywallDeepLink()),
        '/paywall',
      );
    });
    test('home → /home', () {
      expect(
        DeepLinkService.pathForTarget(const HomeDeepLink()),
        '/home',
      );
    });
    test('unknown → /home (safe fallback)', () {
      expect(
        DeepLinkService.pathForTarget(const UnknownDeepLink()),
        '/home',
      );
    });

    // TAM-259 — a bare module link is that module's own screen. These are the
    // paths a server-sent landing actually opens, so a drift here silently
    // sends an ad's whole arrival cohort somewhere else.
    test('bare status → /status (the module, no highlight query)', () {
      expect(DeepLinkService.pathForTarget(const StatusDeepLink()), '/status');
    });
    test('bare ringtone → /ringtones (the FREE grid, not the Pro preview)', () {
      expect(
        DeepLinkService.pathForTarget(const RingtoneDeepLink()),
        '/ringtones',
      );
    });
    test('bare aarti → /aarti-bhajans', () {
      expect(
        DeepLinkService.pathForTarget(const AartiDeepLink()),
        '/aarti-bhajans',
      );
    });
    test('bare mantra → /mantras', () {
      expect(DeepLinkService.pathForTarget(const MantraDeepLink()), '/mantras');
    });
    test('bare book → /books', () {
      expect(DeepLinkService.pathForTarget(const BookDeepLink()), '/books');
    });
    test('bare horoscope → /horoscope', () {
      expect(
        DeepLinkService.pathForTarget(const HoroscopeDeepLink()),
        '/horoscope',
      );
    });
    test('bare wallpaper → /wallpaper', () {
      expect(
        DeepLinkService.pathForTarget(const WallpaperDeepLink()),
        '/wallpaper',
      );
    });

    // The null arms are listed FIRST in the switch because a pattern with no
    // field constraint also matches a null id. Wrong order and every bare link
    // would interpolate the string "null" into a path — a 404 that looks like
    // a routing bug rather than a pattern-ordering one.
    test('an id-carrying link is untouched by the bare-slug arms', () {
      expect(
        DeepLinkService.pathForTarget(const RingtoneDeepLink(id: 'rt')),
        '/ringtones/preview/rt',
      );
      expect(
        DeepLinkService.pathForTarget(const StatusDeepLink(id: 'abc')),
        '/status?highlight=abc',
      );
    });

    // What the landing is FOR: Status is a shell branch, so it selects a tab;
    // Ringtones is not, so it needs Home underneath or back-press exits the app.
    test('bare status selects the tab; bare ringtone stacks over Home', () {
      expect(
        DeepLinkService.stackForTarget(const StatusDeepLink()),
        ['/status'],
      );
      expect(
        DeepLinkService.stackForTarget(const RingtoneDeepLink()),
        ['/home', '/ringtones'],
      );
    });
  });

  group('DeepLinkService.handleUri — payment-return (Part A)', () {
    test('fires onPaymentReturn callback with attribution + navigates to /paywall',
        () async {
      // The whole point of the branch: a Cashfree/Decentro return URL landing
      // on the app must (a) restart the PaymentBloc's poll budget immediately
      // via the injected callback, (b) navigate to /paywall so the user sees
      // the pending state — even if the browser's App Link intercept dropped
      // them somewhere else.
      final store = PendingIntentStore(storage: _FakeStorage());
      final spy = _Spy();
      final svc = spy.build(store: store, wirePaymentReturn: true);

      await svc.handleUri(
        Uri.parse('https://krutyug.ai/app/payment/return?provider=cashfree'),
        source: 'warm_resume',
      );

      expect(spy.paymentReturns, hasLength(1));
      expect(spy.paymentReturns.single['provider'], 'cashfree');
      expect(spy.navigated, ['/paywall']);
      expect(spy.pushPaywallCount, 0,
          reason: 'never push the paywall interstitial — this IS the paywall resume');
    });

    test('does NOT push paywall interstitial for a non-Pro user', () async {
      // Regression guard: without the special-case branch above the login
      // gate, `handleUri` would fall through to the `if (!_isProUser())`
      // block, push /paywall, and its dispose hook (`_PaywallDeepLinkHook`)
      // would consume the pending intent — scrambling ordering. Payment
      // return MUST bypass that gate.
      final store = PendingIntentStore(storage: _FakeStorage());
      final spy = _Spy();
      final svc = spy.build(store: store, pro: false, wirePaymentReturn: true);

      await svc.handleUri(
        Uri.parse('prabhuji://payment/return?provider=cashfree'),
        source: 'warm_resume',
      );

      expect(spy.pushPaywallCount, 0);
      expect(spy.paymentReturns, hasLength(1));
      expect(spy.navigated, ['/paywall']);
    });

    test('skips the /paywall navigation when the user is already there',
        () async {
      // The paywall screen owns navigation once the user is on it — a
      // redundant `go('/paywall')` on top of the current /paywall would
      // rebuild the route, tear down the bloc, and lose the mid-flight
      // poll state. Avoid.
      final store = PendingIntentStore(storage: _FakeStorage());
      final spy = _Spy()..currentPath = '/paywall';
      final svc = spy.build(
        store: store,
        wirePaymentReturn: true,
        wireCurrentLocation: true,
      );

      await svc.handleUri(
        Uri.parse('prabhuji://payment/return'),
        source: 'warm_resume',
      );

      expect(spy.paymentReturns, hasLength(1));
      expect(spy.navigated, isEmpty,
          reason: 'no redundant nav when already on /paywall');
    });

    test('degrades gracefully when the callback / location seams are unwired',
        () async {
      // Tests + harnesses without the paywall route mounted see null
      // callbacks. The service still navigates to /paywall so the user
      // gets somewhere sensible; the poll then resumes via the lifecycle
      // fallback.
      final store = PendingIntentStore(storage: _FakeStorage());
      final spy = _Spy();
      final svc = spy.build(store: store);

      await svc.handleUri(
        Uri.parse('prabhuji://payment/return'),
        source: 'warm_resume',
      );

      expect(spy.paymentReturns, isEmpty);
      expect(spy.navigated, ['/paywall']);
    });
  });

  group('DeepLinkService.parkForLogin', () {
    test('persists URI without navigating or emitting analytics', () async {
      // The router's /app/* fallback calls this when a share URL surfaces
      // for a logged-out user — it needs the intent parked before onboarding
      // starts, but no analytics/navigation side effects (handleUri, firing
      // in parallel from app_links for the same URL, owns those).
      final storage = _FakeStorage();
      final store = PendingIntentStore(storage: storage);
      final spy = _Spy();
      final svc = spy.build(store: store, loggedIn: false);

      await svc.parkForLogin(Uri.parse('https://krutyug.ai/app/aarti/xyz'));

      expect(spy.navigated, isEmpty);
      expect(spy.pushPaywallCount, 0);
      expect(spy.events, isEmpty);
      expect(await store.consumeOnce(),
          Uri.parse('https://krutyug.ai/app/aarti/xyz'));
    });
  });

  group('DeepLinkService.consumePendingIntent', () {
    test('no-op when nothing is pending', () async {
      final store = PendingIntentStore(storage: _FakeStorage());
      final spy = _Spy();
      final svc = spy.build(store: store);

      await svc.consumePendingIntent();

      expect(spy.navigated, isEmpty);
      expect(spy.pushPaywallCount, 0);
      expect(spy.events, isEmpty);
    });

    test('the post-login replay builds the same stack as a direct arrival',
        () async {
      // A user who tapped a share URL while logged out must not end up worse
      // off than one who was already signed in — the replay goes through the
      // same seam, so it gets the same Home base.
      final storage = _FakeStorage();
      final store = PendingIntentStore(storage: storage);
      final spy = _Spy();
      final svc = spy.build(store: store);

      await store.write(Uri.parse('prabhuji://mantra/m-7'));
      await svc.consumePendingIntent();

      expect(spy.stacks.single, ['/home', '/mantras/audio/m-7']);
    });

    test('replays directly to target for Pro user', () async {
      final storage = _FakeStorage();
      final store = PendingIntentStore(storage: storage);
      final spy = _Spy();
      final svc = spy.build(store: store);

      await store.write(Uri.parse('prabhuji://aarti/audio-42'));
      await svc.consumePendingIntent();

      expect(spy.navigated, ['/aarti-bhajans/audio/audio-42']);
      // deep_link_replayed fires on the consume.
      expect(spy.events.map((e) => e.name),
          contains(SharedAnalyticsEvents.deepLinkReplayed));
      expect(storage.value, isNull, reason: 'consumed exactly once');
    });

    test(
        'replay for non-Pro user routes DIRECTLY to target (no paywall loop)',
        () async {
      // Regression guard for the "paywall reopens forever" bug: the
      // paywall dispose hook consumes the pending intent, and if
      // consumePendingIntent re-runs the paywall gate it pushes /paywall
      // AGAIN, dispose consumes again, and we loop forever.
      //
      // Fix (TAM-124 follow-up): consumePendingIntent bypasses the gate
      // because the paywall it's replaying past has already fired once.
      final storage = _FakeStorage();
      final store = PendingIntentStore(storage: storage);
      final spy = _Spy();
      final svc = spy.build(store: store, pro: false);

      await store.write(Uri.parse('prabhuji://aarti/audio-42'));
      await svc.consumePendingIntent();

      expect(spy.pushPaywallCount, 0,
          reason: 'replay must NOT re-push paywall');
      expect(spy.navigated, ['/aarti-bhajans/audio/audio-42'],
          reason: 'replay routes straight to the deep-link target');
      expect(storage.value, isNull,
          reason:
              'replay consumes-once — no fresh pending intent left behind');
    });
  });
}
