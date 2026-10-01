import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../../../core/analytics.dart';
import '../../../../core/firebase_notifications.dart';
import '../../../../core/notification_permission.dart';
import '../../../../core/service_locator.dart';
import '../../../../core/theme.dart';
import '../../bloc/onboarding_orchestrator_bloc.dart';
import '../../bloc/onboarding_orchestrator_event.dart';
import '../../bloc/onboarding_orchestrator_state.dart';
import '../../onboarding_analytics.dart';
import '../../shared/brand_logo.dart';

/// Debug-only compile-time flag. When > 0, splash pauses this many ms before
/// dispatching [AppStarted] — used exclusively by the figma-flutter Phase 6
/// Maestro capture loop so the splash can be photographed before the
/// orchestrator redirects to phone-choice / home. Default 0 in every real build.
const int _kSplashHoldMs = int.fromEnvironment('SPLASH_HOLD_MS');

/// Splash screen — first paint on every launch.
///
/// Design source: Figma node 392:3223 (`Splash`) inside section 520:4992.
///   - 360×800 canvas, `Colors/Brand/100` = #FFF1E2 warm cream background.
///   - Logo (130×130 temple + Om composite) centered vertically, wordmark
///     "Prabhuji" (Libre Caslon Text Bold 24 / 31.2 / #FC7304) directly below.
///   - Bottom-anchored security row: shield icon + "100% Secure" in
///     `Label/label-sm` (Inter 500 12/16) `Colors/Grey/400` (#767676).
///
/// Dispatches [AppStarted] on mount; the orchestrator's state stream drives
/// the redirect via go_router's `refreshListenable`. This widget never calls
/// `Navigator.push`.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  Timer? _stillWorkingTimer;
  bool _showStillWorking = false;

  /// Wall clock at `initState` — stamped onto the row 2 `load_time_ms`
  /// when the first frame is committed.
  late final Stopwatch _splashStopwatch;

  @override
  void initState() {
    super.initState();
    _splashStopwatch = Stopwatch()..start();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _splashStopwatch.stop();
      _fireSplashViewed();
      _requestNotificationPermission();
      if (_kSplashHoldMs > 0) {
        // Fidelity-capture affordance: pause before dispatching so Maestro
        // can screenshot the splash. Only ever active when the app was built
        // with `--dart-define=SPLASH_HOLD_MS=<n>` for the Phase 6 loop.
        Future<void>.delayed(Duration(milliseconds: _kSplashHoldMs))
            .then((_) => _dispatchAppStarted());
      } else {
        _dispatchAppStarted();
      }
    });
    _stillWorkingTimer = Timer(const Duration(milliseconds: 1500), () {
      if (mounted) setState(() => _showStillWorking = true);
    });
  }

  /// Prompt for POST_NOTIFICATIONS (Android 13+) / APNS (iOS) on splash. Fire-
  /// and-forget: a granted or permanently-denied state resolves without
  /// showing UI, so calling on every launch is safe. Only the "notDetermined"
  /// and single-denial states actually surface a dialog — and only those fire
  /// `notification_permission_result` (plus `notification_permission_dismissed`
  /// when the user closed it without choosing). The service is optional (null in
  /// tests / harnesses that skip Firebase init).
  void _requestNotificationPermission() {
    if (!serviceLocator.isRegistered<FirebaseNotifications>()) return;
    unawaited(askNotificationPermission(
      serviceLocator.isRegistered<NotificationPermission>()
          ? serviceLocator<NotificationPermission>()
          : NotificationPermission(
              requestNonAndroid:
                  serviceLocator<FirebaseNotifications>().requestPermission,
            ),
      serviceLocator.isRegistered<Analytics>()
          ? serviceLocator<Analytics>()
          : null,
    ));
  }

  /// Sheet 1 row 2 — `splash_screen_viewed`. Fires once, right after the
  /// first frame is committed. The `app_opened` (row 1) fire is handled
  /// in `main.dart` before `runApp` so its `load_time_ms` isn't polluted
  /// by the splash-widget lifecycle.
  void _fireSplashViewed() {
    final analytics = serviceLocator.isRegistered<Analytics>()
        ? serviceLocator<Analytics>()
        : null;
    if (analytics == null) return;
    unawaited(analytics.trackEvent(
      OnboardingEvents.splashScreenViewed,
      properties: <String, Object?>{
        OnboardingEventProps.loadTimeMs: _splashStopwatch.elapsedMilliseconds,
      },
    ));
  }

  void _dispatchAppStarted() {
    if (!mounted) return;
    context.read<OnboardingOrchestratorBloc>().add(const AppStarted());
  }

  void _retry() {
    setState(() => _showStillWorking = false);
    _stillWorkingTimer?.cancel();
    _stillWorkingTimer = Timer(const Duration(milliseconds: 1500), () {
      if (mounted) setState(() => _showStillWorking = true);
    });
    _dispatchAppStarted();
  }

  @override
  void dispose() {
    _stillWorkingTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.brand100,
      body: BlocConsumer<OnboardingOrchestratorBloc, OrchestratorState>(
        listener: (context, state) {
          if (state is OrchestratorRouteDecided) {
            _stillWorkingTimer?.cancel();
          }
        },
        builder: (context, state) {
          final isOffline = state is OrchestratorRouteDecided &&
              state.target == RouteTarget.offline;
          final isError = state is OrchestratorError;

          return Stack(
            children: <Widget>[
              // Hero cluster — logo + wordmark, vertically centered.
              Center(
                child: Column(
                  key: const Key('splash-hero'),
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    const BrandLogo(size: 130),
                    const SizedBox(height: 0),
                    Text(
                      'Prabhuji',
                      key: const Key('splash-wordmark'),
                      style: AppText.wordmarkFigma(),
                    ),
                  ],
                ),
              ),
              // Bottom-anchored security row.
              Positioned(
                left: 12,
                right: 12,
                bottom: 8,
                child: SafeArea(
                  top: false,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppSpacing.small,
                      vertical: AppSpacing.small,
                    ),
                    child: Row(
                      key: const Key('splash-trust-row'),
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: <Widget>[
                        SvgPicture.asset(
                          'assets/onboarding/security-shield.svg',
                          width: 20,
                          height: 20,
                          colorFilter: const ColorFilter.mode(
                            AppColors.grey400,
                            BlendMode.srcIn,
                          ),
                        ),
                        const SizedBox(width: AppSpacing.xSmall),
                        Text(
                          '100% Secure',
                          key: const Key('splash-trust-text'),
                          style: AppText.labelSm(color: AppColors.grey400),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              // "Still working" overlay + retry — placed above the hero without
              // shifting it.
              if (_showStillWorking && !isOffline && !isError)
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: 96,
                  child: Center(
                    child: Text(
                      'Still working…',
                      key: const Key('splash-still-working'),
                      style: AppText.bodyXs(color: AppColors.grey400),
                    ),
                  ),
                ),
              if (isOffline || isError)
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: 96,
                  child: Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: <Widget>[
                        Text(
                          'No internet connection',
                          key: const Key('splash-offline-text'),
                          style: AppText.labelMd(color: AppColors.grey500),
                        ),
                        const SizedBox(height: AppSpacing.small),
                        TextButton(
                          key: const Key('splash-retry-button'),
                          onPressed: _retry,
                          style: TextButton.styleFrom(
                            foregroundColor: AppColors.white,
                            backgroundColor: AppColors.brand300,
                            padding: const EdgeInsets.symmetric(
                              horizontal: 24,
                              vertical: 12,
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius:
                                  BorderRadius.circular(AppRadius.input),
                            ),
                          ),
                          child: Text(
                            'Retry',
                            style: AppText.labelMd(color: AppColors.white),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}
