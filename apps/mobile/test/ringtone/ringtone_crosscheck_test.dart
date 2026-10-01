import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/ringtone/ringtone_routes.dart';

import '../support/fake_repositories.dart';
import '../support/figma_crosscheck.dart';
import '../support/golden_harness.dart';
import '../support/ringtone_harness.dart';

/// Render-tree ↔ Figma node-tree cross-check (TAM-60) for the Ringtone module.
/// Pumps each coverage-set screen, sweeps its stable keys, diffs them against
/// the Figma frame's children, and writes the combined `cross-check.md` +
/// per-screen `render-tree/*.md` evidence. Asserts nothing the design requires
/// is missing (spec-authorized divergences aside).
void main() {
  testWidgets('cross-check: home, search, preview vs Figma', (tester) async {
    Directory(
      '${Directory.current.path}/../../specs/evidence/TAM-68/fidelity/render-tree',
    ).createSync(recursive: true);
    final buffer = StringBuffer();

    // --- Home (670:4481) -----------------------------------------------------
    await pumpRingtoneHome(tester, repository: FakeRingtoneRepository(pageSize: 9));
    final homeKeys = [
      ...renderedKeys(tester, 'ringtone-'),
      ...renderedKeys(tester, 'deity-'),
    ];
    final homeMd = renderCrossCheckMarkdown(
      ticket: 'TAM-68',
      figmaNode: '670:4481',
      screen: 'Ringtone Home',
      renderedComponents: homeKeys,
      intentional: const ['ringtone-mic', 'openly-chats-header', 'status-bar'],
      rows: const [
        CrossCheckRow(figmaNode: 'Header → Leading Icon (back)', component: 'ringtone-nav-back'),
        CrossCheckRow(figmaNode: 'Header → Input "Search Ringtones"', component: 'ringtone-search-field'),
        CrossCheckRow(figmaNode: 'Frame 2147227395 → Dieties row', component: 'deity-filter-row'),
        CrossCheckRow(figmaNode: 'Dieties → "All Gods" chip', component: 'deity-chip-all'),
        CrossCheckRow(figmaNode: 'Frame 2147227442 → 3-col card grid', component: 'ringtone-grid'),
        CrossCheckRow(figmaNode: 'Card (676:4711)', component: 'ringtone-card-rt0'),
        CrossCheckRow(figmaNode: 'Card → centre play overlay (676:4763)', component: 'ringtone-card-play-overlay'),
        CrossCheckRow(
          figmaNode: 'Header → mic icon (670:4614/4616)',
          component: 'ringtone-mic',
          notes: 'Intentional: HIDDEN in Phase 1 — no voice search / mic permission (spec q3).',
        ),
        CrossCheckRow(
          figmaNode: 'Frame 1000001675 → Openly/Chats/coins chrome (670:4588)',
          component: 'openly-chats-header',
          notes: 'Intentional: inherited chrome from another screen — not part of the Ringtone module.',
        ),
        CrossCheckRow(
          figmaNode: 'Status bar (device chrome)',
          component: 'status-bar',
          notes: 'Intentional: OS status bar, not app UI.',
        ),
      ],
    );
    expect(crossCheck(
      figmaComponents: const [
        'ringtone-nav-back', 'ringtone-search-field', 'deity-filter-row',
        'deity-chip-all', 'ringtone-grid', 'ringtone-card-rt0',
        'ringtone-card-play-overlay',
      ],
      renderedComponents: homeKeys,
    ).ok, isTrue);
    writeEvidence('TAM-68', 'render-tree/home.md', homeMd);
    buffer..writeln(homeMd)..writeln('\n---\n');

    // --- Search Results (1073:3472) -----------------------------------------
    await tester.pumpWidget(const SizedBox());
    await pumpRingtoneSearch(
      tester,
      repository: FakeRingtoneRepository(pageSize: 9),
      query: 'Krishna',
    );
    final searchKeys = renderedKeys(tester, 'ringtone-');
    final searchMd = renderCrossCheckMarkdown(
      ticket: 'TAM-68',
      figmaNode: '1073:3472',
      screen: 'Ringtone Search Results',
      renderedComponents: searchKeys,
      intentional: const ['ringtone-mic', 'status-bar'],
      rows: const [
        CrossCheckRow(figmaNode: 'Header → Leading Icon (back)', component: 'ringtone-nav-back'),
        CrossCheckRow(figmaNode: 'Header → Input (query echoed)', component: 'ringtone-search-field'),
        CrossCheckRow(figmaNode: 'Text "Search Results" (1073:3927)', component: 'ringtone-search-heading'),
        CrossCheckRow(figmaNode: 'Frame 2147227442 → 3-col card grid', component: 'ringtone-grid'),
        CrossCheckRow(figmaNode: 'Card (1073:3474)', component: 'ringtone-card-rt0'),
        CrossCheckRow(
          figmaNode: 'Header → mic icon',
          component: 'ringtone-mic',
          notes: 'Intentional: HIDDEN in Phase 1 (spec q3).',
        ),
        CrossCheckRow(
          figmaNode: 'Status bar (device chrome)',
          component: 'status-bar',
          notes: 'Intentional: OS status bar, not app UI.',
        ),
      ],
    );
    expect(crossCheck(
      figmaComponents: const [
        'ringtone-nav-back', 'ringtone-search-field', 'ringtone-search-heading',
        'ringtone-grid', 'ringtone-card-rt0',
      ],
      renderedComponents: searchKeys,
    ).ok, isTrue);
    writeEvidence('TAM-68', 'render-tree/search.md', searchMd);
    buffer..writeln(searchMd)..writeln('\n---\n');

    // --- Preview (683:4775) --------------------------------------------------
    await tester.pumpWidget(const SizedBox());
    await pumpRingtonePreview(
      tester,
      repository: FakeRingtoneRepository(pro: true),
      args: const RingtonePreviewArgs(ringtoneId: 'rt1'),
    );
    final previewKeys = renderedKeys(tester, 'ringtone-');
    final previewMd = renderCrossCheckMarkdown(
      ticket: 'TAM-68',
      figmaNode: '683:4775',
      screen: 'Ringtone Preview',
      renderedComponents: previewKeys,
      intentional: const ['player-10s-seek', 'basic-nav-trailing', 'status-bar'],
      rows: const [
        CrossCheckRow(figmaNode: 'Basic Nav → Leading Icon (back)', component: 'ringtone-preview-back'),
        CrossCheckRow(figmaNode: 'Book Cover (300×300, 683:4779)', component: 'ringtone-preview-image'),
        CrossCheckRow(figmaNode: 'Text "Gurur Brahma Mantra" (683:4786)', component: 'ringtone-preview-title'),
        CrossCheckRow(figmaNode: 'Button "N ringtone set" (683:4885)', component: 'ringtone-preview-setcount'),
        CrossCheckRow(figmaNode: 'Features → Like + count (683:4795)', component: 'ringtone-preview-like'),
        CrossCheckRow(figmaNode: 'Features → Plays + count (683:4878)', component: 'ringtone-preview-play'),
        CrossCheckRow(figmaNode: 'Features → Share + count (683:4800)', component: 'ringtone-preview-share'),
        CrossCheckRow(figmaNode: 'Player Controls → play/pause (683:4281)', component: 'ringtone-preview-playpause'),
        CrossCheckRow(figmaNode: 'Main Buttons → Set Ringtone CTA (683:4904)', component: 'ringtone-preview-set-cta'),
        CrossCheckRow(
          figmaNode: 'Player Controls → backward/forward-10s + skip',
          component: 'player-10s-seek',
          notes: 'Intentional: single-clip preview — play/pause only, no seek/skip (§6).',
        ),
        CrossCheckRow(
          figmaNode: 'Basic Nav → trailing gear/phone/pencil (683:4816)',
          component: 'basic-nav-trailing',
          notes: 'Intentional: inherited nav trailing actions — not rendered for this module.',
        ),
        CrossCheckRow(
          figmaNode: 'Status bar (device chrome)',
          component: 'status-bar',
          notes: 'Intentional: OS status bar, not app UI.',
        ),
      ],
    );
    expect(crossCheck(
      figmaComponents: const [
        'ringtone-preview-back', 'ringtone-preview-image', 'ringtone-preview-title',
        'ringtone-preview-setcount', 'ringtone-preview-like', 'ringtone-preview-play',
        'ringtone-preview-share', 'ringtone-preview-playpause', 'ringtone-preview-set-cta',
      ],
      renderedComponents: previewKeys,
    ).ok, isTrue);
    writeEvidence('TAM-68', 'render-tree/preview.md', previewMd);
    buffer.writeln(previewMd);

    writeEvidence('TAM-68', 'cross-check.md', buffer.toString());
  });
}
