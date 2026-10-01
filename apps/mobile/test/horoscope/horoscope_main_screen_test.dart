import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/horoscope/data/horoscope_models.dart';
import 'package:mobile/features/horoscope/main/bloc/horoscope_main_state.dart';
import 'package:mobile/features/horoscope/presentation/horoscope_widgets.dart';

import '../support/fake_horoscope_services.dart';
import '../support/horoscope_harness.dart';

void main() {
  testWidgets('renders all 12 zodiac cards in a 3-column grid', (tester) async {
    await pumpHoroscopeMain(tester, repository: FakeHoroscopeRepository());

    expect(find.byType(ZodiacCard), findsNWidgets(12));
    for (final sign in horoscopeSignsFixture()) {
      expect(
        find.byKey(ValueKey('horoscope-zodiac-${sign.zodiacId}')),
        findsOneWidget,
        reason: '${sign.zodiacId} card must render',
      );
    }

    final grid = tester.widget<GridView>(find.byType(GridView));
    final delegate =
        grid.gridDelegate as SliverGridDelegateWithFixedCrossAxisCount;
    expect(delegate.crossAxisCount, 3);
  });

  testWidgets('renders the title and the IST date', (tester) async {
    await pumpHoroscopeMain(
      tester,
      repository: FakeHoroscopeRepository(),
      now: DateTime.utc(2026, 6, 15, 4),
    );

    expect(find.text("Today's Horoscope"), findsOneWidget);
    expect(find.text('15 June, 2026'), findsOneWidget);
  });

  testWidgets('renders Sagittarius/Capricorn — never the Figma typos',
      (tester) async {
    await pumpHoroscopeMain(tester, repository: FakeHoroscopeRepository());

    expect(find.text('Sagittarius'), findsOneWidget);
    expect(find.text('Capricorn'), findsOneWidget);
    expect(find.text('Saittarius'), findsNothing);
    expect(find.text('Capricon'), findsNothing);
  });

  testWidgets('shows NO lock badge or Pro label for a free user (PRD §5)',
      (tester) async {
    await pumpHoroscopeMain(
      tester,
      repository: FakeHoroscopeRepository(),
      isPro: false,
    );

    // The grid is identical for free users — 12 clean cards.
    expect(find.byType(ZodiacCard), findsNWidgets(12));
    expect(find.textContaining('Pro', findRichText: true), findsNothing);
    expect(find.textContaining('VIP', findRichText: true), findsNothing);
    expect(find.byIcon(Icons.lock), findsNothing);
    expect(find.byIcon(Icons.lock_outline), findsNothing);
  });

  testWidgets('does not open the paywall on load for a free user',
      (tester) async {
    final repo = FakeHoroscopeRepository();
    await pumpHoroscopeMain(tester, repository: repo, isPro: false);

    // Entry is FREE: only the signs endpoint is touched, never /daily.
    expect(repo.fetchSignsCalls, 1);
    expect(repo.fetchDailyCalls, 0);
  });

  testWidgets('error → friendly message + Retry re-fetches', (tester) async {
    final repo = FakeHoroscopeRepository(
      signsError: const HoroscopeException(HoroscopeErrorKind.unknown),
    );
    final bloc = await pumpHoroscopeMain(tester, repository: repo);

    expect(find.byKey(const ValueKey('horoscope-error')), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);

    repo.signsError = null;
    await tester.tap(find.byKey(const ValueKey('horoscope-retry')));
    await tester.pumpAndSettle();

    expect(bloc.state.status, HoroscopeMainStatus.ready);
    expect(find.byType(ZodiacCard), findsNWidgets(12));
  });

  testWidgets('zodiac glyphs are bundled Figma assets, not network images',
      (tester) async {
    await pumpHoroscopeMain(tester, repository: FakeHoroscopeRepository());

    // The API's iconAssetUrl is a placeholder — the grid must never fetch it.
    expect(find.byType(ZodiacGlyph), findsNWidgets(12));
    expect(find.byType(Image), findsNothing);
  });

  test('every contract zodiac id maps to a bundled glyph', () {
    for (final sign in horoscopeSignsFixture()) {
      expect(
        zodiacGlyphAsset(sign.zodiacId),
        'assets/horoscope/zodiac_${sign.zodiacId}.svg',
        reason: 'no bundled Figma glyph for ${sign.zodiacId}',
      );
    }
    // An id outside the contract enum renders no glyph rather than a wrong one.
    expect(zodiacGlyphAsset('ophiuchus'), isNull);
  });
}
