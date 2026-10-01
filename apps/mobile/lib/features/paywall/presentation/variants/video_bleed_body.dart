import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../../../api/generated/openapi.dart';
import '../../../../core/theme.dart';
import '../../bloc/paywall_state.dart';
import '../../bloc/payment_bloc.dart';
import '../../bloc/payment_event.dart';
import '../widgets/hero_video_player.dart';
import '../widgets/pay_now_shimmer_button.dart';
import '../widgets/paywall_video_controller.dart';
import '../widgets/top_nav.dart';

/// `video_bleed` variant body — Figma node `2743:25149`.
///
/// Full-bleed video on a BLACK scaffold background. Top gradient (dark →
/// transparent, 80h) + bottom gradient (transparent → dark, 330h) darken
/// the video's top and bottom edges so the overlays read; the middle band
/// stays clear so the deity's face is never covered.
///
/// Overlay content (paint order back → front):
///   * `PaywallHeroVideoPlayer(fit: BoxFit.cover)` full-bleed
///   * top + bottom gradient scrims
///   * `PaywallTopNav` — white icons, transparent bg
///   * "3-Day FREE Trial" pill (white text)
///   * 3-row benefits list (white text)
///   * `PaywallPayNowShimmerButton` — pinned near-bottom
///
/// **No `_PlanCard` is mounted.** The whole middle band is the video with
/// a trial pill + 3 benefit rows layered over it.
class VideoBleedPaywallBody extends StatelessWidget {
  const VideoBleedPaywallBody({
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

  static const _topGradient = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: <Color>[Color(0xFF000000), Color(0x00000000)],
  );

  static const _bottomGradient = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: <Color>[Color(0x00000000), Color(0xFF000000)],
  );

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
    // Figma v2 shows 3 fixed trial-promise rows (not app-benefit names):
    // (1) coin + "Start trial by paying just ₹2"
    // (2) FREE badge + "3-Day FREE, cancel anytime"
    // (3) diamond + "AUTOPAY ₹299/month"
    // The rows are semantic to the trial contract, not variable per user.
    // Fallback only — the server owns this. Kept in step with the plan's own
    // trial_days (1 since TAM-164) so a config fetch that has not landed yet
    // shows the same number the paywall will settle on, rather than a stale one.
    final int trialDays = selected?.trialDays ?? 1;
    final String priceText = selected?.displayPriceText ?? '₹299/month';
    final trialRows = <_VideoBleedTrialRow>[
      const _VideoBleedTrialRow(
        icon: 'assets/paywall/trial-icon-coin.svg',
        text: 'Start trial by paying just ₹2',
      ),
      _VideoBleedTrialRow(
        icon: 'assets/paywall/trial-icon-free-badge.svg',
        text: '$trialDays-Day FREE, cancel anytime',
      ),
      _VideoBleedTrialRow(
        icon: 'assets/paywall/trial-icon-diamond.svg',
        text: 'AUTOPAY $priceText',
      ),
    ];

    return ColoredBox(
      key: const Key('paywall-video-bleed-scaffold'),
      color: AppColors.black,
      child: Stack(
        fit: StackFit.expand,
        children: <Widget>[
          // Layer 1: Full-bleed video (Positioned.fill so it covers the
          // whole scaffold — the fit=cover crops to fill without letterboxing).
          Positioned.fill(
            key: const Key('paywall-video-bleed-video'),
            child: PaywallHeroVideoPlayer(
              controller: videoController,
              thumbnailUrl: config.videoThumbnailUrl,
              failed: videoInitFailed,
              fit: BoxFit.cover,
            ),
          ),
          // Layer 2: Top gradient overlay (darkens the nav area).
          Positioned(
            key: const Key('paywall-video-bleed-top-gradient'),
            top: 0,
            left: 0,
            right: 0,
            height: 176,
            child: const DecoratedBox(
              decoration: BoxDecoration(gradient: _topGradient),
            ),
          ),
          // Layer 3: Bottom gradient overlay (darkens the CTA + benefits area).
          Positioned(
            key: const Key('paywall-video-bleed-bottom-gradient'),
            bottom: 0,
            left: 0,
            right: 0,
            height: 330,
            child: const DecoratedBox(
              decoration: BoxDecoration(gradient: _bottomGradient),
            ),
          ),
          // Layer 4: content column — nav pinned top, CTA pinned bottom.
          SafeArea(
            child: Column(
              children: <Widget>[
                const PaywallTopNav(
                  key: Key('paywall-video-bleed-nav'),
                  iconColor: AppColors.white,
                  titleColor: AppColors.white,
                  transparentBackground: true,
                ),
                const Spacer(),
                // Trial pill — inline "3-Day [FREE] Trial" per Figma v2
                // (matches v3/v4 treatment; the rounded-container variant we
                // shipped earlier didn't match any Figma frame).
                Padding(
                  key: const Key('paywall-video-bleed-pill'),
                  padding: const EdgeInsets.symmetric(
                      horizontal: AppSpacing.medium),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: <Widget>[
                      Text(
                        '$trialDays-Day',
                        style: const TextStyle(
                          fontFamily: 'Inter',
                          fontSize: 18,
                          fontWeight: FontWeight.w500,
                          color: AppColors.white,
                          height: 21.78 / 18,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: AppColors.brand300, // #FE8A02
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: const Text(
                          'FREE',
                          style: TextStyle(
                            fontFamily: 'Inter',
                            fontSize: 18,
                            fontWeight: FontWeight.w600,
                            color: AppColors.white,
                            height: 21.78 / 18,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      const Text(
                        'Trial',
                        style: TextStyle(
                          fontFamily: 'Inter',
                          fontSize: 18,
                          fontWeight: FontWeight.w500,
                          color: AppColors.white,
                          height: 21.78 / 18,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                // Trial promise rows — 3 fixed per Figma (coin/FREE/diamond).
                Padding(
                  key: const Key('paywall-video-bleed-benefits'),
                  padding: const EdgeInsets.symmetric(
                      horizontal: AppSpacing.medium),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: <Widget>[
                      for (int i = 0; i < trialRows.length; i++) ...[
                        if (i > 0) const SizedBox(height: 8),
                        trialRows[i],
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.medium),
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
          ),
        ],
      ),
    );
  }

}

class _VideoBleedTrialRow extends StatelessWidget {
  const _VideoBleedTrialRow({required this.icon, required this.text});

  final String icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        SvgPicture.asset(
          icon,
          width: 18,
          height: 18,
        ),
        const SizedBox(width: 8),
        Flexible(
          child: Text(
            text,
            style: const TextStyle(
              fontFamily: 'Inter',
              fontSize: 14,
              // Figma: Inter 14 w400 letter -0.42.
              fontWeight: FontWeight.w400,
              color: AppColors.white,
              letterSpacing: -0.42,
              height: 20 / 14,
            ),
            overflow: TextOverflow.ellipsis,
            maxLines: 1,
          ),
        ),
      ],
    );
  }
}
