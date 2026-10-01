import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:shimmer/shimmer.dart';

import '../../../../core/theme.dart';
import '../../bloc/payment_bloc.dart';
import '../../bloc/payment_state.dart';

/// Shimmering Pay Now CTA (Figma node `493:3527`).
///
/// The button itself is the CTA gradient (LR from `#FC7304` → `#FE8A02`) at
/// radius 8. A `shimmer` overlay sweeps a bright band across the surface at a
/// 1.6s period, matching the two Figma "shimmer" rectangles overlaid on the
/// component. Text "Pay Now" — Inter SemiBold 16/24 white with -0.48 tracking.
///
/// Extracted out of `paywall_screen.dart` (TAM-160) so every variant mounts
/// an identical CTA — same event, same PaymentBloc wiring, same visual.
///
/// **In-progress state.** The button subscribes to [PaymentBloc] and, while a
/// mandate is being created or an approval is in flight (Razorpay/Decentro
/// sheet open, polling), swaps the label to a human-readable "Opening payment
/// …" / "Waiting for approval…" string and adds a spinner. Two reasons:
///   1. Microsoft Clarity replays label the button by its rendered text — a
///      static "Pay Now" made it impossible to distinguish "user is on the
///      paywall" from "user has left to Razorpay" in session replays.
///   2. Without a visible progress indicator, the paywall looks frozen while
///      the mandate call is in flight and users double-tap.
/// The disabled onTap while in-progress also prevents a second `PayNowTapped`
/// event from firing before the first settles.
class PaywallPayNowShimmerButton extends StatelessWidget {
  const PaywallPayNowShimmerButton({
    super.key,
    required this.label,
    required this.enabled,
    required this.onTap,
  });

  final String label;
  final bool enabled;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<PaymentBloc, PaymentState>(
      buildWhen: (prev, next) => _isInProgress(prev) != _isInProgress(next),
      builder: (context, paymentState) {
        final inProgress = _isInProgress(paymentState);
        final effectiveLabel =
            inProgress ? _inProgressLabel(paymentState) : label;
        final effectiveEnabled = enabled && !inProgress;
        return _PayNowButton(
          label: effectiveLabel,
          enabled: effectiveEnabled,
          showSpinner: inProgress,
          onTap: effectiveEnabled ? onTap : null,
        );
      },
    );
  }

  static bool _isInProgress(PaymentState s) =>
      s is PaymentCreatingMandate ||
      s is PaymentAwaitingApproval ||
      s is PaymentPolling;

  /// Human-readable label per stage. Kept as literal English strings so
  /// Clarity's session-replay text search can find them; this button doesn't
  /// wire i18n, matching the rest of the paywall which is EN-only today.
  static String _inProgressLabel(PaymentState s) {
    if (s is PaymentCreatingMandate) return 'Opening payment…';
    if (s is PaymentAwaitingApproval) return 'Waiting for approval…';
    if (s is PaymentPolling) return 'Confirming payment…';
    return 'Please wait…';
  }
}

class _PayNowButton extends StatelessWidget {
  const _PayNowButton({
    required this.label,
    required this.enabled,
    required this.showSpinner,
    required this.onTap,
  });

  final String label;
  final bool enabled;
  final bool showSpinner;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    // Stacked so the shimmer only affects a decorative bright-band overlay,
    // never the white text. `Shimmer.fromColors` internally uses
    // `BlendMode.srcIn` — everything it wraps has its alpha multiplied by
    // the shimmer gradient's alpha, so any child text goes invisible at
    // baseColor positions (Colors.transparent → α=0). Keeping the label
    // outside the shimmer subtree guarantees it stays fully white.
    return Opacity(
      opacity: enabled ? 1.0 : 0.6,
      child: SizedBox(
        height: 44,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(AppRadius.button),
          child: Stack(
            fit: StackFit.expand,
            children: <Widget>[
              const DecoratedBox(
                decoration: BoxDecoration(gradient: AppGradient.ctaLR),
              ),
              IgnorePointer(
                child: Shimmer.fromColors(
                  baseColor: Colors.transparent,
                  highlightColor: Colors.white.withValues(alpha: 0.4),
                  period: const Duration(milliseconds: 1600),
                  child: Container(color: Colors.white),
                ),
              ),
              Material(
                color: Colors.transparent,
                child: InkWell(
                  key: const Key('paywall-pay-now-cta'),
                  onTap: enabled ? onTap : null,
                  child: Center(
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: <Widget>[
                        if (showSpinner) ...<Widget>[
                          const SizedBox(
                            key: Key('paywall-pay-now-cta-spinner'),
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              valueColor: AlwaysStoppedAnimation<Color>(
                                AppColors.white,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                        ],
                        Flexible(
                          child: Text(
                            label,
                            key: const Key('paywall-pay-now-cta-label'),
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontFamily: 'Inter',
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                              color: AppColors.white,
                              letterSpacing: -0.48,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
