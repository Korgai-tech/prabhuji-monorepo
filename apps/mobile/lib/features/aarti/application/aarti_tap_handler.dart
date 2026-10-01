// Function-typed constructor params can't use initializing formals.
// ignore_for_file: prefer_initializing_formals

import 'dart:async';

import '../../../core/analytics.dart';
import '../aarti_analytics.dart';
import '../aarti_routes.dart';
import '../data/aarti_models.dart';

/// The audio-item tap = the intent moment (TAM-64 §6.9) + post-purchase
/// continuation (#EXPORT_CRITICAL §7.8), factored into a pure, navigation-free
/// controller so it is trivially unit-testable.
///
/// It implements the TAM-58 `PaywallGate` run-vs-gate-then-resume contract, with
/// the two funnel events the spec mandates interleaved (`paywall_shown` BEFORE
/// the paywall opens, `purchase_success_from_audio` only on a real purchase) —
/// which the opaque gate closure can't express on its own.
///
///  * **Pro** → open the player + auto-play immediately.
///  * **Free** → fire `paywall_shown`, open the unified paywall; on a successful
///    purchase (live entitlement flips to Pro after the paywall closes) fire
///    `purchase_success_from_audio` and open the player for the ORIGINALLY-tapped
///    item with its queue restored; on cancel, do nothing (prior context + scroll
///    preserved, no playback).
///
/// The client NEVER fetches a stream URL for a free user — the player is only
/// ever reached as Pro, and it resolves the URL from the server there.
class AartiTapHandler {
  AartiTapHandler({
    required bool Function() isPro,
    required Future<void> Function() refreshEntitlement,
    required Future<void> Function() openPaywall,
    required Future<void> Function(AartiPlayerArgs args) openPlayer,
    Analytics? analytics,
  })  : _isPro = isPro,
        _refreshEntitlement = refreshEntitlement,
        _openPaywall = openPaywall,
        _openPlayer = openPlayer,
        _analytics = analytics;

  final bool Function() _isPro;
  final Future<void> Function() _refreshEntitlement;
  final Future<void> Function() _openPaywall;
  final Future<void> Function(AartiPlayerArgs args) _openPlayer;
  final Analytics? _analytics;

  /// Handle a tap on [audio] within its source [queue].
  Future<void> handleTap({
    required AartiAudio audio,
    required List<AartiAudio> queue,
    required int index,
    required String sourceListType,
    String? sourceFilter,
  }) async {
    unawaited(_analytics?.trackEvent(
      AartiEvents.audioSelected,
      properties: {
        AartiEventProps.audioId: audio.id,
        AartiEventProps.audioName: audio.title,
        AartiEventProps.audioType: AartiAudioType.aarti,
        'source_list_type': sourceListType,
      },
    ));

    final args = AartiPlayerArgs(
      audioId: audio.id,
      queue: queue,
      index: index,
      sourceListType: sourceListType,
      sourceFilter: sourceFilter,
    );

    if (_isPro()) {
      await _openPlayer(args);
      return;
    }

    // Free → the paywall is the ONLY gate. The `aarti_bhajans_paywall_shown`
    // and `aarti_bhajans_purchase_success_from_audio` legacy events used to
    // fire here; both are absent from the current analytics contract (only
    // `aarti_audio_selected` remains from the tap flow), so no tracking is
    // emitted around the paywall round-trip. If the paywall funnel needs
    // per-source attribution later, add the events to Sheet 1 first.
    await _openPaywall();

    // Paywall closed → re-read LIVE entitlement (never a cached flag).
    await _refreshEntitlement();
    if (!_isPro()) {
      // Cancelled — restore prior context, no playback (§7.7). Nothing to do.
      return;
    }

    // Auto-open the originally-tapped item + auto-play with the queue restored.
    await _openPlayer(args);
  }
}
