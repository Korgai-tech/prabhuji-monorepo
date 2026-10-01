import 'package:meta/meta.dart';

import '../../data/mantras_models.dart';

@immutable
sealed class MantrasMainState {
  const MantrasMainState();
}

/// Initial + retry-in-progress — the page shows nav + skeletons, never a paywall.
class MantrasMainLoading extends MantrasMainState {
  const MantrasMainLoading();
}

/// Loaded: the ordered sections. A section the server omits (e.g. Recently
/// Played with no history) is simply absent — never fabricated (§6.3).
class MantrasMainLoaded extends MantrasMainState {
  const MantrasMainLoaded(this.sections);
  final List<MantraSectionData> sections;

  /// Rendered sections in server `sortOrder`, dropping any empty section so a
  /// failed/empty section hides rather than breaking the page.
  List<MantraSectionData> get visibleSections =>
      sections.where((s) => !s.isEmpty).toList(growable: false);

  /// All sections empty → the all-empty state with retry.
  bool get isAllEmpty => visibleSections.isEmpty;
}

/// Full-page failure → retry state (nav visible, NO paywall).
class MantrasMainError extends MantrasMainState {
  const MantrasMainError(this.message);
  final String message;
}
