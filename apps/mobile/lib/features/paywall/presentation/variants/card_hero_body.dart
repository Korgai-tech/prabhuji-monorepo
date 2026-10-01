import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../api/generated/openapi.dart';
import '../../../../core/app_config.dart';
import '../../../../core/theme.dart';
import '../../bloc/paywall_bloc.dart';
import '../../bloc/paywall_event.dart';
import '../../bloc/paywall_state.dart';
import '../../bloc/payment_bloc.dart';
import '../../bloc/payment_event.dart';
import '../widgets/hero_video_player.dart';
import '../widgets/pay_now_shimmer_button.dart';
import '../widgets/paywall_video_controller.dart';
import '../widgets/plan_card.dart';
import '../widgets/plan_tabs_pill.dart';
import '../widgets/top_nav.dart';

/// `card_hero` variant body — the currently-shipped screen shape. Renamed
/// out of `_ReadyBody` (TAM-160) and moved here BYTE-COMPATIBLE with the
/// existing widget tree + keys + analytics so the existing widget test in
/// `apps/mobile/test/paywall_screen_test.dart` passes unchanged.
///
/// Layout intent (top → bottom):
///   * `PaywallTopNav` — pinned top, 44 tall (intrinsic)
///   * `PaywallHeroVideoPlayer` — flex-3 slot inside an `AspectRatio` 328:176
///     so the hero card scales proportionally as the middle band grows or
///     shrinks (TAM-XXX "no scroll" refactor).
///   * `PaywallPlanTabsPill` — intrinsic, only when >1 plan
///   * `PaywallPlanCard` — flex-7 slot wrapped in `FittedBox(scaleDown)` so
///     the whole card shrinks uniformly when the middle band is smaller than
///     the card's intrinsic height (600dp devices) and sits at natural size
///     with empty space below when the band is larger (800dp+).
///   * `PaywallPayNowShimmerButton` — pinned bottom (intrinsic)
///
/// **No `SingleChildScrollView` anywhere.** The middle band flexes; when the
/// intrinsic content exceeds the allocated slot the FittedBox scales it
/// uniformly rather than scrolling.
class CardHeroPaywallBody extends StatefulWidget {
  const CardHeroPaywallBody({
    super.key,
    required this.state,
    required this.videoController,
    required this.videoInitFailed,
    required this.onRefundPolicyTap,
    required this.triggerModule,
    required this.triggerAction,
    required this.entrySource,
  });

  final PaywallReady state;
  final PaywallVideoController? videoController;
  final bool videoInitFailed;
  final Future<void> Function(String url) onRefundPolicyTap;
  final String? triggerModule;
  final String? triggerAction;
  final String? entrySource;

  @override
  State<CardHeroPaywallBody> createState() => _CardHeroPaywallBodyState();
}

class _CardHeroPaywallBodyState extends State<CardHeroPaywallBody> {
  PaywallReady get state => widget.state;

  List<PaywallPlanDisplay> get _orderedPlans {
    final copy = List<PaywallPlanDisplay>.of(state.config.plans);
    copy.sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
    return copy;
  }

  PaywallPlanDisplay? get _selectedPlan {
    for (final plan in state.config.plans) {
      if (plan.planId == state.selectedPlanId) return plan;
    }
    return _orderedPlans.isNotEmpty ? _orderedPlans.first : null;
  }

  @override
  Widget build(BuildContext context) {
    final selected = _selectedPlan;
    final videoController = widget.videoController;
    final videoInitFailed = widget.videoInitFailed;
    final onRefundPolicyTap = widget.onRefundPolicyTap;
    final config = state.config;
    final refundUrl = config.legalLinks.refundPolicyUrl.isNotEmpty
        ? config.legalLinks.refundPolicyUrl
        : AppConfig.instance.refundPolicyUrl;

    return Column(
      children: <Widget>[
        const PaywallTopNav(),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.medium),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                const SizedBox(height: AppSpacing.xSmall),
                // Hero video — flex 3 with 328:176 aspect ratio. The
                // AspectRatio shrinks the box proportionally when the slot
                // is smaller; no fixed 196dp height (removed for the "no
                // scroll" refactor).
                Flexible(
                  flex: 3,
                  fit: FlexFit.tight,
                  child: Center(
                    child: AspectRatio(
                      aspectRatio: 328 / 176,
                      child: PaywallHeroVideoPlayer(
                        controller: videoController,
                        thumbnailUrl: config.videoThumbnailUrl,
                        failed: videoInitFailed,
                        borderRadius:
                            BorderRadius.circular(AppRadius.button),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: AppSpacing.small),
                // A tab strip with one tab is a control that cannot do
                // anything — it reads as a broken selector. The multi-plan
                // rendering stays intact for when a second plan returns.
                if (_orderedPlans.length > 1) ...<Widget>[
                  PaywallPlanTabsPill(
                    plans: _orderedPlans,
                    selectedPlanId: state.selectedPlanId,
                    onSelect: (id) =>
                        context.read<PaywallBloc>().add(PlanSelected(id)),
                  ),
                  const SizedBox(height: AppSpacing.small),
                ],
                if (selected != null)
                  // Plan card — flex 7. Wrapped in FittedBox(scaleDown) so
                  // when the middle band is shorter than the card's
                  // intrinsic height (600dp devices), the whole card scales
                  // uniformly rather than overflowing. At 800dp+ the card
                  // sits at natural size aligned to the top of the slot.
                  Flexible(
                    flex: 7,
                    fit: FlexFit.tight,
                    child: LayoutBuilder(
                      builder: (context, constraints) => FittedBox(
                        fit: BoxFit.scaleDown,
                        alignment: Alignment.topCenter,
                        child: SizedBox(
                          width: constraints.maxWidth,
                          child: PaywallPlanCard(
                            plan: selected,
                            benefits: config.benefits,
                            cancelAnytimeText: config.cancelAnytimeText,
                            refundPolicyText: config.refundPolicyText,
                            onRefundTap: () => onRefundPolicyTap(refundUrl),
                          ),
                        ),
                      ),
                    ),
                  ),
                const SizedBox(height: AppSpacing.xSmall),
              ],
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.medium,
            AppSpacing.xSmall,
            AppSpacing.medium,
            AppSpacing.medium,
          ),
          child: PaywallPayNowShimmerButton(
            label: config.payNowCta,
            enabled: selected != null,
            onTap: selected == null
                ? null
                : () {
                    context.read<PaymentBloc>().add(
                          PayNowTapped(
                            planId: selected.planId,
                            selectedPlanPeriod: selected.period,
                            selectedProductId: selected.productId,
                            displayPrice: selected.displayPriceText,
                            currency: 'INR',
                            trialAvailable: selected.trialDays > 0,
                            trialDays: selected.trialDays,
                            paymentMethodDisplayed: 'UPI',
                            triggerModule: widget.triggerModule,
                            triggerAction: widget.triggerAction,
                            entrySource: widget.entrySource,
                          ),
                        );
                  },
          ),
        ),
      ],
    );
  }
}
