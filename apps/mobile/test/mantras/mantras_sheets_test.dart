import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile/core/theme.dart';
import 'package:mobile/features/mantras/presentation/mantras_bottom_sheets.dart';

import '../support/fake_repositories.dart';

Widget _host(void Function(BuildContext) onPressed) {
  GoogleFonts.config.allowRuntimeFetching = false;
  return MaterialApp(
    theme: AppTheme.light(),
    home: Scaffold(
      body: Builder(
        builder: (context) => Center(
          child: ElevatedButton(
            onPressed: () => onPressed(context),
            child: const Text('open'),
          ),
        ),
      ),
    ),
  );
}

void main() {
  testWidgets('counter sheet: tapping a radio saves + closes; NO Continue button',
      (tester) async {
    int? picked;
    await tester.pumpWidget(_host((context) async {
      picked = await showMantrasCounterSheet(
        context,
        currentTarget: 7,
        // The SERVER's `availableTargets` — the sheet renders this list.
        targets: const [7, 11, 21, 108, 1008],
      );
    }));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    // All five options present; no Continue button, no stray helper copy.
    for (final t in const [7, 11, 21, 108, 1008]) {
      expect(find.byKey(Key('mantras-counter-option-$t')), findsOneWidget);
    }
    expect(find.text('Continue'), findsNothing);
    expect(find.textContaining('Reporting is private'), findsNothing);

    await tester.tap(find.byKey(const Key('mantras-counter-option-21')));
    await tester.pumpAndSettle();

    // Save-on-tap: the sheet closed and returned the chosen target.
    expect(find.byKey(const Key('mantras-counter-sheet')), findsNothing);
    expect(picked, 21);
  });

  testWidgets('counter sheet renders the SERVER option list, not a bundled one',
      (tester) async {
    // A list the app has never shipped: if the sheet renders these and ONLY
    // these, the options are genuinely coming from `availableTargets`.
    await tester.pumpWidget(_host((context) async {
      await showMantrasCounterSheet(
        context,
        currentTarget: 5,
        targets: const [3, 5, 9],
      );
    }));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    for (final t in const [3, 5, 9]) {
      expect(find.byKey(Key('mantras-counter-option-$t')), findsOneWidget);
    }
    // None of the old hardcoded `RepeatCounter.options` leaks through.
    for (final t in const [7, 11, 21, 108, 1008]) {
      expect(find.byKey(Key('mantras-counter-option-$t')), findsNothing);
    }
  });

  testWidgets('counter sheet with no server options offers nothing (never a '
      'made-up list)', (tester) async {
    await tester.pumpWidget(_host((context) async {
      await showMantrasCounterSheet(
        context,
        currentTarget: 7,
        targets: const [],
      );
    }));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('mantras-counter-sheet')), findsOneWidget);
    for (final t in const [7, 11, 21, 108, 1008]) {
      expect(find.byKey(Key('mantras-counter-option-$t')), findsNothing);
    }
  });

  testWidgets('playlist sheet: shows thumbnail/title/singer, tap returns index',
      (tester) async {
    final items = List.generate(3, (i) => mantraAudioFixture('m$i'));
    int? picked;
    await tester.pumpWidget(_host((context) async {
      picked = await showMantrasPlaylistSheet(
        context,
        items: items,
        currentIndex: 0,
      );
    }));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('mantras-playlist-sheet')), findsOneWidget);
    for (final a in items) {
      expect(find.byKey(Key('mantras-playlist-item-${a.id}')), findsOneWidget);
    }

    await tester.tap(find.byKey(const Key('mantras-playlist-item-m2')));
    await tester.pumpAndSettle();
    expect(picked, 2);
  });
}
