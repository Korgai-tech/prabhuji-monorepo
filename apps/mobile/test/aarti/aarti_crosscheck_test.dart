import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/aarti/data/aarti_models.dart';

import '../support/aarti_harness.dart';
import '../support/fake_repositories.dart';
import '../support/figma_crosscheck.dart';
import '../support/golden_harness.dart';

/// Render-tree ↔ Figma node-tree cross-check (TAM-60) for the Aarti module. Pumps
/// each screen, sweeps its stable keys, diffs them against the Figma frame's
/// children, and writes the combined `cross-check.md` evidence. Asserts nothing
/// the design requires is missing (spec-authorized divergences aside).
void main() {
  testWidgets('cross-check: main page, listing and player vs Figma', (tester) async {
    final buffer = StringBuffer();

    // --- Main page (412:2656) ------------------------------------------------
    await pumpAartiMain(tester, repository: FakeAartiRepository());
    final mainKeys = [
      ...renderedKeys(tester, 'aarti-'),
      ...renderedKeys(tester, 'deity-'),
    ];
    final mainMd = renderCrossCheckMarkdown(
      ticket: 'TAM-64',
      figmaNode: '412:2656',
      screen: 'Aarti & Bhajans — main page',
      renderedComponents: mainKeys,
      intentional: const [
        'nav-trailing-gear',
        'nav-trailing-phone',
        'nav-trailing-pencil',
      ],
      rows: const [
        CrossCheckRow(figmaNode: 'Basic Nav → Leading Icon (back)', component: 'aarti-nav-back'),
        CrossCheckRow(figmaNode: 'Basic Nav → Title "Aarti & Bhajans"', component: 'aarti-nav-title'),
        CrossCheckRow(figmaNode: 'Header "Recently Played"', component: 'aarti-section-recentlyPlayed'),
        CrossCheckRow(figmaNode: 'Recently Played → Show all', component: 'aarti-showall-recentlyPlayed'),
        CrossCheckRow(figmaNode: 'Header "Deities" (Thumbnails)', component: 'aarti-section-deities'),
        CrossCheckRow(figmaNode: 'Deities → Dieties row', component: 'deity-filter-row'),
        CrossCheckRow(figmaNode: 'Categories "Browse Categories"', component: 'aarti-section-browseCategories'),
        CrossCheckRow(figmaNode: 'Header "Newly Added"', component: 'aarti-section-newlyAdded'),
        CrossCheckRow(figmaNode: 'Newly Added → Show all', component: 'aarti-showall-newlyAdded'),
        CrossCheckRow(figmaNode: 'Header "Most Played on Prabhuji"', component: 'aarti-section-mostPlayed'),
        CrossCheckRow(figmaNode: 'Most Played → Show all', component: 'aarti-showall-mostPlayed'),
        CrossCheckRow(
          figmaNode: 'Basic Nav → Trailing Icon 3 (Gear)',
          component: 'nav-trailing-gear',
          notes: 'Intentional: present in Figma JSON but NOT rendered (PRD §6.1 note 8).',
        ),
        CrossCheckRow(
          figmaNode: 'Basic Nav → Trailing Icon 2 (Phone)',
          component: 'nav-trailing-phone',
          notes: 'Intentional: not rendered (PRD §6.1 note 8).',
        ),
        CrossCheckRow(
          figmaNode: 'Basic Nav → Trailing Icon 1 (pencil)',
          component: 'nav-trailing-pencil',
          notes: 'Intentional: not rendered (PRD §6.1 note 8).',
        ),
      ],
    );
    expect(crossCheck(
      figmaComponents: const [
        'aarti-nav-back', 'aarti-nav-title', 'aarti-section-recentlyPlayed',
        'aarti-showall-recentlyPlayed', 'aarti-section-deities', 'deity-filter-row',
        'aarti-section-browseCategories', 'aarti-section-newlyAdded',
        'aarti-showall-newlyAdded', 'aarti-section-mostPlayed', 'aarti-showall-mostPlayed',
      ],
      renderedComponents: mainKeys,
    ).ok, isTrue);
    buffer.writeln(mainMd);
    buffer.writeln('\n---\n');

    // --- Listing (420:2909) --------------------------------------------------
    await tester.pumpWidget(const SizedBox());
    await pumpAartiListing(
      tester,
      repository: FakeAartiRepository(),
      query: const AartiListQuery(title: 'Aarti', sourceListType: 'category', categoryId: 'c1'),
    );
    final listingKeys = renderedKeys(tester, 'aarti-');
    final listingMd = renderCrossCheckMarkdown(
      ticket: 'TAM-64',
      figmaNode: '420:2909',
      screen: 'Aarti & Bhajans — 2-column listing',
      renderedComponents: listingKeys,
      intentional: const ['nav-trailing-gear', 'nav-trailing-phone', 'nav-trailing-pencil'],
      rows: const [
        CrossCheckRow(figmaNode: 'Basic Nav → Leading Icon (back)', component: 'aarti-nav-back'),
        CrossCheckRow(figmaNode: 'Basic Nav → Title (dynamic)', component: 'aarti-nav-title'),
        CrossCheckRow(figmaNode: 'Frame 2147227417 (2-col grid)', component: 'aarti-listing-grid'),
        CrossCheckRow(figmaNode: 'Frame 159×190 (audio card)', component: 'aarti-grid-card-a0'),
        CrossCheckRow(
          figmaNode: 'Basic Nav → Trailing Icons',
          component: 'nav-trailing-gear',
          notes: 'Intentional: not rendered (PRD §6.1 note 8).',
        ),
      ],
    );
    expect(crossCheck(
      figmaComponents: const [
        'aarti-nav-back', 'aarti-nav-title', 'aarti-listing-grid', 'aarti-grid-card-a0',
      ],
      renderedComponents: listingKeys,
    ).ok, isTrue);
    buffer.writeln(listingMd);
    buffer.writeln('\n---\n');

    // --- Player (423:4387 + controls 423:4384) -------------------------------
    await tester.pumpWidget(const SizedBox());
    await pumpAartiPlayer(
      tester,
      repository: FakeAartiRepository(),
      args: playerArgs(['a0', 'a1'], 0),
    );
    final playerKeys = renderedKeys(tester, 'aarti-');
    final playerMd = renderCrossCheckMarkdown(
      ticket: 'TAM-64',
      figmaNode: '423:4387 + 423:4384',
      screen: 'Aarti & Bhajans — full player',
      renderedComponents: playerKeys,
      intentional: const ['status-bar', 'mini-player-no-figma'],
      rows: const [
        CrossCheckRow(figmaNode: 'Basic Nav → back', component: 'aarti-player-back'),
        CrossCheckRow(figmaNode: 'Book Cover (300×300)', component: 'aarti-player-cover'),
        CrossCheckRow(figmaNode: 'Text "Ganesh Aarti"', component: 'aarti-player-title'),
        CrossCheckRow(figmaNode: 'Frame → Singer', component: 'aarti-player-singer'),
        CrossCheckRow(figmaNode: 'Frame → Composer', component: 'aarti-player-composer'),
        CrossCheckRow(figmaNode: 'Button → Like-dislike + count', component: 'aarti-player-like'),
        CrossCheckRow(figmaNode: 'Button → Share + count', component: 'aarti-player-share'),
        CrossCheckRow(figmaNode: 'Group 74 + Ellipse 36 (progress)', component: 'aarti-player-progress'),
        CrossCheckRow(figmaNode: 'Text "0:32" (elapsed)', component: 'aarti-player-elapsed'),
        CrossCheckRow(figmaNode: 'Text "5:52" (total)', component: 'aarti-player-total'),
        CrossCheckRow(figmaNode: 'Controls → backward-10-seconds', component: 'aarti-player-rewind'),
        CrossCheckRow(figmaNode: 'Controls → skip-forward-fill (prev)', component: 'aarti-player-prev'),
        CrossCheckRow(figmaNode: 'Controls → play/pause circle', component: 'aarti-player-playpause'),
        CrossCheckRow(figmaNode: 'Controls → skip-forward-fill (next)', component: 'aarti-player-next'),
        CrossCheckRow(figmaNode: 'Controls → forward-10-seconds', component: 'aarti-player-forward'),
        CrossCheckRow(
          figmaNode: 'Status bar (device chrome)',
          component: 'status-bar',
          notes: 'Intentional: OS status bar, not app UI.',
        ),
        CrossCheckRow(
          figmaNode: 'Mini-player (no Figma frame)',
          component: 'mini-player-no-figma',
          notes: 'Intentional: mini-player has NO Figma source (q1 working assumption).',
        ),
      ],
    );
    expect(crossCheck(
      figmaComponents: const [
        'aarti-player-back', 'aarti-player-cover', 'aarti-player-title',
        'aarti-player-singer', 'aarti-player-composer', 'aarti-player-like',
        'aarti-player-share', 'aarti-player-progress', 'aarti-player-elapsed',
        'aarti-player-total', 'aarti-player-rewind', 'aarti-player-prev',
        'aarti-player-playpause', 'aarti-player-next', 'aarti-player-forward',
      ],
      renderedComponents: playerKeys,
    ).ok, isTrue);
    buffer.writeln(playerMd);

    writeEvidence('TAM-64', 'cross-check.md', buffer.toString());
  });
}
