import 'dart:io';

import 'package:flutter/widgets.dart';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/status/data/status_models.dart';

import '../support/fake_repositories.dart';
import '../support/figma_crosscheck.dart';
import '../support/golden_harness.dart';
import '../support/status_harness.dart';

/// Render-tree ↔ Figma node-tree cross-check (TAM-60) for the Status module.
/// Pumps each coverage-set screen, sweeps its stable keys, diffs them against
/// the Figma frame's children, and writes the combined `cross-check.md` +
/// per-screen `render-tree/*.md` evidence. Asserts nothing the design requires
/// is missing (spec-authorized divergences aside).
///
/// TAM-168 — the Business persona was retired from the mobile app; the Business
/// Details screen is no longer rendered. The Personal / Business tab-group is
/// intentionally absent from the Personal details cross-check (spec: "do NOT
/// implement stray Figma artifacts" — the removed tabs are now such
/// artifacts).
void main() {
  testWidgets('cross-check: status home + personal details vs Figma',
      (tester) async {
    Directory(
      '${Directory.current.path}/../../specs/evidence/TAM-72/fidelity/render-tree',
    ).createSync(recursive: true);
    final buffer = StringBuffer();

    // --- Status Home (302:4384) ---------------------------------------------
    await pumpStatusHome(
      tester,
      repository: FakeStatusRepository(profile: statusPersonalProfileFixture()),
    );
    final homeKeys = [
      ...renderedKeys(tester, 'status-'),
      ...renderedKeys(tester, 'deity-'),
    ];
    const homeRequired = [
      'status-title',
      'status-edit-details',
      'deity-filter-row',
      'deity-chip-all',
      'status-feed-pageview',
      'status-share',
      'status-like',
      'status-view',
      'status-next',
      'status-overlay-band',
      'status-overlay-avatar',
      'status-overlay-title',
      'status-card-image',
    ];
    final homeMd = renderCrossCheckMarkdown(
      ticket: 'TAM-72',
      figmaNode: '302:4384',
      screen: 'Status Home',
      renderedComponents: homeKeys,
      intentional: const [
        'status-bar',
        'basic-nav-avatar',
        'basic-nav-trailing',
        'status-overlay-phone',
        'status-overlay-pills',
        'engagement-share-dupe',
        'bottom-nav',
      ],
      rows: const [
        CrossCheckRow(figmaNode: 'Basic Nav → Title "Status" (I302:4928;5186:10465)', component: 'status-title'),
        CrossCheckRow(figmaNode: 'Basic Nav → Trailing Icon 1 "Edit Details" pill (I302:4928;5186:10469)', component: 'status-edit-details'),
        CrossCheckRow(figmaNode: 'Frame 2147227396 → Dieties row (307:1405)', component: 'deity-filter-row'),
        CrossCheckRow(figmaNode: 'Dieties → "All Gods" chip (307:1406)', component: 'deity-chip-all'),
        CrossCheckRow(figmaNode: 'Frame 2147227398 → Status-swipe feed (330:6125)', component: 'status-feed-pageview'),
        CrossCheckRow(figmaNode: 'Engagement Footer → Share CTA (I330:6125;322:1724)', component: 'status-share'),
        CrossCheckRow(figmaNode: 'Engagement Footer → like + count (I330:6125;322:1725)', component: 'status-like'),
        CrossCheckRow(figmaNode: 'Engagement Footer → view + count (I330:6125;322:1729)', component: 'status-view'),
        CrossCheckRow(figmaNode: 'Engagement Footer → Next (I330:6125;322:1740)', component: 'status-next'),
        CrossCheckRow(figmaNode: 'Hero Preview → media (I330:6125;322:1742)', component: 'status-card-image'),
        CrossCheckRow(figmaNode: 'Hero Preview → overlay band (I330:6125;322:1743)', component: 'status-overlay-band'),
        CrossCheckRow(figmaNode: 'Overlay → Avatar profile photo (I330:6125;322:1768)', component: 'status-overlay-avatar'),
        CrossCheckRow(figmaNode: 'Overlay → Name (I330:6125;322:1749)', component: 'status-overlay-title'),
        CrossCheckRow(
          figmaNode: 'Status bar (302:4385)',
          component: 'status-bar',
          notes: 'Intentional: OS status bar, not app UI.',
        ),
        CrossCheckRow(
          figmaNode: 'Basic Nav → Avatar (I302:4928;5186:10464)',
          component: 'basic-nav-avatar',
          notes: 'Intentional: `visible:false` in the Figma frame — not rendered by the design.',
        ),
        CrossCheckRow(
          figmaNode: 'Basic Nav → Trailing Icon 2/3 gear+phone (I302:4928;5186:10467/10468)',
          component: 'basic-nav-trailing',
          notes: 'Intentional: both `visible:false` in the Figma frame.',
        ),
        CrossCheckRow(
          figmaNode: 'Overlay → phone-call icon block (I330:6125;322:1744)',
          component: 'status-overlay-phone',
          notes: 'Intentional: `visible:false` in the Figma frame (and its render '
              'export is empty). TAM-168 additionally retired the business overlay '
              'copy from the mobile app entirely.',
        ),
        CrossCheckRow(
          figmaNode: 'Overlay → PILLS/marker (I330:6125;322:1750)',
          component: 'status-overlay-pills',
          notes: 'Intentional: `visible:false` in the Figma frame.',
        ),
        CrossCheckRow(
          figmaNode: 'Engagement Footer → second "Share" text button (I330:6125;322:1736)',
          component: 'engagement-share-dupe',
          notes: 'Intentional: a duplicated/stray artifact — the RENDERED frame '
              'shows ONE Share CTA. Spec: "do NOT implement stray Figma artifacts".',
        ),
        CrossCheckRow(
          figmaNode: 'Component 26 → bottom nav (302:4652)',
          component: 'bottom-nav',
          notes: 'Intentional: provided by the TAM-58 shell (StatefulShellRoute), '
              'which hosts this screen as its Status branch — not re-implemented here.',
        ),
      ],
    );
    expect(
      crossCheck(figmaComponents: homeRequired, renderedComponents: homeKeys).ok,
      isTrue,
      reason: 'a required Status Home component is missing from the render tree',
    );
    writeEvidence('TAM-72', 'render-tree/status-home.md', homeMd);
    buffer..writeln(homeMd)..writeln('\n---\n');

    // --- Personal Details (371:2185) ----------------------------------------
    await tester.pumpWidget(const SizedBox());
    await pumpStatusDetailsScreen(
      tester,
      repository: FakeStatusRepository(profile: StatusProfileData.empty),
    );
    final personalKeys = renderedKeys(tester, 'status-');
    const personalRequired = [
      'status-details-back',
      'status-details-title',
      'status-avatar-picker',
      'status-field-personal-name',
      'status-save',
    ];
    final personalMd = renderCrossCheckMarkdown(
      ticket: 'TAM-72',
      figmaNode: '371:2185',
      screen: 'Personal Details',
      renderedComponents: personalKeys,
      intentional: const [
        'status-bar',
        'basic-nav-trailing',
        'bottom-nav',
        'save-button-dupe',
        'tab-group-removed',
      ],
      rows: const [
        CrossCheckRow(figmaNode: 'Basic Nav → Leading Icon back (I371:2371;5186:10373)', component: 'status-details-back'),
        CrossCheckRow(figmaNode: 'Basic Nav → Title "Add your details" (I371:2371;5186:10376)', component: 'status-details-title'),
        CrossCheckRow(figmaNode: 'Avatar-pranhuji 128px + camera badge (371:3556)', component: 'status-avatar-picker'),
        CrossCheckRow(figmaNode: 'First Name Form "Your name" (371:3448)', component: 'status-field-personal-name'),
        CrossCheckRow(figmaNode: 'Main Buttons → Save (371:3724)', component: 'status-save'),
        CrossCheckRow(
          figmaNode: 'Status bar (371:2186)',
          component: 'status-bar',
          notes: 'Intentional: OS status bar, not app UI.',
        ),
        CrossCheckRow(
          figmaNode: 'Basic Nav → Frame 1000001834 trailing gear/phone/pencil (I371:2371;5186:10377)',
          component: 'basic-nav-trailing',
          notes: 'Intentional: inherited nav trailing actions, `visible:false` in the frame.',
        ),
        CrossCheckRow(
          figmaNode: 'Frame 1000001711 → second Save (371:3723/371:3725)',
          component: 'save-button-dupe',
          notes: 'Intentional: `visible:false` duplicate — the rendered frame has ONE Save.',
        ),
        CrossCheckRow(
          figmaNode: 'Tab-group (371:3531) — Personal / Business tabs',
          component: 'tab-group-removed',
          notes: 'TAM-168 — the Business persona was retired from the mobile app; '
              'the tab-group is no longer rendered (spec: "do NOT implement stray '
              'Figma artifacts"; the tabs became one after the persona removal).',
        ),
        CrossCheckRow(
          figmaNode: 'Component 26 → bottom nav (371:2318)',
          component: 'bottom-nav',
          notes: 'Intentional: the details flow pushes OVER the shell (own back-nav, '
              'no bottom tabs) — the Figma frame inherits the nav component but the '
              'flow is a pushed route (spec Frontend task 11).',
        ),
      ],
    );
    expect(
      crossCheck(
        figmaComponents: personalRequired,
        renderedComponents: personalKeys,
      ).ok,
      isTrue,
      reason: 'a required Personal Details component is missing',
    );
    writeEvidence('TAM-72', 'render-tree/personal-details.md', personalMd);
    buffer.writeln(personalMd);

    writeEvidence('TAM-72', 'cross-check.md', buffer.toString());
  });
}
