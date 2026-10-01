import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/ringtone/presentation/ringtone_widgets.dart';

import '../support/fake_repositories.dart';
import '../support/ringtone_harness.dart';

void main() {
  testWidgets('renders the search field with NO mic icon (Phase 1)', (tester) async {
    await pumpRingtoneHome(tester, repository: FakeRingtoneRepository());
    // Search field present with the "Search Ringtones" placeholder.
    expect(find.byKey(const Key('ringtone-search-field')), findsOneWidget);
    expect(find.text('Search Ringtones'), findsOneWidget);
    // No mic glyph asset is wired anywhere on the screen.
    final micFinder = find.byWidgetPredicate((w) {
      return w.runtimeType.toString().contains('Mic') ||
          (w.key is ValueKey &&
              (w.key as ValueKey).value.toString().contains('mic'));
    });
    expect(micFinder, findsNothing);
  });

  testWidgets('renders the 3-column grid of cards with orange border + counts',
      (tester) async {
    await pumpRingtoneHome(tester, repository: FakeRingtoneRepository(pageSize: 6));
    expect(find.byKey(const Key('ringtone-grid')), findsOneWidget);
    expect(find.byKey(const Key('ringtone-card-rt0')), findsOneWidget);

    // Whole card is one tap target: the keyed card widget is itself a
    // GestureDetector (not just the play glyph).
    expect(
      find.byWidgetPredicate((w) =>
          w is GestureDetector &&
          w.key == const Key('ringtone-card-rt0') &&
          w.onTap != null),
      findsOneWidget,
    );
    // Play overlay present on the card.
    expect(find.byKey(const Key('ringtone-card-play-overlay')), findsWidgets);
    // No lock/Pro badge text anywhere.
    expect(find.textContaining('Pro'), findsNothing);
  });

  testWidgets('card renders Indian compact counts (k/L)', (tester) async {
    await pumpRingtoneHome(
      tester,
      repository: FakeRingtoneRepository(
        grid: [ringtoneCardFixture('rt0', play: 580000, set: 150000)],
      ),
    );
    expect(find.text('5.8L'), findsOneWidget); // 580000 plays
    expect(find.text('1.5L'), findsOneWidget); // 150000 sets
  });

  testWidgets('empty grid → "No ringtones found"', (tester) async {
    await pumpRingtoneHome(
      tester,
      repository: FakeRingtoneRepository(grid: const []),
    );
    expect(find.byKey(const Key('ringtone-home-empty')), findsOneWidget);
    expect(find.text('No ringtones found'), findsOneWidget);
  });

  testWidgets('CMS error → error copy + Retry', (tester) async {
    await pumpRingtoneHome(
      tester,
      repository: FakeRingtoneRepository(failGrid: true),
    );
    expect(find.byKey(const Key('ringtone-home-error')), findsOneWidget);
    expect(find.text("Couldn't load ringtones."), findsOneWidget);
    expect(find.byKey(const Key('ringtone-home-retry')), findsOneWidget);
  });

  testWidgets('deity filter row renders with All Gods default', (tester) async {
    await pumpRingtoneHome(tester, repository: FakeRingtoneRepository());
    expect(find.byKey(const Key('deity-filter-row')), findsOneWidget);
    expect(find.byKey(const Key('deity-chip-all')), findsOneWidget);
  });

  testWidgets('RingtoneMessageState renders the message', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: RingtoneMessageState(
            stateKey: Key('m'),
            message: 'No results found',
          ),
        ),
      ),
    );
    expect(find.text('No results found'), findsOneWidget);
  });
}
