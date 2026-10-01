@Tags(['golden'])
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/horoscope/data/horoscope_models.dart';
import 'package:mobile/features/horoscope/main/presentation/horoscope_main_screen.dart';
import 'package:mobile/features/horoscope/result/presentation/horoscope_result_screen.dart';

import '../support/fake_horoscope_services.dart';
import '../support/horoscope_harness.dart';

/// Component goldens for the Horoscope module (TAM-60 Phase 6). Rendered
/// headlessly at the Figma frame size (360×800) and reviewed side-by-side with
/// the frame exports under `specs/evidence/TAM-74/fidelity/figma-refs/`. Tagged
/// `golden` so the cross-platform gate (`--exclude-tags golden`) skips them;
/// refresh locally with
/// `flutter test --update-goldens test/goldens/horoscope_golden_test.dart`.
///
/// The result goldens run on the **static-fallback** path: a golden must never
/// touch the network or a real codec, so the fake video port fails and the empty
/// CMS URL resolves to the bundled Figma still — which is exactly what the Figma
/// frame shows (its backdrop is that same still). Everything else on screen is
/// the real thing: real theme, real Figma assets, real geometry.
void main() {
  setUp(FakeHoroscopeVideoPort.resetCounters);
  tearDown(FakeHoroscopeVideoPort.resetCounters);

  testWidgets('golden: horoscope main — zodiac grid (371:3796)', (tester) async {
    await pumpHoroscopeMain(
      tester,
      repository: FakeHoroscopeRepository(),
      now: DateTime.utc(2026, 6, 15, 4),
      viewportHeight: 800,
    );
    await _settleFonts(tester);

    await expectLater(
      find.byType(HoroscopeMainScreen),
      matchesGoldenFile('horoscope_main.png'),
    );
  });

  testWidgets('golden: horoscope result — text step (387:2571)', (tester) async {
    FakeHoroscopeVideoPort.failNext = true;
    await _pumpResult(
      tester,
      steps: [
        horoscopeStepFixture(
          stepId: 'good_time',
          order: 0,
          title: 'A good time today',
          displayText:
              'This is a day of progress and success at work. Your ideas and '
              'plans will receive praise. Success is likely on an important project.',
        ),
        horoscopeStepFixture(stepId: 'next_one', order: 1),
      ],
    );

    await expectLater(
      find.byType(HoroscopeResultScreen),
      matchesGoldenFile('horoscope_result.png'),
    );
  });

  testWidgets('golden: horoscope result — number step + Finish (392:2545/392:2628)',
      (tester) async {
    FakeHoroscopeVideoPort.failNext = true;
    // The final enabled step → the CTA reads "Finish"; contentType `number`
    // renders its value at the design's 32px scale (node 1162:4276).
    await _pumpResult(
      tester,
      steps: [
        horoscopeStepFixture(
          stepId: 'lucky_number',
          order: 0,
          title: 'Lucky number',
          displayText: '7',
          contentType: HoroscopeContentType.number,
        ),
      ],
    );

    await expectLater(
      find.byType(HoroscopeResultScreen),
      matchesGoldenFile('horoscope_result_number_finish.png'),
    );
  });
}

Future<void> _pumpResult(
  WidgetTester tester, {
  required List<HoroscopeStep> steps,
}) async {
  await pumpHoroscopeResult(
    tester,
    repository: FakeHoroscopeRepository(
      daily: horoscopeDailyFixture(steps: steps, fallbackImageUrl: ''),
    ),
  );
  await _settleFonts(tester, precacheImages: true);
}

/// Let real async I/O finish before the golden is captured.
///
/// Two separate traps, both fixed by giving the event loop a real turn inside
/// `runAsync`:
///  * **Fonts** — `GoogleFonts` loads the bundled Inter TTF asynchronously and
///    calls `handleFontsChange` when it lands. A fake-async `pumpAndSettle`
///    never lets that future complete, so text rasterizes with the Ahem test
///    font — the classic "every glyph is a black box" golden.
///  * **Images** — image decode is real I/O; without a precache the bundled
///    still renders blank (skill trap: "Blank art in goldens").
Future<void> _settleFonts(
  WidgetTester tester, {
  bool precacheImages = false,
}) async {
  await tester.runAsync(() async {
    if (precacheImages) {
      for (final el in find.byType(Image).evaluate()) {
        await precacheImage((el.widget as Image).image, el);
      }
    }
    // Yield so any in-flight font load resolves and marks the text dirty.
    await Future<void>.delayed(const Duration(milliseconds: 100));
  });
  await tester.pumpAndSettle();
}
