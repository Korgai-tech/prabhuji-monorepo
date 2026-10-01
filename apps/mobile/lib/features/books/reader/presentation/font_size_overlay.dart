import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../../../../core/theme.dart';
import '../../presentation/books_widgets.dart';

/// The slider thumb exactly as Figma draws it (node 620:3860,
/// "Background+Border+Shadow"): a 24px white circle with a 1px `#EAEBEE` stroke
/// and a `#000000 @0.10` shadow offset (0, 2) with a 4px blur.
///
/// Material's [RoundSliderThumbShape] can express none of that — it has no
/// border, and its `elevation` shadow renders as a hard dark ring on this warm
/// panel (caught by the Phase-6 crop sweep against the node export).
class _FigmaThumbShape extends SliderComponentShape {
  const _FigmaThumbShape();

  static const double _radius = AppBooks.fontThumbSize / 2; // 24 → 12

  @override
  Size getPreferredSize(bool isEnabled, bool isDiscrete) =>
      const Size.fromRadius(_radius);

  @override
  void paint(
    PaintingContext context,
    Offset center, {
    required Animation<double> activationAnimation,
    required Animation<double> enableAnimation,
    required bool isDiscrete,
    required TextPainter labelPainter,
    required RenderBox parentBox,
    required SliderThemeData sliderTheme,
    required TextDirection textDirection,
    required double value,
    required double textScaleFactor,
    required Size sizeWithOverflow,
  }) {
    final canvas = context.canvas;

    // Shadow first — a blurred, offset copy under the circle.
    canvas.drawCircle(
      center.translate(0, AppBooks.fontThumbShadowDy),
      _radius,
      Paint()
        ..color = AppColors.booksFontThumbShadow
        ..maskFilter = const ui.MaskFilter.blur(
          BlurStyle.normal,
          AppBooks.fontThumbShadowBlur / 2, // sigma ≈ blur radius / 2
        ),
    );

    canvas.drawCircle(
      center,
      _radius,
      Paint()..color = AppColors.booksFontSliderThumb,
    );

    // 1px inside stroke (Figma strokeAlign INSIDE ⇒ inset by half the width).
    canvas.drawCircle(
      center,
      _radius - AppBooks.fontThumbBorder / 2,
      Paint()
        ..color = AppColors.booksFontThumbBorder
        ..style = PaintingStyle.stroke
        ..strokeWidth = AppBooks.fontThumbBorder,
    );
  }
}

/// The reader's text-size overlay — Figma `637:4463`, panel node `620:3844`.
///
/// Drops straight below the nav, full width, with only its BOTTOM corners
/// rounded (`rectangleCornerRadii [0,0,16,16]`).
///
/// The frame's sibling "Brightness Setting" row (node 620:3845) is
/// `visible:false` and is correctly not rendered — recorded as `intentional` in
/// the cross-check.
///
/// The size is GLOBAL and persisted (q4/r10) — this widget is pure UI; the bloc
/// owns the value and the write.
class FontSizeOverlay extends StatelessWidget {
  const FontSizeOverlay({
    super.key,
    required this.fontSize,
    required this.onChanged,
  });

  final double fontSize;
  final ValueChanged<double> onChanged;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: Container(
        height: AppBooks.fontPanelHeight,
        decoration: const BoxDecoration(
          color: AppColors.booksFontPanel,
          // Node 620:3844 `rectangleCornerRadii: [0,0,16,16]` — top corners are
          // SQUARE; the panel butts up against the nav.
          borderRadius: BorderRadius.only(
            bottomLeft: Radius.circular(AppBooks.fontPanelRadius),
            bottomRight: Radius.circular(AppBooks.fontPanelRadius),
          ),
          boxShadow: [
            BoxShadow(
              color: AppColors.booksFontPanelShadow,
              offset: Offset(0, AppBooks.fontPanelShadowDy),
              blurRadius: AppBooks.fontPanelShadowBlur,
            ),
          ],
        ),
        padding: const EdgeInsets.symmetric(
          horizontal: AppBooks.fontPanelPaddingH,
          vertical: AppBooks.fontPanelPaddingV,
        ),
        child: Row(
          children: [
            // text-size glyph (node 634:4097).
            const BooksIcon(
              BooksAssets.textSize,
              size: AppBooks.fontIconSize,
              color: AppColors.booksFontIcon,
            ),
            const SizedBox(width: AppBooks.fontPanelGap),
            Expanded(
              child: SliderTheme(
                data: SliderTheme.of(context).copyWith(
                  trackHeight: AppBooks.fontTrackHeight,
                  activeTrackColor: AppColors.booksFontSliderFill,
                  inactiveTrackColor: AppColors.booksFontSliderTrack,
                  thumbColor: AppColors.booksFontSliderThumb,
                  overlayColor: Colors.transparent,
                  // Node 620:3860 is a 24 circle with a #EAEBEE hairline and its
                  // own drop shadow — Material's RoundSliderThumbShape can draw
                  // neither, and its default elevation shadow reads as a dark
                  // ring against the panel. Hence the exact custom shape.
                  thumbShape: const _FigmaThumbShape(),
                  overlayShape: SliderComponentShape.noOverlay,
                  // The design has NO tick marks: `divisions` only quantises the
                  // value to the 1px steps, it must not draw the Material dots.
                  tickMarkShape: SliderTickMarkShape.noTickMark,
                  trackShape: const RoundedRectSliderTrackShape(),
                ),
                child: Slider(
                  key: const ValueKey('books-font-slider'),
                  value: fontSize,
                  min: AppBooks.readerFontMin,
                  max: AppBooks.readerFontMax,
                  divisions: AppBooks.readerFontDivisions,
                  onChanged: onChanged,
                ),
              ),
            ),
            const SizedBox(width: AppBooks.fontPanelGap),
            // Value box (node 620:3861) — "18px".
            Container(
              key: const ValueKey('books-font-value'),
              width: AppBooks.fontValueBoxWidth,
              height: AppBooks.fontValueBoxHeight,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(AppBooks.fontValueBoxRadius),
                border: Border.all(
                  color: AppColors.booksFontValueBorder,
                  // Node 620:3861 strokeWeight is 2 — the design's only 2px
                  // hairline; Border.all defaults to 1 and reads visibly thinner.
                  width: AppBooks.fontValueBoxBorder,
                ),
              ),
              child: Text(
                '${fontSize.round()}px',
                style: AppText.booksFontValue(),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
