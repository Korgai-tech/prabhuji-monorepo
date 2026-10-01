import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/theme.dart';
import '../../downloads_routes.dart';

/// TAM-125 — full-branch "you're offline" placeholder shown by
/// `AppShellScaffold` in the body of every non-Downloads branch while the
/// device is offline.
///
/// The Netflix / Spotify pattern: network-dependent surfaces are unreachable
/// while offline, but the user is not blocked — they can jump to Downloads
/// with one tap, which is the only branch that works offline.
class OfflinePlaceholder extends StatelessWidget {
  const OfflinePlaceholder({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.scaffoldWarm,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.large),
          child: Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: <Widget>[
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
                      'assets/downloads/wifi-off.svg',
                      width: 28,
                      height: 28,
                      colorFilter: const ColorFilter.mode(
                        AppColors.brand400,
                        BlendMode.srcIn,
                      ),
                      semanticsLabel: 'Offline',
                    ),
                  ),
                ),
                const SizedBox(height: AppSpacing.large),
                Text(
                  "You're offline",
                  key: const Key('offline-placeholder-title'),
                  textAlign: TextAlign.center,
                  style: AppText.headingXs(color: AppColors.grey500),
                ),
                const SizedBox(height: AppSpacing.small),
                Text(
                  "Only your downloads are available while you're offline. "
                  "Connect to the internet to use this section.",
                  key: const Key('offline-placeholder-body'),
                  textAlign: TextAlign.center,
                  style: AppText.bodySm(color: AppColors.grey400),
                ),
                const SizedBox(height: AppSpacing.large),
                _GoToDownloadsButton(),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _GoToDownloadsButton extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return InkWell(
      key: const Key('offline-placeholder-go-downloads'),
      onTap: () => context.go(DownloadsRoutes.library),
      child: Container(
        constraints: const BoxConstraints(minHeight: 48),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: AppColors.brand300,
          borderRadius: BorderRadius.circular(AppRadius.button),
        ),
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.large,
          vertical: AppSpacing.small,
        ),
        child: Text(
          'Go to Downloads',
          style: AppText.labelMd(color: AppColors.white),
        ),
      ),
    );
  }
}
