import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../../../api/generated/openapi.dart';
import '../../../../core/theme.dart';

/// Plan details card — Figma node `I493:4823;493:4501` "Plan Details".
///
/// 328 wide, 2px `#FF7200` border, radius 8, overflow-clipped so the trial
/// header's brand200 background stretches edge-to-edge inside the card.
///
/// Used by the `card_hero` variant only — the other three variants have no
/// traditional plan card.
class PaywallPlanCard extends StatelessWidget {
  const PaywallPlanCard({
    super.key,
    required this.plan,
    required this.benefits,
    required this.cancelAnytimeText,
    required this.refundPolicyText,
    required this.onRefundTap,
  });

  final PaywallPlanDisplay plan;
  final List<PaywallBenefitDisplay> benefits;
  final String cancelAnytimeText;
  final String refundPolicyText;
  final VoidCallback onRefundTap;

  static const Color _cardBorder = AppColors.paywallPlanCardBorder;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      key: Key('paywall-plan-card-${plan.planId}'),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(AppRadius.button),
        border: Border.all(color: _cardBorder, width: 2),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppRadius.button - 2),
        child: Column(
          children: <Widget>[
            _TrialHeader(label: plan.trialLabel),
            const SizedBox(height: AppSpacing.medium),
            _PriceBlock(
              priceText: plan.displayPriceText,
              subscriptionText: plan.subscriptionDetailText,
            ),
            const SizedBox(height: AppSpacing.medium),
            const _VipBenefitsHeader(),
            const SizedBox(height: 10),
            _BenefitsGrid(benefits: benefits),
            const SizedBox(height: AppSpacing.medium),
            const Center(child: _SecureAndSafePill()),
            const SizedBox(height: AppSpacing.medium),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 32),
              child: _CancelAndRefundRow(
                cancelAnytimeText: cancelAnytimeText,
                refundPolicyText: refundPolicyText,
                onRefundTap: onRefundTap,
              ),
            ),
            const SizedBox(height: 18),
          ],
        ),
      ),
    );
  }
}

/// Header row inside the plan card — `Colors/Brand/200` bg, "Free trial" text
/// on the left, orange check circle on the right.
class _TrialHeader extends StatelessWidget {
  const _TrialHeader({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppColors.brand200,
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.small,
        vertical: 13,
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: <Widget>[
          Text(
            label,
            style: const TextStyle(
              // Figma: Poppins Bold 16/24. Now bundled — see pubspec.yaml.
              fontFamily: 'Poppins',
              fontSize: 16,
              fontWeight: FontWeight.w700,
              height: 24 / 16,
              color: AppColors.brand300,
            ),
          ),
          SvgPicture.asset(
            'assets/paywall/trial-check.svg',
            width: 24,
            height: 24,
            colorFilter: const ColorFilter.mode(
              AppColors.brand300,
              BlendMode.srcIn,
            ),
          ),
        ],
      ),
    );
  }
}

/// ₹2 price + trial helper text. The Figma design places a Lottie sparkle
/// behind the price; we render the static PNG export at 25% opacity so the
/// price stays readable when the animation isn't available.
class _PriceBlock extends StatelessWidget {
  const _PriceBlock({
    required this.priceText,
    required this.subscriptionText,
  });

  final String priceText;
  final String subscriptionText;

  @override
  Widget build(BuildContext context) {
    return Stack(
      alignment: Alignment.center,
      children: <Widget>[
        // Sparkle backdrop behind the price. Lottie in Figma → static PNG
        // fallback on device.
        Positioned(
          top: 0,
          child: Opacity(
            opacity: 0.35,
            child: Image.asset(
              'assets/paywall/sparkle.png',
              width: 136,
              height: 61,
              fit: BoxFit.contain,
            ),
          ),
        ),
        Column(
          children: <Widget>[
            Text(
              priceText,
              style: const TextStyle(
                fontFamily: 'Inter',
                fontSize: 40,
                fontWeight: FontWeight.w900, // Inter Black
                color: AppColors.black,
                height: 1,
              ),
            ),
            const SizedBox(height: AppSpacing.small),
            // Figma `Subscription text` (493:3349) is textAlignHorizontal
            // CENTER in a 156-wide container. Without an explicit textAlign a
            // single line looks centred (the Column centres it) but a wrapping
            // one does not — and the localized copy wraps in every language we
            // ship. The horizontal inset keeps it off the card edge rather
            // than pinning the literal 156px, which would clip Hindi.
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Text(
                subscriptionText,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  // Figma: Poppins Medium 12. Now bundled.
                  fontFamily: 'Poppins',
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                  height: 18 / 12,
                  color: AppColors.grey500,
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

/// "ॐ VIP BENEFITS ॐ" — Inter Bold 16 in `Colors/Brand/400`, letter-spaced,
/// uppercase, flanked by 18×18 om icons.
class _VipBenefitsHeader extends StatelessWidget {
  const _VipBenefitsHeader();

  @override
  Widget build(BuildContext context) {
    return Row(
      key: const Key('paywall-vip-header'),
      mainAxisAlignment: MainAxisAlignment.center,
      children: <Widget>[
        SvgPicture.asset(
          'assets/paywall/om.svg',
          width: 18,
          height: 18,
          colorFilter: const ColorFilter.mode(
            AppColors.brand400,
            BlendMode.srcIn,
          ),
        ),
        const SizedBox(width: 10),
        const Text(
          'VIP BENEFITS',
          style: TextStyle(
            fontFamily: 'Inter',
            fontSize: 16,
            fontWeight: FontWeight.w700,
            color: AppColors.brand400,
            height: 18 / 16,
            letterSpacing: 3.52,
          ),
        ),
        const SizedBox(width: 10),
        SvgPicture.asset(
          'assets/paywall/om-right.svg',
          width: 18,
          height: 18,
          colorFilter: const ColorFilter.mode(
            AppColors.brand400,
            BlendMode.srcIn,
          ),
        ),
      ],
    );
  }
}

/// 4×2 benefits grid with 16×16 green check icons + labels. Falls back to the
/// PRD benefit list ordering; Figma uses column-major fill (Mandir, Ringtone,
/// Mantras & Stutis, Horoscope | Wallpaper, Aarti & Bhajans, Whatsapp Status,
/// App icon) — we honor the CMS's `sortOrder` and let the grid wrap.
class _BenefitsGrid extends StatelessWidget {
  const _BenefitsGrid({required this.benefits});

  final List<PaywallBenefitDisplay> benefits;

  @override
  Widget build(BuildContext context) {
    final ordered = List<PaywallBenefitDisplay>.of(benefits)
      ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xSmall),
      child: Column(
        key: const Key('paywall-benefits-list'),
        children: <Widget>[
          for (int row = 0; row * 2 < ordered.length; row++) ...<Widget>[
            if (row > 0) const SizedBox(height: 10),
            Row(
              children: <Widget>[
                Expanded(
                  child: _BenefitRow(
                    benefit: ordered[row * 2],
                  ),
                ),
                const SizedBox(width: AppSpacing.small),
                Expanded(
                  child: row * 2 + 1 < ordered.length
                      ? _BenefitRow(benefit: ordered[row * 2 + 1])
                      : const SizedBox.shrink(),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _BenefitRow extends StatelessWidget {
  const _BenefitRow({required this.benefit});

  final PaywallBenefitDisplay benefit;

  @override
  Widget build(BuildContext context) {
    // Row uses `mainAxisSize: MainAxisSize.max` so `Expanded` on the label
    // gives a bounded width for the `Text` to shrink into at high text
    // scales (a11y user with `textScaleFactor` >= 1.5). Kept the same key
    // so the shipped widget test finds the row unchanged.
    return Row(
      key: Key('paywall-benefit-${benefit.benefitId}'),
      children: <Widget>[
        const SizedBox(width: 20),
        SvgPicture.asset(
          'assets/paywall/benefit-check.svg',
          width: 16,
          height: 16,
          colorFilter: const ColorFilter.mode(
            AppColors.green,
            BlendMode.srcIn,
          ),
        ),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            benefit.localizedName,
            style: AppText.labelMd(color: AppColors.black),
            overflow: TextOverflow.ellipsis,
            maxLines: 1,
          ),
        ),
      ],
    );
  }
}

class _CancelAndRefundRow extends StatelessWidget {
  const _CancelAndRefundRow({
    required this.cancelAnytimeText,
    required this.refundPolicyText,
    required this.onRefundTap,
  });

  final String cancelAnytimeText;
  final String refundPolicyText;
  final VoidCallback onRefundTap;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: <Widget>[
        // Flexible around each so long/localized copy (or the tester's
        // fallback font) never overflows the row at 360dp width.
        Flexible(
          child: Text(
            cancelAnytimeText,
            key: const Key('paywall-cancel-anytime'),
            style: const TextStyle(
              // Figma: Poppins Regular 12 in Colors/Grey/400.
              fontFamily: 'Poppins',
              fontSize: 12,
              fontWeight: FontWeight.w400,
              height: 18 / 12,
              color: AppColors.grey400,
            ),
            overflow: TextOverflow.ellipsis,
            maxLines: 1,
          ),
        ),
        const SizedBox(width: 8),
        Flexible(
          child: GestureDetector(
            key: const Key('paywall-refund-policy-link'),
            onTap: onRefundTap,
            child: Text(
              refundPolicyText,
              textAlign: TextAlign.end,
              style: const TextStyle(
                // Figma: Poppins Regular 12 in Colors/Brand/300.
                fontFamily: 'Poppins',
                fontSize: 12,
                fontWeight: FontWeight.w400,
                height: 18 / 12,
                color: AppColors.brand300,
              ),
              overflow: TextOverflow.ellipsis,
              maxLines: 1,
            ),
          ),
        ),
      ],
    );
  }
}

/// "Secure & Safe / 100% trusted payments" pill.
///
/// Fixed brand element — not CMS-driven. Sits below the benefits grid and
/// signals that the payment surface is trusted before the user commits to
/// tapping the CTA. Shield icon on the left, two lines of copy on the right;
/// the whole pill has a soft grey background with a subtle border.
class _SecureAndSafePill extends StatelessWidget {
  const _SecureAndSafePill();

  @override
  Widget build(BuildContext context) {
    return Container(
      key: const Key('paywall-secure-safe-pill'),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.grey100,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.grey200, width: 1),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: <Widget>[
          SvgPicture.asset(
            'assets/onboarding/security-shield.svg',
            width: 20,
            height: 20,
            colorFilter: const ColorFilter.mode(
              AppColors.green,
              BlendMode.srcIn,
            ),
          ),
          const SizedBox(width: 8),
          Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(
                'Secure & Safe',
                style: AppText.labelMd(color: AppColors.black),
              ),
              Text(
                '100% trusted payments',
                style: AppText.bodyXs(color: AppColors.grey500),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
