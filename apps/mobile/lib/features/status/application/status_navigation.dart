import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/entitlement.dart';
import '../../../core/user_properties.dart';
import '../../../state/providers.dart';
import '../../paywall/paywall_analytics.dart';
import '../../paywall/presentation/paywall_screen.dart';
import '../data/status_models.dart';
import '../share/bloc/status_share_bloc.dart';
import '../status_analytics.dart';
import '../status_providers.dart';
import '../status_routes.dart';

/// Open the personal details editor. Awaits the pop so the caller can refresh
/// the overlay preview with whatever was saved.
///
/// [initialType] is retained on the API for legacy callers — after TAM-168 the
/// bloc always resolves the active type to personal (the Business tab is
/// gone).
///
/// [entryMessage] renders as a SnackBar on the destination screen the moment
/// it mounts. After TAM-168 the details flow is optional on Share, so this is
/// rarely used; kept optional for compat.
///
/// [entrySource] tags which surface pushed this route so
/// `status_personal_details_page_viewed` attributes the funnel entry
/// (`add_details_strip` from the overlay strip tap, `edit_details_button` from
/// the top-right pill).
Future<void> pushStatusDetails(
  BuildContext context, {
  StatusProfileType initialType = StatusProfileType.personal,
  String? entryMessage,
  String entrySource = StatusEntrySources.editDetailsButton,
}) async {
  await context.push(
    StatusRoutes.details,
    extra: StatusDetailsArgs(
      initialType: initialType,
      entryMessage: entryMessage,
      entrySource: entrySource,
    ),
  );
}

/// Build a [StatusShareBloc] wired to the render service + the LIVE entitlement
/// + the paywall round-trip. The ONLY Pro gate in the module; defined once here
/// so the feed screen stays presentation-only.
StatusShareBloc buildStatusShareBloc(BuildContext context, WidgetRef ref) {
  return StatusShareBloc(
    renderService: ref.read(statusRenderServiceProvider),
    shareService: ref.read(shareServiceProvider),
    isPro: () => ref.read(entitlementProvider),
    refreshEntitlement: () => ref.read(entitlementStateProvider.notifier).refresh(),
    openPaywall: () => context.push(
      '/paywall',
      extra: const PaywallArgs(
        triggerModule: UserPropertyModule.statusSharing,
        triggerAction: PaywallTriggerAction.shareStatus,
        entrySource: PaywallEntrySource.feature,
      ),
    ),
    analytics: ref.read(analyticsProvider),
    storyLauncher: ref.read(storyShareLauncherProvider),
  );
}

/// Fire-and-forget navigation to login for a logged-out user hitting Status.
void redirectToStatusLogin(BuildContext context) {
  unawaited(context.push('/phone-input'));
}
