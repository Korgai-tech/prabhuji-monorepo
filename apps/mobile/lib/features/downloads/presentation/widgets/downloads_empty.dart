import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/theme.dart';
import '../../../aarti/aarti_routes.dart';
import '../../../mantras/mantras_routes.dart';

/// Empty-state body (Figma `2639:22432`). Rendered by the library screen
/// when `state.isTotalEmpty` — spec's Layout-intent table.
class DownloadsEmpty extends StatelessWidget {
  const DownloadsEmpty({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      key: const Key('downloads-empty-inner'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisAlignment: MainAxisAlignment.center,
      children: <Widget>[
        Expanded(
          child: SingleChildScrollView(
            key: const Key('downloads-empty-scroll'),
            child: Padding(
              padding:
                  const EdgeInsets.symmetric(horizontal: AppSpacing.large),
              child: Column(
                children: <Widget>[
                  const SizedBox(height: AppSpacing.xLarge),
                  Container(
                    width: 96,
                    height: 96,
                    decoration: const BoxDecoration(
                      color: AppColors.brand100,
                      shape: BoxShape.circle,
                    ),
                    alignment: Alignment.center,
                    child: Container(
                      width: 64,
                      height: 64,
                      decoration: const BoxDecoration(
                        color: AppColors.brand200,
                        shape: BoxShape.circle,
                      ),
                      alignment: Alignment.center,
                      child: SvgPicture.asset(
                        'assets/downloads/download-avatar.svg',
                        width: 24,
                        height: 24,
                        semanticsLabel: 'Nothing downloaded yet',
                      ),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.large),
                  Text(
                    'Nothing downloaded yet',
                    key: const Key('downloads-empty-title'),
                    textAlign: TextAlign.center,
                    style: AppText.headingXs(color: AppColors.grey500),
                  ),
                  const SizedBox(height: AppSpacing.small),
                  Text(
                    "Tap the download icon on any Aarti, Bhajan or Mantra "
                    "play page, you'll be able to listen without internet.",
                    key: const Key('downloads-empty-body'),
                    textAlign: TextAlign.center,
                    style: AppText.bodySm(color: AppColors.grey400),
                  ),
                  const SizedBox(height: AppSpacing.large),
                  _BrowseCta(
                    key: const Key('downloads-empty-browse-aarti'),
                    label: 'Browse Aarti & Bhajans',
                    onTap: () => context.push(AartiRoutes.main),
                  ),
                  const SizedBox(height: AppSpacing.small),
                  _BrowseCta(
                    key: const Key('downloads-empty-browse-mantras'),
                    label: 'Browse Mantras',
                    onTap: () => context.push(MantrasRoutes.main),
                    outlined: true,
                  ),
                  const SizedBox(height: AppSpacing.large),
                ],
              ),
            ),
          ),
        ),
        const _DisclosureCard(),
      ],
    );
  }
}

class _BrowseCta extends StatelessWidget {
  const _BrowseCta({
    super.key,
    required this.label,
    required this.onTap,
    this.outlined = false,
  });

  final String label;
  final VoidCallback onTap;
  final bool outlined;

  @override
  Widget build(BuildContext context) {
    final bg = outlined ? AppColors.white : AppColors.brand300;
    final fg = outlined ? AppColors.brand400 : AppColors.white;
    final border = outlined ? AppColors.brand300 : Colors.transparent;
    return InkWell(
      onTap: onTap,
      child: Container(
        constraints: const BoxConstraints(minHeight: 48),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(AppRadius.button),
          border: Border.all(color: border, width: outlined ? 1.5 : 0),
        ),
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.large,
          vertical: AppSpacing.small,
        ),
        child: Text(label, style: AppText.labelMd(color: fg)),
      ),
    );
  }
}

class _DisclosureCard extends StatelessWidget {
  const _DisclosureCard();

  @override
  Widget build(BuildContext context) {
    return Container(
      key: const Key('downloads-disclosure-card'),
      margin: const EdgeInsets.all(AppSpacing.medium),
      padding: const EdgeInsets.all(AppSpacing.medium),
      decoration: BoxDecoration(
        color: AppColors.brand100,
        borderRadius: BorderRadius.circular(AppRadius.card),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          SvgPicture.asset(
            'assets/downloads/lock.svg',
            width: 12,
            height: 18,
            semanticsLabel: 'Encrypted',
          ),
          const SizedBox(width: AppSpacing.small),
          Expanded(
            child: Text(
              "Plays only inside Prabhuji. Downloads are encrypted on your "
              "device, they can't be shared, copied out, or opened in another "
              "app.",
              style: AppText.bodyXs(color: AppColors.grey500),
            ),
          ),
        ],
      ),
    );
  }
}
