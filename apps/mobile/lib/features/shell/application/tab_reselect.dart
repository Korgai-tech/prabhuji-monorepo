import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Branch indices of the `StatefulShellRoute` in `router.dart` that react to
/// a bottom-nav re-tap. Kept beside the signal so a screen never hard-codes a
/// bare int.
abstract final class ShellBranch {
  static const int home = 0;
  static const int chat = 1;
  static const int status = 2;
}

/// One re-tap of the ALREADY-active bottom-nav tab.
///
/// Deliberately no `==` override: every tap is a new instance, so Riverpod
/// notifies listeners even when the same tab is re-tapped twice in a row.
@immutable
class TabReselect {
  const TabReselect(this.branchIndex);

  final int branchIndex;
}

/// Shell → screen signal for "re-tapped the active tab" (scroll to top +
/// refresh on Home / Status). The shell writes it from `_BottomNav`; branch
/// screens `ref.listen` and filter by [TabReselect.branchIndex] — they stay
/// mounted in the shell's IndexedStack, so every branch hears every re-tap.
class TabReselectNotifier extends Notifier<TabReselect?> {
  @override
  TabReselect? build() => null;

  void reselect(int branchIndex) => state = TabReselect(branchIndex);
}

final tabReselectProvider =
    NotifierProvider<TabReselectNotifier, TabReselect?>(TabReselectNotifier.new);
