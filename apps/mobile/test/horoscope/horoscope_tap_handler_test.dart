import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/paywall_gate.dart';
import 'package:mobile/features/horoscope/application/horoscope_tap_handler.dart';
import 'package:mobile/features/horoscope/data/horoscope_models.dart';

import '../support/fake_analytics.dart';

const _taurus = HoroscopeZodiacSign(
  zodiacId: 'taurus',
  displayName: 'Taurus',
  sortOrder: 1,
);

/// Builds a handler over the REAL [PaywallGate] with a scriptable entitlement.
/// `purchaseOnPaywall` flips the live entitlement while the paywall is open —
/// exactly what a successful purchase does.
({
  HoroscopeTapHandler handler,
  List<String> opened,
  RecordingAnalytics analytics,
  int Function() paywallOpens,
}) _build({
  required bool isPro,
  bool purchaseOnPaywall = false,
}) {
  var pro = isPro;
  var paywallOpens = 0;
  final opened = <String>[];
  final analytics = RecordingAnalytics();

  final gate = PaywallGate(
    isPro: () => pro,
    refreshEntitlement: () async {},
  );

  final handler = HoroscopeTapHandler(
    gate: gate,
    locale: 'hi',
    analytics: analytics,
    openPaywall: () async {
      paywallOpens++;
      if (purchaseOnPaywall) pro = true; // the purchase completes
    },
    openResult: (id) async => opened.add(id),
  );

  return (
    handler: handler,
    opened: opened,
    analytics: analytics,
    paywallOpens: () => paywallOpens,
  );
}

void main() {
  group('Pro user', () {
    test('opens the tapped sign directly — no paywall', () async {
      final t = _build(isPro: true);

      final result = await t.handler.handleTap(_taurus);

      expect(result, isTrue);
      expect(t.opened, ['taurus']);
      expect(t.paywallOpens(), 0);
      // Sheet row 103 — `horoscope_sign_selected` fires on every tap.
      expect(t.analytics.names, contains('horoscope_sign_selected'));
    });
  });

  group('Free user', () {
    test('purchase → resumes into the ORIGINALLY-tapped sign', () async {
      final t = _build(isPro: false, purchaseOnPaywall: true);

      final result = await t.handler.handleTap(_taurus);

      expect(result, isTrue);
      expect(t.paywallOpens(), 1);
      // The whole point: they land on Taurus, not back on the grid.
      expect(t.opened, ['taurus']);
      // The sign_selected event still fires — the tap is the intent moment,
      // regardless of what the gate does with it.
      expect(t.analytics.names, contains('horoscope_sign_selected'));
    });

    test('resumes the sign that was tapped, not a later one', () async {
      final t = _build(isPro: false, purchaseOnPaywall: true);
      const pisces = HoroscopeZodiacSign(
        zodiacId: 'pisces',
        displayName: 'Pisces',
        sortOrder: 11,
      );

      await t.handler.handleTap(pisces);

      expect(t.opened, ['pisces']);
      expect(t.analytics.propsFor('horoscope_sign_selected')['zodiac_sign'],
          'pisces');
    });

    test('cancel → back to the grid, nothing opened', () async {
      final t = _build(isPro: false);

      final result = await t.handler.handleTap(_taurus);

      expect(result, isFalse);
      expect(t.paywallOpens(), 1);
      expect(t.opened, isEmpty);
      expect(t.analytics.names, contains('horoscope_sign_selected'));
    });

    test('every tap is reported, and each carries the sign', () async {
      final t = _build(isPro: false);

      await t.handler.handleTap(_taurus);
      await t.handler.handleTap(_taurus);

      expect(t.paywallOpens(), 2, reason: 'a free user is gated on every tap');
      expect(t.analytics.propsFor('horoscope_sign_selected')['zodiac_sign'],
          'taurus');
    });

    test('positionIndex and horoscopeDate ride along on sign_selected (row 103)',
        () async {
      final t = _build(isPro: true);

      await t.handler.handleTap(_taurus,
          positionIndex: 1, horoscopeDate: '2026-06-15');

      final props = t.analytics.propsFor('horoscope_sign_selected');
      expect(props['zodiac_sign'], 'taurus');
      expect(props['position_index'], 1);
      expect(props['horoscope_date'], '2026-06-15');
    });
  });
}
