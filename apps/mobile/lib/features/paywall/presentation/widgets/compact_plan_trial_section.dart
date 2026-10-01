import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../../../api/generated/openapi.dart';
import '../../../../core/theme.dart';

/// Compact trial + trial-promise section — Figma Frame `2147227499`.
///
/// Shared between the `icon_grid` and `carousel` variants (TAM-160), and a
/// visual match for the trial section in `video_bleed` (v2). Content:
///   * "N-Day FREE Trial" pill (162×30) at the top, centred
///   * a horizontal border-gradient hairline under the pill
///   * three hardcoded trial-promise rows, EACH with its own icon:
///       - coin      → "Start trial by paying just ₹2"
///       - FREE badge → "N-Day FREE, cancel anytime"
///       - diamond   → "AUTOPAY {price}/month"
///
/// The rows are NOT driven by `PaywallConfigData.benefits` — those are
/// app-feature names (Wallpaper / Ringtone / …) and Figma shows the paywall's
/// trial-promise copy here instead. The [benefits] param is kept for
/// backwards-compat with the existing call sites; it is intentionally unused.
///
/// [textColor] parameterised so `video_bleed` (dark scaffold) can request
/// WHITE while `icon_grid` and `carousel` (peach scaffold) pass BLACK.
///
/// [contentAlignment] toggles the row layout so a single shared widget
/// covers two Figma treatments without a fork:
///   * `.start` (default) — pill centred, rows left-aligned as a stack
///     (matches `video_bleed` v2 fidelity — the inlined copy still uses
///     the left-aligned pattern)
///   * `.center` — pill centred AND each row centred as an icon+text pair
///     (matches `icon_grid` v3 + `carousel` v4 fidelity, where Figma centres
///     the whole trial block under the benefits)
/// Kept as an optional param with the legacy `.start` default so callers
/// that don't opt in are unaffected.
class PaywallCompactPlanTrialSection extends StatelessWidget {
  const PaywallCompactPlanTrialSection({
    super.key,
    required this.plan,
    this.benefits = const <PaywallBenefitDisplay>[],
    this.textColor = AppColors.black,
    this.contentAlignment = CrossAxisAlignment.start,
  });

  final PaywallPlanDisplay plan;

  /// Legacy parameter kept for source-compat with the pre-TAM-160 call sites.
  /// The section no longer renders CMS-driven benefit rows here — Figma shows
  /// three hardcoded trial-promise rows instead. Safe to omit.
  final List<PaywallBenefitDisplay> benefits;
  final Color textColor;

  /// Horizontal alignment applied to the 3 trial-promise rows. See class doc
  /// for which variant chooses which alignment.
  final CrossAxisAlignment contentAlignment;

  @override
  Widget build(BuildContext context) {
    // Figma pill: NO peach background pill. Text-inline layout:
    //   "3-Day" (black, large)  [FREE] (white on orange filled box)  "Trial" (black, large)
    // Fallback only; see video_bleed_body.dart. 1 since TAM-164.
    final trialDays = plan.trialDays > 0 ? plan.trialDays : 1;
    final headingColor = textColor;

    return SizedBox(
      key: const Key('paywall-compact-trial-section'),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Center(
            key: const Key('paywall-compact-trial-pill'),
            // FittedBox(scaleDown) so the "3-Day [FREE] Trial" row survives
            // system font scale ≥ 1.5 — otherwise the Inter-18 pill row
            // (with a padded FREE badge) exceeds 328dp at textScale 2.0 and
            // trips the RenderFlex overflow banner (caught by
            // `multi_size_smoke_test` at textScale 2.0).
            child: FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.center,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.center,
                children: <Widget>[
                  Text(
                    '$trialDays-Day',
                    style: TextStyle(
                      fontFamily: 'Inter',
                      fontSize: 18,
                      fontWeight: FontWeight.w500,
                      color: headingColor,
                      height: 22 / 18,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    // Figma FREE pill: padding L=5 R=5 T=4 B=4 (total row
                    // height = 22 line-height + 8 padding = 30, matching
                    // the 30dp pill-row spec).
                    padding: const EdgeInsets.symmetric(
                        horizontal: 5, vertical: 4),
                    decoration: BoxDecoration(
                      color: AppColors.brand300, // #FE8A02
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: const Text(
                      'FREE',
                      style: TextStyle(
                        fontFamily: 'Inter',
                        fontSize: 18,
                        // Figma: Inter 18 w600 (not w700). w700 reads too
                        // heavy against the surrounding w500 "3-Day" and
                        // "Trial".
                        fontWeight: FontWeight.w600,
                        color: AppColors.white,
                        height: 21.78 / 18,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    'Trial',
                    style: TextStyle(
                      fontFamily: 'Inter',
                      fontSize: 18,
                      fontWeight: FontWeight.w500,
                      color: headingColor,
                      height: 22 / 18,
                    ),
                  ),
                ],
              ),
            ),
          ),
          // Figma: 16dp between the pill row and the divider (VERTICAL
          // itemSpacing on Frame 2147227499).
          const SizedBox(height: AppSpacing.medium),
          // Border-gradient hairline — Figma has a 3-stop fade
          // (transparent → orange → transparent) that reads as a soft divider.
          Container(
            key: const Key('paywall-compact-trial-divider'),
            height: 1,
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.centerLeft,
                end: Alignment.centerRight,
                colors: <Color>[
                  Color(0x00FE8A02),
                  Color(0xFFFE8A02),
                  Color(0x00FE8A02),
                ],
                stops: <double>[0.0, 0.5, 1.0],
              ),
            ),
          ),
          // Figma: 16dp between the divider and the trial-promise rows.
          const SizedBox(height: AppSpacing.medium),
          // Row 1 — coin. Trial price hint.
          _TrialPromiseRow(
            key: const Key('paywall-compact-trial-row-coin'),
            iconAsset: 'assets/paywall/trial-icon-coin.svg',
            label: _trialPriceLabel(plan),
            textColor: textColor,
            centered: contentAlignment == CrossAxisAlignment.center,
          ),
          // Figma Frame 2147227498 itemSpacing = 8 (rows are 20dp each,
          // 3 rows in 76dp with 2× 8dp gaps).
          const SizedBox(height: AppSpacing.xSmall),
          // Row 2 — FREE badge. Trial length promise.
          _TrialPromiseRow(
            key: const Key('paywall-compact-trial-row-free'),
            iconAsset: 'assets/paywall/trial-icon-free-badge.svg',
            label: _freeTrialLabel(plan),
            textColor: textColor,
            centered: contentAlignment == CrossAxisAlignment.center,
          ),
          const SizedBox(height: AppSpacing.xSmall),
          // Row 3 — diamond. Recurring commitment.
          _TrialPromiseRow(
            key: const Key('paywall-compact-trial-row-autopay'),
            iconAsset: 'assets/paywall/trial-icon-diamond.svg',
            label: _autopayLabel(plan),
            textColor: textColor,
            centered: contentAlignment == CrossAxisAlignment.center,
          ),
        ],
      ),
    );
  }

  /// The pill copy — derived from the plan's trialLabel when it looks like a
  /// Row-1 label. `PaywallPlanDisplay` doesn't currently carry an
  /// `amountPaise` field for the trial deposit, so we default to the Figma
  /// copy "₹2". If the CMS surfaces a real deposit amount later, prepend the
  /// derivation here — call sites don't need to change.
  static String _trialPriceLabel(PaywallPlanDisplay plan) {
    return 'Start trial by paying just ₹2';
  }

  /// Row-2 label — trial length + cancel-anytime promise.
  static String _freeTrialLabel(PaywallPlanDisplay plan) {
    final days = plan.trialDays > 0 ? plan.trialDays : 1;
    return '$days-Day FREE, cancel anytime';
  }

  /// Row-3 label — recurring commitment. Uses the plan's own displayPriceText
  /// when set (e.g. "₹299/month"), else the Figma default.
  static String _autopayLabel(PaywallPlanDisplay plan) {
    final price = plan.displayPriceText.trim();
    if (price.isNotEmpty) return 'AUTOPAY $price';
    return 'AUTOPAY ₹299/month';
  }
}

/// One row inside the trial section — a per-row SVG icon (rendered at its
/// native fill so the coin stays orange, the FREE badge stays orange, and the
/// diamond stays blue) + a single-line label in [textColor].
///
/// [centered] switches the row from left-aligned (leading fixed inset →
/// icon → gap → text) to centred (icon+text pair centred as one unit).
/// Left-aligned matches `video_bleed`'s inlined 3-row list; centred matches
/// Figma v3 (`icon_grid`) and v4 (`carousel`) where the whole trial block
/// centres under the benefits.
class _TrialPromiseRow extends StatelessWidget {
  const _TrialPromiseRow({
    super.key,
    required this.iconAsset,
    required this.label,
    required this.textColor,
    this.centered = false,
  });

  final String iconAsset;
  final String label;
  final Color textColor;
  final bool centered;

  @override
  Widget build(BuildContext context) {
    // Figma "Benefit item" icon = 16×16 (was 20×20 pre-fix — icons read too
    // heavy against the 14pt text and pushed the row above its 20dp height).
    final icon = SizedBox(
      width: 16,
      height: 16,
      child: SvgPicture.asset(
        iconAsset,
        width: 16,
        height: 16,
        fit: BoxFit.contain,
      ),
    );
    final text = Text(
      label,
      style: TextStyle(
        fontFamily: 'Inter',
        fontSize: 14,
        // Figma: Inter 14 w400 letter-spacing -0.42. We shipped w500 with no
        // tracking — reads too heavy and too wide vs the design.
        fontWeight: FontWeight.w400,
        color: textColor,
        letterSpacing: -0.42,
        height: 20 / 14,
      ),
      overflow: TextOverflow.ellipsis,
      maxLines: 1,
    );

    // Figma "Benefit item" itemSpacing = 6 (icon → text gap).
    const iconTextGap = 6.0;

    if (centered) {
      // Centre the icon+text pair as ONE visual unit. Wrap a MainAxisSize.min
      // Row inside Center() so the pair hugs its content and the whole unit
      // sits in the middle of the section — matching Figma v3+v4 where the
      // icon+text pair has visible margin on both sides.
      //
      // For textScale ≥1.5 safety: cap the row's intrinsic width via a
      // ConstrainedBox tied to the parent's width; long labels ellipsize
      // rather than push the icon off-centre.
      return LayoutBuilder(
        builder: (context, constraints) {
          final maxRowWidth =
              constraints.maxWidth.clamp(0.0, double.infinity);
          return Center(
            child: ConstrainedBox(
              constraints: BoxConstraints(maxWidth: maxRowWidth),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  icon,
                  const SizedBox(width: iconTextGap),
                  Flexible(child: text),
                ],
              ),
            ),
          );
        },
      );
    }

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        const SizedBox(width: 20),
        icon,
        const SizedBox(width: iconTextGap),
        Flexible(child: text),
      ],
    );
  }
}
