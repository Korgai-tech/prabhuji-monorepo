import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mantras/data/mantras_models.dart';

import '../support/fake_repositories.dart';
import '../support/figma_crosscheck.dart';
import '../support/golden_harness.dart';
import '../support/mantras_harness.dart';

/// Render-tree ↔ Figma node-tree cross-check (TAM-60) for the Mantras module.
/// Pumps each coverage-set screen, sweeps its stable keys, diffs them against
/// the Figma frame's children, and writes the combined `cross-check.md` +
/// per-screen `render-tree/*.md` evidence. Asserts nothing the design requires
/// is missing (spec-authorized divergences aside).
void main() {
  testWidgets('cross-check: main, listing, player + sheets vs Figma',
      (tester) async {
    // Ensure the per-screen render-tree subdir exists (writeEvidence only
    // creates the `fidelity/` root).
    Directory(
      '${Directory.current.path}/../../specs/evidence/TAM-66/fidelity/render-tree',
    ).createSync(recursive: true);
    final buffer = StringBuffer();

    // --- Main page (425:4944) ------------------------------------------------
    await pumpMantrasMain(tester, repository: FakeMantrasRepository());
    final mainKeys = [
      ...renderedKeys(tester, 'mantras-'),
      ...renderedKeys(tester, 'deity-'),
    ];
    final mainMd = renderCrossCheckMarkdown(
      ticket: 'TAM-66',
      figmaNode: '425:4944',
      screen: 'Mantras & Stutis — main page',
      renderedComponents: mainKeys,
      intentional: const [
        'nav-trailing-gear',
        'nav-trailing-phone',
        'nav-trailing-pencil',
      ],
      rows: const [
        CrossCheckRow(figmaNode: 'Basic Nav → Leading Icon (back)', component: 'mantras-nav-back'),
        CrossCheckRow(figmaNode: 'Basic Nav → Title "Mantras & Stutis"', component: 'mantras-nav-title'),
        CrossCheckRow(figmaNode: 'Header "Recently Played Mantras"', component: 'mantras-section-recentlyPlayed'),
        CrossCheckRow(figmaNode: 'Recently Played → Show all', component: 'mantras-showall-recentlyPlayed'),
        CrossCheckRow(figmaNode: 'Header "Mantras of Deities" (Thumbnails)', component: 'mantras-section-deities'),
        CrossCheckRow(figmaNode: 'Deities → Dieties row', component: 'deity-filter-row'),
        CrossCheckRow(figmaNode: 'Header "Browse Categories"', component: 'mantras-section-categories'),
        CrossCheckRow(figmaNode: 'Header "Newly Added Mantras"', component: 'mantras-section-newlyAdded'),
        CrossCheckRow(figmaNode: 'Newly Added → Show all', component: 'mantras-showall-newlyAdded'),
        CrossCheckRow(
          figmaNode: 'Basic Nav → Trailing Icons (gear/phone/pencil)',
          component: 'nav-trailing-gear',
          notes: 'Intentional: present in Figma JSON but NOT rendered (no trailing actions for this module).',
        ),
      ],
    );
    expect(crossCheck(
      figmaComponents: const [
        'mantras-nav-back', 'mantras-nav-title', 'mantras-section-recentlyPlayed',
        'mantras-showall-recentlyPlayed', 'mantras-section-deities', 'deity-filter-row',
        'mantras-section-categories', 'mantras-section-newlyAdded', 'mantras-showall-newlyAdded',
      ],
      renderedComponents: mainKeys,
    ).ok, isTrue);
    writeEvidence('TAM-66', 'render-tree/main.md', mainMd);
    buffer.writeln(mainMd);
    buffer.writeln('\n---\n');

    // --- Listing (1066:3358) -------------------------------------------------
    await tester.pumpWidget(const SizedBox());
    await pumpMantrasListing(
      tester,
      repository: FakeMantrasRepository(),
      query: const MantraListQuery(
        title: 'Newly Added Mantras',
        sourceListType: 'newly_added',
        section: MantraListSection.newlyAdded,
      ),
    );
    final listingKeys = renderedKeys(tester, 'mantras-');
    final listingMd = renderCrossCheckMarkdown(
      ticket: 'TAM-66',
      figmaNode: '1066:3358',
      screen: 'Mantras & Stutis — 2-column Show-all listing',
      renderedComponents: listingKeys,
      rows: const [
        CrossCheckRow(figmaNode: 'Basic Nav → Leading Icon (back)', component: 'mantras-nav-back'),
        CrossCheckRow(figmaNode: 'Basic Nav → Title (dynamic)', component: 'mantras-nav-title'),
        CrossCheckRow(figmaNode: 'Frame (2-col grid)', component: 'mantras-listing-grid'),
        CrossCheckRow(figmaNode: 'Frame (audio card)', component: 'mantras-grid-card-m0'),
      ],
    );
    expect(crossCheck(
      figmaComponents: const [
        'mantras-nav-back', 'mantras-nav-title', 'mantras-listing-grid', 'mantras-grid-card-m0',
      ],
      renderedComponents: listingKeys,
    ).ok, isTrue);
    writeEvidence('TAM-66', 'render-tree/listing.md', listingMd);
    buffer.writeln(listingMd);
    buffer.writeln('\n---\n');

    // --- Player (438:3074) ---------------------------------------------------
    await tester.pumpWidget(const SizedBox());
    await pumpMantrasPlayer(
      tester,
      repository: FakeMantrasRepository(),
      args: mantrasPlayerArgs(['m0', 'm1'], 0),
    );
    final playerKeys = renderedKeys(tester, 'mantras-');
    final playerMd = renderCrossCheckMarkdown(
      ticket: 'TAM-66',
      figmaNode: '438:3074',
      screen: 'Mantras & Stutis — full player',
      renderedComponents: playerKeys,
      intentional: const ['player-10s-seek', 'status-bar', 'mini-player-no-figma'],
      rows: const [
        CrossCheckRow(figmaNode: 'Basic Nav → back', component: 'mantras-player-back'),
        CrossCheckRow(figmaNode: 'Button "0/21 times" (counter pill)', component: 'mantras-player-counter-pill'),
        CrossCheckRow(figmaNode: 'Book Cover (150×150)', component: 'mantras-player-cover'),
        CrossCheckRow(figmaNode: 'Text "Shri Raam Dootam"', component: 'mantras-player-title'),
        CrossCheckRow(figmaNode: 'Frame → Singer', component: 'mantras-player-singer'),
        CrossCheckRow(figmaNode: 'Devanagari mantra text (438:3199)', component: 'mantras-player-text'),
        CrossCheckRow(figmaNode: 'Button → Like-dislike + count', component: 'mantras-player-like'),
        CrossCheckRow(figmaNode: 'Button → Share + count', component: 'mantras-player-share'),
        CrossCheckRow(figmaNode: 'Controls → skip prev', component: 'mantras-player-prev'),
        CrossCheckRow(figmaNode: 'Controls → play/pause circle', component: 'mantras-player-playpause'),
        CrossCheckRow(figmaNode: 'Controls → skip next', component: 'mantras-player-next'),
        CrossCheckRow(figmaNode: 'Frame 276 (Next-track card)', component: 'mantras-player-next-card'),
        CrossCheckRow(figmaNode: 'Next card → play circle', component: 'mantras-player-next-card-play'),
        CrossCheckRow(
          figmaNode: 'Controls → backward/forward-10-seconds',
          component: 'player-10s-seek',
          notes: 'Intentional: NOT implemented — Phase 1 is prev/next only (§6.8, §10).',
        ),
        CrossCheckRow(
          figmaNode: 'Status bar (device chrome)',
          component: 'status-bar',
          notes: 'Intentional: OS status bar, not app UI.',
        ),
        CrossCheckRow(
          figmaNode: 'Mini-player (no Figma frame)',
          component: 'mini-player-no-figma',
          notes: 'Intentional: shared mini-player has NO Figma source (TAM-59 working assumption).',
        ),
      ],
    );
    expect(crossCheck(
      figmaComponents: const [
        'mantras-player-back', 'mantras-player-counter-pill', 'mantras-player-cover',
        'mantras-player-title', 'mantras-player-singer', 'mantras-player-text',
        'mantras-player-like', 'mantras-player-share', 'mantras-player-prev',
        'mantras-player-playpause', 'mantras-player-next', 'mantras-player-next-card',
        'mantras-player-next-card-play',
      ],
      renderedComponents: playerKeys,
    ).ok, isTrue);
    writeEvidence('TAM-66', 'render-tree/player.md', playerMd);
    buffer.writeln(playerMd);

    writeEvidence('TAM-66', 'cross-check.md', buffer.toString());
  });
}
