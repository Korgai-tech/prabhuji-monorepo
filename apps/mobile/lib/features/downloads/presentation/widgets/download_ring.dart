import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../core/theme.dart';

/// Animated progress ring for the play-page Download Button. Renders an
/// arc from `-π/2` sweeping clockwise for [progress] × 2π. Wraps a
/// [TweenAnimationBuilder] so the arc smoothly interpolates between
/// callback rebuilds (spec: target 60 fps).
class DownloadRing extends StatelessWidget {
  const DownloadRing({
    super.key,
    required this.progress,
    this.size = 24,
    this.strokeWidth = 2.5,
    this.trackColor,
    this.progressColor,
  });

  final double progress;
  final double size;
  final double strokeWidth;
  final Color? trackColor;
  final Color? progressColor;

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      duration: const Duration(milliseconds: 200),
      curve: Curves.linear,
      tween: Tween<double>(begin: 0, end: progress.clamp(0.0, 1.0)),
      builder: (context, value, _) {
        return CustomPaint(
          size: Size.square(size),
          painter: _RingPainter(
            progress: value,
            strokeWidth: strokeWidth,
            trackColor: trackColor ?? AppColors.grey200,
            progressColor: progressColor ?? AppColors.brand400,
          ),
        );
      },
    );
  }
}

class _RingPainter extends CustomPainter {
  _RingPainter({
    required this.progress,
    required this.strokeWidth,
    required this.trackColor,
    required this.progressColor,
  });

  final double progress;
  final double strokeWidth;
  final Color trackColor;
  final Color progressColor;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final radius = size.shortestSide / 2 - strokeWidth / 2;
    final center = rect.center;
    final track = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..color = trackColor;
    final prog = Paint()
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeWidth = strokeWidth
      ..color = progressColor;
    canvas.drawCircle(center, radius, track);
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      -math.pi / 2,
      progress * 2 * math.pi,
      false,
      prog,
    );
  }

  @override
  bool shouldRepaint(covariant _RingPainter old) =>
      old.progress != progress ||
      old.trackColor != trackColor ||
      old.progressColor != progressColor ||
      old.strokeWidth != strokeWidth;
}
