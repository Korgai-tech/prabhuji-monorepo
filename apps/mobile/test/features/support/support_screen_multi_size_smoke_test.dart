import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/secrets.dart';
import 'package:mobile/features/support/support_analytics.dart';

import 'support_screen_harness.dart';

/// Multi-size smoke test for the Support screen (spec TAM-N-support-screen,
/// Figma frame 1939:20185). Pumps the screen at 3 widths × 3 heights plus
/// a textScaleFactor 2.0 variant, asserting NO Flutter layout exception
/// fires (no `RenderFlex overflowed`, no `BoxConstraints has NaN…`).
///
/// Uses `tester.takeException()` — Flutter's idiomatic exception capture.
/// The naive alternative (override `FlutterError.onError`, restore in
/// tearDown, then `expect(errors, isEmpty)`) deadlocks the binding when
/// an exception fires: `expect()` throws while the overridden handler is
/// still active, the binding's own assertion trips, and the whole test
/// hangs for the binding's 10-minute default. Cost measured 2026-08-03:
/// 30 min per `/pre-pr` on 3 legitimately-overflowing sizes.
///
/// Pattern: patterns_library/testing/flutter-multi-size-smoke.md. The card
/// is the exact "Text inside a constrained-width container" case — three
/// text nodes (heading, body, availability) + a 48 dp CTA — so the a11y
/// text-scale variant is mandatory.
void main() {
  const widths = [320.0, 390.0, 428.0];
  const heights = [600.0, 800.0, 1200.0];

  final realSecrets = Secrets.forTest(
    supportWhatsAppNumber: '+911234567890',
    supportWhatsAppMessage: 'Hi Prabhuji team,',
  );

  Future<void> pumpAt(
    WidgetTester tester, {
    required double w,
    required double h,
    double textScale = 1.0,
  }) async {
    tester.platformDispatcher.textScaleFactorTestValue = textScale;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    await pumpSupportScreen(
      tester,
      source: SupportEntrySource.homeHeader,
      secrets: realSecrets,
      viewport: Size(w, h),
    );
  }

  for (final w in widths) {
    for (final h in heights) {
      testWidgets('no layout exception at ${w.toInt()}×${h.toInt()}',
          (tester) async {
        await pumpAt(tester, w: w, h: h);
        final exception = tester.takeException();
        expect(
          exception,
          isNull,
          reason: 'layout exception at ${w.toInt()}×${h.toInt()}: $exception',
        );
      });
    }
  }

  testWidgets('no layout exception at textScale 2.0 (390×800)',
      (tester) async {
    await pumpAt(tester, w: 390, h: 800, textScale: 2.0);
    final exception = tester.takeException();
    expect(
      exception,
      isNull,
      reason: 'layout exception at textScale 2.0 (a11y max): $exception',
    );
  });

  testWidgets('no layout exception at textScale 2.0 on small screen (320×600)',
      (tester) async {
    // Doubly hostile: narrow width + tall text. This is the "small phone with
    // font size maxed" real-world case that a11y users routinely hit.
    await pumpAt(tester, w: 320, h: 600, textScale: 2.0);
    final exception = tester.takeException();
    expect(
      exception,
      isNull,
      reason:
          'layout exception at textScale 2.0 on 320×600 (small phone + max a11y): $exception',
    );
  });
}
