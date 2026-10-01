import 'package:meta/meta.dart';

import '../../data/aarti_models.dart';

@immutable
sealed class AartiMainState {
  const AartiMainState();
}

/// Initial + retry-in-progress — the page shows nav + skeletons, never a paywall.
class AartiMainLoading extends AartiMainState {
  const AartiMainLoading();
}

/// Loaded: the ordered sections (a section the server omits — e.g. Recently
/// Played with no history — is simply absent; never fabricated, §6.3).
class AartiMainLoaded extends AartiMainState {
  const AartiMainLoaded(this.sections);
  final List<AartiSectionData> sections;

  /// Rendered sections in server `sortOrder`, dropping any empty section so a
  /// failed/empty section hides rather than breaking the page (§7.5).
  List<AartiSectionData> get visibleSections =>
      sections.where((s) => !s.isEmpty).toList(growable: false);
}

/// Full-page failure → retry state (nav visible, NO paywall, §7.6).
class AartiMainError extends AartiMainState {
  const AartiMainError(this.message);
  final String message;
}
