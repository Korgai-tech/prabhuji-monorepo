import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../../core/theme.dart';

/// The Prabhuji temple + Om logo as a 130×130 composite, extracted from Figma
/// node `750:4998` (Logo symbol used on splash / phone-choice / phone-input /
/// OTP / OTP-wrong / name-language).
///
/// Composed from 4 exported SVG pieces:
///  - `logo-vector.svg` — full orange temple silhouette (lower ~65% of canvas)
///  - `logo-om.svg`     — white Om symbol, centered slightly below middle
///  - `logo-flag.svg`   — small orange flag on the upper-right of the spire
///  - `logo-arch.svg`   — tiny orange arch at the spire tip
///
/// Positioning percentages taken verbatim from the Dev Mode React output; see
/// `get_design_context(392:3223)`.
class BrandLogo extends StatelessWidget {
  const BrandLogo({super.key, this.size = 130});

  final double size;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: Stack(
        clipBehavior: Clip.hardEdge,
        children: <Widget>[
          // Temple body (main orange silhouette). Positioned inside the canvas
          // per Figma: bottom 15.45%, left 25%, right 25.58%, top 34.02%.
          Positioned(
            top: size * 0.3402,
            left: size * 0.25,
            right: size * 0.2558,
            bottom: size * 0.1545,
            child: SvgPicture.asset(
              'assets/logo/logo-vector.svg',
              fit: BoxFit.fill,
              colorFilter: const ColorFilter.mode(
                AppColors.brand500,
                BlendMode.srcIn,
              ),
            ),
          ),
          // Om symbol (white). Figma: 20×20.909, centered horizontally, offset
          // 9.45px below middle. Scaled proportionally.
          Positioned(
            left: (size - size * (20 / 130)) / 2,
            top: (size / 2) + size * (9.45 / 130) - size * (20.909 / 130) / 2,
            width: size * (20 / 130),
            height: size * (20.909 / 130),
            child: SvgPicture.asset(
              'assets/logo/logo-om.svg',
              fit: BoxFit.contain,
              colorFilter: const ColorFilter.mode(
                AppColors.white,
                BlendMode.srcIn,
              ),
            ),
          ),
          // Flag on the spire. Figma inset: top 13.89%, right 31.68%,
          // bottom 69.82%, left 47.73%.
          Positioned(
            top: size * 0.1389,
            right: size * 0.3168,
            bottom: size * 0.6982,
            left: size * 0.4773,
            child: SvgPicture.asset(
              'assets/logo/logo-flag.svg',
              fit: BoxFit.fill,
              colorFilter: const ColorFilter.mode(
                AppColors.brand500,
                BlendMode.srcIn,
              ),
            ),
          ),
          // Top-of-spire arch. Figma inset: top 30.76%, right 46.47%,
          // bottom 66.23%, left 45.95%.
          Positioned(
            top: size * 0.3076,
            right: size * 0.4647,
            bottom: size * 0.6623,
            left: size * 0.4595,
            child: SvgPicture.asset(
              'assets/logo/logo-arch.svg',
              fit: BoxFit.fill,
              colorFilter: const ColorFilter.mode(
                AppColors.brand500,
                BlendMode.srcIn,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
