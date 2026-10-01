import 'package:flutter/material.dart';

import '../../../core/theme.dart';

/// Mandir tab destination (TAM-58 AC-a). Mandir appears in the nav + the paywall
/// benefits list but has no PRD (TAM-56 decision 5), so its branch shows a calm,
/// on-brand "coming soon" stub — it stays in the nav and never crashes.
class MandirComingSoonScreen extends StatelessWidget {
  const MandirComingSoonScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.scaffoldWarm,
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.large),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  width: 96,
                  height: 96,
                  alignment: Alignment.center,
                  decoration: const BoxDecoration(
                    color: AppColors.brand100,
                    shape: BoxShape.circle,
                  ),
                  // The Figma mandir diya (nav node I750:6252;750:5529;750:5912,
                  // provenance in tools/figma-assets.manifest.json) — the only
                  // mandir glyph the design file has. Multicolour raster,
                  // state-independent, so it renders untinted exactly like the
                  // nav tab does. Sized 40 (not the nav's 20) for the empty
                  // state: the export is 80px = 20pt@4x, so 40 stays within its
                  // native raster budget at 2x and upscales only mildly at 3x.
                  child: Image.asset(
                    'assets/nav/mandir.png',
                    key: const Key('mandir-coming-soon-glyph'),
                    width: 40,
                    height: 40,
                  ),
                ),
                const SizedBox(height: AppSpacing.large),
                Text(
                  'Mandir is coming soon',
                  key: const Key('mandir-coming-soon-title'),
                  textAlign: TextAlign.center,
                  style: AppText.headingXs(),
                ),
                const SizedBox(height: AppSpacing.xSmall),
                Text(
                  // Placeholder copy pending Product string (spec #PLAN_UNCERTAINTY).
                  'Your personal temple is being prepared with care. '
                  'Please check back soon.',
                  textAlign: TextAlign.center,
                  style: AppText.bodySm(color: AppColors.textSecondary),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
