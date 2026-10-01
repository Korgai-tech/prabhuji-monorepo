import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/scheduler.dart';
import 'package:go_router/go_router.dart';

import '../features/chat/chat_routes.dart';
import '../features/downloads/downloads_routes.dart';
import '../features/home/home_routes.dart';
import '../features/horoscope/horoscope_routes.dart';
import '../features/status/status_routes.dart';

/// The five bottom-nav branches of `StatefulShellRoute.indexedStack`
/// (`router.dart`). A branch path is SELECTED (`go`), never pushed — pushing
/// one stacks a second shell over the first.
///
/// Kept in sync by hand with the branch list in `router.dart`; a missing
/// entry here means that branch gets pushed instead of selected.
///
/// (`kShellBranchPaths` in `features/home/destinations.dart` is a narrower,
/// Home-CTA-specific subset — it only lists the branches a CMS destination
/// can resolve to. This set is the complete one.)
const Set<String> kShellBranchRoutes = <String>{
  HomeRoutes.home,
  ChatRoutes.chat,
  StatusRoutes.home,
  DownloadsRoutes.library,
  RashifalRoutes.main,
};

/// The router stack an EXTERNALLY-ARRIVING navigation should build: share
/// links, push-notification taps, install-referrer replays.
///
/// The first entry is the base — `go` it, which resets the stack. Every
/// later entry is `push`ed on top, in order.
///
/// ## Why this exists
///
/// Module routes are registered FLAT in `router.dart`
/// (`/mantras/audio/:itemId` is a top-level `GoRoute`, not a child of
/// `/mantras`), so `go('/mantras/audio/x')` produces a one-entry stack:
/// `canPop` is false and the system back button exits the app. In-app taps
/// never hit this because they push over the live shell
/// (`openHomeDestinationPath`) — only external arrivals were landing with
/// nothing underneath.
///
/// ## The rule
///
///   * A shell branch (`/home`, `/status`, `/horoscope`, …) → `['<branch>']`.
///     Selecting a branch IS the navigation; the shell's own `PopScope`
///     (`app_shell_scaffold.dart`) already sends back → Home tab. Pushing a
///     branch route instead would stack a second shell over the first.
///   * Anything else → `['/home', '<path>']` — Home underneath, target on
///     top, back returns to Home.
///
/// Deliberately TWO entries, not three. go_router builds every page in the
/// stack immediately rather than lazily on pop, so inserting the module home
/// (`/home` → `/mantras` → `/mantras/audio/x`) would mount that screen's
/// bloc and fire its feed request on every deep-link open — a request the
/// user never sees unless they press back. Per-module intermediates can be
/// added here later where they earn the fetch.
List<String> navigationStackFor(String path) {
  // `resolveNotificationRoute` emits bare `/` for its `home` type.
  final normalised = path == '/' ? HomeRoutes.home : path;

  // Query strings ride along (`/wallpaper?highlight=<id>`), so match the
  // path portion against the branch set rather than the whole string.
  final base = normalised.split('?').first;
  if (kShellBranchRoutes.contains(base)) return [normalised];

  return [HomeRoutes.home, normalised];
}

/// Realise a [navigationStackFor] result on [router]: `go` the base, then
/// `push` everything above it.
///
/// `go` resets the stack, so re-arriving on the same link can never pile
/// up duplicates. The pushes run in the SAME frame as the `go` — go_router
/// applies each one synchronously to the route-match list, so no
/// post-frame deferral is needed (verified against a router shaped like
/// ours: `go` alone leaves depth 1 / `canPop` false, `go` + `push` leaves
/// depth 2 popping back to the base).
void applyNavigationStack(GoRouter router, List<String> stack) {
  if (stack.isEmpty) return;
  if (kDebugMode) debugPrint('[DEEPLINK] applyNavigationStack $stack');
  router.go(stack.first);
  for (final path in stack.skip(1)) {
    router.push<void>(path);
  }
}

/// The location the user is actually looking at, pushed routes included.
///
/// `currentConfiguration.uri` stays at the BASE when a route is pushed
/// imperatively (see `deep_link_replay.dart`), so a pushed top is read from
/// its own match list instead.
String topLocationOf(GoRouter router) {
  final config = router.routerDelegate.currentConfiguration;
  if (config.isEmpty) return '';
  final top = config.last;
  if (top is ImperativeRouteMatch) return top.matches.uri.toString();
  return config.uri.toString();
}

/// Completes once the top of [router] is no longer [path] — however it
/// left (pop, `go`, replace). Checked after the current frame so a push made
/// just before the call has landed. Completes at once if [path] isn't on top.
Future<void> untilTopLeaves(GoRouter router, String path) async {
  await SchedulerBinding.instance.endOfFrame;
  bool onTop() => Uri.parse(topLocationOf(router)).path == path;
  if (!onTop()) return;
  final left = Completer<void>();
  final delegate = router.routerDelegate;
  void check() {
    if (!onTop() && !left.isCompleted) left.complete();
  }

  delegate.addListener(check);
  try {
    await left.future;
  } finally {
    delegate.removeListener(check);
  }
}
