import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/entitlement.dart';
import '../../../core/user_properties.dart';
import '../../../state/providers.dart';
import '../../paywall/paywall_analytics.dart';
import '../../paywall/presentation/paywall_screen.dart';
import '../ringtone_routes.dart';
import 'ringtone_tap_handler.dart';

/// Builds a [RingtoneTapHandler] bound to go_router navigation + the live
/// entitlement + the paywall round-trip. Reused by Home + Search so the Pro
/// gate is defined once.
RingtoneTapHandler buildRingtoneTapHandler(BuildContext context, WidgetRef ref) {
  return RingtoneTapHandler(
    isPro: () => ref.read(entitlementProvider),
    refreshEntitlement: () => ref.read(entitlementStateProvider.notifier).refresh(),
    openPaywall: () => context.push(
      '/paywall',
      extra: const PaywallArgs(
        triggerModule: UserPropertyModule.ringtone,
        triggerAction: PaywallTriggerAction.playRingtone,
        entrySource: PaywallEntrySource.feature,
      ),
    ),
    openPreview: (args) =>
        context.push(RingtoneRoutes.preview(args.ringtoneId), extra: args),
    analytics: ref.read(analyticsProvider),
  );
}

/// Navigate to the Search Results screen for [query].
void pushRingtoneSearch(BuildContext context, String query) {
  unawaited(context.push(RingtoneRoutes.search, extra: query));
}
