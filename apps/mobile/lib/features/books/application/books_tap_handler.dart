// Function-typed constructor params can't use initializing formals.
// ignore_for_file: prefer_initializing_formals

import '../../../core/analytics.dart';
import '../data/books_models.dart';

/// The book-card tap = the intent moment (TAM-76 AC "Pro gating") + the
/// post-purchase continuation, factored into a pure, navigation-free controller
/// so it is trivially unit-testable.
///
/// It implements the TAM-58 `PaywallGate` run-vs-gate-then-resume contract:
///
///  * **Pro** → open Contents (major book) or the Reader (direct scripture)
///    immediately.
///  * **Free** → open the **unified paywall directly** — no contextual
///    pre-paywall screen (r3/r4, #EXPORT_CRITICAL). On a successful purchase
///    (live entitlement flips to Pro after the paywall closes) resume by
///    opening the ORIGINALLY-tapped book; on cancel, do nothing (prior
///    context + scroll preserved).
///
/// Discovery is free and inviting: this handler is the ONLY gate in the module,
/// so cards never carry lock badges (#EXPORT_CRITICAL).
///
/// Analytics: Books is out of scope for the current analytics contract
/// (Sheet 1 has zero Books events), so no tracking is emitted. The [Analytics]
/// ctor param is retained so callers don't have to reshape when Books tracking
/// is re-added.
class BooksTapHandler {
  BooksTapHandler({
    required bool Function() isPro,
    required Future<void> Function() refreshEntitlement,
    required Future<void> Function() openPaywall,
    required Future<void> Function(BookCardView book) openContents,
    required Future<void> Function(BookCardView book) openScripture,
    // ignore: avoid_unused_constructor_parameters -- see class dartdoc
    Analytics? analytics,
  })  : _isPro = isPro,
        _refreshEntitlement = refreshEntitlement,
        _openPaywall = openPaywall,
        _openContents = openContents,
        _openScripture = openScripture;

  final bool Function() _isPro;
  final Future<void> Function() _refreshEntitlement;
  final Future<void> Function() _openPaywall;
  final Future<void> Function(BookCardView book) _openContents;
  final Future<void> Function(BookCardView book) _openScripture;

  /// Handle a tap on [book] from [sourceListType] (`carousel`, `newly_added`,
  /// `all_books`, `category`). `sourceListType` is currently unused (Books
  /// tracking is out of scope); retained so re-adding events later requires
  /// no call-site changes.
  Future<void> handleTap({
    required BookCardView book,
    required String sourceListType,
  }) async {
    if (_isPro()) {
      await _open(book);
      return;
    }

    // Free → the unified paywall is the ONLY gate, opened DIRECTLY (r3/r4).
    await _openPaywall();

    // Paywall closed → re-read LIVE entitlement (never a cached flag).
    await _refreshEntitlement();
    if (!_isPro()) return; // Cancelled — restore prior context, open nothing.

    // Purchased → resume with the ORIGINALLY-tapped book.
    await _open(book);
  }

  /// #PATH_DECISION — two flows off one tap, branched on `contentType`.
  Future<void> _open(BookCardView book) => switch (book.contentType) {
        BookContentType.majorBook => _openContents(book),
        BookContentType.directScripture => _openScripture(book),
      };
}
