import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/aarti/data/aarti_models.dart';

import '../support/aarti_harness.dart';
import '../support/fake_repositories.dart';

void main() {
  testWidgets('main page renders the five sections in order', (tester) async {
    await pumpAartiMain(tester, repository: FakeAartiRepository());

    expect(find.byKey(const Key('aarti-nav-title')), findsOneWidget);
    expect(find.text('Aarti & Bhajans'), findsOneWidget);
    for (final key in const [
      'aarti-section-recentlyPlayed',
      'aarti-section-deities',
      'aarti-section-browseCategories',
      'aarti-section-newlyAdded',
      'aarti-section-mostPlayed',
    ]) {
      expect(find.byKey(Key(key)), findsOneWidget, reason: key);
    }
  });

  testWidgets('section headers render the SERVER title, not bundled copy',
      (tester) async {
    // Copy the app has never contained: if it renders, the headings are the
    // server's `section.title` (the client used to hardcode 'Recently Played' /
    // 'Newly Added' / 'Most Played on Prabhuji').
    await pumpAartiMain(
      tester,
      repository: FakeAartiRepository(
        sections: aartiSectionFixtures(
          recentlyPlayedTitle: 'Abhi Suna',
          newlyAddedTitle: 'Naye Bhajan',
          mostPlayedTitle: 'Sabse Zyada Sune Gaye',
        ),
      ),
    );

    expect(find.text('Abhi Suna'), findsOneWidget);
    expect(find.text('Naye Bhajan'), findsOneWidget);
    expect(find.text('Sabse Zyada Sune Gaye'), findsOneWidget);
    expect(find.text('Recently Played'), findsNothing);
    expect(find.text('Most Played on Prabhuji'), findsNothing);
  });

  testWidgets("Show all carries the section's SERVER title into the listing",
      (tester) async {
    // The listing titles itself from the query the section hands it, so this
    // asserts the handoff: the query's title must be `section.title`, not one of
    // the three strings the screen used to hardcode.
    final repository = FakeAartiRepository(
      sections: aartiSectionFixtures(
        recentlyPlayedTitle: 'Abhi Suna',
        newlyAddedTitle: 'Naye Bhajan',
        mostPlayedTitle: 'Sabse Zyada Sune Gaye',
      ),
    );

    for (final probe in const [
      ('aarti-showall-recentlyPlayed', 'Abhi Suna'),
      ('aarti-showall-newlyAdded', 'Naye Bhajan'),
      ('aarti-showall-mostPlayed', 'Sabse Zyada Sune Gaye'),
    ]) {
      final pushed = <AartiListQuery>[];
      await pumpAartiMainWithRouter(
        tester,
        repository: repository,
        onListingPushed: pushed.add,
      );

      await tester.tap(find.byKey(Key(probe.$1)));
      await tester.pumpAndSettle();

      expect(pushed.single.title, probe.$2, reason: probe.$1);
    }
  });

  testWidgets('Recently Played is hidden when the server omits it', (tester) async {
    await pumpAartiMain(
      tester,
      repository: FakeAartiRepository(
        sections: aartiSectionFixtures(withRecentlyPlayed: false),
      ),
    );
    expect(find.byKey(const Key('aarti-section-recentlyPlayed')), findsNothing);
    expect(find.byKey(const Key('aarti-section-mostPlayed')), findsOneWidget);
  });

  testWidgets('audio, category and deity cards render (un-badged discovery)',
      (tester) async {
    await pumpAartiMain(tester, repository: FakeAartiRepository());

    // Audio cards (Recently Played seeds r0/r1).
    expect(find.byKey(const Key('aarti-audio-card-r0')), findsOneWidget);
    // Category tiles (Browse Categories seeds c1/c2).
    expect(find.byKey(const Key('aarti-category-c1')), findsOneWidget);
    // Deity chips via the shared DeityFilterRow.
    expect(find.byKey(const Key('deity-chip-ganesh')), findsOneWidget);

    // Discovery is free — no lock/Pro chrome anywhere on the browse surface.
    expect(find.textContaining('Pro'), findsNothing);
    expect(find.byIcon(Icons.lock), findsNothing);
  });

  testWidgets('failure shows retry state (nav visible, no paywall)',
      (tester) async {
    await pumpAartiMain(tester, repository: FakeAartiRepository(failMain: true));
    expect(find.byKey(const Key('aarti-main-error')), findsOneWidget);
    expect(find.byKey(const Key('aarti-main-retry')), findsOneWidget);
    expect(find.text('Aarti & Bhajans'), findsOneWidget); // nav still visible
  });
}
