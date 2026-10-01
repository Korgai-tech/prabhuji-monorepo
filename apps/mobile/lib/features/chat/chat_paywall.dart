import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/paywall_gate.dart';
import '../../state/providers.dart';

/// ⚑ THE CHAT PAYWALL SEAM — every chat Pro-gate goes through this file.
///
/// Chat is currently FREE for every user in every A/B arm
/// (`content_chat`, `bhagwat_gita_chat`, `kuldevta_chat`). Nothing was
/// deleted to make that true: the three gates below are intact and dormant,
/// waiting on one server-side boolean.
///
/// ── HOW TO TURN THE PAYWALL BACK ON ────────────────────────────────────────
/// Flip ONE line in the API and deploy:
///
///     apps/api/src/core/chat/services/chat.constants.ts
///     export const CHAT_REQUIRES_PRO = true;
///
/// That is the whole change. No app release, no edit to this file, no edit to
/// the three call sites. It rides `GET /users/me → chatConfig.requiresPro`, so
/// already-shipped APKs re-arm on their next launch.
///
/// ── THE THREE GATES THIS SEAM FEEDS ────────────────────────────────────────
///  1. Entry from the Home FAB
///     `features/shell/application/open_chat.dart`
///  2. The khoj "Baat Karein" CTA
///     `features/chat/presentation/chat_screen.dart:_onKuldevtaChatPressed`
///  3. The defensive send-time re-gate
///     `features/chat/application/chat_bloc.dart:_onSubmitted`, wired the
///     same way `isPro` is — a live closure injected at `core/router.dart`,
///     never a bool captured at construction.
///
/// ── WHY A WRAPPER RATHER THAN `if (requiresPro)` AT EACH SITE ──────────────
/// The two navigation gates do not merely skip the paywall when it is off —
/// they must still RUN the action the gate was wrapping (swap to the chat
/// branch; complete the kuldevta handoff). Writing that by hand three times is
/// three chances to drop the action and leave a dead button, which is exactly
/// the bug an ungated build would ship. [runChatPaywallGate] makes
/// "off" mean "run it straight through" in one place.
///
/// ── WHAT THIS DOES NOT CONTROL ─────────────────────────────────────────────
/// CONTENT CARDS inside an agent's reply. Tapping one is gated on `isPro`
/// alone — an ALWAYS-ARMED fourth gate that ignores the switch above, in
/// `chat_screen.dart:_gateContentTap`. Free chat must not become a backdoor
/// around the aarti / mantras / ringtone paywalls, which gate the very same
/// rows, so a free user's tap opens the paywall and (on purchase) then the
/// content. The server also still strips `playUrl` for a non-Pro caller
/// (`chat.content.ts`), which is what paints the lock on the card.
///
/// Do NOT route that gate through [runChatPaywallGate]: "may they talk" and
/// "may they play what the bot recommended" are different questions, and
/// wiring them to one flag would give away paid content the moment chat went
/// free — which is exactly what happened to the locked cards before this gate
/// existed (they were simply inert, a dead end with a lock on it).

/// Whether chat should be Pro-gated for the signed-in user, per the server.
///
/// Reads the live `/users/me` payload. `false` whenever the answer is not a
/// definite yes — payload unresolved, chatConfig absent, or a server that
/// predates the field — because a paywall shown on a blank payload is worse
/// than a free chat. See [MeChatConfig.requiresPro].
final chatPaywallRequiredProvider = Provider<bool>((ref) {
  return ref.watch(meProvider).value?.chatConfig?.requiresPro ?? false;
});

/// Runs [pending] behind the chat paywall when the server says chat is
/// Pro-gated, and straight through when it does not.
///
/// A drop-in replacement for [PaywallGate.run] at a chat call site: when
/// [requiresPro] is true this IS `gate.run`, byte for byte, so re-arming the
/// paywall restores the previous behaviour — including post-purchase
/// resumption of [pending] and the `null` return on cancel.
///
/// When [requiresPro] is false, [pending] runs immediately and [openPaywall]
/// is never invoked, so no `paywall_viewed` fires and no `/paywall` route is
/// pushed. The return value is [PendingAction.action]'s, never `null`-by-
/// cancellation — an ungated call cannot be cancelled.
Future<T?> runChatPaywallGate<T>({
  required bool requiresPro,
  required PaywallGate gate,
  required PendingAction<T> pending,
  required Future<void> Function() openPaywall,
}) async {
  if (!requiresPro) return pending.action();
  return gate.run<T>(pending: pending, openPaywall: openPaywall);
}
