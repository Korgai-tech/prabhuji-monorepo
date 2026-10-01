import 'package:dio/dio.dart';
import 'package:get_it/get_it.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../features/chat/data/chat_counters.dart';
import '../features/deities/data/deity_repository.dart';
import '../features/status/data/status_profile_flags_store.dart';
import '../features/status/share/data/story_share_launcher.dart';
import '../features/onboarding/bloc/onboarding_orchestrator_bloc.dart';
import '../features/onboarding/data/auth_repository.dart';
import '../features/onboarding/data/languages_repository.dart';
import '../features/onboarding/data/users_repository.dart';
import '../features/onboarding/phone/bloc/phone_otp_bloc.dart';
import '../features/onboarding/profile/bloc/name_language_bloc.dart';
import '../features/paywall/application/payment_return_registrar.dart';
import '../features/paywall/bloc/paywall_bloc.dart';
import '../features/paywall/bloc/payment_bloc.dart';
import '../features/paywall/data/payment_repository.dart';
import '../features/paywall/data/razorpay_payment_gateway.dart';
import '../features/paywall/data/razorpay_sdk_gateway.dart';
import '../features/paywall/data/upi_launcher.dart';
import '../features/paywall/data/paywall_repository.dart';
import '../features/paywall/data/subscription_repository.dart';
import '../features/referral/data/referral_repository.dart';
import '../features/referral/referral_sync_service.dart';
import 'advertising_id_service.dart';
import 'analytics.dart';
import 'app_config.dart';
import 'auth_store.dart';
import 'device_context.dart';
import 'firebase_notifications.dart';
import 'firebase_token_sync.dart';
import 'install_referrer_reader.dart';
import 'secrets.dart';
import 'session_context.dart';
import 'share_service.dart';
import 'sms_retriever_service.dart';
import 'user_properties.dart';

/// App-wide [GetIt] instance. Aliased so call sites read as `serviceLocator`
/// (matches `.claude/skills/flutter-modular-architecture`).
final GetIt serviceLocator = GetIt.instance;

/// Wire the onboarding + paywall dependency graph.
///
/// Called from `main()` BEFORE `runApp` with the already-constructed
/// [AuthStore], the auth-injecting [Dio], the optional [Analytics] seam and an
/// optional pre-resolved [SharedPreferences] so the same instances stay
/// authoritative across Riverpod (existing admin flow) and get_it (new
/// onboarding flow).
///
/// [preferences] is optional: production `main()` resolves it via
/// `SharedPreferences.getInstance()` and passes it. Tests that don't touch the
/// paywall (`widget_test`, `router_test`) can skip it — the paywall blocs
/// simply won't be registered, and any `/paywall` navigation would surface a
/// missing-registration error at that boundary.
///
/// Idempotent — calling it twice under test resets the container first.
Future<void> configureLocator({
  required AuthStore authStore,
  required Dio dio,
  Analytics? analytics,
  SharedPreferences? preferences,
  SessionContext? sessionContext,
  DeviceContext? deviceContext,
  FirebaseTokenSync? firebaseTokenSync,
  FirebaseNotifications? firebaseNotifications,
  AdvertisingIdService? advertisingIdService,
  InstallReferrerReader? installReferrerReader,
  Future<String?> Function()? pseudoIdProvider,
}) async {
  if (serviceLocator.isRegistered<AuthStore>()) {
    await serviceLocator.reset();
  }

  // Shared singletons.
  serviceLocator.registerSingleton<AuthStore>(authStore);
  serviceLocator.registerSingleton<Dio>(dio);
  // Device metadata bag — passed to any secondary dio built via
  // `buildDio(store, deviceContext: ...)`. Falls back to `DeviceContext.empty`
  // when the caller didn't pre-resolve (test harnesses).
  serviceLocator.registerSingleton<DeviceContext>(
    deviceContext ?? DeviceContext.empty,
  );
  if (analytics != null) {
    serviceLocator.registerSingleton<Analytics>(analytics);
  }
  // Session context — the analytics enricher reads from here; the orchestrator
  // and paywall blocs write. If the caller didn't pre-build one (tests), we
  // instantiate an empty one so blocs can always inject it.
  serviceLocator
      .registerSingleton<SessionContext>(sessionContext ?? SessionContext());

  // Repositories — lazy singletons (cheap to hold, one instance is enough).
  serviceLocator.registerLazySingleton<AuthRepository>(
    // pseudoIdProvider threaded through so `sendOtp` can stamp Firebase's
    // `app_instance_id` on the request body — same seam referral-sync uses.
    () => AuthRepository(
      serviceLocator<Dio>(),
      pseudoIdProvider: pseudoIdProvider,
    ),
  );
  serviceLocator.registerLazySingleton<UsersRepository>(
    // `chatCounters` is the write side of the global `chat_type` analytics
    // property: `/users/me` is the only place the app learns the user's
    // experiment arm, so it is mirrored to SharedPreferences here and read
    // synchronously per event by `AnalyticsEnricher` (wired in `main()` over
    // the same preferences). Null when preferences weren't resolved — the
    // enricher then keeps reporting its `'control'` fallback.
    () => UsersRepository(
      serviceLocator<Dio>(),
      chatCounters: serviceLocator.isRegistered<SharedPreferences>()
          ? ChatCounters(serviceLocator<SharedPreferences>())
          : null,
    ),
  );
  serviceLocator.registerLazySingleton<LanguagesRepository>(
    () => DioLanguagesRepository(serviceLocator<Dio>()),
  );
  serviceLocator.registerLazySingleton<PaywallRepository>(
    () => PaywallRepository(serviceLocator<Dio>()),
  );
  serviceLocator.registerLazySingleton<SubscriptionRepository>(
    () => SubscriptionRepository(serviceLocator<Dio>()),
  );
  // Deity catalogue (TAM-57/58) — feeds the shared DeityFilterRow.
  serviceLocator.registerLazySingleton<DeityRepository>(
    () => DeityRepository(serviceLocator<Dio>()),
  );

  // Native share seam (TAM-58) — WhatsApp-first, link + thumbnail only. Modules
  // resolve it via `shareServiceProvider` (Riverpod → get_it).
  serviceLocator.registerLazySingleton<ShareService>(
    () => SharePlusShareService(),
  );

  // SMS Retriever session holder — armed BEFORE `SendOtpRequested` on the
  // phone-input screen so Play Services is listening by the time MSG91's SMS
  // lands. Consumed by the OTP screen. See sms_retriever_service.dart for the
  // race this closes.
  serviceLocator.registerLazySingleton<SmsRetrieverService>(
    () => SmsRetrieverService(),
  );

  // Story/status direct-share launcher — routes a rendered status file to a
  // specific third-party app (WhatsApp Status / IG Story / FB Story / Snapchat)
  // through the Android `prabhuji/story_share` MethodChannel. iOS has no
  // implementation registered on the channel, so [ChannelStoryShareLauncher]
  // resolves `installedTargets` to empty there and the UI naturally falls back
  // to the OS chooser.
  serviceLocator.registerLazySingleton<StoryShareLauncher>(
    () => const ChannelStoryShareLauncher(),
  );

  // User-property tracker (Sheet 3) — the ONLY place `Analytics.identifyUser`
  // is called from feature code. Wraps a nullable `Analytics` so both
  // production (real Analytics) and tests (no Analytics) can share the same
  // wiring without conditional call sites. Registered as a singleton so the
  // 6 lifecycle hooks (login, subscription change, module open, first
  // audio-complete / share / ringtone-set / wallpaper-set) resolve to the
  // same instance the auth listener in main.dart wires.
  serviceLocator.registerLazySingleton<UserPropertiesTracker>(
    () => UserPropertiesTracker(
      serviceLocator.isRegistered<Analytics>()
          ? serviceLocator<Analytics>()
          : null,
    ),
  );

  // Firebase Cloud Messaging token lifecycle. Optional — production `main()`
  // passes an instance once Firebase.initializeApp succeeds; tests / harnesses
  // that don't need FCM skip it and every logout path guards with
  // `isRegistered<FirebaseTokenSync>()`.
  if (firebaseTokenSync != null) {
    serviceLocator.registerSingleton<FirebaseTokenSync>(firebaseTokenSync);
  }
  // FCM receive-side: foreground display + tap dispatch + permission ask.
  // Same optional-registration story as FirebaseTokenSync above.
  if (firebaseNotifications != null) {
    serviceLocator
        .registerSingleton<FirebaseNotifications>(firebaseNotifications);
  }

  // Orchestrator: app-wide singleton — the router listens to its stream, so a
  // per-screen factory would defeat `refreshListenable`. Downstream per-screen
  // Blocs (phone, otp, name-language, paywall) will be factory-registered when
  // their tickets land.
  serviceLocator.registerLazySingleton<OnboardingOrchestratorBloc>(
    () => OnboardingOrchestratorBloc(
      authStore: serviceLocator<AuthStore>(),
      usersRepository: serviceLocator<UsersRepository>(),
      subscriptionRepository: serviceLocator<SubscriptionRepository>(),
      analytics: serviceLocator.isRegistered<Analytics>()
          ? serviceLocator<Analytics>()
          : null,
      sessionContext: serviceLocator<SessionContext>(),
      userPropertiesTracker: serviceLocator<UserPropertiesTracker>(),
    ),
  );

  // Phone-choice + phone-input share this per-navigation bloc. Factory so each
  // entry into `/phone-choice` (or `/phone-input`) gets a fresh terms + phone
  // state; the OTP bloc is instantiated inline inside its route builder because
  // it depends on send-OTP response extras (session id, resend seconds, etc.).
  serviceLocator.registerFactory<PhoneOtpBloc>(
    () => PhoneOtpBloc(
      authRepository: serviceLocator<AuthRepository>(),
      analytics: serviceLocator.isRegistered<Analytics>()
          ? serviceLocator<Analytics>()
          : null,
      // Referral sync — registered only when SharedPreferences was passed to
      // configureLocator (paywall branch), so guard on `isRegistered`. Tests
      // that skip the paywall branch don't get the sync — the bloc handles
      // null cleanly (fire-and-forget with `?.`).
      referralSync: serviceLocator.isRegistered<ReferralSyncService>()
          ? serviceLocator<ReferralSyncService>()
          : null,
    ),
  );

  // Name + Language bloc — factory so a re-entry to `/name-language` re-fetches
  // the language catalogue and starts from a fresh Loading state.
  serviceLocator.registerFactory<NameLanguageBloc>(
    () => NameLanguageBloc(
      usersRepository: serviceLocator<UsersRepository>(),
      languagesRepository: serviceLocator<LanguagesRepository>(),
      orchestrator: serviceLocator<OnboardingOrchestratorBloc>(),
      analytics: serviceLocator.isRegistered<Analytics>()
          ? serviceLocator<Analytics>()
          : null,
    ),
  );

  // Install Referrer reader — shared across two consumers (DeepLinkService's
  // `/app/*` post-install replay + ReferralSyncService's first-launch POST).
  // Registered as a singleton so both see the same in-memory cache; the
  // reader itself no longer owns a "consumed" flag (each consumer holds its
  // own SharedPreferences gate). Widget tests that don't wire it fall back
  // to a NoOp registered lazily below.
  if (installReferrerReader != null) {
    serviceLocator.registerSingleton<InstallReferrerReader>(
      installReferrerReader,
    );
  }

  // Paywall wiring is only registered when a pre-resolved [SharedPreferences]
  // was passed in — production `main()` always does so. Test harnesses that
  // don't need the paywall (`widget_test`, `router_test`) skip this branch so
  // they don't hang on the SharedPreferences platform channel.
  if (preferences != null) {
    serviceLocator.registerSingleton<SharedPreferences>(preferences);

    // Persisted mirror of `/status/profile`'s presence flags, read
    // synchronously by `AnalyticsEnricher` so `has_name` / `has_photo` ride
    // on EVERY event. Registered here (rather than lazily) because both the
    // writer (`DioStatusRepository`) and the reader (the enricher, wired in
    // `main()`) must share one instance over the same preferences.
    serviceLocator
        .registerSingleton<StatusProfileFlagsStore>(StatusProfileFlagsStore(preferences));

    // Referral sync (TAM install-attribution) — fires once per install once
    // the user has logged in, posting install-referrer + device context to
    // the referral backend. Registered only when preferences are present
    // because the dedupe flag lives in SharedPreferences. All other gates
    // (placeholder config, missing tenant secret, missing userId, missing
    // reader) are handled inside the service as silent no-ops so a partial
    // production build still boots cleanly.
    serviceLocator.registerLazySingleton<ReferralRepository>(
      () => ReferralRepository(
        config: AppConfig.instance,
        secrets: Secrets.instance,
        deviceContext: serviceLocator<DeviceContext>(),
      ),
    );
    serviceLocator.registerLazySingleton<ReferralSyncService>(
      () => ReferralSyncService(
        authStore: serviceLocator<AuthStore>(),
        preferences: serviceLocator<SharedPreferences>(),
        installReferrerReader:
            serviceLocator.isRegistered<InstallReferrerReader>()
                ? serviceLocator<InstallReferrerReader>()
                : const NoOpInstallReferrerReader(),
        advertisingIdService: advertisingIdService,
        deviceContext: serviceLocator<DeviceContext>(),
        config: AppConfig.instance,
        secrets: Secrets.instance,
        repository: serviceLocator<ReferralRepository>(),
        pseudoIdProvider: pseudoIdProvider,
      ),
    );

    // Paywall bloc — factory so re-entering `/paywall` refetches the config and
    // increments the impression counter.
    serviceLocator.registerFactory<PaywallBloc>(
      () => PaywallBloc(
        paywallRepository: serviceLocator<PaywallRepository>(),
        preferences: serviceLocator<SharedPreferences>(),
        analytics: serviceLocator.isRegistered<Analytics>()
            ? serviceLocator<Analytics>()
            : null,
        sessionContext: serviceLocator<SessionContext>(),
      ),
    );

    serviceLocator.registerLazySingleton<PaymentRepository>(
      () => PaymentRepository(serviceLocator<Dio>()),
    );

    // TAM-129 — Razorpay checkout SDK gateway (singleton so the native
    // Razorpay instance's event listeners are registered exactly once
    // per app lifetime). Fires when the mandate API returns
    // `provider: "razorpay"`; the bloc's `_runRazorpayPath` invokes it.
    // Unconditional registration: the `razorpay_flutter` plugin is in
    // pubspec so its runtime is always available on Android.
    if (!serviceLocator.isRegistered<RazorpayPaymentGateway>()) {
      serviceLocator.registerLazySingleton<RazorpayPaymentGateway>(
        () => RazorpaySdkGateway(),
      );
    }

    // Payment bloc — scoped to the paywall route only; factory so it starts
    // idle on every entry rather than resuming a stale poll from a previous
    // visit. The launcher's `onNeedsWebView` seam (TAM-124 Part A) routes
    // `https://` URIs through the in-app WebView owned by the paywall
    // route — the `_PaymentReturnBinder` in `router.dart` registers /
    // clears the actual pusher for the paywall's lifetime. Without the
    // seam a browser tab would strand the user; the registrar returning
    // `null` when nothing is mounted is the fall-back signal that lets
    // the launcher default to `url_launcher`.
    serviceLocator.registerFactory<PaymentBloc>(
      () => PaymentBloc(
        repository: serviceLocator<PaymentRepository>(),
        launcher: PlatformUpiLauncher(
          onNeedsWebView: PaymentReturnRegistrar.fireNeedsWebView,
        ),
        analytics: serviceLocator.isRegistered<Analytics>()
            ? serviceLocator<Analytics>()
            : null,
        razorpayGateway: serviceLocator<RazorpayPaymentGateway>(),
      ),
    );
  }
}
