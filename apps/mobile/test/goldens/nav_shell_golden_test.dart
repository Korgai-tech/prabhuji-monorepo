@Tags(['golden'])
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:mobile/core/theme.dart';
import 'package:mobile/features/onboarding/data/users_repository.dart';
import 'package:mobile/features/shell/presentation/app_shell_scaffold.dart';
import 'package:mobile/state/providers.dart';

import '../support/figma_crosscheck.dart';
import '../support/golden_harness.dart';

/// TAM-60 fidelity harness — WORKING EXAMPLE on the TAM-58 bottom nav.
///
/// Produces, in one test, the two evidence artifacts every screen ticket must
/// commit under `specs/evidence/TAM-{N}/fidelity/`:
///   1. a GOLDEN PNG (`goldens/nav_shell.png`) — the render a reviewer diffs
///      against the Figma nav frame PNG (export it with `tools/figma-export.ts`);
///   2. a render-tree ↔ Figma node-tree `cross-check.md` — proves no nav tab
///      silently went missing vs Figma node `750:6252`.
///
/// Tagged `golden` so CI can `flutter test --exclude-tags golden` (real-font
/// goldens are platform-locked); plain `flutter test` still runs it locally.
/// Regenerate the golden: `flutter test --update-goldens test/goldens/`.

/// The five bottom-nav children per TAM-164 (Figma frame `2612:18143`):
/// Home / Chat / Status / Downloads / Rashifal (Horoscope renamed + moved
/// to index 4, Chat inserted at index 1). Chat is never rendered — its entry
/// is the Home FAB (Figma 3914:11348) — so the golden captures four tabs,
/// with chat enabled to prove the grant doesn't bring the tab back.
const _navRows = <CrossCheckRow>[
  CrossCheckRow(
    figmaNode: 'I2612:18143 "Bottom Nav" → home',
    component: 'nav-tab-home',
    notes: 'Active om-badge (home_active.svg) / default (home_inactive.svg), untinted.',
  ),
  CrossCheckRow(
    figmaNode: 'I2612:18143 "Bottom Nav" → Status',
    component: 'nav-tab-status',
    notes: 'Monochrome status.svg, tinted navActive/navInactive.',
  ),
  CrossCheckRow(
    figmaNode: 'I2632:21396 "Bottom Bar" → Downloads (TAM-125)',
    component: 'nav-tab-downloads',
    notes: 'Bespoke nav-downloads.svg glyph (Figma 2639:22533), tinted navActive/navInactive.',
  ),
  CrossCheckRow(
    figmaNode: 'I2612:18143 "Bottom Nav" → Rashifal (TAM-164, renamed from Horoscope)',
    component: 'nav-tab-rashifal',
    notes:
        'Monochrome horoscope.svg reused for the Rashifal rename — no new asset '
        'from Figma; if a distinct glyph lands it swaps in via kShellDestinations.',
  ),
];

GoRouter _shellRouter() {
  Widget branch(String key) =>
      SizedBox.expand(key: Key('branch-$key'), child: const ColoredBox(color: AppColors.white));
  return GoRouter(
    initialLocation: '/home',
    routes: [
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            AppShellScaffold(navigationShell: navigationShell),
        branches: [
          for (final k in ['home', 'chat', 'status', 'downloads', 'rashifal'])
            StatefulShellBranch(
              routes: [GoRoute(path: '/$k', builder: (_, _) => branch(k))],
            ),
        ],
      ),
    ],
  );
}

MeUser _chatEnabledMe() => MeUser(
      id: 'test-user',
      name: 'Tester',
      selectedLanguage: 'hi',
      onboardingCompletedAt: DateTime(2026),
      phoneCountryCode: '+91',
      phoneNumber: '9999999999',
      chatConfig: const MeChatConfig(enabled: true, agentId: 'test-agent'),
    );

void main() {
  testWidgets('bottom nav renders the 5 Figma glyphs → golden + cross-check',
      (tester) async {
    tester.view.physicalSize = const Size(360, 120);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          meProvider.overrideWith((ref) async => _chatEnabledMe()),
        ],
        child: MaterialApp.router(
          debugShowCheckedModeBanner: false,
          theme: AppTheme.light(),
          routerConfig: _shellRouter(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    // Decode the nav-icon rasters so they aren't blank in the golden.
    await tester.runAsync(() async {
      for (final el in find.byType(Image).evaluate()) {
        await precacheImage((el.widget as Image).image, el);
      }
    });
    await tester.pumpAndSettle();

    // (1) Golden — the review artifact vs the Figma nav frame PNG.
    await expectLater(
      find.byType(MaterialApp),
      matchesGoldenFile('nav_shell.png'),
    );

    // (2) Render-tree ↔ node-tree cross-check → committed evidence.
    final rendered = renderedKeys(tester, 'nav-tab-');
    final md = renderCrossCheckMarkdown(
      ticket: 'TAM-164',
      figmaNode: '2612:18143',
      screen: 'App shell — bottom navigation (5-tab, TAM-164)',
      rows: _navRows,
      renderedComponents: rendered,
    );
    writeEvidence('TAM-164', 'cross-check.md', md);

    // The nav MUST match its Figma children exactly — no tab missing, no stray.
    final result = crossCheck(
      figmaComponents: _navRows.map((r) => r.component).toList(),
      renderedComponents: rendered,
    );
    expect(result.ok, isTrue, reason: 'missing nav tabs: ${result.missing}');
    expect(result.stray, isEmpty, reason: 'stray nav tabs: ${result.stray}');
    expect(md, contains('Verdict**: PASS'));
  });
}
