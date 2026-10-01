import 'dart:async';

import 'package:chucker_flutter/chucker_flutter.dart';
import 'package:flutter/foundation.dart' show kDebugMode;
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/login_screen.dart';
import '../features/home/feed/bloc/home_feed_bloc.dart';
import '../features/home/feed/bloc/home_feed_event.dart';
import '../features/home/home_providers.dart';
import '../features/home/home_routes.dart';
import '../features/home/presentation/home_screen.dart';
import '../features/profile/presentation/edit_profile_screen.dart';
import '../features/profile/presentation/manage_subscription_screen.dart';
import '../features/profile/presentation/profile_screen_v2.dart';
import '../features/onboarding/bloc/onboarding_orchestrator_bloc.dart';
import '../features/onboarding/bloc/onboarding_orchestrator_state.dart';
import '../features/onboarding/data/auth_repository.dart';
import '../features/onboarding/data/languages_repository.dart';
import '../features/onboarding/data/users_repository.dart';
import '../features/onboarding/otp/bloc/otp_bloc.dart';
import '../features/onboarding/otp/presentation/otp_screen.dart';
import '../features/onboarding/phone/bloc/phone_otp_bloc.dart';
import '../features/onboarding/phone/presentation/phone_input_screen.dart';
import '../features/onboarding/profile/bloc/name_language_bloc.dart';
import '../features/onboarding/profile/presentation/name_language_screen.dart';
import '../features/aarti/aarti_providers.dart';
import '../features/aarti/aarti_routes.dart';
import '../features/aarti/data/aarti_models.dart';
import '../features/aarti/listing/bloc/aarti_listing_bloc.dart';
import '../features/aarti/listing/bloc/aarti_listing_event.dart';
import '../features/aarti/listing/presentation/aarti_listing_screen.dart';
import '../features/aarti/main/bloc/aarti_main_bloc.dart';
import '../features/aarti/main/bloc/aarti_main_event.dart';
import '../features/aarti/main/presentation/aarti_main_screen.dart';
import '../features/aarti/player/presentation/aarti_player_screen.dart';
import '../features/aarti/presentation/aarti_deep_link_screen.dart';
import '../features/mantras/mantras_providers.dart';
import '../features/mantras/mantras_routes.dart';
import '../features/mantras/presentation/mantras_deep_link_screen.dart';
import '../features/mantras/data/mantras_models.dart';
import '../features/mantras/listing/bloc/mantras_listing_bloc.dart';
import '../features/mantras/listing/bloc/mantras_listing_event.dart';
import '../features/mantras/listing/presentation/mantras_listing_screen.dart';
import '../features/mantras/main/bloc/mantras_main_bloc.dart';
import '../features/mantras/main/bloc/mantras_main_event.dart';
import '../features/mantras/main/presentation/mantras_main_screen.dart';
import '../features/mantras/player/presentation/mantras_player_screen.dart';
import '../features/ringtone/ringtone_providers.dart';
import '../features/ringtone/ringtone_routes.dart';
import '../features/ringtone/home/bloc/ringtone_home_bloc.dart';
import '../features/ringtone/home/bloc/ringtone_home_event.dart';
import '../features/ringtone/home/presentation/ringtone_home_screen.dart';
import '../features/ringtone/search/bloc/ringtone_search_bloc.dart';
import '../features/ringtone/search/bloc/ringtone_search_event.dart';
import '../features/ringtone/search/presentation/ringtone_search_screen.dart';
import '../features/ringtone/preview/presentation/ringtone_preview_screen.dart';
import '../features/audio/application/audio_providers.dart';
import '../features/audio/domain/audio_item.dart';
import '../features/downloads/bloc/downloads_library_bloc.dart';
import '../features/downloads/bloc/downloads_library_event.dart';
import '../features/downloads/downloads_providers.dart';
import '../features/downloads/downloads_routes.dart';
import '../features/downloads/presentation/downloads_library_screen.dart';
import '../features/books/books_providers.dart';
import '../features/books/books_routes.dart';
import '../features/books/contents/bloc/book_contents_bloc.dart';
import '../features/books/contents/bloc/book_contents_event.dart';
import '../features/books/contents/presentation/book_contents_screen.dart';
import '../features/books/data/books_models.dart';
import '../features/books/home/bloc/books_home_bloc.dart';
import '../features/books/home/bloc/books_home_event.dart';
import '../features/books/home/presentation/books_home_screen.dart';
import '../features/books/listing/bloc/books_listing_bloc.dart';
import '../features/books/listing/bloc/books_listing_event.dart';
import '../features/books/listing/presentation/books_listing_screen.dart';
import '../features/books/reader/bloc/book_reader_bloc.dart';
import '../features/books/reader/bloc/book_reader_event.dart';
import '../features/books/reader/bloc/book_reader_state.dart';
import '../features/books/reader/bloc/reader_audio_port.dart';
import '../features/books/reader/presentation/book_reader_screen.dart';
import '../features/chat/application/chat_bloc.dart';
import '../features/chat/application/chat_event.dart';
import '../features/chat/chat_paywall.dart';
import '../features/chat/chat_providers.dart';
import '../features/chat/chat_routes.dart';
import '../features/chat/presentation/widgets/chat_intro_video_card.dart';
import '../features/chat/presentation/chat_screen.dart';
import '../features/horoscope/horoscope_providers.dart';
import '../features/horoscope/horoscope_routes.dart';
import '../features/horoscope/main/bloc/horoscope_main_bloc.dart';
import '../features/horoscope/main/bloc/horoscope_main_event.dart';
import '../features/horoscope/main/presentation/horoscope_main_screen.dart';
import '../features/horoscope/presentation/horoscope_widgets.dart';
import '../features/horoscope/result/bloc/horoscope_result_bloc.dart';
import '../features/horoscope/result/bloc/horoscope_result_event.dart';
import '../features/horoscope/result/presentation/horoscope_result_screen.dart';
import '../features/status/details/bloc/status_profile_bloc.dart';
import '../features/status/details/bloc/status_profile_event.dart';
import '../features/status/details/presentation/status_details_screen.dart';
import '../features/status/feed/bloc/status_feed_bloc.dart';
import '../features/status/feed/presentation/status_home_screen.dart';
import '../features/status/status_providers.dart';
import '../features/status/status_routes.dart';
import '../features/wallpaper/wallpaper_providers.dart';
import '../features/wallpaper/wallpaper_routes.dart';
import '../features/wallpaper/home/bloc/wallpaper_home_bloc.dart';
import '../features/wallpaper/home/bloc/wallpaper_home_event.dart';
import '../features/wallpaper/home/presentation/wallpaper_home_screen.dart';
import '../features/wallpaper/listing/bloc/wallpaper_list_bloc.dart';
import '../features/wallpaper/listing/bloc/wallpaper_list_event.dart';
import '../features/wallpaper/listing/presentation/wallpaper_listing_screen.dart';
import '../features/wallpaper/preview/presentation/wallpaper_preview_screen.dart';
import '../features/onboarding/splash/presentation/splash_screen.dart';
import '../features/paywall/application/payment_return_registrar.dart';
import '../features/paywall/bloc/paywall_bloc.dart';
import '../features/paywall/bloc/paywall_event.dart';
import '../features/paywall/bloc/payment_bloc.dart';
import '../features/paywall/bloc/payment_event.dart';
import '../features/paywall/paywall_analytics.dart';
import '../features/paywall/presentation/payment_webview_screen.dart';
import '../features/paywall/presentation/paywall_screen.dart';
import 'user_properties.dart';
import '../features/shell/presentation/app_shell_scaffold.dart';
import '../features/support/presentation/support_screen.dart';
import '../features/support/support_analytics.dart';
import '../features/support/support_routes.dart';
import '../features/users/users_screen.dart';
import '../shared/widgets/in_app_webview_screen.dart';
import '../state/providers.dart';
import 'analytics.dart';
import 'auth_store.dart';
import 'app_config.dart';
import 'deep_link_parser.dart';
import 'deep_link_service.dart';
import 'entitlement.dart';
import 'service_locator.dart';
import 'services/clarity_service.dart';
import 'session_context.dart';

/// A [Listenable] that fires whenever the auth store transitions (login /
/// logout) OR the Bloc-owned orchestrator state changes. go_router re-runs
/// `redirect` on each notify — it does NOT rebuild the router itself.
///
/// Auth events come straight from [AuthStore.changes] (the single source of
/// truth). The router does not read any Riverpod state mirror — that
/// separation is what caused the "OTP login writes token, tokenProvider
/// stays null, tap Status → redirect to /phone-choice" bug earlier.
class _RouterRefresh extends ChangeNotifier {
  _RouterRefresh(AuthStore store, OnboardingOrchestratorBloc? bloc) {
    _authSub = store.changes.listen((_) => notifyListeners());
    final stream = bloc?.stream;
    if (stream != null) {
      _blocSub = stream.listen((_) => notifyListeners());
    }
  }

  StreamSubscription<String?>? _authSub;
  StreamSubscription<OrchestratorState>? _blocSub;

  @override
  void dispose() {
    _authSub?.cancel();
    _blocSub?.cancel();
    super.dispose();
  }
}

/// Fire the deep-link pending-intent replay on the next frame.
///
/// Called at two moments (TAM-124):
///
///   * When the orchestrator settles on `RouteTarget.home` post-onboarding,
///     from the redirect below. If the user arrived at the app via a
///     shared link while logged out, the intent captured for them replays
///     into the target screen instead of just landing on /home.
///
///   * When the paywall route disposes ([_PaywallDeepLinkHook] below). If
///     the paywall was pushed as the deep-link interstitial for a non-Pro
///     user, the same store gets consumed on close — regardless of paywall
///     outcome, per product direction (TAM-124 #PATH_DECISION).
///
/// The service's `consumeOnce` contract keeps both hooks safe even when
/// they fire in the same frame — the second call finds an empty store and
/// no-ops. `serviceLocator` may not be registered in some test harnesses;
/// the check makes both hooks a no-op there.
///
/// TAM-259's landing deliberately does NOT ride this hook. It rides
/// `wireDeepLinkReplayOnHome` in `main.dart` instead, because this one only
/// fires for a user who settles on home while still on `/splash` — a free user
/// goes to the paywall first and reaches home by `context.go('/home')` from
/// `paywall_close.dart`, which never comes back through here.
void _schedulePendingIntentReplay() {
  WidgetsBinding.instance.addPostFrameCallback((_) {
    if (serviceLocator.isRegistered<DeepLinkService>()) {
      unawaited(serviceLocator<DeepLinkService>().consumePendingIntent());
    }
  });
}

/// Wraps the paywall route so the pending deep-link intent (if any) is
/// consumed on close. Any exit path — user pays, dismisses, back-presses —
/// fires this dispose; the replay only actually navigates if the store
/// still holds an intent, which it only does when the paywall was pushed
/// AS the deep-link interstitial. Tapping "Upgrade" from a random feature
/// leaves the store empty, so this hook is transparent.
class _PaywallDeepLinkHook extends StatefulWidget {
  const _PaywallDeepLinkHook({required this.child});

  final Widget child;

  @override
  State<_PaywallDeepLinkHook> createState() => _PaywallDeepLinkHookState();
}

class _PaywallDeepLinkHookState extends State<_PaywallDeepLinkHook> {
  @override
  void dispose() {
    _schedulePendingIntentReplay();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

/// Binds the two [PaymentReturnRegistrar] seams to this paywall's mounted
/// `PaymentBloc` + this router (TAM-124 Part A). Sits INSIDE the
/// `MultiBlocProvider` so `context.read<PaymentBloc>()` resolves the
/// route-scoped bloc, not a stale one from a previous mount.
///
///   * `onPaymentReturn` — fires `AppResumedFromUpi` on the bloc so the
///     poll budget resets IMMEDIATELY when a `PaymentReturnDeepLink`
///     arrives, instead of waiting on Android's lifecycle-resume path
///     (unreliable via a browser bounce).
///   * `onNeedsWebView` — pushes `/paywall/return-webview` when the UPI
///     launcher sees an `https://` URI it can't hand to a UPI app
///     (Cashfree hosted checkout, unresolved Decentro shortener). Kills
///     the "stuck in Chrome" symptom this ticket targets.
///
/// Both seams are cleared on dispose so a stale bloc / router reference
/// can never fire once the paywall is gone. Also cleared during hot
/// restart via the same dispose path.
class _PaymentReturnBinder extends StatefulWidget {
  const _PaymentReturnBinder({required this.child});

  final Widget child;

  @override
  State<_PaymentReturnBinder> createState() => _PaymentReturnBinderState();
}

class _PaymentReturnBinderState extends State<_PaymentReturnBinder> {
  @override
  void initState() {
    super.initState();
    PaymentReturnRegistrar.setOnPaymentReturn((_) {
      if (!mounted) return;
      context.read<PaymentBloc>().add(const AppResumedFromUpi());
    });
    PaymentReturnRegistrar.setOnNeedsWebView((httpsUrl) async {
      if (!mounted) return false;
      await context.push('/paywall/return-webview', extra: httpsUrl);
      // Return true: the launcher's contract is "I handled the launch."
      // Returning false would surface the "no UPI app found" snackbar on
      // the paywall — wrong, since we did open the flow (in the WebView).
      // Failure inside the WebView surfaces via the paywall's own poll
      // (mandate stays pending → PaymentPending snackbar).
      return true;
    });
  }

  @override
  void dispose() {
    PaymentReturnRegistrar.clearOnPaymentReturn();
    PaymentReturnRegistrar.clearOnNeedsWebView();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

/// Path segment for every [RouteTarget] the orchestrator can decide.
String pathForRouteTarget(RouteTarget target) {
  switch (target) {
    case RouteTarget.phoneInput:
      return '/phone-input';
    case RouteTarget.otp:
      return '/otp';
    case RouteTarget.nameLanguage:
      return '/name-language';
    case RouteTarget.paywall:
      return '/paywall';
    case RouteTarget.home:
      return '/home';
    case RouteTarget.offline:
      // Offline stays on the splash — the splash renders the retry affordance
      // directly. No dedicated route needed.
      return '/splash';
  }
}

/// Overridden in `main.dart` before `runApp` after inspecting the encrypted-
/// store's `index.json` on disk and the current `Connectivity` state. Defaults
/// to `/splash` for tests and for the case where the app is online or has no
/// downloads. When the app cold-starts offline WITH downloads, main.dart
/// overrides this to `/downloads` so the very first frame the router paints
/// is already the Downloads library — no `/home` flash, no redirect hack.
final bootstrapInitialLocationProvider = Provider<String>((ref) => '/splash');

final routerProvider = Provider<GoRouter>((ref) {
  // Pulled from get_it because the orchestrator is registered there. The
  // AuthStore is likewise fetched through the Riverpod provider (overridden
  // in main() with the app-wide singleton). We stay null-safe: some test
  // harnesses skip `configureLocator` and expect the router to still boot.
  final orchestrator = serviceLocator.isRegistered<OnboardingOrchestratorBloc>()
      ? serviceLocator<OnboardingOrchestratorBloc>()
      : null;
  final authStore = ref.watch(authStoreProvider);

  final refresh = _RouterRefresh(authStore, orchestrator);
  ref.onDispose(refresh.dispose);

  return GoRouter(
    initialLocation: ref.read(bootstrapInitialLocationProvider),
    refreshListenable: refresh,
    // Chucker's floating debug button/notification uses this key to push its
    // inspector screen. Bound unconditionally — Chucker itself no-ops in
    // release via `showOnRelease = false` set in main.dart.
    navigatorKey: ChuckerFlutter.navigatorKey,
    // Pause home-feed audio previews whenever a new route is pushed. The
    // feed's own VisibilityDetector only fires on scroll/unmount; pushing
    // a route on top of the home screen leaves the underlying widgets
    // laid out at their previous visibility, so the audio would otherwise
    // keep playing across the pushed screen. Preview-mode playback is
    // defined as "only while the source card is visible" (see
    // AudioController + _AudioHero) — pausing it on push is semantically
    // correct. Full-mode playback (mini-player) is left alone.
    // Order matters only cosmetically — every observer runs on every
    // navigation event. The Clarity observer (TAM-127) tags each screen
    // with the route's `name:` so session replays are readable in the
    // Clarity dashboard; it's a silent no-op in debug/profile builds
    // (see `ClarityService`).
    observers: [
      _PreviewAudioPauseOnPushObserver(ref),
      ClarityNavigatorObserver(),
      // TAM-177 — RouteAware host for the chat intro video, replacing the
      // kuldevta entry hero's observer (that screen is gone). The card
      // subscribes so its media_kit player pauses when a route is pushed over
      // the chat and resumes when that push pops back. VisibilityDetector
      // cannot see this: Flutter does not re-layout occluded widgets, so the
      // card's reported visibility never changes and the video would keep
      // playing audibly under the pushed route.
      chatVideoRouteObserver,
    ],
    redirect: (context, state) {
      final path = state.matchedLocation;

      // Auth truth: synchronous read straight from the hydrated AuthStore
      // cache. Never a Riverpod mirror, never an async read — a redirect
      // callback can't await anyway, and reading the source guarantees the
      // decision uses the freshest value (which is why the router refresh
      // listener above subscribes to `authStore.changes`).
      final loggedIn = authStore.read() != null;

      // TAM-124 — external App Link URL landed on go_router.
      //
      // When Android delivers an https://krutyug.ai/app/* intent to the
      // app, Flutter's PlatformRouteInformationProvider hands the URL to
      // go_router, which tries to match `/app/<type>/<id>` against its
      // routes and throws "GoException: no routes for location: …" because
      // no route is registered under `/app/*` (deliberately — those paths
      // are external, not internal navigation).
      //
      // Fix: parse the incoming URL via the same deep-link parser the
      // service uses, and redirect to the mapped internal path. The
      // DeepLinkService (via app_links plugin's uriLinkStream) is ALSO
      // receiving the same URI in parallel and enforces the paywall
      // interstitial for non-Pro users — so this redirect just gets
      // go_router past the "no route" error; the visible-to-user routing
      // (including paywall gate) is DeepLinkService's job.
      if (path.startsWith('/app/') || path == '/app') {
        if (kDebugMode) {
          debugPrint(
            '[DEEPLINK] router redirect /app/* uri=${state.uri} '
            'loggedIn=$loggedIn '
            'serviceRegistered=${serviceLocator.isRegistered<DeepLinkService>()}',
          );
        }
        // `state.uri` is ABSOLUTE for a platform-delivered App Link — see
        // `absoluteAppLink` for the bug that assuming otherwise caused.
        final reconstructed = absoluteAppLink(
          state.uri,
          shareHost: AppConfig.instance.shareHost,
        );
        final target = parseDeepLink(reconstructed);

        // Logged-out user tapped a share URL. Landing them on the
        // destination would fetch with no Bearer and render the target
        // screen's error state — the exact bug this branch guards against.
        // Park the intent + send them through onboarding; main.dart's
        // auth-transition listener consumes it exactly once after login.
        //
        // DeepLinkService is registered from `_MobileAppState.initState`
        // (post-`runApp`), so on very-early cold-start URIs this may not
        // be wired yet — the app_links stream in DeepLinkService.initialize
        // still fires for the same URI a moment later and parks the intent
        // itself. Either write wins.
        //
        // This check comes FIRST, before any target-based fallback: `/home`
        // is an authenticated screen, so a logged-out user must never be
        // sent there — not even for a link we can't parse. Doing so mounts
        // the feed with no Bearer, its 401s clear the auth store, and that
        // clear wipes the intent we just parked.
        if (!loggedIn) {
          if (target is! UnknownDeepLink &&
              serviceLocator.isRegistered<DeepLinkService>()) {
            unawaited(
              serviceLocator<DeepLinkService>().parkForLogin(reconstructed),
            );
          }
          return '/splash';
        }

        if (target is UnknownDeepLink) return '/home';

        // Hand the URL to the service and return only the BASE of its
        // stack — the service does the gated, stacked navigation on top.
        //
        // The handoff is EXPLICIT rather than "app_links will also deliver
        // it, so the service will get there eventually". That assumption is
        // what made this branch dangerous: if the service never dispatched
        // (its registration is async, behind `SharedPreferences`), returning
        // the base alone would strand the user on Home with the link
        // silently dropped. `handleUri` de-duplicates, so the second
        // delivery — whichever of the two arrives later — is a no-op.
        //
        // Post-frame because `handleUri` reaches `navigateToStack`
        // synchronously for a logged-in Pro user, and navigating from inside
        // a redirect is not allowed.
        if (serviceLocator.isRegistered<DeepLinkService>()) {
          final service = serviceLocator<DeepLinkService>();
          WidgetsBinding.instance.addPostFrameCallback((_) {
            unawaited(service.handleUri(reconstructed, source: 'router'));
          });
          return DeepLinkService.stackForTarget(target).first;
        }
        // Not registered yet: nothing else will navigate, so land the user
        // on the target itself. Stackless (the pre-TAM-124-follow-up
        // behaviour), but never a dropped link.
        return DeepLinkService.pathForTarget(target);
      }
      if (path == '/login' && loggedIn) return '/users';
      if (path == '/users' && !loggedIn) return '/login';

      // Status module entry is LOGIN-GATED (TAM-72 PRD §5) — there is no status
      // surface for a logged-out user. Covers /status and /status/details.
      //
      // The old `status_login_required_shown` analytics fire was DROPPED as
      // an orphan — Sheet 1 rows 86–101 (the Status Sharing contract) has
      // no matching row, and login-required is a cross-cutting auth event,
      // not a Status funnel step. The redirect itself is unchanged.
      if (path.startsWith(StatusRoutes.home) && !loggedIn) {
        return '/phone-input';
      }

      // Onboarding flow: the splash consults the orchestrator's decision.
      if (path == '/splash' && orchestrator != null) {
        final decision = orchestrator.state;
        if (decision is OrchestratorRouteDecided &&
            decision.target != RouteTarget.offline) {
          if (decision.target == RouteTarget.home) {
            // Deep-link pending-intent replay (TAM-124): if the user arrived
            // via a shared link while logged out, replay it AFTER the
            // redirect settles on /home so the target overrides the default
            // home landing.
            _schedulePendingIntentReplay();
          }
          return pathForRouteTarget(decision.target);
        }
      }

      // TAM-125 offline-cold-start decision is NOT made here — it lives in
      // `main.dart`'s bootstrap logic (reads `downloads/index.json` on disk
      // + `Connectivity().checkConnectivity()`) and is delivered to this
      // router via `bootstrapInitialLocationProvider`. In-app "user tapped
      // Home while offline" behavior lives in `AppShellScaffold` (dims the
      // tab + shows an OfflinePlaceholder in the branch body). The redirect
      // is intentionally NOT the layer for either — this keeps user intent
      // (which tab they tapped) inviolate and prevents redirect loops.

      return null;
    },
    routes: [
      // Onboarding surface.
      GoRoute(
        path: '/splash',
        name: 'splash',
        builder: (context, state) => const SplashScreen(),
      ),
      GoRoute(
        path: '/phone-input',
        name: 'phone-input',
        builder: (context, state) {
          // `?reset=<n>` is the OTP screen's "Change No." signal — this page is
          // reused (not rebuilt) when we hop back here, so the screen needs to
          // be told to clear the old number. See `PhoneInputScreen.resetToken`.
          final resetToken = state.uri.queryParameters['reset'];
          return BlocProvider<PhoneOtpBloc>(
            create: (_) => serviceLocator<PhoneOtpBloc>(),
            child: PhoneInputScreen(resetToken: resetToken),
          );
        },
      ),
      GoRoute(
        path: '/otp',
        name: 'otp',
        builder: (context, state) {
          final extras = state.extra;
          if (extras is! Map) {
            // Fell through — hop back to phone-input rather than crash.
            return const PhoneInputScreen();
          }
          final otpSessionId = extras['otpSessionId'] as String? ?? '';
          final phoneCountryCode =
              extras['phoneCountryCode'] as String? ?? '+91';
          final phoneNumber = extras['phoneNumber'] as String? ?? '';
          final resendAvailableAfterSeconds =
              extras['resendAvailableAfterSeconds'] as int? ?? 20;
          final otpLength = extras['otpLength'] as int? ?? 4;
          return BlocProvider<OtpBloc>(
            create: (_) => OtpBloc(
              authRepository: serviceLocator<AuthRepository>(),
              authStore: serviceLocator<AuthStore>(),
              orchestrator: serviceLocator<OnboardingOrchestratorBloc>(),
              otpSessionId: otpSessionId,
              phoneCountryCode: phoneCountryCode,
              phoneNumber: phoneNumber,
              initialResendSeconds: resendAvailableAfterSeconds,
              otpLength: otpLength,
              analytics: serviceLocator.isRegistered<Analytics>()
                  ? serviceLocator<Analytics>()
                  : null,
            ),
            child: const OtpScreen(),
          );
        },
      ),
      GoRoute(
        path: '/name-language',
        name: 'name-language',
        builder: (context, state) => BlocProvider<NameLanguageBloc>(
          // Onboarding no longer asks the user to pick a language — name only.
          // Built inline (not via the get_it factory) so `pickLanguage: false`
          // skips the `/languages` round-trip and silently seeds the server
          // default; a new user completes onboarding with just their name.
          create: (_) => NameLanguageBloc(
            usersRepository: serviceLocator<UsersRepository>(),
            languagesRepository: serviceLocator<LanguagesRepository>(),
            orchestrator: serviceLocator<OnboardingOrchestratorBloc>(),
            analytics: serviceLocator.isRegistered<Analytics>()
                ? serviceLocator<Analytics>()
                : null,
            sessionContext: serviceLocator<SessionContext>(),
            pickLanguage: false,
          ),
          child: const NameLanguageScreen(showLanguageField: false),
        ),
      ),
      // Profile & Settings v2 (TAM-N-profile-v2) opened from the home
      // header avatar. Full-screen over the shell so the shell's bottom
      // nav stays hidden while the user is in the profile flow.
      GoRoute(
        path: HomeRoutes.profile,
        name: 'profile',
        builder: (context, state) => const ProfileScreenV2(),
      ),
      GoRoute(
        path: HomeRoutes.editProfile,
        name: 'edit-profile',
        builder: (context, state) => const EditProfileScreen(),
      ),
      // Manage Subscription (TAM-125) — VIP-facing details screen pushed
      // over the shell from Profile v2's Manage Subscription tile. Not
      // deep-linkable in this ticket; free-tier users never see this route
      // (the tile itself pushes /paywall for non-VIPs).
      GoRoute(
        path: HomeRoutes.subscription,
        name: 'manage-subscription',
        builder: (context, state) => const ManageSubscriptionScreen(),
      ),
      // Language-only variant, opened from the profile menu. Reuses the
      // onboarding screen with the name field hidden; the bloc is built inline
      // (not via the get_it factory) so `nameRequired: false` skips the
      // orchestrator step-completion dispatch — otherwise a language change
      // would re-route through the paywall on every save.
      GoRoute(
        path: HomeRoutes.language,
        name: 'language',
        builder: (context, state) => BlocProvider<NameLanguageBloc>(
          create: (_) => NameLanguageBloc(
            usersRepository: serviceLocator<UsersRepository>(),
            languagesRepository: serviceLocator<LanguagesRepository>(),
            orchestrator: serviceLocator<OnboardingOrchestratorBloc>(),
            analytics: serviceLocator.isRegistered<Analytics>()
                ? serviceLocator<Analytics>()
                : null,
            sessionContext: serviceLocator<SessionContext>(),
            nameRequired: false,
          ),
          child: const NameLanguageScreen(
            showNameField: false,
            ctaLabel: 'Save',
            popOnSaved: true,
          ),
        ),
      ),
      GoRoute(
        path: '/paywall',
        name: 'paywall',
        builder: (context, state) {
          // Locale — the orchestrator doesn't cache the user's selectedLanguage
          // yet (Wave 2 wired the auth surface, not user profile), so we
          // default to Hindi. The backend resolves + returns the served locale
          // per `paywall_localization_fallback_used`.
          const locale = 'hi';
          // Optional route args carry the three attribution dimensions
          // (`entry_source`, `trigger_module`, `trigger_action`) — threaded
          // into `ConfigRequested` (so `paywall_viewed` / `paywall_closed`
          // ship with attribution) and into `PayNowTapped.triggerModule` (so
          // every payment analytics event does too). Any push that lands here
          // without a `PaywallArgs` extra (cold-start orchestrator redirect,
          // push-notification tap, WebView pop fallback, deep-link payment
          // return) falls back to `app_open` on all three dimensions so the
          // downstream events never emit null attribution.
          final args = state.extra is PaywallArgs
              ? state.extra as PaywallArgs
              : const PaywallArgs(
                  triggerModule: UserPropertyModule.appOpen,
                  triggerAction: PaywallTriggerAction.appOpen,
                  entrySource: PaywallEntrySource.appOpen,
                );
          // Wrapped so a deep-link interstitial paywall (TAM-124) replays
          // the pending intent on close. Transparent for non-deep-link
          // paywall pushes: the store is empty in that case.
          return _PaywallDeepLinkHook(
            child: MultiBlocProvider(
              providers: [
                BlocProvider<PaywallBloc>(
                  create: (_) => serviceLocator<PaywallBloc>()
                    ..add(
                      ConfigRequested(
                        locale,
                        triggerModule: args.triggerModule,
                        triggerAction: args.triggerAction,
                        entrySource: args.entrySource,
                        agentId: args.agentId,
                        chatType: args.chatType,
                      ),
                    ),
                ),
                BlocProvider<PaymentBloc>(
                  // Wire the entitlement-refresh callback here (not in
                  // service_locator) because it needs Riverpod `ref` to
                  // reach `entitlementStateProvider`. Without this, a
                  // successful payment left the app's live entitlement
                  // flag stale → PaywallGate saw `isPro = false` on the
                  // next check → the paywall re-appeared after payment.
                  //
                  // TAM-129 — same Riverpod-scoping reason for
                  // `getPrefillContact`: reads the logged-in user's phone
                  // from `meProvider` to prefill Razorpay's checkout, so
                  // the user doesn't re-type the number they already gave
                  // us at OTP.
                  //
                  // Reads `meProvider.future` (NOT `.value`) — `.value`
                  // returned null on first paywall entry because the
                  // /users/me FutureProvider hadn't resolved yet, so
                  // Razorpay's phone screen showed. `.future` resolves
                  // instantly when cached (typical after home has
                  // rendered) and waits briefly when not — the bloc
                  // awaits before opening the SDK.
                  //
                  // Returns the LOGIN phone in E.164 format
                  // (`+919998887777`) — server stores both
                  // `phoneCountryCode` (`+91`) and `phoneNumber`
                  // (national digits) from OTP verification. Razorpay's
                  // `prefill.contact` accepts bare digits OR E.164, but
                  // E.164 matches unambiguously; without the country
                  // code the SDK's phone validator falls back to the
                  // input screen on some builds.
                  create: (_) => serviceLocator<PaymentBloc>()
                    ..onEntitlementChanged = (() =>
                        ref.read(entitlementStateProvider.notifier).refresh())
                    ..getPrefillContact = (() async {
                      final me = await ref.read(meProvider.future);
                      final phone = me?.phoneNumber;
                      if (phone == null || phone.isEmpty) return null;
                      final country = me?.phoneCountryCode;
                      return country != null && country.isNotEmpty
                          ? '$country$phone'
                          : phone;
                    }),
                ),
              ],
              // Binder lives INSIDE the bloc providers so its context
              // resolves to this route's PaymentBloc, not a stale one.
              // Registers/clears the two PaymentReturnRegistrar seams
              // for the paywall's lifetime — see the binder's doc.
              child: _PaymentReturnBinder(
                child: PaywallScreen(
                  triggerModule: args.triggerModule,
                  triggerAction: args.triggerAction,
                  entrySource: args.entrySource,
                  // `goHome` for every push that doesn't ask otherwise —
                  // including the `args` fallback above, which is the
                  // bottom-of-stack entries (cold start, notification tap,
                  // payment return) where a pop would exit the app.
                  dismissMode: args.dismissMode,
                ),
              ),
            ),
          );
        },
      ),
      // In-app WebView that hosts a payment gateway's hosted checkout
      // page (Cashfree `/api/pay/authorize/…`, unresolved Decentro
      // shortener) and intercepts the `/app/payment/return` bounce so
      // the user never lands stranded in a browser tab. Pushed by
      // `_PaymentReturnBinder`'s `onNeedsWebView` seam when the UPI
      // launcher receives an `https://` URI it can't hand to a UPI
      // app. Not deep-linkable — bare navigation without the URL extra
      // pops back rather than rendering a blank WebView.
      GoRoute(
        path: '/paywall/return-webview',
        name: 'payment-webview',
        builder: (context, state) {
          final extra = state.extra;
          if (extra is! String) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (context.mounted && context.canPop()) context.pop();
            });
            return const Scaffold(body: SizedBox.shrink());
          }
          return PaymentWebViewScreen(url: extra);
        },
      ),
      // Support screen (TAM-N-support-screen) — full-screen route pushed
      // OVER the shell (bottom nav hidden while active), same convention
      // as /paywall and /profile. Registered FLAT (NOT nested under
      // /profile) so both entry points — the home header help glyph and
      // the profile menu Support row — push straight here without a
      // synthetic profile step in the back stack (see spec #PATH_DECISION).
      GoRoute(
        path: SupportRoutes.support,
        name: 'support',
        builder: (context, state) {
          // `extra` is typed as `SupportEntrySource` from both call sites.
          // Deep-link / hot-restart drops the extras — fall through to
          // `null` and let the screen fire the `unknown` analytics bucket
          // rather than crash.
          final source = state.extra is SupportEntrySource
              ? state.extra! as SupportEntrySource
              : null;
          return SupportScreen(source: source);
        },
      ),

      // Post-onboarding home area: a FIVE-branch stateful shell (TAM-58 +
      // TAM-164). Each branch keeps its own navigation stack + scroll position
      // across tab switches. The onboarding/paywall routes above stay OUTSIDE
      // the shell so they present full-screen and `/paywall` pushes over the
      // shell.
      //
      // TAM-164 — branch order was Home / Status / Horoscope / Downloads (4).
      // It is now Home / **Chat** / Status / Downloads / **Rashifal** (5) —
      // chat inserted at index 1, Horoscope re-labelled Rashifal and moved to
      // index 4. Every hard-coded index in `app_shell_scaffold.dart` is
      // updated to match. The chat branch is ALWAYS registered here (even
      // when a user's A/B variant has `chatConfig.enabled == false`) so the
      // IndexedStack's stable-branch-count invariant holds; enablement gates
      // the VISIBLE nav row, not the branch registration.
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            AppShellScaffold(navigationShell: navigationShell),
        branches: [
          // Branch 0 — Home (TAM-62). The app's discovery surface: CMS banners +
          // a mixed infinite feed over the five built modules. Figma 285:3464
          // renders the five-item bottom nav with Home active, so it lives in
          // the shell. Home is NOT Pro-gated (PRD §5) — there is deliberately no
          // entitlement check on this route; the only Home-origin paywall is a
          // pro-feature-discovery banner tap, gated inside the carousel.
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: HomeRoutes.home,
                name: 'home',
                builder: (context, state) => BlocProvider<HomeFeedBloc>(
                  create: (_) => HomeFeedBloc(
                    repository: ref.read(homeRepositoryProvider),
                    analytics: serviceLocator.isRegistered<Analytics>()
                        ? serviceLocator<Analytics>()
                        : null,
                    sessionContext:
                        serviceLocator.isRegistered<SessionContext>()
                        ? serviceLocator<SessionContext>()
                        : null,
                  )..add(const HomeStarted()),
                  child: const HomeScreen(),
                ),
              ),
            ],
          ),
          // Branch 1 — Chat (TAM-164). RAGFlow-backed conversational discovery.
          // A/B-gated via `MeUser.chatConfig` — the shell hides the tab from the
          // visible nav row when disabled but keeps the branch registered here
          // (IndexedStack requires a stable branch count). The chat SCREEN
          // renders WITHOUT the bottom nav (spec §Layout intent — every Figma
          // chat frame shows a back-arrow app bar and no visible nav); the shell
          // scaffold hides `_BottomNav` while this branch is active.
          //
          // Entry is Pro-gated at the TAB TAP via `PaywallGate.run` in
          // `app_shell_scaffold.dart` — not on this route, because a non-Pro
          // user must never mount the chat screen even for a frame.
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: ChatRoutes.chat,
                name: 'chat',
                // TAM-164 Slice 2 — `isPro` is a CLOSURE that reads
                // entitlement fresh on every call (spec §Composing &
                // sending: the bloc must NOT capture a stale bool). The
                // shell tab tap has already gated entry; this closure is
                // the defensive re-gate for entitlement flipping mid-
                // session. `analytics` is fire-and-forget (null in tests
                // per `apps/mobile/CLAUDE.md`).
                //
                // `requiresPro` decides whether that re-gate is armed at
                // all, from `/users/me → chatConfig.requiresPro`. A closure
                // for the same reason `isPro` is — the flag can flip under
                // a live session on the next profile refetch. Chat is free
                // today; see `features/chat/chat_paywall.dart` for the
                // one-line switch that re-arms it.
                builder: (context, state) => BlocProvider<ChatBloc>(
                  create: (_) => ChatBloc(
                    repository: ref.read(chatRepositoryProvider),
                    counters: ref.read(chatCountersProvider),
                    isPro: () => ref.read(entitlementProvider),
                    requiresPro: () => ref.read(chatPaywallRequiredProvider),
                    analytics: ref.read(analyticsProvider),
                  )..add(const ChatStarted()),
                  child: const ChatScreen(),
                ),
              ),
            ],
          ),
          // Branch 2 — Status (TAM-72). Unlike the other modules, Status Home
          // lives INSIDE the shell: Figma 302:4384 renders the five-item bottom
          // nav with Status active. Entry is login-gated (PRD §5) by the
          // `redirect` above; the feed bloc is built here from the
          // Riverpod-owned repository, and the share bloc is built by the screen
          // (it needs the paywall round-trip + live entitlement via ref).
          //
          // `?pinnedId=` (TAM-166) is the chat status-card target:
          // `context.go(StatusRoutes.homePinned(id))` swaps to this branch and
          // reloads THIS page with the card pinned (see `StatusRoutes`). Same
          // path ⇒ same page, so the screen picks the new pin up in
          // `didUpdateWidget` rather than a second page stacking on the feed.
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: StatusRoutes.home,
                name: 'status-home',
                builder: (context, state) => BlocProvider<StatusFeedBloc>(
                  create: (_) => StatusFeedBloc(
                    repository: ref.read(statusRepositoryProvider),
                    analytics: serviceLocator.isRegistered<Analytics>()
                        ? serviceLocator<Analytics>()
                        : null,
                  ),
                  child: StatusHomeScreen(
                    pinnedStatusId:
                        state.uri.queryParameters[StatusRoutes.pinnedIdParam],
                  ),
                ),
              ),
            ],
          ),
          // Branch 3 — Downloads (TAM-125). Library screen lives INSIDE the
          // shell so tapping the "Downloads" bottom tab swaps branches
          // without pushing a route. The bloc subscribes to the shared
          // `downloadManagerProvider` — the same manager the play-page
          // `DownloadButton` writes into, so a download started on any
          // player surfaces here without a manual refetch.
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: DownloadsRoutes.library,
                name: 'downloads-library',
                builder: (context, state) => BlocProvider<DownloadsLibraryBloc>(
                  create: (_) => DownloadsLibraryBloc(
                    manager: ref.read(downloadManagerProvider),
                  )..add(const DownloadsLibraryStarted()),
                  child: const DownloadsLibraryScreen(),
                ),
              ),
            ],
          ),
          // Branch 4 — Rashifal (TAM-74 module, TAM-164 rename). The module's
          // entry screen lives INSIDE the shell: Figma 371:3796 renders the
          // five-item bottom nav with Rashifal active. The grid is FREE (PRD
          // §5) — no paywall on tab entry or load; the gate fires on a zodiac
          // tap. The result flow pushes OVER the shell (below).
          //
          // The route path stays `/horoscope` for deep-link continuity; only
          // the user-visible label and the `GoRoute.name` change.
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: RashifalRoutes.main,
                name: 'rashifal-main',
                builder: (context, state) => BlocProvider<HoroscopeMainBloc>(
                  create: (_) => HoroscopeMainBloc(
                    repository: ref.read(horoscopeRepositoryProvider),
                    locale: ref.read(horoscopeLocaleProvider),
                    analytics: serviceLocator.isRegistered<Analytics>()
                        ? serviceLocator<Analytics>()
                        : null,
                  )..add(const HoroscopeMainRequested()),
                  child: const HoroscopeMainScreen(),
                ),
              ),
            ],
          ),
        ],
      ),

      // Books home (TAM-76) — no longer a bottom-nav branch. Kept as a
      // top-level route pushed OVER the shell so home shortcut / deep link
      // pushes still reach it; discovery is FREE (PRD §2) so no gate on
      // entry. Listings/contents/readers push over the shell below.
      GoRoute(
        path: BooksRoutes.home,
        name: 'books-home',
        builder: (context, state) => BlocProvider<BooksHomeBloc>(
          create: (_) => BooksHomeBloc(
            repository: ref.read(booksRepositoryProvider),
            analytics: serviceLocator.isRegistered<Analytics>()
                ? serviceLocator<Analytics>()
                : null,
          )..add(const BooksHomeLoadRequested()),
          child: const BooksHomeScreen(),
        ),
      ),

      // Aarti & Bhajans module (TAM-64) — full-screen OVER the shell (own
      // back-nav + title, no bottom tabs), like /paywall. Blocs are created here
      // from the Riverpod-owned repository; the player builds its own bloc
      // (it needs the shared AudioController via ref).
      GoRoute(
        path: AartiRoutes.main,
        name: 'aarti-main',
        builder: (context, state) => BlocProvider<AartiMainBloc>(
          create: (_) => AartiMainBloc(
            repository: ref.read(aartiRepositoryProvider),
            analytics: serviceLocator.isRegistered<Analytics>()
                ? serviceLocator<Analytics>()
                : null,
            sessionContext: serviceLocator.isRegistered<SessionContext>()
                ? serviceLocator<SessionContext>()
                : null,
          )..add(const AartiMainLoadRequested()),
          child: const AartiMainScreen(),
        ),
      ),
      GoRoute(
        path: AartiRoutes.listing,
        name: 'aarti-listing',
        builder: (context, state) {
          final query = state.extra is AartiListQuery
              ? state.extra! as AartiListQuery
              : const AartiListQuery(title: 'Aarti', sourceListType: 'all');
          return BlocProvider<AartiListingBloc>(
            create: (_) => AartiListingBloc(
              repository: ref.read(aartiRepositoryProvider),
              query: query,
              analytics: ref.read(analyticsProvider),
            )..add(const AartiListingLoadRequested()),
            child: AartiListingScreen(query: query),
          );
        },
      ),
      GoRoute(
        path: AartiRoutes.player,
        name: 'aarti-player',
        builder: (context, state) {
          final args = state.extra;
          if (args is! AartiPlayerArgs) return const AartiMainScreen();
          return AartiPlayerScreen(args: args);
        },
      ),
      GoRoute(
        path: AartiRoutes.deepLinkPattern,
        name: 'aarti-deep-link',
        builder: (context, state) =>
            AartiDeepLinkScreen(audioId: state.pathParameters['audioId'] ?? ''),
      ),

      // Mantras & Stutis module (TAM-66) — full-screen OVER the shell (own
      // back-nav + title, no bottom tabs), like /paywall + the Aarti module.
      // Blocs are created here from the Riverpod-owned repository; the player
      // builds its own bloc (it needs the shared AudioController via ref).
      GoRoute(
        path: MantrasRoutes.main,
        name: 'mantras-main',
        builder: (context, state) => BlocProvider<MantrasMainBloc>(
          create: (_) => MantrasMainBloc(
            repository: ref.read(mantrasRepositoryProvider),
            analytics: serviceLocator.isRegistered<Analytics>()
                ? serviceLocator<Analytics>()
                : null,
          )..add(const MantrasMainLoadRequested()),
          child: const MantrasMainScreen(),
        ),
      ),
      GoRoute(
        path: MantrasRoutes.listing,
        name: 'mantras-listing',
        builder: (context, state) {
          final query = state.extra is MantraListQuery
              ? state.extra! as MantraListQuery
              : const MantraListQuery(
                  title: 'Mantras & Stutis',
                  sourceListType: 'all',
                );
          return BlocProvider<MantrasListingBloc>(
            create: (_) => MantrasListingBloc(
              repository: ref.read(mantrasRepositoryProvider),
              query: query,
            )..add(const MantrasListingLoadRequested()),
            child: MantrasListingScreen(query: query),
          );
        },
      ),
      GoRoute(
        path: MantrasRoutes.player,
        name: 'mantras-player',
        builder: (context, state) {
          final args = state.extra;
          if (args is! MantrasPlayerArgs) return const MantrasMainScreen();
          return MantrasPlayerScreen(args: args);
        },
      ),
      // Mantras deep-link resolver (`/mantras/audio/:itemId`) — mirror of
      // `/aarti-bhajans/audio/:audioId`. Consumed by home-feed's
      // `content_detail` CTA on mantra cards + external share links.
      GoRoute(
        path: MantrasRoutes.deepLinkPattern,
        name: 'mantras-deep-link',
        builder: (context, state) =>
            MantrasDeepLinkScreen(itemId: state.pathParameters['itemId'] ?? ''),
      ),

      // Ringtone module (TAM-68) — full-screen OVER the shell (own back-nav +
      // search, no bottom tabs), like /paywall + Aarti + Mantras. Home/Search
      // blocs are created here from the Riverpod-owned repository; the Preview
      // builds its own blocs (it needs the shared AudioController via ref).
      GoRoute(
        path: RingtoneRoutes.home,
        name: 'ringtone-home',
        builder: (context, state) => BlocProvider<RingtoneHomeBloc>(
          create: (_) => RingtoneHomeBloc(
            repository: ref.read(ringtoneRepositoryProvider),
            analytics: serviceLocator.isRegistered<Analytics>()
                ? serviceLocator<Analytics>()
                : null,
          )..add(const RingtoneHomeLoadRequested()),
          child: const RingtoneHomeScreen(),
        ),
      ),
      GoRoute(
        path: RingtoneRoutes.search,
        name: 'ringtone-search',
        builder: (context, state) {
          final query = state.extra is String ? state.extra! as String : '';
          return BlocProvider<RingtoneSearchBloc>(
            create: (_) => RingtoneSearchBloc(
              repository: ref.read(ringtoneRepositoryProvider),
              analytics: serviceLocator.isRegistered<Analytics>()
                  ? serviceLocator<Analytics>()
                  : null,
            )..add(RingtoneSearchSubmitted(query)),
            child: RingtoneSearchScreen(query: query),
          );
        },
      ),
      GoRoute(
        path: RingtoneRoutes.previewPattern,
        name: 'ringtone-preview',
        builder: (context, state) {
          final extra = state.extra;
          final args = extra is RingtonePreviewArgs
              ? extra
              : RingtonePreviewArgs(
                  ringtoneId: state.pathParameters['id'] ?? '',
                );
          return RingtonePreviewScreen(args: args);
        },
      ),

      // Status details flow (TAM-72) — full-screen OVER the shell (own back-nav,
      // no bottom tabs), per Figma 371:2185 / 371:3567. Login-gated with the
      // feed via the `redirect` above.
      GoRoute(
        path: StatusRoutes.details,
        name: 'status-details',
        builder: (context, state) {
          final args = state.extra is StatusDetailsArgs
              ? state.extra! as StatusDetailsArgs
              : const StatusDetailsArgs();
          return BlocProvider<StatusProfileBloc>(
            create: (_) =>
                StatusProfileBloc(
                  repository: ref.read(statusRepositoryProvider),
                  avatarPicker: ref.read(statusAvatarPickerProvider),
                  analytics: serviceLocator.isRegistered<Analytics>()
                      ? serviceLocator<Analytics>()
                      : null,
                )..add(
                  StatusProfileLoadRequested(
                    args.initialType,
                    entrySource: args.entrySource,
                  ),
                ),
            child: StatusDetailsScreen(entryMessage: args.entryMessage),
          );
        },
      ),

      // Wallpaper module (TAM-70) — full-screen OVER the shell (own back-nav, no
      // bottom tabs), like /paywall + Aarti + Mantras + Ringtone. Home/Listing
      // blocs are created here from the Riverpod-owned repository; the Preview
      // builds its own blocs (it needs the video-port factory + share + set gate
      // via ref). Discovery/preview/like/share are FREE; only Set gates on Pro.
      GoRoute(
        path: WallpaperRoutes.home,
        name: 'wallpaper-home',
        builder: (context, state) => BlocProvider<WallpaperHomeBloc>(
          create: (_) => WallpaperHomeBloc(
            repository: ref.read(wallpaperRepositoryProvider),
            analytics: serviceLocator.isRegistered<Analytics>()
                ? serviceLocator<Analytics>()
                : null,
          )..add(const WallpaperHomeLoadRequested()),
          child: const WallpaperHomeScreen(),
        ),
      ),
      GoRoute(
        path: WallpaperRoutes.list,
        name: 'wallpaper-list',
        builder: (context, state) {
          final query = state.extra is WallpaperListQuery
              ? state.extra! as WallpaperListQuery
              : const WallpaperListQuery(title: 'Wallpapers');
          return BlocProvider<WallpaperListBloc>(
            create: (_) => WallpaperListBloc(
              repository: ref.read(wallpaperRepositoryProvider),
              query: query,
              analytics: serviceLocator.isRegistered<Analytics>()
                  ? serviceLocator<Analytics>()
                  : null,
            )..add(const WallpaperListLoadRequested()),
            child: WallpaperListingScreen(query: query),
          );
        },
      ),
      GoRoute(
        path: WallpaperRoutes.preview,
        name: 'wallpaper-preview',
        builder: (context, state) {
          final args = state.extra;
          if (args is! WallpaperPreviewArgs) return const WallpaperHomeScreen();
          return WallpaperPreviewScreen(args: args);
        },
      ),

      // Horoscope result flow (TAM-74) — full-screen OVER the shell (own back
      // arrow, no bottom tabs), per Figma 387:2571 (its nav component is
      // `visible:false`). The bloc is built here from the Riverpod-owned
      // repository + TTS port; entitlement is enforced SERVER-side (a free
      // caller gets 403 and never receives step text), and the grid's tap
      // handler only routes here through the PaywallGate.
      GoRoute(
        path: HoroscopeRoutes.resultPattern,
        name: 'horoscope-result',
        // Unknown zodiac ids are a no-op: bounce to the grid rather than open a
        // result we can't render (route allowlist per the feed pattern). Keyed
        // off the contract's closed 12-value enum via the bundled-glyph map.
        redirect: (context, state) =>
            zodiacGlyphAsset(state.pathParameters['zodiacId'] ?? '') == null
            ? HoroscopeRoutes.main
            : null,
        builder: (context, state) {
          final zodiacId = state.pathParameters['zodiacId'] ?? '';
          return BlocProvider<HoroscopeResultBloc>(
            create: (_) => HoroscopeResultBloc(
              repository: ref.read(horoscopeRepositoryProvider),
              tts: ref.read(ttsPortProvider),
              zodiacId: zodiacId,
              locale: ref.read(horoscopeLocaleProvider),
              analytics: serviceLocator.isRegistered<Analytics>()
                  ? serviceLocator<Analytics>()
                  : null,
            )..add(const HoroscopeResultRequested()),
            child: const HoroscopeResultScreen(),
          );
        },
      ),

      // Books & Scriptures downstream flow (TAM-76) — full-screen OVER the shell
      // (own back-nav, no bottom tabs), like the Status details + Horoscope
      // result flows. Books HOME itself lives in the shell (branch 4, above).
      //
      // Discovery (both listings) is FREE. Contents/reader/scripture are
      // Pro-gated SERVER-side by TAM-75: they are normally reached through
      // BooksTapHandler's paywall gate, and a 403 (expired entitlement, deep
      // link) routes to the paywall from inside the screen — never a preview.
      GoRoute(
        path: BooksRoutes.all,
        name: 'books-all',
        builder: (context, state) {
          // Deep-linked (no extra) ⇒ no title hint; the screen titles itself from
          // the response's server-owned `data.title`.
          final query = state.extra is BookListQuery
              ? state.extra! as BookListQuery
              : const BookListQuery();
          return BlocProvider<BooksListingBloc>(
            create: (_) => BooksListingBloc(
              repository: ref.read(booksRepositoryProvider),
              query: query,
              analytics: serviceLocator.isRegistered<Analytics>()
                  ? serviceLocator<Analytics>()
                  : null,
            )..add(const BooksListingLoadRequested()),
            child: BooksListingScreen(query: query),
          );
        },
      ),
      GoRoute(
        path: BooksRoutes.categoryPattern,
        name: 'books-category',
        // Unknown category slugs are a no-op: bounce to Books home rather than
        // open a listing we can't fetch (route allowlist per the feed pattern).
        // Keyed off the contract's closed 4-value enum.
        redirect: (context, state) =>
            BookCategory.fromWire(state.pathParameters['category']) == null
            ? BooksRoutes.home
            : null,
        builder: (context, state) {
          final category = BookCategory.fromWire(
            state.pathParameters['category'],
          )!;
          // Deep-linked ⇒ no hint (the enum's wire value is a path segment, not a
          // title, and rendering it as one was the bug). The category listing's
          // own `data.title` fills the nav bar.
          final query = state.extra is BookListQuery
              ? state.extra! as BookListQuery
              : BookListQuery(category: category);
          return BlocProvider<BooksListingBloc>(
            create: (_) => BooksListingBloc(
              repository: ref.read(booksRepositoryProvider),
              query: query,
              analytics: serviceLocator.isRegistered<Analytics>()
                  ? serviceLocator<Analytics>()
                  : null,
            )..add(const BooksListingLoadRequested()),
            child: BooksListingScreen(query: query),
          );
        },
      ),
      GoRoute(
        path: BooksRoutes.contentsPattern,
        name: 'book-contents',
        builder: (context, state) {
          final contentId = state.pathParameters['id'] ?? '';
          final card = state.extra is BookCardView
              ? state.extra! as BookCardView
              : null;
          return BlocProvider<BookContentsBloc>(
            create: (_) => BookContentsBloc(
              repository: ref.read(booksRepositoryProvider),
              contentId: contentId,
              analytics: serviceLocator.isRegistered<Analytics>()
                  ? serviceLocator<Analytics>()
                  : null,
            )..add(const BookContentsLoadRequested()),
            child: BookContentsScreen(card: card),
          );
        },
      ),
      GoRoute(
        path: BooksRoutes.readPattern,
        name: 'book-reader',
        builder: (context, state) {
          final contentId = state.pathParameters['id'] ?? '';
          final args = state.extra is BookReaderArgs
              ? state.extra! as BookReaderArgs
              : BookReaderArgs(contentId: contentId, title: '');
          return BlocProvider<BookReaderBloc>(
            create: (_) => BookReaderBloc(
              repository: ref.read(booksRepositoryProvider),
              cache: ref.read(booksOfflineCacheProvider),
              fontPrefs: ref.read(booksReaderFontPrefsProvider),
              contentId: contentId,
              mode: BookReaderMode.majorBook,
              // Chapter narration runs on the ONE shared TAM-59 engine, so it
              // promotes the mini-player and can never overlap other modules'
              // playback.
              audio: ControllerBookReaderAudioPort(
                ref.read(audioControllerProvider.notifier),
                readState: () => ref.read(audioControllerProvider),
              ),
              contents: args.contents,
              initialChapterId: args.chapterId,
              analytics: serviceLocator.isRegistered<Analytics>()
                  ? serviceLocator<Analytics>()
                  : null,
            )..add(const BookReaderStarted()),
            child: BookReaderScreen(
              bookTitle: args.title,
              coverImageUrl: args.coverImageUrl,
            ),
          );
        },
      ),
      GoRoute(
        path: BooksRoutes.scripturePattern,
        name: 'book-scripture',
        builder: (context, state) {
          final contentId = state.pathParameters['id'] ?? '';
          final card = state.extra is BookCardView
              ? state.extra! as BookCardView
              : null;
          return BlocProvider<BookReaderBloc>(
            create: (_) => BookReaderBloc(
              repository: ref.read(booksRepositoryProvider),
              cache: ref.read(booksOfflineCacheProvider),
              fontPrefs: ref.read(booksReaderFontPrefsProvider),
              contentId: contentId,
              // Direct scripture: no audio port is passed at all — the mode
              // already hides Listen Audio, and this makes narration structurally
              // impossible here (PRD §10).
              mode: BookReaderMode.directScripture,
              analytics: serviceLocator.isRegistered<Analytics>()
                  ? serviceLocator<Analytics>()
                  : null,
            )..add(const BookReaderStarted()),
            child: BookReaderScreen(
              bookTitle: card?.title ?? '',
              coverImageUrl: card?.coverImageUrl ?? '',
            ),
          );
        },
      ),

      // In-app browser for the legal pages (Terms & Conditions, Privacy
      // Policy). Pushed from the onboarding TermsRow + the Profile & Settings
      // screen with an [InAppWebViewArgs] on `state.extra`. Missing/malformed
      // extras → pop back rather than open a blank page.
      GoRoute(
        path: '/webview',
        name: 'webview',
        builder: (context, state) {
          final extra = state.extra;
          if (extra is! InAppWebViewArgs) {
            // Deep-linked without extras (or bad extras) — bounce back to the
            // splash rather than render a blank webview. Schedule the pop
            // after the current build so we don't mutate navigation state
            // mid-frame.
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (context.mounted) context.go('/splash');
            });
            return const Scaffold(body: SizedBox.shrink());
          }
          return InAppWebViewScreen(args: extra, onLoaded: extra.onLoaded);
        },
      ),

      // Existing admin routes — preserved so the current admin flow keeps
      // working end-to-end (login screen + users list).
      GoRoute(
        path: '/login',
        name: 'login',
        builder: (context, state) => const LoginScreen(),
      ),
      GoRoute(
        path: '/users',
        name: 'users',
        builder: (context, state) => const UsersScreen(),
      ),
    ],
  );
});

/// Pauses home-feed audio previews on any route push.
///
/// The problem this solves: the home feed's `_AudioHero` uses
/// `VisibilityDetector` to auto-play/pause based on viewport visibility. That
/// works for scrolls (widget moves out of view) and for the widget getting
/// disposed, but it does NOT fire when a new route is pushed on top — Flutter
/// doesn't re-layout the occluded underlying widgets, so their reported
/// visibility stays at whatever it was before the push, and the pause path
/// never runs. Result: preview audio keeps playing across every pushed screen.
///
/// The fix has to be global (the pushed route can be anything — a module CTA,
/// the profile menu, a paywall interstitial, an ad-hoc share sheet) and it
/// has to run for every push, so a router-level observer is the right seam.
///
/// Only `PlaybackMode.preview` playback is paused. Full-mode playback (i.e.
/// the mini-player over the shell) is left alone — the user is deliberately
/// keeping that alive across navigation.
class _PreviewAudioPauseOnPushObserver extends NavigatorObserver {
  _PreviewAudioPauseOnPushObserver(this._ref);
  final Ref _ref;

  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) {
    _maybePause();
  }

  @override
  void didReplace({Route<dynamic>? newRoute, Route<dynamic>? oldRoute}) {
    _maybePause();
  }

  void _maybePause() {
    final state = _ref.read(audioControllerProvider);
    if (state.mode == PlaybackMode.preview && state.playing) {
      unawaited(_ref.read(audioControllerProvider.notifier).pause());
    }
  }
}
