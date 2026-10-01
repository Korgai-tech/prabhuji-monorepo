import 'dart:async';

import 'package:amplitude_flutter/amplitude.dart' as realamp;
import 'package:amplitude_flutter/configuration.dart' as realamp;
import 'dart:convert';
import 'dart:io' show Directory, File, InternetAddress;

import 'package:chucker_flutter/chucker_flutter.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:path_provider/path_provider.dart';
import 'package:facebook_app_events/facebook_app_events.dart';
import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart' show kDebugMode, debugPrint, visibleForTesting;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:media_kit/media_kit.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'core/advertising_id_service.dart';
import 'core/analytics.dart';
import 'core/analytics_enricher.dart';
import 'core/app_config.dart';
import 'core/secrets.dart';
import 'core/auth_store.dart';
import 'core/deep_link_replay.dart';
import 'core/navigation_stack.dart';
import 'core/deep_link_service.dart';
import 'core/dev_flags.dart';
import 'core/device_context.dart';
import 'core/dio_client.dart';
import 'core/entitlement.dart';
import 'core/firebase_notifications.dart';
import 'core/firebase_token_sync.dart';
import 'core/install_referrer_reader.dart';
import 'core/notification_analytics.dart';
import 'core/notification_background_receipt.dart';
import 'core/notification_permission.dart';
import 'core/notification_tap_handler.dart';
import 'core/pending_intent_store.dart';
import 'core/router.dart';
import 'core/service_locator.dart';
import 'core/services/clarity_service.dart';
import 'core/services/crashlytics_service.dart';
import 'core/session_context.dart';
import 'core/user_properties.dart';
import 'features/chat/data/chat_counters.dart';
import 'features/downloads/downloads_providers.dart';
import 'features/downloads/downloads_routes.dart';
import 'features/onboarding/bloc/onboarding_orchestrator_bloc.dart';
import 'features/onboarding/onboarding_analytics.dart';
import 'features/paywall/application/payment_return_registrar.dart';
import 'features/paywall/paywall_analytics.dart';
import 'features/paywall/presentation/paywall_screen.dart';
import 'features/referral/referral_sync_service.dart';
import 'features/status/data/status_profile_flags_store.dart';
import 'features/status/details/bloc/status_profile_cubit.dart';
import 'features/status/status_providers.dart';
import 'state/providers.dart';

/// FCM background message handler. MUST be a top-level function (or static)
/// AND annotated with `@pragma('vm:entry-point')` so the AOT compiler retains
/// it under tree-shaking — the isolate that runs it doesn't share the app's
/// Dart heap. Fires for pushes received while the app is backgrounded /
/// terminated with a `data` payload; system-tray display for `notification`
/// payloads is handled by the OS regardless of this handler.
///
/// Kept intentionally minimal: initialise Firebase in the background isolate
/// and no-op otherwise. Tap dispatch lives in [FirebaseNotifications] and
/// runs in the main isolate on app resume.
@pragma('vm:entry-point')
Future<void> firebaseBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  if (kDebugMode) {
    debugPrint('[FCM background] message: ${message.messageId}');
  }
  // `notification_received` for background / killed deliveries — see
  // notification_background_receipt.dart for the three delivery routes.
  await handleBackgroundNotificationReceipt(message);
}

/// A [BlocObserver] that dumps state transitions to `debugPrint` in debug
/// builds. Zero-cost in release — we early-return before formatting.
class _DebugBlocObserver extends BlocObserver {
  @override
  void onChange(BlocBase<dynamic> bloc, Change<dynamic> change) {
    super.onChange(bloc, change);
    if (!kDebugMode) return;
    debugPrint('[Bloc] ${bloc.runtimeType}: '
        '${change.currentState.runtimeType} → ${change.nextState.runtimeType}');
  }

  @override
  void onError(BlocBase<dynamic> bloc, Object error, StackTrace stackTrace) {
    super.onError(bloc, error, stackTrace);
    if (!kDebugMode) return;
    debugPrint('[Bloc] ${bloc.runtimeType} error: $error');
  }
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // media_kit's libmpv/FFmpeg backend. Required before ANY `Player()` is
  // constructed — the Status feed's video port (see
  // `lib/features/status/feed/status_video_port.dart`) uses it to bypass
  // broken hardware decoders on Xiaomi/MIUI (and similar) that produce
  // corrupted frames on user-generated status videos.
  MediaKit.ensureInitialized();

  // Lock the app to portrait — no landscape support. The design (Figma
  // frames + our Layout-intent tests) is all authored on a 360×800 portrait
  // canvas; landscape would break every screen's pinned-bottom card, hero
  // aspect ratios, and the shell's bottom nav. On Android the MainActivity
  // is ALSO locked via `android:screenOrientation="portrait"` in the manifest
  // so the OS never rotates the Activity in the first place; this Dart lock
  // covers iOS + is defence-in-depth on Android.
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
  ]);

  // Load the per-env config bundle (env/<staging|preprod|prod>.json) before
  // any consumer runs. `buildDio` reads AppConfig.apiUrl, `Analytics.init`
  // reads eventsUrl + eventsApiKey — both downstream of this line.
  await AppConfig.initialize();

  // Load the gitignored app-secrets bundle (env/prabhujiSecrets.json). One
  // file for the whole app, regardless of ENV. Missing file → every secret
  // is null and consumers degrade cleanly (Meta events skipped, etc.). Must
  // run before Analytics.init so the Meta/Facebook check downstream works.
  await Secrets.initialize();

  // Bundled Inter + Libre Caslon Text TTFs live under assets/fonts/ (see
  // pubspec.yaml). Turning off runtime fetching means google_fonts resolves
  // family names to the bundled files instead of hitting fonts.gstatic.com —
  // critical on emulators without internet, and shrinks first-frame time
  // in production.
  GoogleFonts.config.allowRuntimeFetching = false;

  // Chucker HTTP inspector — gated by [kEnableChucker] (see
  // `core/dev_flags.dart`). On by default in debug, opt-in for release
  // with `--dart-define=ENABLE_CHUCKER=true`. `showNotification = false`
  // hides the per-request toast chip (we render our own persistent FAB
  // via `_ChuckerFab` below). `showOnRelease = true` is what actually
  // unlocks the overlay in a release build — the previous debug-only
  // gate hard-set this to false regardless. Guarded so a placeholder /
  // no-flag release build never surfaces the network-log UI.
  if (kEnableChucker) {
    ChuckerFlutter.showNotification = false;
    ChuckerFlutter.showOnRelease = true;
  }

  Bloc.observer = _DebugBlocObserver();

  final store = AuthStore();
  // Hydrate the encrypted-storage token into an in-memory cache BEFORE
  // anything else touches it. This is what lets every downstream consumer
  // (Dio interceptor, router redirect, orchestrator) read synchronously and
  // deterministically — no async-race, no stale-value window.
  await store.hydrate();
  final token = store.read();

  // SharedPreferences is resolved once here and shared across:
  //  - the analytics enricher (for the persisted `anonymous_id`)
  //  - the paywall bloc (impression counter) via the service locator
  // Resolving inside the locator would hang under `flutter test` when the
  // platform channel is stubbed.
  final preferences = await SharedPreferences.getInstance();

  // Shared session context + enricher — must be constructed BEFORE
  // Analytics.init so the enricher can bake in the anonymous id + PackageInfo
  // + session id from first launch (TAM-55).
  final sessionContext = SessionContext();
  // TAM-167 — the enricher stamps `chat_type` on every event so any surface
  // (home / aarti / paywall / kuldevta / chat_button_clicked) can be split
  // by experiment arm. `UsersRepository.getMe` mirrors
  // `/users/me → chatConfig.chatType` into `ChatCounters` on every successful
  // fetch — the one place the app learns the arm — so constructing one over
  // the same [preferences] reads the freshest value synchronously per event.
  // An empty store (a fresh install's events before its first /users/me has
  // landed) stamps an EMPTY `chat_type` rather than guessing a cohort —
  // `'control'` is a real arm and must only ever come from the server. The
  // key itself is always present. Cleared on logout by `handleLogout`.
  final enricherChatCounters = ChatCounters(preferences);
  // The enricher also stamps `has_name` / `has_photo` on every event — whether
  // the user has a display name and an avatar on their `/status/profile`
  // record. `DioStatusRepository` mirrors both into this store on every
  // profile fetch and save, so reading it here resolves synchronously per
  // event (the profile itself is a network resource most surfaces never
  // fetch). Constructed over the same [preferences] the locator registers, so
  // writer and reader share one view of the data.
  final enricherProfileFlags = StatusProfileFlagsStore(preferences);
  AnalyticsEnricher? enricher;
  try {
    enricher = await AnalyticsEnricher.init(
      sessionContext: sessionContext,
      preferences: preferences,
      chatTypeReader: enricherChatCounters.savedChatType,
      hasNameReader: enricherProfileFlags.hasName,
      hasPhotoReader: enricherProfileFlags.hasPhoto,
    );
  } catch (_) {
    enricher = null; // enrichment is optional — analytics still tracks bare events
  }

  // Firebase must initialise BEFORE Analytics.init so `FirebaseAnalytics.
  // instance` is a valid platform channel by the time we thread it into the
  // analytics seam. Same try/catch pattern used later for FCM: a failure
  // downgrades the app to Amplitude-only + no FCM, never a broken boot.
  //
  // Also register the FCM background handler here so a push landing during
  // boot has a handler waiting; the actual FCM token sync + notifications
  // wiring stays in its own try below because it needs `dio` (constructed
  // AFTER analytics, since analytics is passed into the dio's request logger
  // via the service locator).
  FirebaseAnalytics? firebaseAnalytics;
  bool firebaseReady = false;
  try {
    await Firebase.initializeApp();
    FirebaseMessaging.onBackgroundMessage(firebaseBackgroundHandler);
    firebaseAnalytics = FirebaseAnalytics.instance;
    firebaseReady = true;
  } catch (e) {
    if (kDebugMode) debugPrint('[main] Firebase init skipped: $e');
  }

  // Crash reporting. Fire-and-forget — the error hooks are installed
  // synchronously inside initialize(), the rest is platform-channel setup
  // that must not delay boot. Identity follows the auth stream directly (not
  // via the analytics listener below, which only exists when analytics
  // initialised): restored session now, then every login/logout.
  if (firebaseReady) {
    final crashlytics = CrashlyticsService.instance;
    unawaited(crashlytics.initialize());
    unawaited(crashlytics.setUserFromToken(token));
    store.changes.listen((next) {
      unawaited(crashlytics.setUserFromToken(next));
    });
  }

  // Meta / Facebook App Events — third analytics sink. Only constructed
  // when the App ID + Client Token in `prabhujiSecrets.json` are real
  // (non-placeholder). The Android manifest's `com.facebook.sdk.ApplicationId`
  // / `com.facebook.sdk.ClientToken` <meta-data> tags are wired: values are
  // injected as string resources by `android/app/build.gradle.kts` from the
  // same `env/prabhujiSecrets.json` file this Dart code reads, so both sides
  // pick up new keys in one place. A placeholder build (empty strings in the
  // manifest, `_facebook` null here) never invokes the native SDK.
  FacebookAppEvents? facebookAppEvents;
  if (Secrets.instance.metaEnabled) {
    try {
      facebookAppEvents = FacebookAppEvents();
    } catch (e) {
      if (kDebugMode) debugPrint('[main] Meta init skipped: $e');
    }
  }

  // Fourth analytics sink alongside the in-repo tracker + Firebase + Meta:
  // the ORIGINAL Amplitude Flutter SDK (cloud). Only constructed when
  // `Secrets.instance.amplitudeApiKey` is a real value — a placeholder /
  // missing key leaves it null and every fan-out call inside `Analytics`
  // silently skips. Prefixed types avoid the class-name collision with
  // `custom_analytics_flutter`.
  realamp.Amplitude? realAmplitude;
  if (Secrets.instance.amplitudeCloudEnabled) {
    try {
      realAmplitude = realamp.Amplitude(realamp.Configuration(
        apiKey: Secrets.instance.amplitudeApiKey!,
      ));
    } catch (e) {
      if (kDebugMode) debugPrint('[main] realAmplitude init skipped: $e');
    }
  }

  // Note: ClarityService is initialized in AppShellScaffold after login —
  // do NOT add a Clarity.initialize call here. Clarity needs BOTH a
  // BuildContext AND a real logged-in user id (JWT `sub`), neither of
  // which is available at cold-start `main()` time.
  // Advertising id source (Google Advertising ID on Android, IDFA on iOS).
  // Resolve lives inside Analytics.init — that's the single seam that fetches
  // + caches once and then attaches to every event as top-level `adid`.
  final advertisingIdService = AdvertisingIdService.fromPreferences(preferences);
  Analytics? analytics;
  try {
    analytics = await Analytics.init(
      enricher: enricher,
      firebase: firebaseAnalytics,
      facebook: facebookAppEvents,
      realAmplitude: realAmplitude,
      advertisingIdService: advertisingIdService,
    );
    // Restored session: re-attach analytics identity (fire-and-forget).
    // Fans out to ALL three sinks (Amplitude + Firebase + Meta) inside signIn.
    if (token != null) {
      unawaited(analytics.signIn(token));
    } else {
      // No restored JWT — any userId the SDK still has on disk is a leftover
      // from a previous unverified send (TAM-154: `POST /auth/otp/send` mints
      // a User row and we attach it via `setPendingUser` from PhoneOtpBloc).
      // Wipe it so `app_opened` / `splash_screen_viewed` / anything the user
      // does before entering a phone on THIS launch aren't attributed to
      // whoever tried to log in last time. Safe on a first-ever install
      // (no id → no-op) and safe post-logout (reset() ran on that path).
      unawaited(analytics.clearPendingUser());
    }
  } catch (_) {
    analytics = null; // analytics must never block or break startup
  }

  // Device / app metadata bag stamped on every outbound API request by the
  // dio interceptor (`deviceHeaderInterceptor`). Resolved ONCE here so the
  // interceptor's `onRequest` stays synchronous — a plugin failure degrades
  // every field to `''` rather than throwing (see `DeviceContext.resolve`).
  DeviceContext deviceContext;
  try {
    deviceContext = await DeviceContext.resolve();
  } catch (_) {
    deviceContext = DeviceContext.empty;
  }

  // The GetIt-owned dio shares the same AuthStore singleton as the Riverpod
  // `apiClientProvider` (see state/providers.dart) — both call `store.read()`
  // synchronously against the hydrated cache.
  final dio = buildDio(store, deviceContext: deviceContext);

  // Firebase Cloud Messaging — Android-only for now (iOS deferred until
  // GoogleService-Info.plist is added). If Firebase init failed above we
  // skip the FCM token sync AND the notifications wiring — the app still
  // boots (and analytics still ships to Amplitude).
  FirebaseTokenSync? firebaseTokenSync;
  FirebaseNotifications? firebaseNotifications;
  if (firebaseReady) {
    try {
      firebaseTokenSync = FirebaseTokenSync(authStore: store, dio: dio);
      firebaseTokenSync.start();
      firebaseNotifications = FirebaseNotifications(analytics: analytics);
      await firebaseNotifications.initialize();
    } catch (e) {
      if (kDebugMode) debugPrint('[main] FCM init skipped: $e');
      firebaseTokenSync = null;
      firebaseNotifications = null;
    }
  }

  // Install-referrer reader — one instance shared across two consumers:
  // DeepLinkService's post-install `/app/*` replay AND ReferralSyncService's
  // first-launch attribution POST. Both read from the same in-memory cache
  // (the reader hits Play Install Referrer once per process). Each consumer
  // holds its own SharedPreferences "already did my thing" flag.
  final installReferrerReader = PlayInstallReferrerReader();

  await configureLocator(
    authStore: store,
    dio: dio,
    analytics: analytics,
    preferences: preferences,
    sessionContext: sessionContext,
    deviceContext: deviceContext,
    firebaseTokenSync: firebaseTokenSync,
    firebaseNotifications: firebaseNotifications,
    advertisingIdService: advertisingIdService,
    installReferrerReader: installReferrerReader,
    pseudoIdProvider: firebaseAnalytics == null
        ? null
        : () async {
            try {
              return await firebaseAnalytics!.appInstanceId;
            } catch (_) {
              return null;
            }
          },
  );

  // Sheet-3 user-properties: cold-start "app opened" identify. Fires
  // `last_app_open_at` immediately (client-side); the server-tracked
  // `total_sessions` counter and `first_app_open_at` refresh via
  // `applyServerSnapshot` once the /users/me/activity endpoint lands
  // (see docs/ANALYTICS-USER-PROPERTIES-BACKEND.md). Warm-resume side
  // fires from `_MobileAppState.didChangeAppLifecycleState` below.
  serviceLocator<UserPropertiesTracker>().onAppOpen();

  // Push funnel. The splash asks for the permission (Android-classified,
  // FCM's ask elsewhere); the bridge lets the FCM background isolate hand
  // `notification_received` to this isolate while the app is backgrounded;
  // the drain replays receipts the background isolate had to park.
  final notificationsForPermission = firebaseNotifications;
  if (notificationsForPermission != null) {
    serviceLocator.registerSingleton<NotificationPermission>(
      NotificationPermission(
        requestNonAndroid: notificationsForPermission.requestPermission,
      ),
    );
  }
  if (analytics != null) {
    listenForBackgroundNotificationReceipts(analytics);
    unawaited(drainPendingNotificationReceipts(
      analytics: analytics,
      preferences: preferences,
    ));
  }

  // Sheet-1 row 1 — `app_opened` fires ONCE per process (i.e. once per
  // session; `session_id` from `AnalyticsEnricher` never rotates on
  // background, so process lifetime == session). The `_fired` latch on
  // `AppLaunchTracker` guards against a second `runApp` / hot restart.
  // Warm resumes are intentionally silent — subsequent events already
  // carry `entry_source: resume` via `SessionContext`, so consumers can
  // still tell a mid-session event apart from a cold-start one without
  // re-firing `app_opened`. `is_first_open` reads a boolean flag persisted
  // on first launch. `days_since_last_open` is the whole-day delta between
  // `now` and the previous stored open (null on first).
  if (analytics != null) {
    unawaited(AppLaunchTracker.instance.recordColdLaunch(
      analytics: analytics,
      preferences: preferences,
      launchNotification: firebaseNotifications?.initialTap,
    ));
  }

  // Tie analytics identity to the auth stream so login/logout events flip
  // Amplitude's user id without every login/logout path having to remember
  // to call signIn/reset itself. Fire-and-forget: an analytics failure must
  // never break auth.
  final capturedAnalytics = analytics;
  if (capturedAnalytics != null) {
    store.changes.listen((next) {
      if (next != null) {
        unawaited(capturedAnalytics.signIn(next));
      } else {
        unawaited(capturedAnalytics.reset());
        // Wipe the global `has_name` / `has_photo` flags on the same branch:
        // they describe the logged-OUT user's `/status/profile` record, and
        // without this the next user on this device would report user A's
        // profile state on every event until their first profile fetch.
        enricherProfileFlags.clear();
        // TAM-127: on logout, wipe ClarityService's `_isInitialized` flag
        // so the next login re-initialises with the new user's JWT `sub`
        // (from AppShellScaffold.initState). Same shape as
        // Analytics.reset() — a paired cleanup on the same auth branch.
        ClarityService().reset();
      }
    });
  }

  // TAM-124: on logout, wipe any pending deep-link intent so the next user
  // on this device doesn't inherit user A's queued share target. The
  // DeepLinkService is only registered after `runApp` (inside
  // `_MobileAppState.initState`) so we guard the lookup here.
  store.changes.listen((next) {
    if (next != null) return;
    if (!serviceLocator.isRegistered<DeepLinkService>()) return;
    unawaited(serviceLocator<DeepLinkService>().clearPendingIntent());
  });

  // Tie FCM token registration to fresh logins. The initial cold-start sync
  // runs once below (right after configureLocator); this listener catches
  // subsequent transitions to non-null (OTP verify → JWT stored) so the token
  // is registered immediately after login without every login path having to
  // remember. Logout paths call `logout()` explicitly BEFORE `store.clear()`
  // so the DELETE still has a Bearer.
  //
  // POST_NOTIFICATIONS is asked from SplashScreen.initState (not here) so the
  // prompt lands on every launch until the user grants OR Android's system
  // throttle silences it — visible to logged-in AND onboarding users alike.
  final capturedSync = firebaseTokenSync;
  if (capturedSync != null) {
    store.changes.listen((next) {
      if (next != null) {
        unawaited(capturedSync.syncIfAuthenticated());
      }
    });
    // Restored session: kick off the first sync.
    if (token != null) unawaited(capturedSync.syncIfAuthenticated());
  }

  // TAM-125 — cold-start offline routing (Part A).
  //
  // Netflix/Spotify pattern: if the device is offline AND the user has at
  // least one previously-downloaded item, land them on `/downloads`
  // directly. Decided HERE (not in a router redirect) so the very first
  // frame the router paints is correct — no `/home` flash while
  // `connectivity_plus` resolves, no redirect loop, no coupling between
  // the router and the downloads module beyond the initial-location
  // provider override.
  //
  // Reads `downloads/index.json` from disk (same file the encrypted store
  // writes on completion) so this works BEFORE `DownloadManager.hydrate()`
  // has run — hydrate populates the in-memory snapshot the shell renders,
  // but the routing decision only needs the count.
  final bootstrapInitialLocation = await _resolveBootstrapInitialLocation();

  // First-launch install-attribution sync. Fires as soon as we have BOTH a
  // logged-in user (JWT hydrated OR a fresh login lands) AND the install
  // referrer has been read. The service itself is idempotent (a
  // SharedPreferences flag makes it once-per-install) and silent-no-ops when
  // referral config / tenant secret are still placeholders, so a partial
  // production build won't spam the referral backend.
  if (serviceLocator.isRegistered<ReferralSyncService>()) {
    final referralSync = serviceLocator<ReferralSyncService>();
    // Login transition path — every non-null token change triggers a check.
    store.changes.listen((next) {
      if (next != null) unawaited(referralSync.syncIfNeeded());
    });
    // Restored-session path — a user already logged in at cold start still
    // needs their first-launch sync if it hasn't happened yet.
    if (token != null) unawaited(referralSync.syncIfNeeded());
  }

  runApp(ProviderScope(
    overrides: [
      authStoreProvider.overrideWithValue(store),
      analyticsProvider.overrideWithValue(analytics),
      bootstrapInitialLocationProvider
          .overrideWithValue(bootstrapInitialLocation),
    ],
    child: const MobileApp(),
  ));
}

/// Read the encrypted-store index directly from disk + the current
/// connectivity state, and return the router's initial location. Best-effort:
/// any failure (missing dir, corrupt JSON, connectivity plugin error) falls
/// back to `/splash` — the app boots normally and the user can navigate to
/// Downloads themselves.
///
/// Bias — the caller uses this to decide whether to show a full-screen
/// offline UX, so EVERY ambiguous signal resolves to ONLINE:
///  * empty result from `checkConnectivity` → ONLINE (plugin init glitch)
///  * `checkConnectivity` times out (>2s) → ONLINE
///  * plugin says offline BUT a DNS lookup to `one.one.one.one` succeeds
///    within 2s → ONLINE (plugin was wrong about the physical link)
///  * any exception → ONLINE (via the outer try/catch)
///
/// Only if BOTH signals unambiguously agree "no network" do we send the
/// user straight to Downloads at cold start.
Future<String> _resolveBootstrapInitialLocation() async {
  try {
    final List<ConnectivityResult> conn = await Connectivity()
        .checkConnectivity()
        .timeout(
          const Duration(seconds: 2),
          onTimeout: () => const <ConnectivityResult>[],
        );
    // Empty list → treat as ONLINE (plugin glitch, not a real "no network"
    // signal). Only ALL-none means physically offline.
    final connectivitySaysOffline = conn.isNotEmpty &&
        conn.every((r) => r == ConnectivityResult.none);
    if (!connectivitySaysOffline) return '/splash';

    // Double-check the connectivity signal with a real DNS lookup before
    // committing to the "block the UI" decision. If the lookup succeeds,
    // there's some form of network reachable — trust it over
    // `checkConnectivity()`.
    if (await _internetReachable()) return '/splash';

    final Directory docs = await getApplicationDocumentsDirectory();
    final File index = File('${docs.path}/downloads/index.json');
    if (!await index.exists()) return '/splash';
    final raw = await index.readAsString();
    if (raw.trim().isEmpty || raw.trim() == '[]') return '/splash';
    final decoded = jsonDecode(raw);
    if (decoded is! List || decoded.isEmpty) return '/splash';
    return DownloadsRoutes.library;
  } catch (_) {
    return '/splash';
  }
}

/// DNS-only reachability probe. Cheaper than an HTTPS round-trip and
/// independent of our API's availability (a downed stage API shouldn't
/// send users to Downloads if the internet itself is fine). Returns
/// false on timeout, socket error, or any exception — the caller then
/// trusts the connectivity plugin's "offline" verdict.
Future<bool> _internetReachable() async {
  try {
    final result = await InternetAddress.lookup('one.one.one.one').timeout(
      const Duration(seconds: 2),
    );
    return result.isNotEmpty && result.first.rawAddress.isNotEmpty;
  } catch (_) {
    return false;
  }
}

class MobileApp extends ConsumerStatefulWidget {
  const MobileApp({super.key});

  @override
  ConsumerState<MobileApp> createState() => _MobileAppState();
}

class _MobileAppState extends ConsumerState<MobileApp>
    with WidgetsBindingObserver {
  StreamSubscription<NotificationTap>? _tapSub;
  StreamSubscription<String?>? _notificationLogoutSub;
  VoidCallback? _disposeNotificationReplay;
  StreamSubscription<String?>? _entitlementLogoutSub;
  StreamSubscription<String?>? _downloadsLogoutSub;
  DeepLinkService? _deepLinkService;
  VoidCallback? _disposeReplay;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // Hydrate the entitlement from secure storage BEFORE anything else — a
    // user who paid successfully then killed the app must not see the paywall
    // re-appear on relaunch just because the orchestrator's
    // `/subscription/status` fetch is still in-flight (or has failed on a
    // flaky network). `EntitlementNotifier.build()` returns free() then the
    // hydrate below flips state to the persisted decision (or leaves it free
    // if there's no cache yet). A subsequent successful orchestrator refresh
    // overrides this; a failed one leaves the hydrated value in place.
    //
    // Reading the provider first ensures build() has run — otherwise setting
    // state inside hydrate() throws (Riverpod invariant).
    ref.read(entitlementStateProvider);
    unawaited(ref.read(entitlementStateProvider.notifier).hydrate());

    // TAM-125 — hydrate the DownloadManager's in-memory state from the
    // encrypted store's `index.json` on cold start so previously-downloaded
    // items reappear in the Downloads library without a network fetch.
    // Fire-and-forget: the library screen re-reads the snapshot on first
    // build, so a slow disk read just means the empty state flashes briefly.
    unawaited(ref.read(downloadManagerProvider).hydrate());

    // On logout, wipe the persisted entitlement so the next user on this
    // device doesn't inherit user A's Pro status. Lives here (not in
    // main.dart's auth listener block) because clearing needs Riverpod
    // `ref` to reach the notifier. Sibling to the DeepLinkService
    // clearPendingIntent hook the pending-intent store gets.
    final authStore = ref.read(authStoreProvider);
    _entitlementLogoutSub = authStore.changes.listen((next) {
      if (next != null) return; // login — nothing to do
      ref.read(entitlementStateProvider.notifier).clear();
    });

    // TAM-125 — on logout, wipe the Downloads state so user B on the same
    // device does NOT inherit user A's encrypted audio library. Cancels
    // active downloads, clears in-memory queue + snapshot, deletes every
    // ciphertext under `downloads/`, and wipes the AES master key from
    // flutter_secure_storage (so any residual blob is unreadable even in
    // the worst case). Fires while the JWT is still present so any
    // `download_cancelled` events from the shutdown carry the correct
    // user id (auth's listener chain calls this listener before
    // AuthStore.clear finishes propagating downstream).
    _downloadsLogoutSub = authStore.changes.listen((next) {
      if (next != null) return; // login — nothing to do
      unawaited(ref.read(downloadManagerProvider).shutdown());
    });

    // Bridge the orchestrator's subscription snapshot into the live
    // entitlementProvider so PaywallGate reads the real Pro flag as soon as
    // login/session-restore completes — no extra /subscription/status round-trip
    // and no race with the user's first Pro-feature tap.
    if (serviceLocator.isRegistered<OnboardingOrchestratorBloc>()) {
      serviceLocator<OnboardingOrchestratorBloc>().onSubscriptionSnapshot =
          (snapshot) =>
              ref.read(entitlementStateProvider.notifier).seed(snapshot);
    }
    // FCM taps → click analytics + routing. Runs for every trigger
    // (foreground local, backgrounded onOpen, and the tap that launched the
    // app). Until the app has landed on Home with a logged-in user, taps are
    // parked and replayed from the same Home milestone share links use.
    if (serviceLocator.isRegistered<FirebaseNotifications>()) {
      _wireNotificationTaps(serviceLocator<FirebaseNotifications>());
    }
    // Deep-link service (TAM-124) — wires prabhuji:// custom scheme +
    // https://krutyug.ai/app/* App Links into the parser → paywall gate →
    // router pipeline. Registered on the service locator so router hooks
    // (`_schedulePendingIntentReplay` in router.dart) can find it.
    //
    // Guarded so tests that don't `configureLocator` still boot the app —
    // an unregistered locator is the default in widget-tests.
    if (!serviceLocator.isRegistered<DeepLinkService>()) {
      final authStore = ref.read(authStoreProvider);
      final analytics = ref.read(analyticsProvider);
      final router = ref.read(routerProvider);
      // SharedPreferences.getInstance() is cached after the first call in
      // main(); this second resolution is essentially free and keeps us
      // from having to plumb the instance through providers.
      unawaited(SharedPreferences.getInstance().then((prefs) {
        // The install-referrer reader is now a shared singleton so both
        // DeepLinkService and the ReferralSyncService read the same
        // in-memory cache. Fall back to a NoOp when the locator isn't
        // wired (widget tests that skip configureLocator).
        final referrerReader =
            serviceLocator.isRegistered<InstallReferrerReader>()
                ? serviceLocator<InstallReferrerReader>()
                : const NoOpInstallReferrerReader();
        final service = DeepLinkService(
          pendingIntentStore: PendingIntentStore(),
          isLoggedIn: () => authStore.read() != null,
          isProUser: () => ref.read(entitlementProvider),
          navigateToStack: (stack) => applyNavigationStack(router, stack),
          pushPaywall: () => router.push(
            '/paywall',
            extra: const PaywallArgs(
              triggerModule: UserPropertyModule.deepLink,
              triggerAction: PaywallTriggerAction.deepLink,
              entrySource: PaywallEntrySource.deepLink,
            ),
          ),
          trackEvent: (name, properties) => unawaited(
            analytics?.trackEvent(name, properties: properties) ??
                Future.value(),
          ),
          // TAM-124 Part A wiring — the router's `_PaymentReturnBinder`
          // registers itself on the paywall's mount, so this fires
          // `AppResumedFromUpi` on the correct route-scoped PaymentBloc
          // and no-ops when the paywall isn't up. `currentLocation`
          // reads the router's active path so the payment-return branch
          // can skip a redundant `go('/paywall')` when we're already
          // there (avoids tearing down the bloc mid-poll).
          onPaymentReturn: PaymentReturnRegistrar.firePaymentReturn,
          currentLocation: () =>
              router.routerDelegate.currentConfiguration.uri.path,
          installReferrerReader: referrerReader,
          readBool: (key) async => prefs.getBool(key),
          writeBool: (key, value) async {
            await prefs.setBool(key, value);
          },
        );
        if (serviceLocator.isRegistered<DeepLinkService>()) return;
        serviceLocator.registerSingleton<DeepLinkService>(service);
        _deepLinkService = service;

        // The LOGIN replay (TAM-124 flow 2). Wired here rather than in
        // `main()` because it needs the router, which doesn't exist until
        // the first build. `persistentOnly` keeps it off the paywall
        // interstitial's own session intent — see `deep_link_replay.dart`
        // for why "landed on /home" is the trigger and not the two more
        // obvious signals.
        _disposeReplay = wireDeepLinkReplayOnHome(
          router,
          () => authStore.read() != null,
          () async {
            // Precedence, in one place: a parked share link ALWAYS beats the
            // experiment's landing. `consumePendingIntent` reports whether it
            // took one, so the check and the consume stay atomic.
            final replayed =
                await service.consumePendingIntent(persistentOnly: true);
            if (replayed) return;
            // TAM-259. This trigger — "/home is the top of the stack" — is the
            // only one true on EVERY path to home: Pro straight through, free
            // via the paywall, returning user, paywall skipped. The two hooks
            // this originally used were not: the splash redirect only runs for
            // a user who settles on home while still on /splash, and
            // `OnboardingStep.paywallDismissed` is dead code — nothing
            // dispatches it, because `paywall_close.dart` calls
            // `context.go('/home')` directly (see `deep_link_replay.dart`,
            // which documents the same trap for the pending-intent replay).
            // So a FREE user — most of them — never got their landing.
            //
            // `take` and not a read: this fires whenever home becomes the top
            // of the stack, tapping the Home tab included.
            if (!serviceLocator.isRegistered<OnboardingOrchestratorBloc>()) {
              return;
            }
            service.openLanding(
              serviceLocator<OnboardingOrchestratorBloc>().takePendingLanding(),
            );
          },
        );
        // Fire and forget — deep-link intake must never block startup.
        unawaited(service.initialize());
      }));
    }
  }

  void _wireNotificationTaps(FirebaseNotifications notifications) {
    // Router is Riverpod-owned; read (not watch) — the instance is
    // long-lived.
    final router = ref.read(routerProvider);
    final authStore = ref.read(authStoreProvider);
    bool isLoggedIn() => authStore.read() != null;
    final handler = NotificationTapHandler(
      analytics: ref.read(analyticsProvider),
      // Same stack treatment as a share link: a notification tap is an
      // external arrival too, so `go`-ing the target alone would leave the
      // user one back-press from exiting the app.
      navigate: (stack) => applyNavigationStack(router, stack),
      currentLocation: () => topLocationOf(router),
      isLoggedIn: isLoggedIn,
      isProUser: () => ref.read(entitlementProvider),
      openPaywall: () {
        unawaited(router.push<void>(
          '/paywall',
          extra: const PaywallArgs(
            triggerModule: UserPropertyModule.notification,
            triggerAction: PaywallTriggerAction.notification,
            entrySource: PaywallEntrySource.notification,
          ),
        ));
        return untilTopLeaves(router, '/paywall');
      },
    );
    _disposeNotificationReplay =
        wireDeepLinkReplayOnHome(router, isLoggedIn, handler.onHomeReached);
    _notificationLogoutSub = authStore.changes.listen((next) {
      if (next == null) handler.onLoggedOut();
    });
    _tapSub = notifications.taps.listen(handler.handle);
    final launchTap = notifications.takeInitialTap();
    if (launchTap != null) handler.handle(launchTap);
  }

  @override
  void dispose() {
    unawaited(_tapSub?.cancel());
    _tapSub = null;
    unawaited(_notificationLogoutSub?.cancel());
    _notificationLogoutSub = null;
    _disposeNotificationReplay?.call();
    _disposeNotificationReplay = null;
    unawaited(_entitlementLogoutSub?.cancel());
    _entitlementLogoutSub = null;
    unawaited(_downloadsLogoutSub?.cancel());
    _downloadsLogoutSub = null;
    // Deep-link service holds the app_links stream subscription; close it
    // so a hot-restart doesn't leave a leaked listener that survives across
    // the new isolate's DeepLinkService instance.
    unawaited(_deepLinkService?.dispose());
    _deepLinkService = null;
    _disposeReplay?.call();
    _disposeReplay = null;
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // First resume after the initial cold-start flips the entry_source on
    // subsequent events. Idempotent — safe to call every time.
    if (state != AppLifecycleState.resumed) return;
    if (serviceLocator.isRegistered<SessionContext>()) {
      serviceLocator<SessionContext>().markResume();
    }
    // Sheet-3 user-properties: warm-resume side of onAppOpen. Cold-start
    // side fires from main() right after configureLocator. Every resume
    // stamps a fresh `last_app_open_at`; the deduper collapses no-ops.
    if (serviceLocator.isRegistered<UserPropertiesTracker>()) {
      serviceLocator<UserPropertiesTracker>().onAppOpen();
    }
    // Receipts the FCM background isolate parked while we were away.
    final analytics = ref.read(analyticsProvider);
    if (analytics != null) {
      unawaited(SharedPreferences.getInstance().then((prefs) =>
          drainPendingNotificationReceipts(
            analytics: analytics,
            preferences: prefs,
          )));
    }
    // Note: `app_opened` is deliberately NOT re-fired on warm resume — the
    // event is a per-session signal, and this app treats one process as
    // one session (`session_id` never rotates on background). Downstream
    // consumers who need "user came back from background" read
    // `entry_source: resume` on subsequent events instead.
    // Bound how long we go WITHOUT asking. `refresh()` deliberately keeps the
    // previous value on a network error, and the cached decision carries its own
    // deadline, so entitlement can never over-extend — but a user who has been
    // in the app for hours should still get a fresh answer. The honest
    // complement to "we never revoke on error".
    unawaited(
      ref
          .read(entitlementStateProvider.notifier)
          .refreshIfStale(const Duration(minutes: 30)),
    );
  }

  @override
  Widget build(BuildContext context) {
    // TAM-127: keep ClarityService's `isPro` tag in sync with the live
    // entitlement. `ref.listen` is safe inside `build` (Riverpod invariant)
    // and only fires on real transitions — the seam short-circuits in
    // debug/profile builds anyway, so listen wiring is free.
    ref.listen<Entitlement>(entitlementStateProvider, (previous, next) {
      if (previous?.isPro == next.isPro) return;
      ClarityService().setSubscription(isPro: next.isPro);
    });
    final router = ref.watch(routerProvider);
    return MultiBlocProvider(
      providers: [
        // Orchestrator is app-wide — provided from the GetIt-owned singleton
        // so the router's `refreshListenable` and every screen share the same
        // instance.
        BlocProvider<OnboardingOrchestratorBloc>.value(
          value: serviceLocator<OnboardingOrchestratorBloc>(),
        ),
        // Shared, app-scoped read source for the user's status overlay
        // profile. Distinct from the per-editor `StatusProfileBloc` — this
        // one is consumed by surfaces OUTSIDE the details editor (Home feed
        // status cards) so the overlay band + Share gate see the same
        // profile the Status tab does. Lazy: only fetches on first `load()`.
        BlocProvider<StatusProfileCubit>(
          create: (_) => StatusProfileCubit(
            repository: ref.read(statusRepositoryProvider),
          ),
        ),
      ],
      child: MaterialApp.router(
        routerConfig: router,
        title: 'Prabhu Ji',
        builder: (context, child) => _ChuckerFab(child: child),
      ),
    );
  }
}

/// Chucker overlay: a floating action button anchored bottom-right on
/// top of every screen that opens the HTTP inspector. Gated by
/// [kEnableChucker] — default on in debug, opt-in for release via
/// `--dart-define=ENABLE_CHUCKER=true`. When the flag is false the
/// widget tree collapses to the raw `child` and neither the Stack nor
/// the FAB is built.
class _ChuckerFab extends StatelessWidget {
  const _ChuckerFab({required this.child});

  final Widget? child;

  @override
  Widget build(BuildContext context) {
    final content = child ?? const SizedBox.shrink();
    if (!kEnableChucker) return content;
    return Stack(
      children: [
        content,
        Positioned(
          right: 12,
          bottom: 135, // above the bottom-nav so it never sits on live UI
          child: SafeArea(
            // NOTE: no `tooltip:` — `FloatingActionButton` builds a
            // `Tooltip` when one is set, and `Tooltip` requires an `Overlay`
            // ancestor. Inside `MaterialApp.router.builder` this FAB is a
            // SIBLING of the router's Navigator (which owns the Overlay),
            // not a descendant, so a tooltip here throws
            // `debugCheckHasOverlay` at first frame.
            child: FloatingActionButton.small(
              heroTag: 'chucker-inspector',
              backgroundColor: Colors.deepPurple,
              onPressed: () => ChuckerFlutter.showChuckerScreen(),
              child: const Icon(Icons.bug_report, color: Colors.white),
            ),
          ),
        ),
      ],
    );
  }
}

/// Owns the `app_opened` (Sheet 1 row 1) fire policy for the process.
///
/// Fires ONCE per process (cold launch). Warm resumes are silent — this
/// app treats one process as one session (`session_id` from the analytics
/// enricher never rotates on background), and consumers that need to know
/// the user came back from background read `entry_source: resume` on
/// subsequent events via `SessionContext`. A boolean latch guards the
/// single fire against hot restart / a second `runApp`.
///
/// `launch_type: cold` is emitted for wire-schema stability (Sheet 1 row 1
/// declares the property) — it is effectively constant now that warm never
/// fires.
///
/// `is_first_open` is stored as a persisted bool in `SharedPreferences`
/// (`_kFirstOpenFlag`) that flips to `false` after the first cold launch.
/// `days_since_last_open` is derived from a persisted UTC timestamp
/// (`_kLastOpenAt`) written on every open; null on the first launch.
class AppLaunchTracker {
  AppLaunchTracker._();

  static final AppLaunchTracker instance = AppLaunchTracker._();

  static const String _kFirstOpenFlag = 'app_launch.first_open_seen';
  static const String _kLastOpenAt = 'app_launch.last_open_at_iso';

  bool _fired = false;

  /// Fire from `main()` before the splash mounts. Idempotent — a second
  /// call within the same process is a no-op.
  ///
  /// [launchNotification] is the tap that launched the process, if any —
  /// it sets `entry_source = notification` plus the notification's ids.
  Future<void> recordColdLaunch({
    required Analytics analytics,
    required SharedPreferences preferences,
    NotificationTap? launchNotification,
  }) async {
    if (_fired) return;
    _fired = true;

    final isFirstOpen = !(preferences.getBool(_kFirstOpenFlag) ?? false);
    final priorIso = preferences.getString(_kLastOpenAt);
    final nowUtc = DateTime.now().toUtc();
    int? daysSinceLastOpen;
    if (priorIso != null) {
      final prior = DateTime.tryParse(priorIso);
      if (prior != null) {
        daysSinceLastOpen = nowUtc.difference(prior).inDays;
      }
    }

    // Persist the flag + timestamp for the NEXT launch; fire-and-forget
    // is fine — a crash between here and the next launch just re-fires
    // `is_first_open: true`, which is a survivable metric imprecision.
    unawaited(preferences.setBool(_kFirstOpenFlag, true));
    unawaited(preferences.setString(_kLastOpenAt, nowUtc.toIso8601String()));

    await analytics.trackEvent(
      OnboardingEvents.appOpened,
      properties: <String, Object?>{
        OnboardingEventProps.launchType: OnboardingEventProps.launchTypeCold,
        OnboardingEventProps.isFirstOpen: isFirstOpen,
        OnboardingEventProps.daysSinceLastOpen: daysSinceLastOpen,
        if (launchNotification != null) ...{
          NotificationEventProps.entrySource:
              NotificationEventProps.entrySourceNotification,
          ...notificationIdentityProps(launchNotification.data),
        },
      },
    );
  }

  /// Test-only reset. Not for production paths.
  @visibleForTesting
  void debugReset() {
    _fired = false;
  }
}
