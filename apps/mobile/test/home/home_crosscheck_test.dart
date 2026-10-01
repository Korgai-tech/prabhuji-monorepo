import 'package:flutter_test/flutter_test.dart';

import '../support/fake_home_services.dart';
import '../support/figma_crosscheck.dart';
import '../support/golden_harness.dart';
import '../support/home_harness.dart';

/// Render-tree ↔ Figma node-tree cross-check (TAM-60) for Home.
///
/// Pumps the screen, sweeps its stable keys, diffs them against the `285:3464`
/// frame's children, and writes `cross-check.md` to the evidence folder. Asserts
/// nothing the design requires is missing — spec-authorized divergences are
/// declared `intentional` and each cites its reason.
void main() {
  testWidgets('cross-check: Home vs Figma 285:3464', (tester) async {
    await pumpHome(
      tester,
      repository: FakeHomeRepository(pageSize: 6),
      viewportHeight: 6000,
    );

    final keys = renderedKeys(tester, 'home-');

    const intentional = <String>[
      'home-search-bar',
      'home-search-mic',
      'home-pro-crown-badge',
      'home-status-business-overlay',
      'openly-chats-header',
      'status-bar',
      'home-bottom-nav',
    ];

    final md = renderCrossCheckMarkdown(
      ticket: 'TAM-62',
      figmaNode: '285:3464',
      screen: 'Home + Infinite Scroll Feed',
      renderedComponents: keys,
      intentional: intentional,
      rows: const [
        // --- Header (285:3482) ---
        CrossCheckRow(
          figmaNode: '285:3482 → 285:3485 "image 934 [Vectorized]" (logo)',
          component: 'home-header-logo',
        ),
        CrossCheckRow(
          figmaNode: '285:3482 → 285:3493 "Prabhuji" (wordmark)',
          component: 'home-header-wordmark',
        ),
        CrossCheckRow(
          figmaNode: '285:3482 → 285:3495 "messages-question" (help)',
          component: 'home-header-help',
        ),
        CrossCheckRow(
          figmaNode: '285:3482 → 285:3497 "Background+Shadow" (profile avatar)',
          component: 'home-header-avatar',
        ),
        // --- Banner carousel (285:3506 / 224:1367) ---
        CrossCheckRow(
          figmaNode: '285:3506 → 285:3507 "Component 27" (banner carousel)',
          component: 'home-banner-carousel',
        ),
        CrossCheckRow(
          figmaNode: 'I285:3507;224:1357 "Carousel Dots"',
          component: 'home-banner-dots',
        ),
        // --- Feature shortcut grid (285:3508 / 300:4338) ---
        CrossCheckRow(
          figmaNode: '285:3508 → 300:4338 "Frame 1000002633" (2×2 grid)',
          component: 'home-shortcut-grid',
        ),
        CrossCheckRow(
          figmaNode: '767:6580 "homescreen-feature-cards" (Aarti & Bhajans)',
          component: 'home-shortcut-aarti_bhajans',
        ),
        CrossCheckRow(
          figmaNode: '767:6643 "homescreen-feature-cards" (Mantras & Stutis)',
          component: 'home-shortcut-mantras_stutis',
        ),
        CrossCheckRow(
          figmaNode: '767:6658 "homescreen-feature-cards" (Set Ringtone)',
          component: 'home-shortcut-set_ringtone',
        ),
        CrossCheckRow(
          figmaNode: '767:6666 "homescreen-feature-cards" (Set Wallpaper)',
          component: 'home-shortcut-set_wallpaper',
        ),
        // --- Feed cards (285:3538) — one per contentType ---
        CrossCheckRow(
          figmaNode: '285:3539 "Article - Status Card" (wallpaper feed card)',
          component: 'home-feed-card-f-wallpaper',
        ),
        CrossCheckRow(
          figmaNode: '285:3574 "Article - Status Card" (status feed card)',
          component: 'home-feed-card-f-status',
        ),
        CrossCheckRow(
          figmaNode: '285:3639 "Article - Status Card" (aarti audio card)',
          component: 'home-feed-card-f-aarti',
        ),
        CrossCheckRow(
          figmaNode: '285:3689 "Article - Status Card" (mantra audio card)',
          component: 'home-feed-card-f-mantra',
        ),
        CrossCheckRow(
          figmaNode: '285:3739 "Article - Status Card" (ringtone audio card)',
          component: 'home-feed-card-f-ringtone',
        ),
        // --- Shared card chrome ---
        CrossCheckRow(
          figmaNode: '285:3541 "Header" / 285:3641 (tappable header row)',
          component: 'home-feed-card-header-f-wallpaper',
        ),
        CrossCheckRow(
          figmaNode: '285:3551 "Background" (TRENDING/SUGGESTED badge pill)',
          component: 'home-feed-badge-f-wallpaper',
        ),
        CrossCheckRow(
          figmaNode: '285:3555 "Hero Preview (9:16)"',
          component: 'home-feed-hero-f-wallpaper',
        ),
        CrossCheckRow(
          figmaNode: '285:3557 "Main Buttons" (hero CTA)',
          component: 'home-feed-cta-f-wallpaper',
        ),
        CrossCheckRow(
          figmaNode: '285:3655 "Audio Preview Area" + 285:3658 "Mini Player"',
          component: 'home-feed-audio-f-aarti',
        ),
        CrossCheckRow(
          figmaNode: '285:3668 "Play/Pause Button"',
          component: 'home-feed-audio-toggle-f-aarti',
        ),
        CrossCheckRow(
          figmaNode: '285:3672 "Main Buttons" (audio CTA "Listen to more")',
          component: 'home-feed-cta-f-aarti',
        ),
        CrossCheckRow(
          figmaNode: '285:3560 "Button" (engagement like)',
          component: 'home-feed-like-f-wallpaper',
        ),
        CrossCheckRow(
          figmaNode: '285:3565 "Container" (engagement view)',
          component: 'home-feed-view-f-wallpaper',
        ),
        CrossCheckRow(
          figmaNode: '285:3570 "Button" (engagement share)',
          component: 'home-feed-share-f-wallpaper',
        ),
        // --- Intentional divergences ---
        CrossCheckRow(
          figmaNode: '285:3499 "First Name Form" (search bar)',
          component: 'home-search-bar',
          notes:
              'Intentional: search REMOVED from Phase 1 (spec #EXPORT_CRITICAL, '
              'PRD §6/§17). Zero search UI.',
        ),
        CrossCheckRow(
          figmaNode: '285:3505 "Mic"',
          component: 'home-search-mic',
          notes: 'Intentional: part of the removed search row (PRD §6).',
        ),
        CrossCheckRow(
          figmaNode: '— (no Figma node)',
          component: 'home-pro-crown-badge',
          notes:
              'Dropped from Phase 1 by product decision (2026-07-15). No '
              'crown/VIP node exists in the Figma file; per the STRICT gate art '
              'was not authored. Deferred to Phase 2 if the design owner adds a '
              'node.',
        ),
        CrossCheckRow(
          figmaNode: '285:3592–285:3622 (status business-status overlay)',
          component: 'home-status-business-overlay',
          notes:
              'Intentional: CONTRACT GAP. TAM-61 HomeFeedItem carries no profile '
              'fields (name/business/phone/avatar), so rendering this would mean '
              'fabricating a person. Home shows the status media; the real '
              'overlay is composed from the user\'s own profile in the Status '
              'module (TAM-72).',
        ),
        CrossCheckRow(
          figmaNode: '285:3467 "Openly/Chats" header',
          component: 'openly-chats-header',
          notes:
              'Intentional: the node is visible:false in Figma — inherited '
              'template chrome from another product, not Prabhuji UI.',
        ),
        CrossCheckRow(
          figmaNode: '285:3465 "Status bar"',
          component: 'status-bar',
          notes: 'Intentional: OS status bar, not app UI.',
        ),
        CrossCheckRow(
          figmaNode: '750:6251 "Bottom Bar" / 750:6252 "Nav"',
          component: 'home-bottom-nav',
          notes:
              'Intentional (owned elsewhere): rendered by the TAM-58 shell '
              '(AppShellScaffold) since Home is shell branch 0 — verified by '
              'test/goldens/nav_shell_golden_test.dart, not re-built here.',
        ),
      ],
    );

    writeEvidence('TAM-62', 'cross-check.md', md);

    // The gate: nothing the design requires is missing.
    final result = crossCheck(
      figmaComponents: const [
        'home-header-logo',
        'home-header-wordmark',
        'home-header-help',
        'home-header-avatar',
        'home-banner-carousel',
        'home-banner-dots',
        'home-shortcut-grid',
        'home-shortcut-aarti_bhajans',
        'home-shortcut-mantras_stutis',
        'home-shortcut-set_ringtone',
        'home-shortcut-set_wallpaper',
        'home-feed-card-f-wallpaper',
        'home-feed-card-f-status',
        'home-feed-card-f-aarti',
        'home-feed-card-f-mantra',
        'home-feed-card-f-ringtone',
        'home-feed-card-header-f-wallpaper',
        'home-feed-badge-f-wallpaper',
        'home-feed-hero-f-wallpaper',
        'home-feed-cta-f-wallpaper',
        'home-feed-audio-f-aarti',
        'home-feed-audio-toggle-f-aarti',
        'home-feed-cta-f-aarti',
        'home-feed-like-f-wallpaper',
        'home-feed-view-f-wallpaper',
        'home-feed-share-f-wallpaper',
      ],
      renderedComponents: keys,
    );
    expect(
      result.ok,
      isTrue,
      reason: 'missing design components: ${result.missing}',
    );
  });
}
