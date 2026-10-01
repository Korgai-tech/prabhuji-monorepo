import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../../../core/theme.dart';

/// Offline banner rendered at the top of the Downloads library ONLY when
/// the device is offline (Figma `2649:22822`; text `2649:22824`:
/// "You're offline, showing your downloads"). The underlying Figma
/// component is called "Chat Bubble"; we implement it as an offline banner
/// per the spec's Design References note.
///
/// Renders `SizedBox.shrink()` when online — the library layout intent
/// reserves no space for it in the online state (spec's Layout-intent
/// table).
class OfflineBanner extends StatelessWidget {
  const OfflineBanner({super.key, required this.visible});

  final bool visible;

  static const double _height = 40;

  @override
  Widget build(BuildContext context) {
    if (!visible) return const SizedBox.shrink();
    return Semantics(
      liveRegion: true,
      label: "You're offline, showing your downloads",
      child: Container(
        key: const Key('downloads-offline-banner-inner'),
        constraints: const BoxConstraints(minHeight: _height),
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.medium,
          vertical: AppSpacing.xSmall,
        ),
        color: AppColors.brand400,
        child: Row(
          children: <Widget>[
            SvgPicture.asset(
              'assets/downloads/wifi-off.svg',
              width: 18,
              height: 18,
              semanticsLabel: 'Offline',
            ),
            const SizedBox(width: AppSpacing.xSmall),
            Expanded(
              child: Text(
                "You're offline, showing your downloads",
                style: AppText.labelSm(color: AppColors.white),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
