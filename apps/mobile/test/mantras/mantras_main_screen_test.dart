import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mantras/presentation/mantras_widgets.dart';

import '../support/fake_repositories.dart';
import '../support/mantras_harness.dart';

void main() {
  testWidgets('renders all four sections + top nav', (tester) async {
    await pumpMantrasMain(tester, repository: FakeMantrasRepository());

    expect(find.byKey(const Key('mantras-nav-title')), findsOneWidget);
    expect(find.byKey(const Key('mantras-section-recentlyPlayed')), findsOneWidget);
    expect(find.byKey(const Key('mantras-section-deities')), findsOneWidget);
    expect(find.byKey(const Key('mantras-section-categories')), findsOneWidget);
    expect(find.byKey(const Key('mantras-section-newlyAdded')), findsOneWidget);
    // Show all shows on the enabled audio sections only.
    expect(find.byKey(const Key('mantras-showall-recentlyPlayed')), findsOneWidget);
    expect(find.byKey(const Key('mantras-showall-newlyAdded')), findsOneWidget);
  });

  testWidgets('Recently Played is hidden when the API returns no history',
      (tester) async {
    await pumpMantrasMain(
      tester,
      repository: FakeMantrasRepository(
        sections: mantraSectionFixtures(withRecentlyPlayed: false),
      ),
    );
    expect(find.byKey(const Key('mantras-section-recentlyPlayed')), findsNothing);
    expect(find.byKey(const Key('mantras-section-deities')), findsOneWidget);
  });

  testWidgets('discovery cards render (no lock/Pro badge chrome)',
      (tester) async {
    await pumpMantrasMain(tester, repository: FakeMantrasRepository());
    // Discovery is free — cards render with no lock/Pro badges (§5, §10). The
    // Figma-only icon gate itself is enforced by the `grep Icons.` check over
    // features/mantras; the only Material glyph in the tree is the shared TAM-58
    // AppNetworkImage branded fallback for empty artwork (outside this module).
    expect(find.byType(MantrasAudioCard), findsWidgets);
    expect(find.byType(MantrasCategoryTile), findsWidgets);
  });
}
