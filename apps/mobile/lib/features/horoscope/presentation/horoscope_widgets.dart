import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../../core/theme.dart';
import '../data/horoscope_models.dart';

/// Bundled Figma glyph for a `zodiacId` (TAM-74).
///
/// The zodiac set is a CLOSED 12-value enum in the contract, and its real art is
/// the Figma "Zodiac Icons" section (379:2409) — so the glyph is a bundled asset
/// keyed by the id, NOT the API's `iconAssetUrl` (a `placehold.co` placeholder
/// in the seed; rendering it would ship non-design art, breaking the TAM-56
/// STRICT gate). See TOKENS.md.
///
/// Returns `null` for an id outside the contract enum — the caller renders the
/// label alone rather than a wrong/invented glyph.
String? zodiacGlyphAsset(String zodiacId) {
  const known = <String>{
    'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
    'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces',
  };
  if (!known.contains(zodiacId)) return null;
  return 'assets/horoscope/zodiac_$zodiacId.svg';
}

/// A monochrome zodiac glyph tinted at the call site.
///
/// Tinting is REQUIRED, not cosmetic: the exported masters carry `#FC7304`, the
/// grid instances render `#FE8A02` and the result pill renders `#FFE4C5` — one
/// asset, three colours.
class ZodiacGlyph extends StatelessWidget {
  const ZodiacGlyph({
    super.key,
    required this.zodiacId,
    required this.size,
    required this.color,
  });

  final String zodiacId;
  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final asset = zodiacGlyphAsset(zodiacId);
    if (asset == null) return SizedBox(width: size, height: size);
    return SvgPicture.asset(
      asset,
      width: size,
      height: size,
      colorFilter: ColorFilter.mode(color, BlendMode.srcIn),
    );
  }
}

/// One zodiac card on the FREE discovery grid (Figma node 379:2333).
///
/// 103×103, r8, a #B8B8B8 hairline and NO fill (the frame's cream fill is
/// `visible:false`); 42px glyph 12 from the top, label band at +67.
///
/// **No lock badge / Pro label** — PRD §5 forbids them: free users see a clean
/// grid and the gate happens on tap. The whole card is the tap target (older-user
/// friendly, AC "large tap targets").
class ZodiacCard extends StatelessWidget {
  const ZodiacCard({
    super.key,
    required this.sign,
    required this.onTap,
  });

  final HoroscopeZodiacSign sign;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: sign.displayName,
      child: InkWell(
        key: ValueKey('horoscope-zodiac-${sign.zodiacId}'),
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppHoroscope.cardRadius),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppHoroscope.cardRadius),
            border: Border.all(
              color: AppColors.horoscopeCardBorder,
              width: AppHoroscope.cardBorder,
            ),
          ),
          child: Column(
            children: [
              const SizedBox(height: AppHoroscope.cardIconTop),
              ZodiacGlyph(
                zodiacId: sign.zodiacId,
                size: AppHoroscope.cardIconSize,
                color: AppColors.horoscopeZodiacGlyph,
              ),
              const Spacer(),
              SizedBox(
                height: AppHoroscope.cardLabelHeight,
                child: Center(
                  child: Text(
                    // The API fixes the Figma layer-name typos — this renders
                    // "Sagittarius"/"Capricorn", never "Saittarius"/"Capricon".
                    sign.displayName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                    style: AppText.horoscopeZodiacLabel(),
                  ),
                ),
              ),
              SizedBox(
                height: AppHoroscope.cardSize -
                    AppHoroscope.cardLabelTop -
                    AppHoroscope.cardLabelHeight,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A friendly error body + Retry, shared by the grid and the result flow (PRD §7).
/// Keeps whatever context the caller passes (zodiac + date on the result screen).
class HoroscopeErrorView extends StatelessWidget {
  const HoroscopeErrorView({
    super.key,
    required this.message,
    required this.onRetry,
    this.onDark = false,
  });

  final String message;
  final VoidCallback onRetry;

  /// The result flow renders over the dark starfield; the grid over cream.
  final bool onDark;

  @override
  Widget build(BuildContext context) {
    final color = onDark ? AppColors.white : AppColors.textPrimary;
    return Center(
      key: const ValueKey('horoscope-error'),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.large),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              message,
              textAlign: TextAlign.center,
              style: AppText.bodyMd(color: color),
            ),
            const SizedBox(height: AppSpacing.medium),
            TextButton(
              key: const ValueKey('horoscope-retry'),
              onPressed: onRetry,
              child: Text(
                'Retry',
                style: AppText.labelLg(color: AppColors.brand300),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
