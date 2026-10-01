// Function-typed constructor params can't use initializing formals.
// ignore_for_file: prefer_initializing_formals

import 'dart:async';

import '../../../core/analytics.dart';
import '../data/mantras_models.dart';
import '../data/mantras_repository.dart';
import '../mantras_analytics.dart';
import '../mantras_routes.dart';

/// The tap = the intent moment (TAM-66 §5), factored into a pure,
/// navigation-free controller so it is trivially unit-testable.
///
/// Pro gating is **BROADER than Aarti**: tapping ANY audio card, ANY deity card,
/// OR ANY category card runs through the gate. For a free user every one of
/// these opens the unified paywall (funnel-attributed by the Paywall module,
/// NOT by a mantras-scoped event — Sheet 1 has no `mantras_paywall_triggered`)
/// and the player never opens. For a Pro user:
///  * audio tap → open the player on that item, queue = the surface order.
///  * deity tap → resolve the deity playlist (server-authoritative), open on its
///    first item with the rest as the queue.
///  * category tap → resolve the category playlist, open on its first item.
///
/// The client NEVER fetches a stream URL for a free user — the player is only
/// ever reached as Pro, and it resolves the URL from the server there.
class MantrasTapHandler {
  MantrasTapHandler({
    required bool Function() isPro,
    required Future<void> Function() refreshEntitlement,
    required Future<void> Function() openPaywall,
    required Future<void> Function(MantrasPlayerArgs args) openPlayer,
    required MantrasRepository repository,
    Analytics? analytics,
  })  : _isPro = isPro,
        _refreshEntitlement = refreshEntitlement,
        _openPaywall = openPaywall,
        _openPlayer = openPlayer,
        _repository = repository,
        _analytics = analytics;

  final bool Function() _isPro;
  final Future<void> Function() _refreshEntitlement;
  final Future<void> Function() _openPaywall;
  final Future<void> Function(MantrasPlayerArgs args) _openPlayer;
  final MantrasRepository _repository;
  final Analytics? _analytics;

  /// Tap on an audio [item] within its source [queue] (surface order).
  /// Sheet 1 row 68 — `mantras_audio_selected`.
  Future<void> handleAudioTap({
    required MantraAudio item,
    required List<MantraAudio> queue,
    required int index,
    required String sourceSection,
  }) async {
    unawaited(_analytics?.trackEvent(
      MantrasEvents.audioSelected,
      properties: {
        MantrasEventProps.audioId: item.id,
        MantrasEventProps.audioName: item.title,
        MantrasEventProps.audioType: 'mantra',
        MantrasEventProps.selectionSource: sourceSection,
        MantrasEventProps.positionIndex: index,
      },
    ));
    await _gatedOpen(
      resolve: () async => MantrasPlayerArgs(
        itemId: item.id,
        queue: queue,
        index: index,
        playlistSource: sourceSection,
      ),
    );
  }

  /// Tap on a deity card — resolve its playlist server-side, open the first item.
  /// Sheet 1 row 67 — `mantras_deity_clicked`.
  Future<void> handleDeityTap({
    required MantraDeity deity,
    int positionIndex = 0,
  }) async {
    unawaited(_analytics?.trackEvent(
      MantrasEvents.deityClicked,
      properties: {
        MantrasEventProps.deityId: deity.slug,
        MantrasEventProps.deityName: deity.displayName,
        MantrasEventProps.positionIndex: positionIndex,
      },
    ));
    await _gatedOpen(
      resolve: () => _argsFromPlaylist(
        () => _repository.fetchDeityPlaylist(deity.slug),
        source: 'deity',
      ),
    );
  }

  /// Tap on a category card — resolve its playlist server-side, open first item.
  /// NOTE: Sheet 1 has no `mantras_category_clicked` event (rows 64–85 cover
  /// deity but not category). The tap still gates + resolves; only the
  /// analytics call is dropped.
  Future<void> handleCategoryTap({required MantraCategory category}) async {
    await _gatedOpen(
      resolve: () => _argsFromPlaylist(
        () => _repository.fetchCategoryPlaylist(category.id),
        source: 'category',
      ),
    );
  }

  /// The run-vs-gate-then-resume contract for all three card types. Paywall
  /// attribution is owned by the Paywall module (`trigger_module`), so no
  /// mantras-scoped paywall_triggered fires here.
  Future<void> _gatedOpen({
    required Future<MantrasPlayerArgs?> Function() resolve,
  }) async {
    if (_isPro()) {
      final args = await resolve();
      if (args != null) await _openPlayer(args);
      return;
    }

    await _openPaywall();

    // Paywall closed → re-read LIVE entitlement (never a cached flag).
    await _refreshEntitlement();
    if (!_isPro()) return; // cancelled — restore prior context, no playback.

    final args = await resolve();
    if (args != null) await _openPlayer(args);
  }

  /// Resolve a deity/category playlist into player args (first item + queue).
  Future<MantrasPlayerArgs?> _argsFromPlaylist(
    Future<MantraPlaylist> Function() fetch, {
    required String source,
  }) async {
    final MantraPlaylist playlist;
    try {
      playlist = await fetch();
    } catch (_) {
      return null; // soft-fail — no player, no crash.
    }
    final first = playlist.firstItem;
    if (first == null && playlist.items.isEmpty) return null;
    final queue = playlist.items.isNotEmpty
        ? playlist.items
        : <MantraAudio>[?first];
    final startId = (first ?? queue.first).id;
    final index = queue.indexWhere((a) => a.id == startId).clamp(0, queue.length - 1);
    return MantrasPlayerArgs(
      itemId: startId,
      queue: queue,
      index: index,
      playlistSource: source,
    );
  }
}
