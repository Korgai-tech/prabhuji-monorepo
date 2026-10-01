import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../core/theme.dart';

/// Decorative sun-ray backdrop for the result-screen fallback (TAM-166,
/// `Only Name.png`). Painted procedurally so no additional SVG asset is
/// required — the design's sun rays are a radial star burst, cheap to
/// draw in Flutter and one-swap replaceable if design ships a bespoke SVG
/// later.
class KuldevtaSunRayBackdrop extends StatelessWidget {
  const KuldevtaSunRayBackdrop({super.key});

  @override
  Widget build(BuildContext context) {
    return const DecoratedBox(
      decoration: BoxDecoration(color: AppKuldevta.sunRayBackdrop),
      child: SizedBox.expand(
        child: CustomPaint(painter: _SunRayPainter()),
      ),
    );
  }
}

class _SunRayPainter extends CustomPainter {
  const _SunRayPainter();

  static const int _rayCount = 12;

  @override
  void paint(Canvas canvas, Size size) {
    final ray = Paint()
      ..color = AppKuldevta.sunRay.withValues(alpha: 0.35)
      ..style = PaintingStyle.fill;

    final centre = Offset(size.width / 2, size.height * 0.72);
    final radius = size.width;
    for (int i = 0; i < _rayCount; i++) {
      final angle = (2 * math.pi * i) / _rayCount;
      final width = 0.14; // radians — sun-ray wedge width
      final p1 = Offset(
        centre.dx + radius * math.cos(angle - width / 2),
        centre.dy + radius * math.sin(angle - width / 2),
      );
      final p2 = Offset(
        centre.dx + radius * math.cos(angle + width / 2),
        centre.dy + radius * math.sin(angle + width / 2),
      );
      final path = Path()
        ..moveTo(centre.dx, centre.dy)
        ..lineTo(p1.dx, p1.dy)
        ..lineTo(p2.dx, p2.dy)
        ..close();
      canvas.drawPath(path, ray);
    }

    // Inner sun disc.
    final disc = Paint()..color = AppKuldevta.sunRay.withValues(alpha: 0.5);
    canvas.drawCircle(centre, size.width * 0.14, disc);
  }

  @override
  bool shouldRepaint(covariant _SunRayPainter oldDelegate) => false;
}
