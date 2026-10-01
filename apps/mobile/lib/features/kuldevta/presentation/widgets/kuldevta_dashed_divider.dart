import 'package:flutter/material.dart';

import '../../../../core/theme.dart';

/// Horizontal dashed divider used on the result screen's
/// "Ye aapki kuldevi/kuldevta kyu he?" header (TAM-166,
/// `Bg Image + Name.png` / `Only Name.png`).
///
/// The dashed line runs full-width; the title text sits on TOP of it in
/// a Stack, with an opaque background matching the scaffold surface so
/// the line is visually occluded where the text sits. Previously the
/// widget used a `Row(Expanded dash | Flexible text | Expanded dash)`
/// layout, which squeezed the text into ellipsis on narrow devices at
/// larger text scales (the two Expanded dashes each demanded minimum
/// horizontal space). The Stack layout has no flex competition — the
/// text renders at its intrinsic width and the line just gets covered.
class KuldevtaDashedDivider extends StatelessWidget {
  const KuldevtaDashedDivider({
    super.key,
    required this.text,
    this.surface = AppColors.brand100,
  });

  final String text;

  /// The opaque background painted behind the text so the dashed line
  /// is occluded exactly under the label. Defaults to the result
  /// scaffold's `brand100`. Callers on a different surface (e.g. white
  /// card) should pass their own colour to keep the illusion clean.
  final Color surface;

  @override
  Widget build(BuildContext context) {
    return Stack(
      alignment: Alignment.center,
      children: <Widget>[
        // The full-width dashed line sits at the bottom of the stack —
        // it runs uncut behind everything and its middle section is
        // hidden by the opaque text container above.
        const Positioned.fill(
          child: Center(child: _DashedLine()),
        ),
        // The label sits on top with horizontal padding + solid
        // background matching the scaffold surface. `maxLines: 2` +
        // `TextOverflow.visible` are defensive: even if a future
        // localisation ships a longer string it wraps rather than
        // ellipsises, since we now have room to grow (no flex fight).
        Container(
          color: surface,
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.medium,
            vertical: 2,
          ),
          child: Text(
            text,
            key: const Key('kuldevta-dashed-divider-text'),
            style: AppText.labelLg(color: AppColors.grey500),
            textAlign: TextAlign.center,
            maxLines: 2,
          ),
        ),
      ],
    );
  }
}

class _DashedLine extends StatelessWidget {
  const _DashedLine();

  @override
  Widget build(BuildContext context) {
    // LayoutBuilder gives us the horizontal constraint from the enclosing
    // Expanded, so the CustomPaint has a concrete width — otherwise it
    // renders at 0×1.5 and the parent Row treats it as having intrinsic
    // width 0, which puts the Flex layout in an ambiguous state.
    return LayoutBuilder(
      builder: (context, constraints) => SizedBox(
        width: constraints.maxWidth,
        height: 1.5,
        child: const CustomPaint(painter: _DashedLinePainter()),
      ),
    );
  }
}

class _DashedLinePainter extends CustomPainter {
  const _DashedLinePainter();

  static const double _dashWidth = 4;
  static const double _gapWidth = 3;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = AppKuldevta.dashedDivider
      ..strokeWidth = size.height
      ..strokeCap = StrokeCap.round;
    double x = 0;
    while (x < size.width) {
      final endX = (x + _dashWidth).clamp(0.0, size.width);
      canvas.drawLine(
        Offset(x, size.height / 2),
        Offset(endX, size.height / 2),
        paint,
      );
      x += _dashWidth + _gapWidth;
    }
  }

  @override
  bool shouldRepaint(covariant _DashedLinePainter oldDelegate) => false;
}
