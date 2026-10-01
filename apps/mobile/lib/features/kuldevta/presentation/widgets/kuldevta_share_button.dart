import 'package:flutter/material.dart';

import '../../../../core/theme.dart';

/// The green ([AppKuldevta.shareButtonFill] `#25D366`) share affordance
/// that sits left of the primary "… Se Baat Karein" CTA on the kuldevta
/// result surface.
///
/// Lifted verbatim (geometry + tokens) out of the now-deleted
/// `kuldevta_result_screen.dart`'s private `_ShareButton` so the result
/// **card overlay** (TAM-177) can reuse it.
///
/// The fixed [AppKuldevta.shareButtonSize] square is deliberate and safe
/// under text scaling: the child is a glyph, never scalable text, so there
/// is nothing that can overflow the box.
class KuldevtaShareButton extends StatelessWidget {
  const KuldevtaShareButton({super.key, required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppKuldevta.shareButtonFill,
      borderRadius: BorderRadius.circular(AppKuldevta.shareButtonRadius),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppKuldevta.shareButtonRadius),
        child: const SizedBox(
          width: AppKuldevta.shareButtonSize,
          height: AppKuldevta.shareButtonSize,
          child: Center(
            child: Icon(Icons.ios_share, color: AppColors.white, size: 28),
          ),
        ),
      ),
    );
  }
}
