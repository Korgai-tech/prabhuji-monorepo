import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/features/onboarding/data/users_repository.dart';
import 'package:mobile/features/shell/presentation/app_shell_scaffold.dart';
import 'package:mobile/state/providers.dart';

/// A keyed stand-in for a shell branch's screen.
///
/// These tests assert the SHELL's behaviour (branch switching + IndexedStack
/// state preservation), so a branch only has to be identifiable — it must not
/// drag in a real module's providers/repositories.
///
/// This used to be `ModulePlaceholderScreen` from `lib/`, which existed because
/// Status/Horoscope/Books had no screens yet. All five branches now ship real
/// screens, so that production widget was deleted as dead code and its only
/// remaining consumer — this test — carries its own two-line stub instead.
class _BranchStub extends StatelessWidget {
  const _BranchStub({required this.name});
  final String name;

  @override
  Widget build(BuildContext context) => Scaffold(
        key: Key('module-placeholder-$name'),
        body: Center(child: Text(name)),
      );
}

/// A router mirroring `router.dart`'s StatefulShellRoute branch set. The Home
/// branch hosts a scrollable so we can assert IndexedStack state preservation.
///
/// TAM-164 grew the shell to 5 branches: Home / Chat / Status / Downloads /
/// Rashifal (Horoscope renamed + moved to index 4, Chat inserted at index 1).
/// `_BottomNav` always filters the chat entry out of the visible tab row (the
/// entry is Home's FAB) — the branch itself stays registered so `IndexedStack`
/// keeps a stable branch count.
GoRouter _buildShellRouter() {
  return GoRouter(
    initialLocation: '/home',
    routes: [
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            AppShellScaffold(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(
            routes: [GoRoute(path: '/home', builder: (_, _) => const _ScrollBranch())],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/chat',
                builder: (_, _) => const _BranchStub(name: 'chat'),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/status',
                builder: (_, _) => const _BranchStub(name: 'status'),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/downloads',
                builder: (_, _) => const _BranchStub(name: 'downloads'),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/rashifal',
                builder: (_, _) => const _BranchStub(name: 'rashifal'),
              ),
            ],
          ),
        ],
      ),
    ],
  );
}

/// Synthetic [MeUser] whose `chatConfig.enabled` is the caller's choice.
/// The shell reads `meProvider` for the chat-tab visibility filter; feeding
/// `chatConfig.enabled == true` here makes the chat tab render.
MeUser _fakeMe({required bool chatEnabled}) => MeUser(
      id: 'test-user',
      name: 'Tester',
      selectedLanguage: 'hi',
      onboardingCompletedAt: DateTime(2026),
      phoneCountryCode: '+91',
      phoneNumber: '9999999999',
      chatConfig: MeChatConfig(
        enabled: chatEnabled,
        agentId: chatEnabled ? 'test-agent-id' : null,
      ),
    );

class _ScrollBranch extends StatelessWidget {
  const _ScrollBranch();

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      itemCount: 30,
      itemBuilder: (_, i) => SizedBox(
        height: 100,
        child: Center(child: Text('home-item-$i')),
      ),
    );
  }
}

Future<void> _pump(
  WidgetTester tester,
  GoRouter router, {
  bool? chatEnabled,
}) async {
  // The shell now mounts the Riverpod-driven MiniPlayer (TAM-59) above the
  // bottom nav, so a ProviderScope must be present. With no active playback the
  // mini-player renders SizedBox.shrink() and touches no audio engine.
  //
  // `chatEnabled` overrides `meProvider` so the chat tab renders (or not); by
  // default the shell fails soft to no chat tab.
  final scope = chatEnabled == null
      ? ProviderScope(child: MaterialApp.router(routerConfig: router))
      : ProviderScope(
          overrides: [
            meProvider
                .overrideWith((ref) async => _fakeMe(chatEnabled: chatEnabled)),
          ],
          child: MaterialApp.router(routerConfig: router),
        );
  await tester.pumpWidget(scope);
  await tester.pumpAndSettle();
}

void main() {
  group('Bottom-nav shell', () {
    testWidgets(
      'boots on Home with 4 default tabs present (chat hidden by A/B fail-soft)',
      (tester) async {
        await _pump(tester, _buildShellRouter());

        // Default meProvider yields no `chatConfig` → chat tab hidden. The
        // remaining four tabs render in the new TAM-164 order.
        for (final key in [
          'nav-tab-home',
          'nav-tab-status',
          'nav-tab-downloads',
          'nav-tab-rashifal',
        ]) {
          expect(find.byKey(Key(key)), findsOneWidget, reason: '$key missing');
        }
        // Legacy tabs must NOT be present.
        expect(find.byKey(const Key('nav-tab-mandir')), findsNothing);
        expect(find.byKey(const Key('nav-tab-books')), findsNothing);
        // Pre-rename key must NOT be present after TAM-164.
        expect(find.byKey(const Key('nav-tab-horoscope')), findsNothing);
        // Chat is hidden when disabled — the branch stays registered but the
        // tab does not render in the visible row.
        expect(find.byKey(const Key('nav-tab-chat')), findsNothing);
        expect(find.text('home-item-0'), findsOneWidget);
      },
    );

    testWidgets(
      'chat tab never renders, even when chatConfig.enabled == true',
      (tester) async {
        // Chat's entry moved to the Home extended FAB (Figma 3914:11348).
        await _pump(tester, _buildShellRouter(), chatEnabled: true);
        expect(find.byKey(const Key('nav-tab-chat')), findsNothing);
        expect(find.byKey(const Key('nav-tab-home')), findsOneWidget);
      },
    );

    testWidgets('tapping each tab switches branch', (tester) async {
      await _pump(tester, _buildShellRouter());

      await tester.tap(find.byKey(const Key('nav-tab-status')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('module-placeholder-status')), findsOneWidget);

      await tester.tap(find.byKey(const Key('nav-tab-rashifal')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('module-placeholder-rashifal')), findsOneWidget);
    });

    // The Mandir-tab and Books-tab tests were dropped: Mandir was retired
    // from the shell (its coming-soon screen still lives in `lib/` for
    // reference but is no longer reachable via the nav) and Books is a
    // top-level route pushed OVER the shell, not a branch. See
    // `apps/mobile/doc/bottom-nav-routing.md` for the retirement rationale.

    testWidgets('switching away and back preserves scroll position (IndexedStack)',
        (tester) async {
      await _pump(tester, _buildShellRouter());

      // Scroll the Home branch so item 0 leaves the viewport.
      await tester.drag(find.byType(ListView), const Offset(0, -1200));
      await tester.pumpAndSettle();
      expect(find.text('home-item-0'), findsNothing);
      expect(find.text('home-item-15'), findsOneWidget);

      // Switch away…
      await tester.tap(find.byKey(const Key('nav-tab-status')));
      await tester.pumpAndSettle();
      // …and back.
      await tester.tap(find.byKey(const Key('nav-tab-home')));
      await tester.pumpAndSettle();

      // Scroll offset survived the round trip.
      expect(find.text('home-item-0'), findsNothing);
      expect(find.text('home-item-15'), findsOneWidget);
    });
  });

  group('Render-tree ↔ Figma cross-check (nav 2612:18143)', () {
    // The five bottom-nav children per TAM-164 (Figma frame `2612:18143`):
    // Home / Chat / Status / Downloads / Rashifal (Horoscope renamed + moved
    // to index 4, Chat inserted at index 1). Chat is never rendered — its
    // entry is the Home FAB — so the render check skips it.
    const figmaNavLabels = ['Home', 'Chat', 'Status', 'Downloads', 'Rashifal'];
    const renderedNavLabels = ['Home', 'Status', 'Downloads', 'Rashifal'];

    test('kShellDestinations matches the Figma nav children exactly', () {
      expect(
        kShellDestinations.map((d) => d.label).toList(),
        figmaNavLabels,
        reason: 'rendered nav destinations must equal the shell nav (5-tab)',
      );
    });

    testWidgets('every Figma nav label renders as a tab + writes the dump',
        (tester) async {
      await _pump(tester, _buildShellRouter(), chatEnabled: true);

      for (final label in renderedNavLabels) {
        expect(find.text(label), findsWidgets, reason: '$label tab missing');
      }
      expect(find.text('Chat'), findsNothing);

      // Dump the rendered widget tree as the cross-check artifact.
      final tree = WidgetsBinding.instance.rootElement!.toStringDeep();
      final navTabs =
          kShellDestinations.map((d) => '${d.key} → "${d.label}"').join('\n  ');

      final dir = Directory('${Directory.current.path}/../../'
          'specs/evidence/TAM-164/fidelity');
      dir.createSync(recursive: true);
      File('${dir.path}/render-tree-dump.txt').writeAsStringSync(
        'TAM-164 bottom-nav render-tree cross-check\n'
        'Figma node: 2612:18143\n'
        'Figma nav children (in order): $figmaNavLabels\n\n'
        'Rendered nav destinations:\n  $navTabs\n\n'
        '--- WidgetsBinding.rootElement.toStringDeep() ---\n$tree\n',
      );
    });
  });
}
