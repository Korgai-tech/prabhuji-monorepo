import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/theme.dart';
import '../bloc/paywall_bloc.dart';
import '../bloc/paywall_event.dart';
import '../bloc/paywall_state.dart';
import '../bloc/payment_bloc.dart';
import '../bloc/payment_event.dart';
import '../bloc/payment_state.dart';
import 'paywall_close.dart';
import 'variants/card_hero_body.dart';
import 'variants/carousel_body.dart';
import 'variants/icon_grid_body.dart';
import 'variants/video_bleed_body.dart';
import 'widgets/paywall_video_controller.dart';

/// Paywall / VIP Membership screen (PRD §6.6–6.9).
///
/// Design source: Figma node `493:3349` ("Paywall") on a 360×800 canvas.
///
/// **TAM-160 — variant dispatcher.** Reads `state.config.layout` and mounts
/// exactly ONE of the four variant bodies:
///
///  * `card_hero`   → [CardHeroPaywallBody] (currently-shipped shape;
///                    byte-compatible with the pre-TAM-160 build)
///  * `video_bleed` → [VideoBleedPaywallBody]
///  * `icon_grid`   → [IconGridPaywallBody]
///  * `carousel`    → [CarouselPaywallBody]
///  * unknown/null  → [CardHeroPaywallBody] fallback (never blank, never
///                    error)
///
/// The video-controller lifecycle (initialize → autoplay-with-sound → loop →
/// pause-on-background → watch-time accumulator on dispose → failure
/// reporting) is owned by [_PaywallScreenState] and threaded into the
/// variant bodies that need it. `carousel` doesn't mount the controller.
///
/// See `specs/TAM-160-paywall-variant-ui.md` for the full variant
/// enumeration + layout intent tables per variant.
///
/// IST is UTC+5:30, no DST — safe as fixed arithmetic, and it must match the
/// server's own offset handling in `apps/api/.../services/npci-window.ts`.
const _istOffset = Duration(hours: 5, minutes: 30);

/// The IST calendar date of [instant], as a UTC-midnight `DateTime`.
DateTime _istDateOnly(DateTime instant) {
  final ist = instant.toUtc().add(_istOffset);
  return DateTime.utc(ist.year, ist.month, ist.day);
}

/// Whole days of free trial, derived from the server's [trialEndsAt].
@visibleForTesting
int trialDaysFrom(DateTime trialEndsAt, {DateTime? now}) {
  final days = _istDateOnly(trialEndsAt)
      .difference(_istDateOnly(now ?? DateTime.now()))
      .inDays;
  return days > 0 ? days : 0;
}

/// Payment-success copy: "Your 3-day free trial has started." when a trial was
/// granted, and a plain welcome when it wasn't.
@visibleForTesting
String trialSuccessMessage(DateTime? trialEndsAt, {DateTime? now}) {
  if (trialEndsAt == null) return 'Welcome to Prabhuji VIP.';
  final days = trialDaysFrom(trialEndsAt, now: now);
  if (days <= 0) return 'Your free trial has started.';
  return 'Your $days-day free trial has started.';
}

/// Route args for the paywall — carries the three attribution dimensions
/// (`entry_source`, `trigger_module`, `trigger_action`) plus (Bug 7) the
/// chat-specific attribution that lets the funnel tell which bot's
/// paywall a `trigger_module: chat` fire came from. Both chat fields are
/// null when the paywall is opened from a non-chat surface — the paywall
/// bloc omits them from the analytics event in that case.
class PaywallArgs {
  const PaywallArgs({
    this.triggerModule,
    this.triggerAction,
    this.entrySource,
    this.agentId,
    this.chatType,
    this.dismissMode = PaywallDismissMode.goHome,
  });

  final String? triggerModule;
  final String? triggerAction;
  final String? entrySource;

  /// Bug 7 — the active RAGFlow agent id when the paywall is opened from
  /// chat (`chatConfig.agentId` on `/users/me`). Null on non-chat entries.
  final String? agentId;

  /// Bug 7 — the opaque `chat_type` bucket label when the paywall is
  /// opened from chat. Null on non-chat entries.
  final String? chatType;

  /// Where the user lands when they leave the paywall without buying — and
  /// where they leave FROM after they do buy. Defaults to
  /// [PaywallDismissMode.goHome], which is what every surface did before this
  /// field existed, so only a call site that opts in moves.
  final PaywallDismissMode dismissMode;
}

class PaywallScreen extends StatefulWidget {
  const PaywallScreen({
    super.key,
    this.triggerModule,
    this.triggerAction,
    this.entrySource,
    this.agentId,
    this.chatType,
    this.dismissMode = PaywallDismissMode.goHome,
  });

  final String? triggerModule;
  final String? triggerAction;
  final String? entrySource;
  final String? agentId;
  final String? chatType;

  /// See [PaywallArgs.dismissMode] — threaded through by the `/paywall` route
  /// builder and consumed by all four of this screen's exits.
  final PaywallDismissMode dismissMode;

  @override
  State<PaywallScreen> createState() => _PaywallScreenState();
}

class _PaywallScreenState extends State<PaywallScreen>
    with WidgetsBindingObserver {
  PaywallVideoController? _videoController;
  bool _videoInitInFlight = false;
  bool _videoInitFailed = false;
  String? _lastVideoUrl;
  String? _videoId;

  // Sheet 1 row 25 — `paywall_video_watch_time` accumulator.
  int _videoWatchMs = 0;
  DateTime? _lastPlayStartAt;

  /// Whether the currently-resolved variant mounts the video controller.
  /// `carousel` (images-only) returns false; every other layout returns
  /// true. Determined by the same switch that picks the body — see
  /// [_variantMountsVideo].
  bool _variantWantsVideo(PaywallReady state) {
    return _variantMountsVideo(state.config.layout);
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _flushWatchInterval();
    if (_videoWatchMs > 0) {
      try {
        context.read<PaywallBloc>().trackVideoWatchTime(
              watchTimeMs: _videoWatchMs,
              videoId: _videoId,
            );
      } catch (_) {
        // The bloc may already be closed on a forced route unmount — this is
        // fire-and-forget analytics, not a correctness path.
      }
    }
    _videoController?.dispose();
    super.dispose();
  }

  void _flushWatchInterval() {
    final startedAt = _lastPlayStartAt;
    if (startedAt == null) return;
    final ms = DateTime.now().difference(startedAt).inMilliseconds;
    if (ms > 0) _videoWatchMs += ms;
    _lastPlayStartAt = null;
  }

  void _markPlaying() {
    _lastPlayStartAt ??= DateTime.now();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (!mounted) return;
    final bloc = context.read<PaywallBloc>();
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.inactive ||
        state == AppLifecycleState.hidden) {
      _flushWatchInterval();
      bloc.add(const AppBackgrounded());
      _videoController?.pause();
    } else if (state == AppLifecycleState.resumed) {
      bloc.add(const AppResumed());
      final payment = context.read<PaymentBloc>();
      final s = payment.state;
      if (s is PaymentAwaitingApproval || s is PaymentPolling) {
        payment.add(const AppResumedFromUpi());
      }
    }
  }

  void _onPaymentStateChanged(BuildContext context, PaymentState state) {
    switch (state) {
      case PaymentSucceeded(:final trialEndsAt):
        _showSnack(
          context,
          key: 'paywall-payment-success-snackbar',
          message: trialSuccessMessage(trialEndsAt),
        );
        // Leaving via the caller's mode, not unconditionally `/home`: a
        // purchase made from a paywall that was pushed over a surface has to
        // hand the user BACK to that surface, or whatever the gate resumes
        // afterwards stacks on top of Home and the surface is gone from the
        // back stack.
        unawaited(Future<void>.microtask(() {
          if (!context.mounted) return;
          leavePaywall(context, mode: widget.dismissMode);
        }));

      case PaymentPending():
        _showSnack(
          context,
          key: 'paywall-payment-pending-snackbar',
          message: "Still confirming with your bank — we'll unlock this as "
              'soon as it completes.',
        );

      case PaymentFailed(:final message, :final requiresReRegistration):
        _showSnack(
          context,
          key: requiresReRegistration
              ? 'paywall-payment-reregister-snackbar'
              : 'paywall-payment-failed-snackbar',
          message: message,
        );

      case PaymentIdle():
      case PaymentCreatingMandate():
      case PaymentAwaitingApproval():
      case PaymentPolling():
      case PaymentCancelled():
        break;
    }
  }

  void _showSnack(
    BuildContext context, {
    required String key,
    required String message,
  }) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        key: Key(key),
        content: Text(message),
        duration: const Duration(milliseconds: 3000),
      ),
    );
  }

  Future<void> _ensureVideoController(String? videoUrl) async {
    if (videoUrl == null || videoUrl.isEmpty) return;
    if (_lastVideoUrl == videoUrl && _videoController != null) return;
    if (_videoInitInFlight) return;
    _videoInitInFlight = true;
    _videoInitFailed = false;

    final uri = Uri.tryParse(videoUrl);
    if (uri == null) {
      _videoInitFailed = true;
      _videoInitInFlight = false;
      _reportVideoFailed('invalid_url');
      if (mounted) setState(() {});
      return;
    }

    final controller = PaywallVideoController();
    try {
      await controller.initialize(uri, volume: 1.0, loop: true, autoplay: true);
      if (!mounted) {
        await controller.dispose();
        return;
      }
      await _videoController?.dispose();
      _videoController = controller;
      _lastVideoUrl = videoUrl;
      _markPlaying();
    } catch (_) {
      _videoInitFailed = true;
      _reportVideoFailed('init_failed');
      await controller.dispose();
    } finally {
      _videoInitInFlight = false;
      if (mounted) setState(() {});
    }
  }

  void _reportVideoFailed(String errorCode) {
    if (!mounted) return;
    try {
      context.read<PaywallBloc>().trackVideoFailed(
            videoId: _videoId,
            errorCode: errorCode,
          );
    } catch (_) {
      // Fire-and-forget analytics.
    }
  }

  Future<void> _openRefundPolicy(String url) async {
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    try {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {
      // A missing browser or a bad URL must never crash the paywall.
    }
  }

  /// Android system back button / predictive-back gesture. Routed through the
  /// same [dismissPaywall] the X glyph uses, so a back press is exactly a
  /// close: `paywall_closed` fires and the user lands on `/home`.
  void _onSystemBack() {
    if (!mounted) return;
    dismissPaywall(
      context,
      trigger: PaywallCloseTrigger.back,
      mode: widget.dismissMode,
    );
  }

  @override
  Widget build(BuildContext context) {
    // `canPop: false` is what keeps the app alive on the cold-start paywall:
    // the orchestrator redirects `/splash → /paywall`, so the paywall is the
    // bottom of the stack and an unhandled back press popped the last page —
    // which Android reads as "leave the app". Intercepted on every entry, not
    // just the root one, so back and the X glyph behave identically wherever
    // the paywall was opened from.
    // The scope publishes the mode to the subtree — the X glyph in
    // `PaywallTopNav` (mounted by all four variant bodies) and the
    // config-error escape read it from there rather than being handed it.
    return PaywallDismissScope(
      mode: widget.dismissMode,
      child: PopScope(
        canPop: false,
        onPopInvokedWithResult: (didPop, result) {
          if (didPop) return;
          _onSystemBack();
        },
        child: _buildScaffold(context),
      ),
    );
  }

  /// The paywall surface itself. Split out of [build] purely so the [PopScope]
  /// wrapper doesn't re-indent the whole tree.
  Widget _buildScaffold(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.white,
      body: SafeArea(
        child: BlocConsumer<PaywallBloc, PaywallState>(
          listenWhen: (prev, next) {
            if (prev.runtimeType != next.runtimeType) return true;
            if (prev is PaywallReady && next is PaywallReady) {
              return prev.isPlaying != next.isPlaying ||
                  prev.config.videoUrl != next.config.videoUrl;
            }
            return false;
          },
          listener: (context, state) {
            if (state is PaywallEmpty) {
              context
                  .read<PaywallBloc>()
                  .add(const CloseTapped(trigger: 'no_valid_plans'));
              unawaited(Future<void>.microtask(() {
                if (!context.mounted) return;
                leavePaywall(context, mode: widget.dismissMode);
              }));
            }
            if (state is PaywallReady) {
              _videoId = state.config.videoId;
              // Only initialize the controller when the resolved variant
              // needs it — `carousel` (images-only) skips this entirely.
              if (_variantWantsVideo(state)) {
                _ensureVideoController(state.config.videoUrl);
              }
              if (_videoController != null &&
                  _videoController!.isInitialized) {
                if (state.isPlaying && !_videoController!.isPlaying) {
                  _videoController!.play();
                  _markPlaying();
                } else if (!state.isPlaying &&
                    _videoController!.isPlaying) {
                  _videoController!.pause();
                  _flushWatchInterval();
                }
              }
            }
          },
          builder: (context, state) {
            if (state is PaywallLoading) {
              return const Center(child: CircularProgressIndicator());
            }
            if (state is PaywallError) {
              return _ErrorView(message: state.message);
            }
            if (state is PaywallOffline) {
              return const _ErrorView(message: 'You are offline');
            }
            if (state is PaywallEmpty) {
              return const SizedBox.shrink();
            }
            if (state is PaywallReady) {
              return BlocListener<PaymentBloc, PaymentState>(
                listener: _onPaymentStateChanged,
                child: _dispatchBody(state),
              );
            }
            return const SizedBox.shrink();
          },
        ),
      ),
    );
  }

  /// Route the ready state to the variant body indicated by
  /// `state.config.layout`. Unknown / null layouts fall through to
  /// [CardHeroPaywallBody] — never blank, never error (spec `#PATH_DECISION`
  /// + `#EXPORT_CRITICAL`).
  Widget _dispatchBody(PaywallReady state) {
    switch (state.config.layout) {
      case 'card_hero':
        return CardHeroPaywallBody(
          state: state,
          videoController: _videoController,
          videoInitFailed: _videoInitFailed,
          onRefundPolicyTap: _openRefundPolicy,
          triggerModule: widget.triggerModule,
          triggerAction: widget.triggerAction,
          entrySource: widget.entrySource,
        );
      case 'video_bleed':
        return VideoBleedPaywallBody(
          state: state,
          videoController: _videoController,
          videoInitFailed: _videoInitFailed,
          triggerModule: widget.triggerModule,
          triggerAction: widget.triggerAction,
          entrySource: widget.entrySource,
        );
      case 'icon_grid':
        return IconGridPaywallBody(
          state: state,
          videoController: _videoController,
          videoInitFailed: _videoInitFailed,
          triggerModule: widget.triggerModule,
          triggerAction: widget.triggerAction,
          entrySource: widget.entrySource,
        );
      case 'carousel':
        // The v4 body now ships bundled fallback coverflow images
        // (`v4-coverflow-1..5.png`) that render when CMS `heroMedia` has no
        // image rows. Spec §363's fallback-to-CardHero is preserved for the
        // literal "empty AND no local defaults" case inside the body itself.
        return CarouselPaywallBody(
          state: state,
          triggerModule: widget.triggerModule,
          triggerAction: widget.triggerAction,
          entrySource: widget.entrySource,
        );
      default:
        // Unknown/null layout → the shipped default. Guarded by
        // `_variantMountsVideo` so the video controller wiring stays
        // consistent with `card_hero`.
        return CardHeroPaywallBody(
          state: state,
          videoController: _videoController,
          videoInitFailed: _videoInitFailed,
          onRefundPolicyTap: _openRefundPolicy,
          triggerModule: widget.triggerModule,
          triggerAction: widget.triggerAction,
          entrySource: widget.entrySource,
        );
    }
  }
}

/// Whether the given layout mounts the shared hero video player. Only
/// `carousel` returns false — it's images-only per the seed. Kept a plain
/// static so the `_PaywallScreenState.listener` can guard the controller
/// initialisation without duplicating the switch above.
bool _variantMountsVideo(String? layout) {
  return layout != 'carousel';
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          const Icon(Icons.error_outline, size: 48, color: AppColors.brand300),
          const SizedBox(height: 16),
          Text(
            message,
            textAlign: TextAlign.center,
            style: AppText.bodyMd(color: AppColors.grey500),
          ),
          const SizedBox(height: 24),
          ElevatedButton(
            key: const Key('paywall-retry-cta'),
            onPressed: () =>
                context.read<PaywallBloc>().add(const RetryRequested()),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.brand300,
              foregroundColor: AppColors.white,
            ),
            child: const Text('Retry'),
          ),
          const SizedBox(height: 12),
          TextButton(
            // "Skip for now" is an exit like any other — it obeys the
            // opening caller's mode instead of hard-coding `/home`.
            onPressed: () =>
                leavePaywall(context, mode: PaywallDismissScope.of(context)),
            child: const Text('Skip for now'),
          ),
        ],
      ),
    );
  }
}
