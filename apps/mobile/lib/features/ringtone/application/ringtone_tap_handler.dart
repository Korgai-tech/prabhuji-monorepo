// Function-typed constructor params can't use initializing formals.
// ignore_for_file: prefer_initializing_formals

import 'dart:async';

import '../../../core/analytics.dart';
import '../data/ringtone_models.dart';
import '../ringtone_analytics.dart';
import '../ringtone_routes.dart';

/// The card tap = the intent moment (TAM-68 §5), factored into a pure,
/// navigation-free controller so it is trivially unit-testable.
///
/// Discovery/search/filter are FREE, but **opening a ringtone is Pro**: every
/// card tap (and its play overlay — the whole card is one tap target) runs
/// through the gate. For a free user the tap opens the unified paywall and
/// the Preview never opens. On a successful purchase (LIVE entitlement
/// re-read after the paywall closes) the ORIGINAL ringtone's Preview opens
/// and auto-plays — post-purchase continuation (§5). For a Pro user the
/// Preview opens immediately and auto-plays.
///
/// Analytics: fires Sheet 1 row 115 (`ringtone_selected`) on EVERY card tap
/// (Pro or free — the "intent to play" is the same). Paywall-side events
/// (`paywall_viewed` etc.) belong to the Paywall module (rows 17–26) and are
/// deliberately NOT emitted here.
class RingtoneTapHandler {
  RingtoneTapHandler({
    required bool Function() isPro,
    required Future<void> Function() refreshEntitlement,
    required Future<void> Function() openPaywall,
    required Future<void> Function(RingtonePreviewArgs args) openPreview,
    Analytics? analytics,
  })  : _isPro = isPro,
        _refreshEntitlement = refreshEntitlement,
        _openPaywall = openPaywall,
        _openPreview = openPreview,
        _analytics = analytics;

  final bool Function() _isPro;
  final Future<void> Function() _refreshEntitlement;
  final Future<void> Function() _openPaywall;
  final Future<void> Function(RingtonePreviewArgs args) _openPreview;
  final Analytics? _analytics;

  /// Tap on a ringtone [item] at grid [index] on [sourceScreen]. [selectionSource]
  /// distinguishes home-grid taps from search taps (row 115 `selection_source`
  /// field).
  Future<void> handleCardTap({
    required RingtoneCardItem item,
    required int index,
    String? deityId,
    String sourceScreen = 'ringtone_home',
    String selectionSource = 'listing',
  }) async {
    // Row 115 — `ringtone_selected`. Fires on every tap (Pro or free); the
    // Pro gate below decides where the user goes next.
    unawaited(_analytics?.trackEvent(
      RingtoneEvents.selected,
      properties: {
        RingtoneEventProps.ringtoneId: item.id,
        RingtoneEventProps.ringtoneName: item.title,
        RingtoneEventProps.selectionSource: selectionSource,
        RingtoneEventProps.positionIndex: index,
        RingtoneEventProps.deityId: deityId ?? item.deityId,
      },
    ));

    if (_isPro()) {
      await _openPreview(RingtonePreviewArgs(
        ringtoneId: item.id,
        entrySource: 'card',
        deityId: deityId ?? item.deityId,
        positionIndex: index,
      ));
      return;
    }

    // Free → paywall (Paywall module owns its own funnel events). The Preview
    // never opens; no audio.
    await _openPaywall();

    // Paywall closed → re-read LIVE entitlement (never a cached flag).
    await _refreshEntitlement();
    if (!_isPro()) {
      // Still free after the paywall closed = the user backed out. No Preview.
      return;
    }

    // Post-purchase continuation: auto-open the ORIGINAL ringtone's Preview +
    // auto-play (§5, §subscription_success_continuation).
    await _openPreview(RingtonePreviewArgs(
      ringtoneId: item.id,
      entrySource: 'post_purchase',
      deityId: deityId ?? item.deityId,
      positionIndex: index,
    ));
  }
}
