import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/entitlement.dart';
import '../../../core/paywall_gate.dart';
import '../../../core/user_properties.dart';
import '../../../state/providers.dart';
import '../../chat/chat_analytics.dart';
import '../../chat/chat_paywall.dart';
import '../../chat/chat_providers.dart';
import '../../paywall/paywall_analytics.dart';
import '../../paywall/presentation/paywall_screen.dart';
import 'tab_reselect.dart';

/// The one chat entry: fires `chat_button_clicked`, then routes to Kuldevta
/// discovery, the paywall, or the chat branch.
///
/// Was the chat-tab tap in `AppShellScaffold`'s bottom nav (TAM-164/166); the
/// tab is gone and the Home extended FAB is the entry now. The branch itself
/// stays registered on `StatefulShellRoute` at [ShellBranch.chat].
/// [goBranch] is the shell's branch switch (`StatefulNavigationShell.of`).
void openChatFromShell({
  required BuildContext context,
  required WidgetRef ref,
  required void Function(int branchIndex) goBranch,
  required String sourceScreen,
  required String entryPoint,
}) {
  final isPro = ref.read(entitlementProvider);
  // Bug 2 — attribute the entry fire to the user's bot + bucket. Primary
  // source is the live `meProvider` (freshest); if the FutureProvider hasn't
  // resolved yet (cold-launch first-tap race) fall back to the values
  // `ChatCounters` persisted from the last session. Both properties are
  // OMITTED when neither source has a value — an empty string would look
  // like a real bot / bucket in the funnel.
  final chatConfig = ref.read(meProvider).value?.chatConfig;
  final counters = ref.read(chatCountersProvider);
  final resolvedAgentId = chatConfig?.agentId ?? counters.savedAgentId();
  final resolvedChatType = chatConfig?.chatType ?? counters.savedChatType();
  unawaited(
    ref
        .read(analyticsProvider)
        ?.trackEvent(
          ChatEvents.chatButtonClicked,
          properties: <String, Object?>{
            ChatEventProps.sourceScreen: sourceScreen,
            ChatEventProps.entryPoint: entryPoint,
            ChatEventProps.contentId: '',
            ChatEventProps.contentType: '',
            ChatEventProps.userSubscriptionStatus:
                ChatUserSubscriptionStatus.fromIsPro(isPro),
            if (resolvedAgentId != null && resolvedAgentId.isNotEmpty)
              ChatEventProps.agentId: resolvedAgentId,
            if (resolvedChatType != null && resolvedChatType.isNotEmpty)
              ChatEventProps.chatType: resolvedChatType,
          },
        ),
  );

  // TAM-166 — routing branches on `chatConfig` (spec §Entry & visibility):
  //
  //   showKuldevtaChat  kuldevtaAssigned    → action
  //   ─────────────────────────────────────────────────────────────
  //   false             (any)               → paywall then chat
  //   true              false               → chat in KHOJ MODE, free,
  //                                          no paywall
  //   true              true                → paywall then chat
  //                                          (persona header renders)
  //
  // Discovery is un-gated (locked decision 2026-09-03) — unchanged.
  //
  // TAM-177 changed HOW, not WHETHER. Discovery used to be four screens
  // pushed OVER the shell, specifically so the chat screen stayed unreachable
  // for a qualified-but-unassigned user. The khoj now happens INSIDE the chat
  // screen, so that invariant can no longer be enforced by route choice: we
  // branch-swap to Chat like everyone else, and `ChatScreen` resolves khoj
  // mode from the same two flags.
  //
  // What replaces the route-level guard is the per-mode gate in the screen:
  // in khoj mode the composer's send and voice paths go to `KuldevtaBloc`
  // only, so `ChatBloc._onSubmitted` — and with it `POST /chat/messages` and
  // the send-time `_isPro()` re-gate — is unreachable. A non-Pro user can
  // answer six questions and see their deity, and can send nothing else.
  final router = GoRouter.of(context);
  if (chatConfig != null &&
      chatConfig.showKuldevtaChat &&
      !chatConfig.kuldevtaAssigned) {
    goBranch(ShellBranch.chat);
    return;
  }

  // Everyone else: chat is Pro-gated ONLY when the server says so, via
  // `chatConfig.requiresPro` (see `features/chat/chat_paywall.dart`). While
  // that flag is false the branch swap happens immediately and no paywall is
  // pushed; when it is true this behaves exactly as it always did — the
  // paywall opens with `entry_source: chat`, a successful purchase resumes the
  // branch swap, and cancel means no swap.
  final gate = ref.read(paywallGateProvider);
  final requiresPro = ref.read(chatPaywallRequiredProvider);
  unawaited(
    runChatPaywallGate<void>(
      requiresPro: requiresPro,
      gate: gate,
      pending: PendingAction<void>(
        action: () async => goBranch(ShellBranch.chat),
        label: 'open_chat',
      ),
      openPaywall: () async {
        await router.push(
          '/paywall',
          extra: PaywallArgs(
            // Attribution for `paywall_viewed` (spec §18.1) — chat module +
            // open-chat action + chat entry source.
            triggerModule: UserPropertyModule.chat,
            triggerAction: PaywallTriggerAction.openChat,
            entrySource: PaywallEntrySource.chat,
            // TAM-177 attribution fix (A). These were null on this path even
            // though both values are resolved a few lines above for
            // `chat_button_clicked` — which made every chat-entry paywall
            // view indistinguishable by arm in the warehouse. Purely
            // additive: it fills nulls, it does not move any existing value.
            agentId: resolvedAgentId,
            chatType: resolvedChatType,
          ),
        );
      },
    ),
  );
}
