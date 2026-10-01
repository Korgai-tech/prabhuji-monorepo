import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/wallpaper/data/wallpaper_models.dart';
import 'package:mobile/features/wallpaper/wallpaper_routes.dart';

import '../support/fake_repositories.dart';
import '../support/figma_crosscheck.dart';
import '../support/golden_harness.dart';
import '../support/wallpaper_harness.dart';

/// Render-tree ↔ Figma node-tree cross-check (TAM-60) for the Wallpaper module.
/// Pumps each coverage-set screen, sweeps its stable keys, diffs them against the
/// Figma frame's children, and writes the combined `cross-check.md` + per-screen
/// `render-tree/*.md` evidence. Asserts nothing the design requires is missing
/// (spec-authorized divergences aside).
void main() {
  testWidgets('cross-check: home, listing, static + live preview vs Figma',
      (tester) async {
    Directory(
      '${Directory.current.path}/../../specs/evidence/TAM-70/fidelity/render-tree',
    ).createSync(recursive: true);
    final buffer = StringBuffer();

    // --- Home (704:5223) -----------------------------------------------------
    await pumpWallpaperHome(tester, repository: FakeWallpaperRepository());
    final homeKeys = [
      ...renderedKeys(tester, 'wallpaper-'),
      ...renderedKeys(tester, 'deity-'),
    ];
    final homeMd = renderCrossCheckMarkdown(
      ticket: 'TAM-70',
      figmaNode: '704:5223',
      screen: 'Wallpaper Home',
      renderedComponents: homeKeys,
      intentional: const [
        'wallpaper-nav-trailing',
        'openly-chats-header',
        'status-bar',
      ],
      rows: const [
        CrossCheckRow(figmaNode: 'Basic Nav → Leading Icon (back)', component: 'wallpaper-nav-back'),
        CrossCheckRow(figmaNode: 'Basic Nav → Title "Wallpapers"', component: 'wallpaper-nav-title'),
        CrossCheckRow(figmaNode: 'Frame 2147227395 → Dieties row', component: 'deity-filter-row'),
        CrossCheckRow(figmaNode: 'Dieties → "All Gods" chip', component: 'deity-chip-all'),
        CrossCheckRow(figmaNode: 'CMS rows container', component: 'wallpaper-home-rows'),
        CrossCheckRow(figmaNode: 'Header (707:6137) → row "Top Live Wallpapers"', component: 'wallpaper-home-row-row-top-live'),
        CrossCheckRow(figmaNode: 'Header → title "Top Live Wallpapers"', component: 'wallpaper-row-title-row-top-live'),
        CrossCheckRow(figmaNode: 'Header → "Show all" (707:6170)', component: 'wallpaper-row-showall-row-top-live'),
        CrossCheckRow(figmaNode: 'Header → icon fi_1687795 (707:6140, Top Live only)', component: 'wallpaper-row-icon-row-top-live'),
        CrossCheckRow(figmaNode: 'Card (707:6173, 111×198)', component: 'wallpaper-card-live0'),
        CrossCheckRow(
          figmaNode: 'Basic Nav → trailing gear/phone/pencil (704:5786)',
          component: 'wallpaper-nav-trailing',
          notes: 'Intentional: inherited nav trailing actions — not part of this module.',
        ),
        CrossCheckRow(
          figmaNode: 'Frame 1000001840 → Openly/Chats/coins chrome',
          component: 'openly-chats-header',
          notes: 'Intentional: inherited chrome from another screen (PRD §10).',
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
        'wallpaper-nav-back', 'wallpaper-nav-title', 'deity-filter-row',
        'deity-chip-all', 'wallpaper-home-rows',
        'wallpaper-home-row-row-top-live', 'wallpaper-row-title-row-top-live',
        'wallpaper-row-showall-row-top-live', 'wallpaper-row-icon-row-top-live',
        'wallpaper-card-live0',
      ],
      renderedComponents: homeKeys,
    ).ok, isTrue);
    writeEvidence('TAM-70', 'render-tree/home.md', homeMd);
    buffer..writeln(homeMd)..writeln('\n---\n');

    // --- Listing (707:6427) --------------------------------------------------
    await tester.pumpWidget(const SizedBox());
    await pumpWallpaperListing(
      tester,
      repository: FakeWallpaperRepository(pageSize: 8),
      query: const WallpaperListQuery(title: 'Durga Ma Wallpapers', deityId: 'durga'),
    );
    final listKeys = renderedKeys(tester, 'wallpaper-');
    final listMd = renderCrossCheckMarkdown(
      ticket: 'TAM-70',
      figmaNode: '707:6427',
      screen: 'Wallpaper Listing',
      renderedComponents: listKeys,
      intentional: const [
        'wallpaper-nav-trailing',
        'openly-chats-header',
        'status-bar',
      ],
      rows: const [
        CrossCheckRow(figmaNode: 'Basic Nav → Leading Icon (back)', component: 'wallpaper-nav-back'),
        CrossCheckRow(figmaNode: 'Basic Nav → Title (dynamic)', component: 'wallpaper-nav-title'),
        CrossCheckRow(figmaNode: 'Main - Wallpaper Grid (707:6451, 2-col)', component: 'wallpaper-grid'),
        CrossCheckRow(figmaNode: 'Card (707:6452, 159×284)', component: 'wallpaper-grid-card-live0'),
        CrossCheckRow(figmaNode: 'Card → LIVE badge (712:6808)', component: 'wallpaper-live-badge'),
        CrossCheckRow(
          figmaNode: 'Frame 1000001840 → Openly/Chats/coins chrome (707:6431)',
          component: 'openly-chats-header',
          notes: 'Intentional: inherited chrome from another screen (PRD §10).',
        ),
        CrossCheckRow(
          figmaNode: 'Basic Nav → trailing actions',
          component: 'wallpaper-nav-trailing',
          notes: 'Intentional: inherited nav trailing actions.',
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
        'wallpaper-nav-back', 'wallpaper-nav-title', 'wallpaper-grid',
        'wallpaper-grid-card-live0', 'wallpaper-live-badge',
      ],
      renderedComponents: listKeys,
    ).ok, isTrue);
    writeEvidence('TAM-70', 'render-tree/listing.md', listMd);
    buffer..writeln(listMd)..writeln('\n---\n');

    // --- Static Preview (282:2812) -------------------------------------------
    await tester.pumpWidget(const SizedBox());
    await pumpWallpaperPreview(
      tester,
      repository: FakeWallpaperRepository(),
      args: WallpaperPreviewArgs(
        items: [wallpaperCardFixture('wp0', title: 'Durga')],
        startIndex: 0,
      ),
    );
    final staticKeys = renderedKeys(tester, 'wallpaper-');
    final staticMd = renderCrossCheckMarkdown(
      ticket: 'TAM-70',
      figmaNode: '282:2812',
      screen: 'Static Wallpaper Preview',
      renderedComponents: staticKeys,
      intentional: const ['status-bar'],
      rows: const [
        CrossCheckRow(figmaNode: 'Header → Go back (282:2821)', component: 'wallpaper-preview-back'),
        CrossCheckRow(figmaNode: 'Immersive Background Image (282:2814)', component: 'wallpaper-preview-image'),
        CrossCheckRow(figmaNode: 'Gradient Overlay (282:2815)', component: 'wallpaper-preview-overlay'),
        CrossCheckRow(figmaNode: 'Right Rail → Like + count (282:2833)', component: 'wallpaper-preview-like'),
        CrossCheckRow(figmaNode: 'Right Rail → WhatsApp/share + count (282:2838)', component: 'wallpaper-preview-share'),
        CrossCheckRow(figmaNode: 'Footer → "Wallpaper set N TIMES" (282:2817)', component: 'wallpaper-preview-setcount'),
        CrossCheckRow(figmaNode: 'Main Buttons → Set Wallpaper (282:2818)', component: 'wallpaper-preview-set-home'),
        CrossCheckRow(figmaNode: 'Main Buttons → Set Lockscreen (707:6596)', component: 'wallpaper-preview-set-lock'),
        CrossCheckRow(
          figmaNode: 'Status bar (device chrome)',
          component: 'status-bar',
          notes: 'Intentional: OS status bar, not app UI.',
        ),
      ],
    );
    expect(crossCheck(
      figmaComponents: const [
        'wallpaper-preview-back', 'wallpaper-preview-image',
        'wallpaper-preview-overlay', 'wallpaper-preview-like',
        'wallpaper-preview-share', 'wallpaper-preview-setcount',
        'wallpaper-preview-set-home', 'wallpaper-preview-set-lock',
      ],
      renderedComponents: staticKeys,
    ).ok, isTrue);
    writeEvidence('TAM-70', 'render-tree/static-preview.md', staticMd);
    buffer..writeln(staticMd)..writeln('\n---\n');

    // --- Live Preview (712:6622) ---------------------------------------------
    await tester.pumpWidget(const SizedBox());
    await pumpWallpaperPreview(
      tester,
      repository: FakeWallpaperRepository(),
      args: WallpaperPreviewArgs(
        items: [
          wallpaperCardFixture('live0',
              title: 'Shiva', mediaType: WallpaperMediaType.live),
        ],
        startIndex: 0,
      ),
    );
    final liveKeys = renderedKeys(tester, 'wallpaper-');
    final liveMd = renderCrossCheckMarkdown(
      ticket: 'TAM-70',
      figmaNode: '712:6622',
      screen: 'Live Wallpaper Preview',
      renderedComponents: liveKeys,
      intentional: const ['wallpaper-preview-set-lock', 'status-bar'],
      rows: const [
        CrossCheckRow(figmaNode: 'Header → Go back (712:6634)', component: 'wallpaper-preview-back'),
        CrossCheckRow(figmaNode: 'Immersive muted looping video (712:6624)', component: 'wallpaper-preview-video'),
        CrossCheckRow(figmaNode: 'Gradient Overlay (712:6625)', component: 'wallpaper-preview-overlay'),
        CrossCheckRow(figmaNode: 'Right Rail → Like + count (712:6645)', component: 'wallpaper-preview-like'),
        CrossCheckRow(figmaNode: 'Right Rail → WhatsApp/share + count (712:6650)', component: 'wallpaper-preview-share'),
        CrossCheckRow(figmaNode: 'Footer → "Wallpaper set N TIMES" (712:6627)', component: 'wallpaper-preview-setcount'),
        CrossCheckRow(figmaNode: 'Main Buttons → Set Wallpaper only (712:6629)', component: 'wallpaper-preview-set-home'),
        CrossCheckRow(
          figmaNode: 'Set Lockscreen',
          component: 'wallpaper-preview-set-lock',
          notes: 'Intentional: live wallpapers are home-screen only in Phase 1 (PRD §6.7) — the Figma live frame has one button.',
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
        'wallpaper-preview-back', 'wallpaper-preview-video',
        'wallpaper-preview-overlay', 'wallpaper-preview-like',
        'wallpaper-preview-share', 'wallpaper-preview-setcount',
        'wallpaper-preview-set-home',
      ],
      renderedComponents: liveKeys,
    ).ok, isTrue);
    writeEvidence('TAM-70', 'render-tree/live-preview.md', liveMd);
    buffer.writeln(liveMd);

    writeEvidence('TAM-70', 'cross-check.md', buffer.toString());
  });
}
