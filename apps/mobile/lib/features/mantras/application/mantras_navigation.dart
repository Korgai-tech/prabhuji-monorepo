import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/entitlement.dart';
import '../../../core/user_properties.dart';
import '../../../state/providers.dart';
import '../../audio/application/audio_providers.dart';
import '../../paywall/paywall_analytics.dart';
import '../../paywall/presentation/paywall_screen.dart';
import '../data/mantras_models.dart';
import '../mantras_providers.dart';
import '../mantras_routes.dart';
import 'mantras_tap_handler.dart';

/// Builds a [MantrasTapHandler] bound to go_router navigation + the live
/// entitlement + paywall round-trip + the mantras repository (for
/// server-authoritative deity/category playlist resolution). Reused by the main
/// page and the listing so the broad Pro gate is defined once.
MantrasTapHandler buildMantrasTapHandler(BuildContext context, WidgetRef ref) {
  return MantrasTapHandler(
    isPro: () => ref.read(entitlementProvider),
    refreshEntitlement: () => ref.read(entitlementStateProvider.notifier).refresh(),
    openPaywall: () => context.push(
      '/paywall',
      extra: const PaywallArgs(
        triggerModule: UserPropertyModule.mantrasStutis,
        triggerAction: PaywallTriggerAction.playAudio,
        entrySource: PaywallEntrySource.feature,
      ),
    ),
    openPlayer: (args) => context.push(MantrasRoutes.player, extra: args),
    repository: ref.read(mantrasRepositoryProvider),
    analytics: ref.read(analyticsProvider),
  );
}

/// Navigate to the reusable Show-all listing for [query].
void pushMantrasListing(BuildContext context, MantraListQuery query) {
  unawaited(context.push(MantrasRoutes.listing, extra: query));
}

/// Re-open the full player for the already-active engine item (mini-player tap)
/// — attach, don't restart. Sheet 1 rows 64–85 have no mantras-scoped
/// mini-player event, so this navigation emits no analytics of its own.
///
/// `playlistSource` is deliberately EMPTY. `_loadAndPlay` treats empty as
/// "no source" and calls `fetchDetail(source: null)` — the mini-player reopen
/// is a UI re-attach, not a fresh play from a playlist. Passing a synthetic
/// "mini_player" string here was previously threaded into the API `source`
/// query, which the backend rejects because it's not one of its allowlisted
/// playlist sources (deity / category / recently_played / newly_added). The
/// detail fetch then errored, the bloc emitted `MantrasPlayerErrorState`, and
/// the user saw the tap "do nothing" instead of reopening the full player.
void reopenActiveMantrasPlayer(BuildContext context, WidgetRef ref) {
  final active = ref.read(audioControllerProvider).currentItem;
  if (active == null) return;
  unawaited(context.push(
    MantrasRoutes.player,
    extra: MantrasPlayerArgs(
      itemId: active.id,
      queue: const [],
      index: 0,
      playlistSource: '',
      autoStart: false,
    ),
  ));
}
