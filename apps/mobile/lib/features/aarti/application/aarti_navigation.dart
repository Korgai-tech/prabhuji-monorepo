import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/entitlement.dart';
import '../../../core/user_properties.dart';
import '../../audio/application/audio_providers.dart';
import '../../../state/providers.dart';
import '../../paywall/paywall_analytics.dart';
import '../../paywall/presentation/paywall_screen.dart';
import '../aarti_analytics.dart';
import '../aarti_routes.dart';
import '../data/aarti_models.dart';
import 'aarti_tap_handler.dart';

/// Builds an [AartiTapHandler] bound to go_router navigation + the live
/// entitlement + paywall round-trip. Reused by the main page and the listing
/// page so the intent moment + post-purchase continuation is defined once.
AartiTapHandler buildAartiTapHandler(BuildContext context, WidgetRef ref) {
  return AartiTapHandler(
    isPro: () => ref.read(entitlementProvider),
    refreshEntitlement: () => ref.read(entitlementStateProvider.notifier).refresh(),
    // `push` completes when the paywall route is popped — the gate then re-reads
    // live entitlement to decide purchase-vs-cancel.
    openPaywall: () => context.push(
      '/paywall',
      extra: const PaywallArgs(
        triggerModule: UserPropertyModule.aartiBhajans,
        triggerAction: PaywallTriggerAction.playAudio,
        entrySource: PaywallEntrySource.feature,
      ),
    ),
    openPlayer: (args) => context.push(AartiRoutes.player, extra: args),
    analytics: ref.read(analyticsProvider),
  );
}

/// Navigate to the reusable listing for [query] (§6.4–6.7).
void pushAartiListing(BuildContext context, AartiListQuery query) {
  unawaited(context.push(AartiRoutes.listing, extra: query));
}

/// Re-open the full player for the already-active engine item (mini-player tap /
/// deep link into ongoing playback) — attach, don't restart (fires
/// `aarti_bhajans_mini_player_tapped`).
void reopenActivePlayer(BuildContext context, WidgetRef ref) {
  final active = ref.read(audioControllerProvider).currentItem;
  if (active == null) return;
  unawaited(ref.read(analyticsProvider)?.trackEvent(
    AartiEvents.miniPlayerClicked,
    properties: {'audio_id': active.id},
  ));
  unawaited(context.push(
    AartiRoutes.player,
    extra: AartiPlayerArgs(
      audioId: active.id,
      queue: const [],
      index: 0,
      sourceListType: 'mini_player',
      autoStart: false,
    ),
  ));
}
