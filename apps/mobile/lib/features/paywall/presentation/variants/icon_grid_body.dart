import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../api/generated/openapi.dart';
import '../../../../core/theme.dart';
import '../../bloc/paywall_state.dart';
import '../../bloc/payment_bloc.dart';
import '../../bloc/payment_event.dart';
import '../widgets/compact_plan_trial_section.dart';
import '../widgets/hero_video_player.dart';
import '../widgets/icon_grid_benefits_card.dart';
import '../widgets/pay_now_shimmer_button.dart';
import '../widgets/paywall_video_controller.dart';
import '../widgets/top_nav.dart';
import '../widgets/vip_benefits_heading.dart';

/// `icon_grid` variant body — Figma node `2743:24912`.
///
/// Layout intent (top → bottom):
///   * `PaywallTopNav` — pinned top, 44 tall (intrinsic)
///   * `PaywallHeroVideoPlayer` — Flexible slot inside `Center` + `AspectRatio`
///     328:176. AspectRatio caps growth on tall devices; on short devices the
///     tight slot forces it to shrink width proportionally so it never
///     overshoots its share.
///   * "VIP Benefits" title (brand orange, centred with 🕉 flanking) —
///     intrinsic
///   * `PaywallIllustratedBenefitGrid` — Flexible slot wrapped in
///     `FittedBox(scaleDown)` so the 3×2 illustrated cards shrink uniformly
///     when the middle band is shorter than the grid's intrinsic height.
///   * `PaywallCompactPlanTrialSection` — **intrinsic (NOT Flexible)**. The
///     trial pill + 3 promise rows are the paywall's most critical copy — if
///     they scale down the text becomes unreadable and visually collides
///     with the grid above (which is exactly the "grid overlapping the
///     3-Day FREE Trial line" symptom on 640dp phones). Reserving the
///     trial section its full ~138dp intrinsic height forces the video +
///     grid Flexibles to absorb the remaining shrinkage instead.
///   * `PaywallPayNowShimmerButton` — pinned bottom (intrinsic)
///
/// **No `SingleChildScrollView` anywhere.** The middle band flexes; when
/// intrinsic content exceeds the allocated slot the FittedBoxes scale content
/// uniformly rather than scrolling.
///
/// **No traditional `_PlanCard` mounted.** The illustrated benefit grid +
/// compact trial section together replace `card_hero`'s plan card.
class IconGridPaywallBody extends StatelessWidget {
  const IconGridPaywallBody({
    super.key,
    required this.state,
    required this.videoController,
    required this.videoInitFailed,
    required this.triggerModule,
    required this.triggerAction,
    required this.entrySource,
  });

  final PaywallReady state;
  final PaywallVideoController? videoController;
  final bool videoInitFailed;
  final String? triggerModule;
  final String? triggerAction;
  final String? entrySource;

  @override
  Widget build(BuildContext context) {
    final config = state.config;
    final orderedPlans = List<PaywallPlanDisplay>.of(config.plans)
      ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
    final selected = orderedPlans.isEmpty
        ? null
        : orderedPlans.firstWhere(
            (p) => p.planId == state.selectedPlanId,
            orElse: () => orderedPlans.first,
          );

    return ColoredBox(
      color: AppColors.brand100,
      child: Column(
        children: <Widget>[
          const PaywallTopNav(
            key: Key('paywall-icon-grid-nav'),
            transparentBackground: true,
          ),
          Expanded(
            key: const Key('paywall-icon-grid-body'),
            child: Padding(
              padding:
                  const EdgeInsets.symmetric(horizontal: AppSpacing.medium),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: <Widget>[
                  const SizedBox(height: AppSpacing.xSmall),
                  // Hero video — Flexible with the design's 328:176 aspect
                  // ratio. Center wraps AspectRatio so short slots don't
                  // stretch the video horizontally past its aspect box.
                  // Shares the freed-up flex space with the grid below —
                  // the trial section no longer competes for flex, so on
                  // small devices the video shrinks proportionally instead
                  // of pushing the trial text off-slot.
                  Flexible(
                    flex: 5,
                    fit: FlexFit.tight,
                    child: Center(
                      child: AspectRatio(
                        aspectRatio: 328 / 176,
                        child: PaywallHeroVideoPlayer(
                          key: const Key('paywall-icon-grid-video'),
                          controller: videoController,
                          thumbnailUrl: config.videoThumbnailUrl,
                          failed: videoInitFailed,
                          borderRadius: BorderRadius.circular(AppRadius.card),
                        ),
                      ),
                    ),
                  ),
                  // Figma: 16dp gap between video and the benefits block.
                  const SizedBox(height: AppSpacing.medium),
                  const Padding(
                    key: Key('paywall-icon-grid-title'),
                    padding: EdgeInsets.symmetric(horizontal: 4),
                    child: PaywallVipBenefitsHeading(
                      textColor: AppColors.brand400,
                    ),
                  ),
                  // Figma: 8dp between VIP heading and the 3×2 grid.
                  const SizedBox(height: AppSpacing.xSmall),
                  // Illustrated benefit grid — Flexible + FittedBox
                  // scaleDown. Shares the middle band's flex space with
                  // the video above so on short devices the grid shrinks
                  // uniformly instead of overrunning the trial section
                  // below. Kept at flex 5 (same as video) to preserve the
                  // Figma video:grid visual balance (176:203 ≈ 5:5).
                  Flexible(
                    flex: 5,
                    fit: FlexFit.tight,
                    child: LayoutBuilder(
                      builder: (context, constraints) => FittedBox(
                        fit: BoxFit.scaleDown,
                        alignment: Alignment.topCenter,
                        child: SizedBox(
                          width: constraints.maxWidth,
                          child: PaywallIllustratedBenefitGrid(
                            benefits: config.benefits,
                          ),
                        ),
                      ),
                    ),
                  ),
                  // Figma: 24dp between the benefits block and the trial
                  // section. This gap is critical — the pre-fix layout
                  // dropped it AND wrapped the trial section in a
                  // FittedBox, which is what caused the grid to visually
                  // overlap the "3-Day FREE Trial" line on 640dp phones.
                  const SizedBox(height: AppSpacing.large),
                  if (selected != null)
                    // Trial section — INTRINSIC (not Flexible). The pill +
                    // 3 promise rows always render at their designed size
                    // (~138dp per Figma) and never scale down. Video +
                    // grid absorb any remaining shrinkage on small
                    // devices.
                    PaywallCompactPlanTrialSection(
                      key: const Key('paywall-icon-grid-trial-section'),
                      plan: selected,
                      contentAlignment: CrossAxisAlignment.center,
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
                              triggerModule: triggerModule,
                              triggerAction: triggerAction,
                              entrySource: entrySource,
                            ),
                          );
                    },
            ),
          ),
        ],
      ),
    );
  }
}
