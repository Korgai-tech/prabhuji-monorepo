import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/entitlement.dart';
import '../../../core/user_properties.dart';
import '../../../state/providers.dart';
import '../../paywall/paywall_analytics.dart';
import '../../paywall/presentation/paywall_screen.dart';
import '../preview/bloc/set_wallpaper_bloc.dart';
import '../wallpaper_providers.dart';
import '../wallpaper_routes.dart';

/// Open the Listing screen for [query] (deity or row).
void pushWallpaperListing(BuildContext context, WallpaperListQuery query) {
  unawaited(context.push(WallpaperRoutes.list, extra: query));
}

/// Open the full-screen reels Preview seeded with a source-context feed.
void pushWallpaperPreview(BuildContext context, WallpaperPreviewArgs args) {
  unawaited(context.push(WallpaperRoutes.preview, extra: args));
}

/// Build a [SetWallpaperBloc] wired to the native channel + the LIVE entitlement
/// + the paywall round-trip. The ONLY Pro gate in the module; defined once here
/// so the preview screen stays presentation-only.
SetWallpaperBloc buildSetWallpaperBloc(BuildContext context, WidgetRef ref) {
  return SetWallpaperBloc(
    service: ref.read(setWallpaperServiceProvider),
    repository: ref.read(wallpaperRepositoryProvider),
    isPro: () => ref.read(entitlementProvider),
    refreshEntitlement: () => ref.read(entitlementStateProvider.notifier).refresh(),
    openPaywall: () => context.push(
      '/paywall',
      extra: const PaywallArgs(
        triggerModule: UserPropertyModule.wallpaper,
        triggerAction: PaywallTriggerAction.setWallpaper,
        entrySource: PaywallEntrySource.feature,
      ),
    ),
    analytics: ref.read(analyticsProvider),
  );
}
