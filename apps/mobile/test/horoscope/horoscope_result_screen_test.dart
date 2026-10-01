import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/horoscope/data/horoscope_models.dart';
import 'package:mobile/features/horoscope/result/bloc/horoscope_result_state.dart';
import 'package:mobile/shared/widgets/app_network_image.dart';

import '../support/fake_horoscope_services.dart';
import '../support/horoscope_harness.dart';

void main() {
  setUp(FakeHoroscopeVideoPort.resetCounters);
  tearDown(FakeHoroscopeVideoPort.resetCounters);

  testWidgets('renders the current backend step: title pill + body', (tester) async {
    await pumpHoroscopeResult(tester, repository: FakeHoroscopeRepository());

    expect(find.text('Namaste'), findsOneWidget);
    expect(find.text('Taurus Horoscope for Today'), findsOneWidget);
    expect(find.byKey(const ValueKey('horoscope-step-title')), findsOneWidget);
    expect(find.byKey(const ValueKey('horoscope-step-text')), findsOneWidget);
  });

  testWidgets('renders the zodiac header + the SERVER date', (tester) async {
    await pumpHoroscopeResult(tester, repository: FakeHoroscopeRepository());

    expect(find.text('Taurus'), findsOneWidget);
    expect(find.text('15 June, 2026'), findsOneWidget);
    expect(find.byKey(const ValueKey('horoscope-result-back')), findsOneWidget);
  });

  testWidgets('walks a BACKEND-defined step list — titles the app never knew',
      (tester) async {
    final repo = FakeHoroscopeRepository(
      daily: horoscopeDailyFixture(steps: [
        horoscopeStepFixture(
            stepId: 'brand_new', order: 0, title: 'A brand new step',
            displayText: 'Configured server-side after ship.'),
        horoscopeStepFixture(
            stepId: 'another', order: 1, title: 'Another new one',
            displayText: 'Also new.'),
      ]),
    );
    await pumpHoroscopeResult(tester, repository: repo);

    expect(find.text('A brand new step'), findsOneWidget);
    expect(find.text('Configured server-side after ship.'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('horoscope-next')));
    await tester.pumpAndSettle();

    expect(find.text('Another new one'), findsOneWidget);
    expect(find.text('Also new.'), findsOneWidget);
  });

  testWidgets('contentType:number renders at the design 32px scale', (tester) async {
    final repo = FakeHoroscopeRepository(
      daily: horoscopeDailyFixture(steps: [
        horoscopeStepFixture(
            stepId: 'lucky_number', order: 0, title: 'Lucky number',
            displayText: '7', contentType: HoroscopeContentType.number),
        horoscopeStepFixture(
            stepId: 'lucky_colour', order: 1, title: 'Lucky colour',
            displayText: 'Sky Blue', contentType: HoroscopeContentType.color),
      ]),
    );
    await pumpHoroscopeResult(tester, repository: repo);

    // Figma node 1162:4276 — the number step's value is 32/500.
    final number = tester.widget<Text>(
      find.byKey(const ValueKey('horoscope-step-text')),
    );
    expect(number.style!.fontSize, 32);

    await tester.tap(find.byKey(const ValueKey('horoscope-next')));
    await tester.pumpAndSettle();

    // ...while `color` stays at the 16/500 body scale (node 1162:4244).
    final colour = tester.widget<Text>(
      find.byKey(const ValueKey('horoscope-step-text')),
    );
    expect(colour.style!.fontSize, 16);
  });

  testWidgets('Next on non-final steps, Finish on the last one', (tester) async {
    final repo = FakeHoroscopeRepository(
      daily: horoscopeDailyFixture(steps: [
        horoscopeStepFixture(stepId: 'a', order: 0),
        horoscopeStepFixture(stepId: 'b', order: 1),
      ]),
    );
    await pumpHoroscopeResult(tester, repository: repo);

    expect(find.text('Next'), findsOneWidget);
    expect(find.text('Finish'), findsNothing);

    await tester.tap(find.byKey(const ValueKey('horoscope-next')));
    await tester.pumpAndSettle();

    expect(find.text('Finish'), findsOneWidget);
    expect(find.text('Next'), findsNothing);
  });

  testWidgets('the TTS control reflects mute state using both Figma variants',
      (tester) async {
    final tts = FakeTtsPort();
    await pumpHoroscopeResult(
      tester,
      repository: FakeHoroscopeRepository(),
      tts: tts,
    );

    String currentTtsAsset() {
      final svg = tester.widget<SvgPicture>(
        find.descendant(
          of: find.byKey(const ValueKey('horoscope-result-tts')),
          matching: find.byType(SvgPicture),
        ),
      );
      return (svg.bytesLoader as SvgAssetLoader).assetName;
    }

    // Unmuted → the `volume` variant (Figma 1173:4507).
    expect(currentTtsAsset(), 'assets/horoscope/tts_volume.svg');

    await tester.tap(find.byKey(const ValueKey('horoscope-result-tts')));
    await tester.pumpAndSettle();

    // Muted → the `muted` variant (Figma 1173:4506) — a real design asset, not
    // an improvised indicator.
    expect(currentTtsAsset(), 'assets/horoscope/tts_muted.svg');
    expect(tts.stopCalls, greaterThanOrEqualTo(1));
  });

  testWidgets('video plays when it initializes', (tester) async {
    await pumpHoroscopeResult(tester, repository: FakeHoroscopeRepository());

    expect(find.byKey(const ValueKey('horoscope-result-video')), findsOneWidget);
    expect(find.byKey(const ValueKey('horoscope-result-fallback')), findsNothing);
  });

  testWidgets('video failure → static fallback; text + Next still work',
      (tester) async {
    FakeHoroscopeVideoPort.failNext = true;
    // Empty CMS URL → AppNetworkImage resolves to its fallback with no network
    // and no shimmer (the repo's widget-test convention).
    final bloc = await pumpHoroscopeResult(
      tester,
      repository: FakeHoroscopeRepository(
        daily: horoscopeDailyFixture(fallbackImageUrl: ''),
      ),
    );

    expect(find.byKey(const ValueKey('horoscope-result-video')), findsNothing);
    expect(find.byKey(const ValueKey('horoscope-result-fallback')), findsOneWidget);
    expect(bloc.state.videoFallback, isTrue);

    // The flow never blocks on video (PRD §6.4).
    expect(find.byKey(const ValueKey('horoscope-step-text')), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('horoscope-next')));
    await tester.pumpAndSettle();
    expect(bloc.state.index, 1);
  });

  testWidgets("the fallback is wired to the contract's CMS still URL",
      (tester) async {
    FakeHoroscopeVideoPort.failNext = true;
    await pumpHoroscopeResult(
      tester,
      repository: FakeHoroscopeRepository(
        daily: horoscopeDailyFixture(
          fallbackImageUrl: 'https://cdn.example.com/horoscope/custom.jpg',
        ),
      ),
      // A real URL leaves AppNetworkImage shimmering forever — assert the
      // wiring, don't wait for a load that must never happen in a test.
      settle: false,
    );

    // The CMS-configured still is tried BEFORE the bundled last resort.
    final image = tester.widget<AppNetworkImage>(
      find.byKey(const ValueKey('horoscope-result-fallback')),
    );
    expect(image.url, 'https://cdn.example.com/horoscope/custom.jpg');
  });

  testWidgets('an empty fallback URL still shows the bundled Figma still',
      (tester) async {
    FakeHoroscopeVideoPort.failNext = true;
    await pumpHoroscopeResult(
      tester,
      repository: FakeHoroscopeRepository(
        daily: horoscopeDailyFixture(fallbackImageUrl: ''),
      ),
    );

    // Offline last resort: never a blank void behind the text.
    expect(
      find.byKey(const ValueKey('horoscope-result-bundled-still')),
      findsOneWidget,
    );
  });

  testWidgets('the video port is released when the flow exits', (tester) async {
    await pumpHoroscopeResult(tester, repository: FakeHoroscopeRepository());
    expect(FakeHoroscopeVideoPort.initializeCalls, 1);

    await tester.pumpWidget(const SizedBox());
    await tester.pumpAndSettle();

    expect(FakeHoroscopeVideoPort.disposeCalls, greaterThanOrEqualTo(1));
  });

  testWidgets('empty-config → friendly error + Retry, keeping zodiac context',
      (tester) async {
    final repo = FakeHoroscopeRepository(
      dailyError: const HoroscopeException(HoroscopeErrorKind.emptyConfig),
    );
    final bloc = await pumpHoroscopeResult(tester, repository: repo);

    expect(bloc.state.status, HoroscopeResultStatus.emptyConfig);
    expect(find.byKey(const ValueKey('horoscope-error')), findsOneWidget);
    // Context is preserved (AC).
    expect(find.text('Taurus'), findsOneWidget);

    repo.dailyError = null;
    await tester.tap(find.byKey(const ValueKey('horoscope-retry')));
    await tester.pumpAndSettle();

    expect(bloc.state.status, HoroscopeResultStatus.ready);
    expect(find.text('Namaste'), findsOneWidget);
  });

  testWidgets('unsupported TTS language shows text and disables the control',
      (tester) async {
    final tts = FakeTtsPort(languageAvailable: false);
    await pumpHoroscopeResult(
      tester,
      repository: FakeHoroscopeRepository(),
      tts: tts,
    );

    // Text is fully readable...
    expect(find.text('Taurus Horoscope for Today'), findsOneWidget);
    expect(find.byKey(const ValueKey('horoscope-next')), findsOneWidget);
    // ...narration is simply skipped.
    expect(tts.spoken, isEmpty);
  });

  testWidgets('the result screen renders NO bottom nav (it pushes over the shell)',
      (tester) async {
    await pumpHoroscopeResult(tester, repository: FakeHoroscopeRepository());

    expect(find.byType(NavigationBar), findsNothing);
    expect(find.byType(BottomNavigationBar), findsNothing);
  });

  testWidgets('the card art is the bundled Figma SVG', (tester) async {
    await pumpHoroscopeResult(tester, repository: FakeHoroscopeRepository());

    final svg = tester.widget<SvgPicture>(
      find.byKey(const ValueKey('horoscope-card-art')),
    );
    expect(
      (svg.bytesLoader as SvgAssetLoader).assetName,
      'assets/horoscope/result_card_frame.svg',
    );
  });
}
