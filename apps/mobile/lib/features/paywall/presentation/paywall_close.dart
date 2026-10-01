import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../bloc/paywall_bloc.dart';
import '../bloc/paywall_event.dart';

/// Close-method labels accepted by [dismissPaywall]. They map 1:1 onto Sheet-1
/// row 23's `close_method` vocabulary in `PaywallBloc._wireCloseMethod`.
class PaywallCloseTrigger {
  /// The X glyph in `PaywallTopNav`.
  static const String userClose = 'user_close';

  /// The Android system back button / predictive-back gesture.
  static const String back = 'back';
}

/// Where the user goes when the paywall lets them go — asked of the CALLER
/// that opened it, because only the caller knows whether there is anything
/// underneath.
///
/// Opt-in by design. [goHome] is the default and stays the behaviour on every
/// surface that does not ask for otherwise, so adding a mode here cannot move
/// a paywall nobody touched.
enum PaywallDismissMode {
  /// Land on `/home`. The behaviour the paywall has always had, and the only
  /// safe answer wherever the paywall is the BOTTOM of the stack: the
  /// cold-start orchestrator redirect (`/splash → /paywall`), the deep-link
  /// interstitial, a notification tap, a payment return. A `pop` there pops
  /// the last page, which Android reads as "leave the app".
  goHome,

  /// Pop back to whatever pushed the paywall — for a paywall opened from a
  /// surface the user was in the middle of using, and expects to still be in
  /// afterwards (chat, where the paywall interrupts a conversation).
  ///
  /// Degrades to [goHome] when there is nothing to pop, so this can never be
  /// the mode that exits the app.
  returnToCaller,
}

/// Publishes the enclosing paywall's [PaywallDismissMode] to its subtree.
///
/// The X glyph lives in `PaywallTopNav`, which all four variant bodies mount —
/// so threading the mode down as a constructor parameter would mean touching
/// every variant and trusting that no future one forgets. An inherited scope
/// means the nav asks, and a variant added next year inherits the behaviour
/// without knowing this field exists.
class PaywallDismissScope extends InheritedWidget {
  const PaywallDismissScope({
    super.key,
    required this.mode,
    required super.child,
  });

  final PaywallDismissMode mode;

  /// The mode the enclosing paywall was opened with, or
  /// [PaywallDismissMode.goHome] when there is no scope — which is what a
  /// widget test mounting a nav in isolation sees, and the safe answer
  /// everywhere.
  static PaywallDismissMode of(BuildContext context) {
    final scope =
        context.dependOnInheritedWidgetOfExactType<PaywallDismissScope>();
    return scope?.mode ?? PaywallDismissMode.goHome;
  }

  @override
  bool updateShouldNotify(PaywallDismissScope oldWidget) =>
      oldWidget.mode != mode;
}

/// Leave the paywall, per the opening caller's [mode]. The ONE navigation
/// path off this screen — the X glyph, the system back button, a successful
/// purchase, an empty plan list and the config-error escape all route through
/// here so they cannot drift apart. Fires no analytics of its own; the close
/// events belong to the callers that know their own trigger.
///
/// The `canPop` check is load-bearing, not defensive politeness: it is what
/// makes [PaywallDismissMode.returnToCaller] safe to hand to a call site that
/// might be wrong about its own stack.
void leavePaywall(
  BuildContext context, {
  PaywallDismissMode mode = PaywallDismissMode.goHome,
}) {
  final router = GoRouter.of(context);
  if (mode == PaywallDismissMode.returnToCaller && router.canPop()) {
    router.pop();
    return;
  }
  context.go('/home');
}

/// The ONE dismissal path for the paywall, shared by the X glyph and the
/// Android system back button so the two can never drift apart.
///
/// Fires `paywall_closed` (with the caller's close method), then leaves via
/// [leavePaywall] — `/home` unless the opening call site asked to be returned
/// to. See [PaywallDismissMode].
void dismissPaywall(
  BuildContext context, {
  required String trigger,
  PaywallDismissMode mode = PaywallDismissMode.goHome,
}) {
  context.read<PaywallBloc>().add(CloseTapped(trigger: trigger));
  leavePaywall(context, mode: mode);
}
