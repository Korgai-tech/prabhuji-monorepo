import 'package:flutter/material.dart';

import '../../../../core/theme.dart';

/// A single cream reason card on the result screen (TAM-166,
/// `Bg Image + Name.png` / `Only Name.png`).
///
/// Every card in the list uses the SAME hardcoded icon (the trishul in the
/// design references). The client does NOT classify reasons and does NOT
/// read the response's `matchedOn` for per-card branching — locked
/// decision (Shashank, 2026-09-02), spec §Reason card rendering.
class KuldevtaReasonCard extends StatelessWidget {
  const KuldevtaReasonCard({
    super.key,
    required this.reason,
  });

  final String reason;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppKuldevta.reasonCardFill,
        borderRadius: BorderRadius.circular(AppKuldevta.reasonCardRadius),
      ),
      padding: const EdgeInsets.symmetric(
        horizontal: AppKuldevta.reasonCardPaddingH,
        vertical: AppKuldevta.reasonCardPaddingV,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          const _TrishulIcon(),
          const SizedBox(width: AppKuldevta.reasonCardIconGap),
          Expanded(
            child: Text(
              reason,
              style: AppText.bodyMd(color: AppColors.grey500),
            ),
          ),
        ],
      ),
    );
  }
}

/// Hardcoded trishul glyph — the same asset on every reason card. Painted
/// procedurally so the widget stays const-friendly and avoids a fifth SVG
/// asset while the Figma export budget resets. Once
/// `assets/kuldevta/reason_icon_trishul.svg` lands via figma-flutter
/// Phase 4, swap this out for `SvgPicture.asset` (one-line change).
class _TrishulIcon extends StatelessWidget {
  const _TrishulIcon();

  @override
  Widget build(BuildContext context) {
    return const SizedBox(
      width: AppKuldevta.reasonCardIconSize,
      height: AppKuldevta.reasonCardIconSize,
      child: CustomPaint(
        painter: _TrishulPainter(),
      ),
    );
  }
}

class _TrishulPainter extends CustomPainter {
  const _TrishulPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final stroke = Paint()
      ..color = AppKuldevta.reasonCardIconTint
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round;

    final w = size.width;
    final h = size.height;
    final cx = w / 2;

    // Central shaft.
    canvas.drawLine(Offset(cx, h * 0.15), Offset(cx, h * 0.95), stroke);

    // Central prong (top spike).
    final centralPath = Path()
      ..moveTo(cx, h * 0.05)
      ..lineTo(cx, h * 0.32);
    canvas.drawPath(centralPath, stroke);

    // Left prong — curving up from the shaft, arcing over.
    final left = Path()
      ..moveTo(w * 0.18, h * 0.42)
      ..quadraticBezierTo(w * 0.14, h * 0.22, w * 0.22, h * 0.10)
      ..moveTo(w * 0.22, h * 0.10)
      ..quadraticBezierTo(w * 0.28, h * 0.20, w * 0.28, h * 0.32);
    canvas.drawPath(left, stroke);

    // Right prong (mirror of left).
    final right = Path()
      ..moveTo(w * 0.82, h * 0.42)
      ..quadraticBezierTo(w * 0.86, h * 0.22, w * 0.78, h * 0.10)
      ..moveTo(w * 0.78, h * 0.10)
      ..quadraticBezierTo(w * 0.72, h * 0.20, w * 0.72, h * 0.32);
    canvas.drawPath(right, stroke);

    // Cross-hilt below the prongs.
    canvas.drawLine(
      Offset(w * 0.20, h * 0.48),
      Offset(w * 0.80, h * 0.48),
      stroke,
    );
  }

  @override
  bool shouldRepaint(covariant _TrishulPainter oldDelegate) => false;
}
