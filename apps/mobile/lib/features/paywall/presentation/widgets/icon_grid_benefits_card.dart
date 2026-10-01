import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../../../api/generated/openapi.dart';
import '../../../../core/theme.dart';

/// Illustrated 3×2 VIP-benefits grid — Figma node `2743:24912` (v3 icon-grid
/// paywall variant). Six cards, each with a warm illustrated glyph (phone +
/// lotus, ringing bell, aarti diya, prayer beads, WhatsApp phone, zodiac
/// wheel) and a single-line label below.
///
/// Deliberately does NOT wrap the grid in the pre-TAM-160 gray card
/// (`#F5F5F5`, r16) — Figma v3 sits the cards straight on the peach scaffold.
///
/// Each card is a small **bordered gradient chip** (Figma `Frame 2033`):
/// 2-stop vertical gradient (`#FEFBF3` → `#FFF3E5`) with a 1.5px brand-orange
/// stroke (`#FE8A02`) and 8dp corner radius. No drop shadow — the stroke
/// alone lifts the tile off the peach scaffold. A previous refactor shipped
/// white-fill + r16 + soft shadow (the home-shortcut visual); the v3 spec is
/// the bordered chip and this widget now matches it.
///
/// The widget was renamed from `PaywallIconGridBenefitsCard` to reflect the
/// new visual (illustrated cards, not check-mark icons in a gray card). A
/// type alias keeps the existing test import compiling.
class PaywallIllustratedBenefitGrid extends StatelessWidget {
  const PaywallIllustratedBenefitGrid({
    super.key,
    required this.benefits,
    this.crossAxisCount = 3,
  });

  final List<PaywallBenefitDisplay> benefits;

  /// Number of columns per row. Figma v3 is 3 (→ 3×2 grid). Kept
  /// parameterised so a future tablet A/B could try 4 or 6.
  final int crossAxisCount;

  /// Benefits Figma v3 does not include an illustration for — filtered out so
  /// the grid renders the 6 that DO map cleanly. The CMS ships 8 benefits
  /// (`mandir`, `wallpaper`, `ringtone`, `aarti_bhajans`, `mantras_stutis`,
  /// `whatsapp_status`, `horoscope`, `app_icon`) but Figma's illustrated grid
  /// only shows 6; without this filter the two unmapped ones (`mandir` +
  /// `app_icon`) claim the first slots and shift every label by one.
  static const _skipIds = <String>{'mandir', 'app_icon'};

  @override
  Widget build(BuildContext context) {
    // Sort by sortOrder so the CMS decides the visual order, filter out the
    // two IDs Figma doesn't illustrate, then cap at 6.
    final ordered = List<PaywallBenefitDisplay>.of(benefits)
      ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
    final cells = ordered
        .where((b) => !_skipIds.contains(b.benefitId))
        .take(6)
        .toList();
    if (cells.isEmpty) return const SizedBox.shrink();

    return Column(
      key: const Key('paywall-icon-grid-card'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        for (var start = 0; start < cells.length; start += crossAxisCount) ...[
          if (start > 0) const SizedBox(height: AppSpacing.small),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              for (var i = 0; i < crossAxisCount; i++) ...[
                if (i > 0) const SizedBox(width: AppSpacing.small),
                Expanded(
                  child: (start + i) < cells.length
                      ? _IllustratedBenefitCard(
                          benefit: cells[start + i],
                          fallbackIndex: start + i,
                        )
                      : const SizedBox.shrink(),
                ),
              ],
            ],
          ),
        ],
      ],
    );
  }
}

/// Back-compat alias — the pre-refactor widget name. Kept so the existing
/// unit test (`icon_grid_benefits_card_test.dart`) continues to compile
/// without a churn edit. New call sites should use
/// [PaywallIllustratedBenefitGrid] directly.
typedef PaywallIconGridBenefitsCard = PaywallIllustratedBenefitGrid;

/// One illustrated benefit tile per Figma v3 (`2743:24912`).
///
/// **The label sits OUTSIDE the card, on the peach scaffold below it** —
/// verified against the Figma frame. A previous refactor tried to move the
/// label inside the card; that was wrong. The card contains ONLY the
/// illustration; the caption lives beneath the card as a peer.
class _IllustratedBenefitCard extends StatelessWidget {
  const _IllustratedBenefitCard({
    required this.benefit,
    required this.fallbackIndex,
  });

  final PaywallBenefitDisplay benefit;

  /// Slot position in the grid (0-based). Used as the LAST-RESORT fallback
  /// for the illustration when neither `benefit.icon` nor a name-based match
  /// resolves to an asset — deterministic + never leaves an empty tile.
  final int fallbackIndex;

  @override
  Widget build(BuildContext context) {
    return Column(
      key: Key('paywall-icon-grid-cell-${benefit.benefitId}'),
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: <Widget>[
        // Card chrome — Figma `Frame 2033` (100×70):
        //   * fill: 2-stop vertical linear gradient
        //       top    #FEFBF3 (warm cream)
        //     → bottom #FFF3E5 (soft peach)
        //   * stroke: 1.5px brand orange #FE8A02 (AppColors.brand300)
        //   * radius: 8 (NOT 16 — the earlier r16 + white flat fill + drop
        //     shadow was carried over from the home-shortcut tile visual;
        //     the paywall v3 spec is a bordered gradient chip)
        //   * padding: 8 all sides
        //   * NO drop shadow (Figma effects list is empty)
        // The 100:70 aspect ratio is preserved responsively — the row
        // `Expanded`s each cell to ~100dp wide on 360dp devices, and the
        // AspectRatio drives the height so the card never squishes on
        // wider phones or grows tall on narrower ones.
        AspectRatio(
          aspectRatio: 100 / 70,
          child: Container(
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: <Color>[
                  Color(0xFFFEFBF3), // top: warm cream
                  Color(0xFFFFF3E5), // bottom: soft peach
                ],
              ),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                color: AppColors.brand300, // #FE8A02
                width: 1.5,
              ),
            ),
            padding: const EdgeInsets.all(8),
            // The bundled illustrations are rasters with a near-white
            // background baked into the alpha=255 canvas (only ringtone
            // was ever exported truly transparent). Wrap in ShaderMask +
            // `BlendMode.multiply` against a gradient that MATCHES the
            // card's own cream→peach gradient: every illustration pixel
            // is multiplied by the card colour at its y-position, so:
            //   * near-white bg × card colour ≈ card colour → the white
            //     halo dissolves into the card at BOTH the cream top
            //     AND the peach bottom (a single-colour ColorFilter can
            //     only match one row of the gradient)
            //   * saturated orange/gold content × ~white gradient ≈ the
            //     original colour (imperceptibly cream-tinted)
            // Applied at the padding-inner layer so the card border and
            // gradient scaffold are painted normally underneath.
            child: ShaderMask(
              shaderCallback: (Rect bounds) => const LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: <Color>[
                  Color(0xFFFEFBF3), // matches card gradient top
                  Color(0xFFFFF3E5), // matches card gradient bottom
                ],
              ).createShader(bounds),
              blendMode: BlendMode.multiply,
              child: FittedBox(
                fit: BoxFit.contain,
                child: _BenefitGlyph(
                  benefit: benefit,
                  fallbackIndex: fallbackIndex,
                ),
              ),
            ),
          ),
        ),
        // Figma cell `Frame 2036` itemSpacing = 8 (card → label).
        const SizedBox(height: AppSpacing.xSmall),
        // Label — outside the card, on the peach scaffold.
        FittedBox(
          fit: BoxFit.scaleDown,
          child: Text(
            benefit.localizedName,
            maxLines: 1,
            softWrap: false,
            textAlign: TextAlign.center,
            // Figma: Roboto 13 w500, lineHeight 12px (92.3% of 13pt).
            // Roboto is Android's system font so no asset bundle needed on
            // Android; on iOS falls back to the system sans-serif which is
            // close enough. Consciously not using Inter/Poppins here —
            // Figma spec'd Roboto for these tiles only.
            style: const TextStyle(
              fontFamily: 'Roboto',
              fontSize: 13,
              fontWeight: FontWeight.w500,
              color: AppColors.black,
              height: 12 / 13,
            ),
          ),
        ),
      ],
    );
  }
}

/// Resolves the correct illustration for a benefit. Priority:
///   1. The CMS-provided `benefit.icon` (e.g. `benefit-mandir.png`) —
///      rendered as-is from `assets/paywall/{icon}` so CMS-side art always
///      wins. Falls back on load-error to (2).
///   2. Name-based match against the shipped `benefit-illus-N.png` set —
///      wallpaper / ringtone / aarti / mantra / whatsapp / rashi keywords in
///      `localizedName` map to the correct illustration.
///   3. Deterministic slot fallback: `benefit-illus-{fallbackIndex+1}.png`
///      (clamped to 1..6) — never leaves a tile blank.
class _BenefitGlyph extends StatelessWidget {
  const _BenefitGlyph({
    required this.benefit,
    required this.fallbackIndex,
  });

  final PaywallBenefitDisplay benefit;
  final int fallbackIndex;

  /// Visual mapping (see the six PNGs under `assets/paywall/`):
  ///   1 = phone with Om + lotus       → Wallpaper
  ///   2 = golden ringing bell         → Ringtone
  ///   3 = aarti diya lamp             → Aarti & Bhajans
  ///   4 = Om + prayer beads           → Mantras & Stutis
  ///   5 = phone with contact avatar   → Whatsapp Status
  ///   6 = zodiac wheel                → Rashifal
  static const _keywordToIllus = <String, int>{
    'wallpaper': 1,
    'ring': 2, // matches "ringtone" AND "ringtones"
    'bell': 2,
    'aarti': 3,
    'bhajan': 3,
    'mantra': 4,
    'stuti': 4,
    'whatsapp': 5,
    'status': 5,
    'rashi': 6,
    'horoscope': 6,
    'zodiac': 6,
  };

  int _resolveIllusIndex() {
    // Match against benefitId (English/stable) FIRST — the CMS ships benefits
    // in Hindi via localizedName, so English keyword-matching on that field
    // never fires and every label gets the wrong illustration via the fallback.
    final id = benefit.benefitId.toLowerCase();
    for (final entry in _keywordToIllus.entries) {
      if (id.contains(entry.key)) return entry.value;
    }
    // Then try the localized name (covers admin edits that alter the ID
    // convention but keep an English label somewhere).
    final name = benefit.localizedName.toLowerCase();
    for (final entry in _keywordToIllus.entries) {
      if (name.contains(entry.key)) return entry.value;
    }
    // Deterministic slot fallback — 1..6, wrapping.
    final clamped = (fallbackIndex.abs() % 6) + 1;
    return clamped;
  }

  @override
  Widget build(BuildContext context) {
    final illusIndex = _resolveIllusIndex();
    final illusFallback = Image.asset(
      'assets/paywall/benefit-illus-$illusIndex.png',
      errorBuilder: (_, _, _) => SvgPicture.asset(
        'assets/paywall/benefit-check.svg',
        colorFilter: const ColorFilter.mode(
          AppColors.brand400,
          BlendMode.srcIn,
        ),
      ),
    );

    final cmsIcon = benefit.icon;
    if (cmsIcon.isEmpty) return illusFallback;

    final path = 'assets/paywall/$cmsIcon';
    if (cmsIcon.toLowerCase().endsWith('.svg')) {
      // SvgPicture.asset has no errorBuilder; placeholderBuilder covers the
      // transient loading window, and a truly-missing SVG surfaces via
      // flutter_svg's own error handler (logged, not thrown, in release).
      return SvgPicture.asset(
        path,
        placeholderBuilder: (_) => illusFallback,
      );
    }
    return Image.asset(
      path,
      errorBuilder: (_, _, _) => illusFallback,
    );
  }
}
