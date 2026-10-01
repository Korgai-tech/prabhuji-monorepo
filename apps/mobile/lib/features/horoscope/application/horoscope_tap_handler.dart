// Function-typed constructor params can't use initializing formals.
// ignore_for_file: prefer_initializing_formals

import 'dart:async';

import '../../../core/analytics.dart';
import '../../../core/paywall_gate.dart';
import '../data/horoscope_models.dart';
import '../horoscope_analytics.dart';

/// The zodiac tap = the intent moment + post-purchase continuation (TAM-74 §5),
/// factored into a pure, navigation-free controller so it is trivially
/// unit-testable (same shape as TAM-64's `AartiTapHandler`).
///
///  * **Pro** → open the tapped sign's result immediately.
///  * **Free** → open the unified paywall (TAM-53); on a successful purchase
///    (the LIVE entitlement flips after the paywall closes) open the result for
///    the **ORIGINALLY-tapped** sign; on cancel/failure, return to the grid
///    with nothing opened.
///
/// It delegates the run-vs-gate-then-resume decision to the shared TAM-58
/// [PaywallGate] — one correct implementation of continuation for every module.
///
/// The client never renders a result for a free user: even the resumed action
/// re-fetches through the server's Pro gate (a 403 would route back to the
/// paywall, never to a preview).
///
/// ## Analytics scope
/// This handler owns exactly ONE event: Sheet 1 row 103
/// (`horoscope_sign_selected`). The paywall's own funnel events (row 17
/// `paywall_viewed`, row 22 `subscription_activated`, …) belong to the Paywall
/// module (rows 17–26) and are emitted from the paywall bloc, not here.
class HoroscopeTapHandler {
  HoroscopeTapHandler({
    required PaywallGate gate,
    required Future<void> Function() openPaywall,
    required Future<void> Function(String zodiacId) openResult,
    required String locale,
    Analytics? analytics,
  })  : _gate = gate,
        _openPaywall = openPaywall,
        _openResult = openResult,
        _locale = locale,
        _analytics = analytics;

  final PaywallGate _gate;
  final Future<void> Function() _openPaywall;
  final Future<void> Function(String zodiacId) _openResult;
  // ignore: unused_field — retained on the API for future locale-scoped signals.
  final String _locale;
  final Analytics? _analytics;

  /// Handle a tap on [sign]. Returns `true` when a result was opened (directly
  /// as Pro, or resumed after a purchase), `false` when the user cancelled.
  ///
  /// [positionIndex] is the zero-based grid position (Sheet 1 row 103
  /// `position_index`); [horoscopeDate] is the IST civil date rendered on the
  /// grid header (row 103 `horoscope_date`, `YYYY-MM-DD`).
  Future<bool> handleTap(
    HoroscopeZodiacSign sign, {
    int? positionIndex,
    String? horoscopeDate,
  }) async {
    // Sheet 1 row 103 — `horoscope_sign_selected`. Fires on EVERY tap
    // (before the gate) so the funnel captures intent regardless of
    // entitlement outcome.
    unawaited(_analytics?.trackEvent(
      HoroscopeEvents.signSelected,
      properties: {
        HoroscopeProps.zodiacSign: sign.zodiacId,
        HoroscopeProps.positionIndex: positionIndex,
        HoroscopeProps.horoscopeDate: horoscopeDate,
      },
    ));

    final opened = await _gate.run<bool>(
      pending: PendingAction<bool>(
        label: 'open_horoscope_result',
        action: () async {
          await _openResult(sign.zodiacId);
          return true;
        },
      ),
      openPaywall: () async {
        await _openPaywall();
      },
    );

    // null → cancelled/failed: back to the grid, nothing opened (PRD §5).
    return opened == true;
  }
}
