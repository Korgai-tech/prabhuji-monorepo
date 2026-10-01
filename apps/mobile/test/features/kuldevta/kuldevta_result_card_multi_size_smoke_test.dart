import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile/features/kuldevta/domain/kuldevta_result.dart';
import 'package:mobile/features/kuldevta/presentation/widgets/kuldevta_result_card.dart';

import '../../support/kuldevta_harness.dart';

/// Multi-size smoke for the result card OVERLAY (TAM-177, Figma
/// `3975:24204`) — `patterns_library/testing/flutter-multi-size-smoke.md`.
///
/// Pumps the card at 3 widths × 3 heights plus a `textScaleFactorTestValue
/// = 2.0` variant and asserts NO Flutter layout exception fires. The trap
/// this exists for: the card's own content (artwork + name plate + N
/// reason cards + CTA) does not fit a 600 dp viewport, so it MUST scroll
/// internally with the CTA pinned to the card — a plain `Column` would
/// overflow, and a rigid `height:` on the CTA would overflow again the
/// moment the user raises their font size.
///
/// Both deity variants are swept because they take different artwork
/// branches: `sampleKuldevtaDevi()` has an `imageUrl` (CachedNetworkImage
/// + sun-ray placeholder) and three reasons; `sampleKuldevtaDevta()` has
/// `imageUrl == null` (sun-ray fallback, taller aspect) and one reason.
void main() {
  const widths = <double>[320, 390, 428];
  const heights = <double>[600, 800, 1200];

  setUp(() {
    // AppText goes through GoogleFonts.getFont — without this the pump
    // tries a runtime font fetch and throws under `flutter test`.
    GoogleFonts.config.allowRuntimeFetching = false;
  });

  Future<void> pumpCard(WidgetTester tester, KuldevtaResult result) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          // Mirrors the real mount: a Stack sibling ABOVE the chat
          // screen's Column, so the overlay is handed the full body box.
          body: Stack(
            children: <Widget>[
              const SizedBox.expand(),
              KuldevtaResultCard(
                result: result,
                onChatPressed: () {},
                onSharePressed: () {},
                onDismiss: () {},
              ),
            ],
          ),
        ),
      ),
    );
    await tester.pump();
  }

  final variants = <String, KuldevtaResult Function()>{
    'devi w/ image (3 reasons)': sampleKuldevtaDevi,
    'devta w/o image (1 reason)': sampleKuldevtaDevta,
  };

  variants.forEach((label, build) {
    group('KuldevtaResultCard — $label', () {
      for (final w in widths) {
        for (final h in heights) {
          testWidgets(
              'no layout exception @ ${w.toInt()}×${h.toInt()}',
              (tester) async {
            pinPhoneSize(tester, width: w, height: h);
            await pumpCard(tester, build());

            expect(
              tester.takeException(),
              isNull,
              reason: 'result card overflowed at ${w.toInt()}×${h.toInt()} '
                  '($label) — the card body must scroll internally and the '
                  'CTA must pin to the card, not the screen',
            );
          });
        }
      }

      // The literal-Figma-height-around-scalable-text trap. 320×600 is the
      // harshest combination in the sweep: shortest viewport, narrowest
      // width, every label at double size.
      for (final size in const <Size>[Size(320, 600), Size(390, 800)]) {
        testWidgets(
            'no layout exception @ ${size.width.toInt()}×'
            '${size.height.toInt()} × textScale 2.0', (tester) async {
          pinPhoneSize(tester, width: size.width, height: size.height);
          tester.platformDispatcher.textScaleFactorTestValue = 2.0;
          addTearDown(
            tester.platformDispatcher.clearTextScaleFactorTestValue,
          );

          await pumpCard(tester, build());

          expect(
            tester.takeException(),
            isNull,
            reason: 'result card overflowed at textScale 2.0 ($label) — no '
                'rigid height may wrap scalable text',
          );
        });
      }
    });
  });
}
