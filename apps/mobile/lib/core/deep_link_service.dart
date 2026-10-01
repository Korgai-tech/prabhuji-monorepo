import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/foundation.dart';

import '../features/aarti/aarti_routes.dart';
import '../features/books/books_routes.dart';
import '../features/horoscope/horoscope_routes.dart';
import '../features/mantras/mantras_routes.dart';
import '../features/ringtone/ringtone_routes.dart';
import '../features/status/status_routes.dart';
import '../features/wallpaper/wallpaper_routes.dart';
import 'app_config.dart';
import 'deep_link_parser.dart';
import 'install_referrer_reader.dart';
import 'navigation_stack.dart';
import 'pending_intent_store.dart';
import 'shared_analytics.dart';

/// Coordinates deep-link intake and routing (TAM-124).
///
/// The service does the bookkeeping — parsing URIs, checking auth /
/// entitlement, storing pending intents, invoking analytics — but does NOT
/// own the router or Riverpod. Callers wire it up with function seams so
/// the same instance is unit-testable without a live navigator or platform
/// channel:
///
///   * [isLoggedIn] / [isProUser] — read from the app's auth store /
///     entitlement provider.
///   * [navigateToStack] — build the given router stack: `go` the first
///     entry, `push` each later one. See `navigation_stack.dart` for why an
///     external arrival needs a stack rather than a single `go`.
///   * [pushPaywall] — call `context.push('/paywall')`.
///   * [trackEvent] — the analytics adapter.
///
/// Routing decision tree, applied to every URI receipt:
///
/// ```
///   parse → UnknownDeepLink?         → track + navigate('/home'); done
///   not logged in?                    → track + pendingIntent.write(uri); done
///                                        (the router's auth redirect will
///                                         send them through onboarding; the
///                                         pending intent gets consumed after
///                                         `/home` is decided)
///   not Pro?                          → track deep_link_paywall_shown
///                                       + pendingIntent.write(uri)
///                                       + pushPaywall()
///                                        (when the paywall pops, the router
///                                         consumes the pending intent —
///                                         regardless of outcome, per product
///                                         direction; TAM-124 #PATH_DECISION)
///   logged in AND Pro                 → track + navigate(pathFor(target))
/// ```
///
/// The service exposes [pathForTarget] so the router / pending-intent
/// consumer can share the same target-to-path mapping — one source of truth
/// for how each typed target renders as a router path.
class DeepLinkService {
  DeepLinkService({
    required PendingIntentStore pendingIntentStore,
    required bool Function() isLoggedIn,
    required bool Function() isProUser,
    required void Function(List<String> stack) navigateToStack,
    required void Function() pushPaywall,
    required void Function(String name, Map<String, Object?> properties)
        trackEvent,
    String Function()? currentLocation,
    void Function(Map<String, String> attribution)? onPaymentReturn,
    Future<Uri?> Function()? initialUri,
    Stream<Uri>? uriStream,
    InstallReferrerReader? installReferrerReader,
    Future<bool?> Function(String key)? readBool,
    Future<void> Function(String key, bool value)? writeBool,
  })  : _pendingIntentStore = pendingIntentStore,
        _isLoggedIn = isLoggedIn,
        _isProUser = isProUser,
        _navigateToStack = navigateToStack,
        _pushPaywall = pushPaywall,
        _trackEvent = trackEvent,
        _currentLocation = currentLocation,
        _onPaymentReturn = onPaymentReturn,
        _initialUri = initialUri ?? AppLinks().getInitialLink,
        _uriStream = uriStream ?? AppLinks().uriLinkStream,
        _installReferrerReader =
            installReferrerReader ?? const NoOpInstallReferrerReader(),
        _readBool = readBool,
        _writeBool = writeBool;
  // Positional-named field init above — flutter_lints will nudge us toward
  // `this._foo` initializing formals, but every parameter here is a public
  // name (`pendingIntentStore`, `isLoggedIn`, …) that would leak the leading
  // underscore into the callers via `this._pendingIntentStore = …`. The
  // slight verbosity keeps the constructor call site clean.
  // ignore_for_file: prefer_initializing_formals

  final PendingIntentStore _pendingIntentStore;
  final bool Function() _isLoggedIn;
  final bool Function() _isProUser;
  final void Function(List<String> stack) _navigateToStack;
  final void Function() _pushPaywall;
  final void Function(String name, Map<String, Object?> properties) _trackEvent;
  // Optional — the router's current path, used by the payment-return branch
  // to skip a redundant `go('/paywall')` when the user is already there.
  // Null in tests / harnesses that don't wire it → we always navigate.
  final String Function()? _currentLocation;
  // Optional — invoked when a payment-return deep link fires so the currently
  // mounted `PaymentBloc` can restart its poll budget immediately (see
  // `PaymentReturnDeepLink` doc). Null when no paywall is on the stack or the
  // registrar hasn't been wired yet; the branch still navigates to /paywall.
  final void Function(Map<String, String> attribution)? _onPaymentReturn;
  // Two seams over `app_links` — the platform channel is not driveable
  // from unit tests, but the parsing / dispatch that reads from these IS
  // the whole point of this service. Injecting a synthetic Future + Stream
  // is what lets `initialize()` be tested end-to-end without a device.
  final Future<Uri?> Function() _initialUri;
  final Stream<Uri> _uriStream;
  final InstallReferrerReader _installReferrerReader;
  // SharedPreferences seams for the "already consumed the referrer as a
  // deep link" flag. The reader itself no longer gates — each downstream
  // consumer owns its own flag so a second consumer (the referral sync
  // service) isn't racing us for the read. Null in tests / harnesses
  // that don't wire prefs → consume runs on every process cold-start but
  // `PendingIntentStore.write` is last-writer-wins, so re-parking the
  // same URI is idempotent.
  final Future<bool?> Function(String key)? _readBool;
  final Future<void> Function(String key, bool value)? _writeBool;

  // Persisted flag: has the install-referrer been consumed AS A DEEP LINK
  // yet? Kept as the historical `install_referrer_consumed_v1` name so
  // devices upgrading from a build where the reader owned the flag skip
  // the consume (they've already had their /app/* replay). The referral
  // sync service uses its own separate `referral_synced_v1` key.
  static const _installReferrerDeepLinkFlagKey = 'install_referrer_consumed_v1';

  StreamSubscription<Uri>? _sub;
  bool _initialized = false;

  /// Wire the service to `app_links`. Idempotent — safe to call multiple
  /// times; second and later calls no-op.
  ///
  /// * Reads the initial cold-start URI (if any) and dispatches it.
  /// * Subscribes to the warm-resume URI stream and dispatches subsequent
  ///   URIs.
  ///
  /// Install Referrer is handled by [consumeInstallReferrerOnce] — that
  /// deliberately lives on a separate method so callers can gate it on
  /// "first launch ever" via shared_preferences without this service
  /// needing to know about that flag.
  Future<void> initialize() async {
    if (_initialized) return;
    _initialized = true;

    try {
      final initial = await _initialUri();
      if (initial != null) {
        await handleUri(initial, source: 'cold_start');
      }
    } catch (e, st) {
      // Never let deep-link intake crash boot. Log and move on.
      debugPrint('[DeepLinkService] getInitialLink failed: $e\n$st');
    }

    _sub = _uriStream.listen(
      (uri) => handleUri(uri, source: 'warm_resume'),
      onError: (Object e, StackTrace st) {
        debugPrint('[DeepLinkService] uriLinkStream error: $e\n$st');
      },
    );

    // Android deferred deep linking (TAM-124): on first launch after install,
    // read the Play Install Referrer. If the landing page appended a `/app/*`
    // path (that's the contract in docs/DEEP-LINK-HOSTING-CONTRACT.md), park
    // it as a pending intent so onboarding replay routes to the target.
    //
    // Fire-and-forget — the referrer read is best-effort and must never
    // block boot. Non-Android platforms + already-consumed installs no-op.
    unawaited(_consumeInstallReferrerOnce());
  }

  /// Read the Android Play Install Referrer, parse the recovered path, and
  /// stash it as a pending intent so the router hooks (post-onboarding home
  /// transition, paywall interstitial close) can replay it.
  ///
  /// Kept private + one-shot: the reader itself owns the "already consumed"
  /// flag via `shared_preferences`, so a hot restart in dev won't try again.
  /// Referrer values that aren't in our `/app/*` shape are ignored — the
  /// referrer might be set by an ad campaign (utm_*) or empty on organic
  /// installs; those are not deep links.
  Future<void> _consumeInstallReferrerOnce() async {
    try {
      // Gate on our own flag — the reader used to own this but two
      // consumers now share it (referral sync + this one). When seams are
      // absent (widget tests) we still let the body run because the reader
      // in that context is a NoOp anyway.
      final readBool = _readBool;
      final writeBool = _writeBool;
      if (readBool != null) {
        final consumed = await readBool(_installReferrerDeepLinkFlagKey);
        if (consumed == true) return;
      }

      final data = await _installReferrerReader.read();
      final referrer = data?.raw;
      if (referrer == null || referrer.isEmpty) return;

      // Flip the flag BEFORE any early-return branches below so a bad
      // /app/ shape doesn't leave us re-attempting on every cold-start.
      if (writeBool != null) {
        await writeBool(_installReferrerDeepLinkFlagKey, true);
      }

      // The landing page writes `referrer=<pathname>` (starts with `/app/`).
      // Some Android versions URL-decode before handing to the plugin;
      // some don't. Cover both.
      var path = referrer;
      if (!path.startsWith('/app/')) {
        path = Uri.decodeComponent(path);
      }
      if (!path.startsWith('/app/')) return;

      final fullUrl = '${AppConfig.instance.shareHost}$path';
      final uri = Uri.tryParse(fullUrl);
      if (uri == null) return;

      // Park the URI — it will be picked up by the router's post-onboarding
      // (`RouteTarget.home`) hook, or by the paywall interstitial's dispose
      // hook, whichever fires first once the user makes it into the app.
      await _pendingIntentStore.write(uri);
      debugPrint('[DeepLinkService] Install referrer captured: $fullUrl');
    } catch (e, st) {
      debugPrint('[DeepLinkService] install referrer consume failed: $e\n$st');
    }
  }

  /// Deep-link tracing. One prefix for the whole pipeline so a single
  /// `adb logcat -s flutter | grep DEEPLINK` shows every checkpoint a tap
  /// passes (or fails to pass). Debug builds only.
  static void _diag(String message) {
    if (!kDebugMode) return;
    debugPrint('[DEEPLINK] $message');
  }

  Future<void> dispose() async {
    await _sub?.cancel();
    _sub = null;
  }

  /// Wipe any stored pending intent — call on logout so a deep-link tap
  /// captured for user A doesn't fire in user B's session on the same
  /// device. Clears both session cache and persistent storage.
  Future<void> clearPendingIntent() => _pendingIntentStore.clear();

  /// Park a deep-link URI as the pending intent without dispatching. Used
  /// by the router's `/app/*` fallback when Flutter's
  /// PlatformRouteInformationProvider surfaces a share URL for a
  /// logged-out user — the redirect can't await, but it needs the intent
  /// persisted BEFORE it hands the user to onboarding, so the
  /// auth-transition replay in main.dart lands on the shared target
  /// instead of the default `/home`.
  ///
  /// No analytics, no navigation — `handleUri` (via `app_links`) also
  /// fires for the same URL in parallel and owns those side effects.
  /// `PendingIntentStore.write` clears both surfaces before setting the
  /// new value, so calling this on top of the parallel write just
  /// re-parks the same URI (last-writer-wins invariant preserved).
  Future<void> parkForLogin(Uri uri) => _pendingIntentStore.write(uri);

  // Last URI dispatched, for the duplicate-delivery guard below.
  Uri? _lastHandledUri;
  DateTime? _lastHandledAt;

  /// How long the same URI is treated as an echo of one already handled.
  /// Generous enough to cover the gap between the router's redirect and
  /// `app_links` surfacing the same cold-start intent, short enough that a
  /// user deliberately re-tapping a link still works.
  static const _duplicateWindow = Duration(seconds: 5);

  /// The core dispatch. Public because THREE callers feed it: `initialize`
  /// (app_links), the install-referrer replay, and the router's `/app/*`
  /// redirect — which hands the URL over rather than navigating itself, so
  /// the auth + paywall gates below are never bypassed.
  ///
  /// Duplicate-safe: the same [uri] arriving twice inside
  /// [_duplicateWindow] is dropped (no analytics, no navigation). That
  /// matters because an App Link cold start IS delivered twice — once by
  /// Flutter's route-information provider (→ the router redirect) and once
  /// by `app_links`. Without this, whichever landed second would re-run the
  /// gate and re-navigate on top of the first.
  Future<void> handleUri(Uri uri, {required String source}) async {
    final lastUri = _lastHandledUri;
    final lastAt = _lastHandledAt;
    if (lastUri == uri &&
        lastAt != null &&
        DateTime.now().difference(lastAt) < _duplicateWindow) {
      return;
    }
    _lastHandledUri = uri;
    _lastHandledAt = DateTime.now();

    final target = parseDeepLink(uri);
    _diag('handleUri uri=$uri source=$source target=${target.typeSlug} '
        'loggedIn=${_isLoggedIn()} pro=${_isProUser()}');

    _trackEvent(SharedAnalyticsEvents.deepLinkReceived, {
      SharedAnalyticsEventProps.source: source,
      SharedAnalyticsEventProps.type: target.typeSlug,
      // Only when there IS an id: a bare module link names no item, and
      // stamping a literal null would make "the module was shared" look like a
      // share whose target went missing.
      if (target is StatusDeepLink && target.id != null)
        SharedAnalyticsEventProps.targetId: target.id,
      if (target is AartiDeepLink && target.audioId != null)
        SharedAnalyticsEventProps.targetId: target.audioId,
      if (target is MantraDeepLink && target.audioId != null)
        SharedAnalyticsEventProps.targetId: target.audioId,
      if (target is BookDeepLink && target.contentId != null)
        SharedAnalyticsEventProps.targetId: target.contentId,
      if (target is HoroscopeDeepLink && target.zodiacId != null)
        SharedAnalyticsEventProps.targetId: target.zodiacId,
      if (target is RingtoneDeepLink && target.id != null)
        SharedAnalyticsEventProps.targetId: target.id,
      if (target is WallpaperDeepLink && target.id != null)
        SharedAnalyticsEventProps.targetId: target.id,
      ...target.attribution,
    });

    if (target is UnknownDeepLink) {
      debugPrint(
          '[DeepLinkService] UnknownDeepLink: ${target.reason} (${target.rawUri})');
      _navigateToStack(navigationStackFor('/home'));
      return;
    }

    // Payment-return short-circuits BOTH the login gate AND the paywall
    // interstitial. Reasoning:
    //   * Login gate — a payment-return fires only after a payment was
    //     started, which is only reachable post-login. If the app was killed
    //     and re-cold-started via this URL somehow, the router's own auth
    //     redirect will still send them through onboarding; there's no
    //     content behind the return-URL to gate.
    //   * Paywall interstitial — the interstitial exists to funnel non-Pro
    //     users through the paywall before a Pro-gated destination. A
    //     payment-return IS the paywall's own resume signal; pushing the
    //     interstitial on top would fire the paywall dispose hook (TAM-124
    //     `_PaywallDeepLinkHook`), consume the pending intent, and generally
    //     scramble the ordering.
    //
    // Fires `onPaymentReturn` so the active `PaymentBloc` restarts its poll
    // budget immediately, then navigates to `/paywall` if the user isn't
    // already there. Both steps are safe when the callback isn't wired
    // (`_onPaymentReturn == null`) or the location seam is absent — the
    // paywall's own `didChangeAppLifecycleState → resumed → AppResumedFromUpi`
    // path still fires as the fallback.
    if (target is PaymentReturnDeepLink) {
      _onPaymentReturn?.call(target.attribution);
      final currentPath = _currentLocation?.call();
      if (currentPath != '/paywall') {
        // Deliberately a bare replace, NOT a stack: this is a provider
        // bounce-back into a paywall the user is already mid-flow on, and
        // the branch above only runs when they aren't already there.
        // Stacking Home underneath would put a page between the paywall and
        // whatever it pops back to, mid-poll.
        _navigateToStack(const ['/paywall']);
      }
      return;
    }

    if (!_isLoggedIn()) {
      // Router's auth redirect will send them through onboarding; the
      // pending intent gets consumed once onboarding completes.
      await _pendingIntentStore.write(uri);
      _diag('PARKED for login (persistent) uri=$uri');
      return;
    }

    // Home is the app's free discovery surface (PRD §5, NOT Pro-gated); the
    // paywall interstitial only exists to gate Pro content, so pushing it in
    // front of a free target would be a UX regression AND leave a session-
    // pending intent hanging on paywall dismiss.
    if (!_isProUser() && target is! HomeDeepLink) {
      // Product-directed: every non-Pro deep-link arrival to a Pro-gated
      // target sees the paywall first. Router observes the paywall pop
      // and consumes the pending intent — success OR dismiss both replay.
      _trackEvent(SharedAnalyticsEvents.deepLinkPaywallShown, {
        SharedAnalyticsEventProps.type: target.typeSlug,
      });
      // Session-only write — if the user kills the app mid-paywall and
      // opens it days later, they should NOT be silently teleported into
      // whatever content that stale share pointed at. Persistent writes
      // would survive the kill; session write dies with the isolate.
      // (Contrast: install-referrer + logged-out-share writes below stay
      //  persistent because those flows explicitly need to survive a boot
      //  cycle. See pending_intent_store.dart's `write` docs.)
      await _pendingIntentStore.write(uri, sessionOnly: true);
      _diag('PARKED for paywall (session) uri=$uri');
      _pushPaywall();
      return;
    }

    _diag('NAVIGATE (direct) stack=${stackForTarget(target)}');
    _navigateToStack(stackForTarget(target));
  }

  /// Consumes the previously-stored pending intent (post-onboarding or
  /// post-paywall-pop) and navigates to the target's screen. Called by
  /// router hooks — see `apps/mobile/lib/core/router.dart`. No-op when
  /// nothing is pending.
  ///
  /// **Bypasses the paywall interstitial gate on purpose** — replay only
  /// fires AFTER a gate the user has already crossed:
  ///
  ///   * **Post-paywall-pop replay** — the interstitial already ran (that's
  ///     how this pending intent got written). Re-running the gate here
  ///     would push /paywall a second time, its dispose hook would consume
  ///     the pending intent again, and we'd loop forever (dismiss →
  ///     replay → paywall → dismiss → replay → …).
  ///   * **Post-onboarding replay** — a non-Pro user just came through the
  ///     orchestrator's paywall step as part of PRD §6.1's onboarding
  ///     flow, so they've already seen the paywall.
  ///
  /// Pro-gated CONTENT (Books contents/reader/scripture) still enforces
  /// server-side entitlement via 403 on the fetch, which the target
  /// screen surfaces as its own paywall push — that's a separate,
  /// screen-owned gate, not the deep-link interstitial.
  ///
  /// Emits `deep_link_replayed` on a successful consume so downstream
  /// analytics can distinguish "arrived and routed immediately" from
  /// "arrived, gated, replayed later."
  /// Returns `true` iff something was parked and has now been navigated to.
  ///
  /// The boolean exists for TAM-259's landing hook, which must run ONLY when
  /// nothing was parked: a user who tapped a specific shared link gets what
  /// they tapped, and an experiment's landing must never eat it. Reporting it
  /// here — rather than having the caller peek at the store first — keeps the
  /// check and the consume atomic; a caller that read the store separately
  /// could see "empty" against a write that lands between the two calls.
  Future<bool> consumePendingIntent({bool persistentOnly = false}) async {
    final uri =
        await _pendingIntentStore.consumeOnce(persistentOnly: persistentOnly);
    _diag('consumePendingIntent(persistentOnly: $persistentOnly) -> '
        '${uri ?? 'NOTHING PARKED'}');
    if (uri == null) return false;

    final target = parseDeepLink(uri);
    _trackEvent(SharedAnalyticsEvents.deepLinkReplayed, {
      SharedAnalyticsEventProps.uri: uri.toString(),
      SharedAnalyticsEventProps.type: target.typeSlug,
      ...target.attribution,
    });

    // Direct navigation — no gate re-check. See method doc for the
    // infinite-loop reasoning.
    _diag('REPLAY stack=${stackForTarget(target)}');
    _navigateToStack(stackForTarget(target));
    return true;
  }

  /// Open a server-chosen landing (TAM-258/259) — `prabhuji://ringtone`,
  /// `prabhuji://status/<id>`, whatever `/users/me` named.
  ///
  /// Returns `false` without navigating when the string is empty or names a
  /// slug this build does not know, so the caller can leave the user wherever
  /// the orchestrator already put them (Home) instead of bouncing them there.
  ///
  /// ── WHY THIS DOES NOT GO THROUGH `handleUri` ────────────────────────────
  /// That path runs the paywall interstitial for any non-Pro user whose target
  /// is not Home. A landing fires for someone who has JUST come through the
  /// orchestrator's paywall step, so routing it through `handleUri` would show
  /// them the paywall a second time, immediately. `consumePendingIntent` above
  /// bypasses the same gate for exactly the same reason, and this is the same
  /// situation: a gate the user has already crossed.
  ///
  /// It also fires no `deep_link_received` — nobody tapped a link. The landing
  /// reports itself on `app_route_decided`, where the routing decision lives.
  bool openLanding(String deeplink) {
    if (deeplink.isEmpty) return false;
    final uri = Uri.tryParse(deeplink);
    if (uri == null) {
      _diag('LANDING unparseable uri=$deeplink');
      return false;
    }
    final target = parseDeepLink(uri);
    if (target is UnknownDeepLink) {
      // A destination this release predates. Home is already where the
      // orchestrator left them, so do nothing rather than navigate to it —
      // a redundant `go('/home')` would reset a stack somebody else built.
      _diag('LANDING unknown target uri=$deeplink reason=${target.reason}');
      return false;
    }
    _diag('LANDING stack=${stackForTarget(target)}');
    _navigateToStack(stackForTarget(target));
    return true;
  }

  /// The router STACK a typed target opens as — what the service actually
  /// navigates. First entry is the base (`go`), the rest are pushed.
  ///
  /// Composed from [pathForTarget] so there stays exactly ONE target→path
  /// mapping; `navigation_stack.dart` owns the "what goes underneath" rule
  /// and is shared with the notification-tap path in `main.dart`, so an
  /// external arrival lands the same way whichever door it came through.
  static List<String> stackForTarget(DeepLinkTarget target) =>
      navigationStackFor(pathForTarget(target));

  /// Map a typed target to its router path. Shared with the router's
  /// pending-intent consumer so both the direct path and the replay path
  /// route consistently.
  ///
  /// **These strings must match the paths registered in `router.dart` /
  /// `<feature>_routes.dart` exactly** — the TAM-124 URL scheme is a
  /// user-facing contract (`/app/aarti/:id`, kept short and normalized),
  /// while these are the app's internal navigation paths which were locked
  /// in before this ticket.
  static String pathForTarget(DeepLinkTarget target) {
    return switch (target) {
      // Status feed home + `?highlight=` query param that the feed can
      // consume later (v1 ignores the query but captures it for analytics —
      // TAM-124 #PLAN_UNCERTAINTY on status target).
      // TAM-259: every content target's id is OPTIONAL, and a bare one is the
      // module's own screen. The null arms have to come FIRST — a pattern with
      // no field constraint matches a null id too, so ordering them the other
      // way round would make the bare cases unreachable and interpolate
      // "null" into a path.
      StatusDeepLink(id: null) => StatusRoutes.home,
      StatusDeepLink(:final id) => '${StatusRoutes.home}?highlight=$id',
      AartiDeepLink(audioId: null) => AartiRoutes.main,
      // AartiRoutes.deepLinkPattern: /aarti-bhajans/audio/:audioId
      AartiDeepLink(:final audioId) => '/aarti-bhajans/audio/$audioId',
      MantraDeepLink(audioId: null) => MantrasRoutes.main,
      // MantrasRoutes.deepLinkPattern: /mantras/audio/:itemId — the
      // module's own resolver screen (entitlement refresh → player or
      // module home), the mirror of Aarti's.
      MantraDeepLink(:final audioId) => '/mantras/audio/$audioId',
      BookDeepLink(contentId: null) => BooksRoutes.home,
      // BooksRoutes.contentsPattern: /books/:id/contents
      BookDeepLink(:final contentId) => '/books/$contentId/contents',
      HoroscopeDeepLink(zodiacId: null) => RashifalRoutes.main,
      // HoroscopeRoutes.resultPattern: /horoscope/result/:zodiacId
      HoroscopeDeepLink(:final zodiacId) => '/horoscope/result/$zodiacId',
      // A bare ringtone link is the module's FREE grid; the id-carrying one is
      // the Pro-only preview. That difference is the whole reason an ad lands
      // on the former.
      RingtoneDeepLink(id: null) => RingtoneRoutes.home,
      // RingtoneRoutes.previewPattern: /ringtones/preview/:id (plural)
      RingtoneDeepLink(:final id) => '/ringtones/preview/$id',
      // Wallpaper: the current preview route requires an `extra`
      // WallpaperPreviewArgs carrying the originating feed + start index
      // (built for in-app reels swiping, not URL-driven navigation).
      // Deep-linking a single wallpaper by ID needs (a) a fetch-by-id
      // repository method and (b) a single-item preview screen — neither
      // exists yet, so v1 lands on the wallpaper home with the id captured
      // as a `?highlight=` query for a follow-up to scroll/highlight to.
      // Same pattern as status. Recipient still sees the module; the
      // shared item is discoverable via scroll.
      WallpaperDeepLink(id: null) => WallpaperRoutes.home,
      WallpaperDeepLink(:final id) => '${WallpaperRoutes.home}?highlight=$id',
      PaywallDeepLink() => '/paywall',
      // Home tab lives at branch 0 of the shell (TAM-58 StatefulShellRoute).
      HomeDeepLink() => '/home',
      // A payment-return replay (e.g. via consumePendingIntent) lands on the
      // paywall — the poll restart is the whole point of the target, and
      // dropping the user anywhere else would waste the return signal.
      PaymentReturnDeepLink() => '/paywall',
      UnknownDeepLink() => '/home',
    };
  }
}
