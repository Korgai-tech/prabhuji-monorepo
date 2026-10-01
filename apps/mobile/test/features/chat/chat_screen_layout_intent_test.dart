import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/features/chat/application/chat_bloc.dart';
import 'package:mobile/features/chat/application/chat_event.dart';
import 'package:mobile/features/chat/chat_providers.dart';
import 'package:mobile/features/chat/chat_routes.dart';
import 'package:mobile/features/chat/data/chat_counters.dart';
import 'package:mobile/features/chat/presentation/chat_screen.dart';
import 'package:mobile/features/home/presentation/home_chat_fab.dart';
import 'package:mobile/features/onboarding/data/users_repository.dart';
import 'package:mobile/features/shell/presentation/app_shell_scaffold.dart';
import 'package:mobile/state/providers.dart';

import '../../support/chat_harness.dart';
import '../../support/fake_chat_video_port.dart';

/// Layout-intent test for the Chat screen (TAM-164, Figma `2612:17646`).
///
/// Per spec §Layout intent, the chat screen has:
///
///   * pinned-top app bar         (Key('chat-appbar'))
///   * flex-fill transcript zone  (Key('chat-transcript'))
///   * pinned-bottom composer     (Key('chat-composer-zone'))
///
/// At every device height the composer must sit flush against the bottom
/// edge, the app bar must sit at the top, and the transcript is the only
/// scrollable in the tree.
///
/// The test also asserts the shell hides the bottom nav while the chat
/// branch is active — the atypical shell behaviour that Figma frames
/// `2612:17647` / `2612:17701` / `2612:17716` / `2612:17787` / `2612:17837`
/// all render (back-arrow app bar + no bottom nav).
void main() {
  const width = 360.0;
  const heights = <double>[600, 800, 1200];

  group('Chat screen layout intent', () {
    for (final h in heights) {
      testWidgets('layout intent holds at ${h.toInt()}dp', (tester) async {
        tester.view.physicalSize = Size(width, h);
        tester.view.devicePixelRatio = 1.0;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);

        // Pump the chat screen directly (single-branch harness); the shell
        // integration is exercised in a separate group below.
        await pumpChatScreen(tester, size: Size(width, h));

        // 1. Pinned-top app bar sits at y = 0.
        final appBar = tester.getRect(find.byKey(const Key('chat-appbar')));
        expect(
          appBar.top,
          closeTo(0, 0.5),
          reason: 'pinned-top app bar must sit at y=0 (was ${appBar.top})',
        );

        // 2. Composer is flush with the bottom edge.
        final composer = tester.getRect(
          find.byKey(const Key('chat-composer-zone')),
        );
        expect(
          composer.bottom,
          closeTo(h, 0.5),
          reason:
              'composer must be flush with bottom edge (was ${composer.bottom}, expected $h)',
        );

        // 3. Transcript flex-fill expands to consume the remainder.
        final transcript = tester.getRect(
          find.byKey(const Key('chat-transcript')),
        );
        expect(
          transcript.top,
          closeTo(appBar.bottom, 0.5),
          reason: 'transcript must sit directly under the app bar',
        );
        expect(
          transcript.bottom,
          closeTo(composer.top, 0.5),
          reason: 'transcript must sit directly above the composer',
        );

        // 4. The transcript zone owns the ONE user-facing scrollable.
        //    (The composer's `TextField` creates its own internal
        //    Scrollable inside `EditableText`; that is expected and not
        //    counted against the "one flex-fill scroll" rule — it never
        //    scrolls the screen, only the text input's overflowing
        //    content.)
        expect(
          find.descendant(
            of: find.byKey(const Key('chat-transcript')),
            matching: find.byType(Scrollable),
          ),
          findsOneWidget,
          reason:
              'the transcript zone must contain exactly one Scrollable — '
              'the flex-fill list view (or the empty-state SingleChildScrollView)',
        );
        // Assert the screen root is NOT itself a Scrollable — the classic
        // "whole-screen SingleChildScrollView" regression this pattern
        // exists to catch.
        expect(
          find
              .descendant(
                of: find.byType(Scaffold),
                matching: find.byType(Scrollable),
              )
              .evaluate()
              .where((e) {
                // Filter out any Scrollable that is a descendant of the
                // composer (EditableText's internal one).
                final ancestors = <Element>[];
                e.visitAncestorElements((a) {
                  ancestors.add(a);
                  return true;
                });
                final composerRoot = find
                    .byKey(const Key('chat-composer-zone'))
                    .evaluate()
                    .firstOrNull;
                if (composerRoot == null) return true;
                return !ancestors.contains(composerRoot);
              })
              .length,
          1,
          reason:
              'exactly one non-composer Scrollable expected on-screen — '
              'the transcript. A second (non-composer) Scrollable means '
              'someone wrapped the screen root in a SingleChildScrollView.',
        );
      });
    }
  });

  group('Shell hides bottom nav while chat branch is active (TAM-164)', () {
    // Verifies the atypical shell behaviour called out in spec §Layout
    // intent: every Figma chat frame renders WITHOUT the bottom nav. The
    // shell scaffold conditionally hides `_BottomNav` when
    // `navigationShell.currentIndex == _chatBranchIndex`.

    for (final h in heights) {
      testWidgets('nav-hidden-on-chat at ${h.toInt()}dp', (tester) async {
        tester.view.physicalSize = Size(width, h);
        tester.view.devicePixelRatio = 1.0;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);

        final router = _buildChatEnabledShellRouter();
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              meProvider.overrideWith(
                (ref) async => _fakeMe(chatEnabled: true),
              ),
              // The chat app-bar reads `chatCountersProvider` for the
              // kuldevta-name persistence + fallback (TAM-166). The
              // production provider needs SharedPreferences from the
              // service locator, which isn't registered in widget
              // tests — swap for the in-memory factory.
              chatCountersProvider.overrideWith(
                (ref) => ChatCounters.inMemory(),
              ),
              // Chat is no longer paywalled, so the FAB tap now actually
              // reaches the chat branch and mounts the REAL ChatScreen.
              // Before that, a non-Pro user was pushed to `/paywall` — a
              // route this minimal router does not define — so the branch
              // never activated and this group asserted "no nav tabs"
              // against GoRouter's error page. The two overrides below are
              // what `pumpChatScreen` has always needed and this group
              // never exercised:
              //
              //   * analytics must be null in widget tests (apps/mobile
              //     CLAUDE.md) — the real one does async init that never
              //     settles under pumpAndSettle.
              //   * `MediaKit.ensureInitialized()` only runs in `main()`, so
              //     a real `Player()` throws synchronously here; the intro
              //     card mounts straight from the transcript.
              analyticsProvider.overrideWithValue(null),
              chatVideoPortFactoryProvider.overrideWithValue(
                FakeChatVideoPort.new,
              ),
            ],
            child: MaterialApp.router(routerConfig: router),
          ),
        );
        await tester.pumpAndSettle();

        // On Home: the nav row is visible and chat's entry is the FAB.
        expect(find.byKey(const Key('nav-tab-home')), findsOneWidget);

        // Open chat via the FAB and verify the bottom nav DISAPPEARS.
        await tester.tap(find.byKey(const Key('home-chat-fab')));
        await tester.pumpAndSettle();

        // Any tab that would normally render on the shell — home / status /
        // downloads / rashifal — must be absent from the widget tree while
        // the chat branch is active.
        for (final key in <String>[
          'nav-tab-home',
          'nav-tab-chat',
          'nav-tab-status',
          'nav-tab-downloads',
          'nav-tab-rashifal',
        ]) {
          expect(
            find.byKey(Key(key)),
            findsNothing,
            reason: '$key must NOT render while the chat branch is active',
          );
        }
      });
    }
  });
}

/// A minimal 5-branch shell router used by the "nav-hidden-on-chat" group.
/// Home is a scrollable stub; the chat branch mounts the REAL [ChatScreen]
/// wired to a `FakeChatRepository` via the ChatBloc's isPro closure default
/// (chat_screen's bloc reads `entitlementProvider` in production but the
/// harness provides `isPro: () => true` at BlocProvider construction).
GoRouter _buildChatEnabledShellRouter() {
  return GoRouter(
    initialLocation: '/home',
    routes: <RouteBase>[
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            AppShellScaffold(navigationShell: navigationShell),
        branches: <StatefulShellBranch>[
          StatefulShellBranch(
            routes: <RouteBase>[
              GoRoute(
                path: '/home',
                builder: (_, _) => const Scaffold(
                  body: Center(child: Text('home')),
                  floatingActionButton: HomeChatFab(extended: true),
                ),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: <RouteBase>[
              GoRoute(
                path: ChatRoutes.chat,
                builder: (_, _) => BlocProvider<ChatBloc>(
                  // `..add(ChatStarted())` matches production
                  // (`core/router.dart`) and `pumpChatScreen`. Without it the
                  // bloc never leaves `ChatInitial`, whose body is an
                  // indeterminate `CircularProgressIndicator` — an animation
                  // that never ends, so `pumpAndSettle` times out instead of
                  // reaching the assertions.
                  create: (_) => ChatBloc(
                    repository: FakeChatRepository(),
                    counters: ChatCounters.inMemory(),
                    isPro: () => true,
                  )..add(const ChatStarted()),
                  child: const ChatScreen(),
                ),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: <RouteBase>[
              GoRoute(
                path: '/status',
                builder: (_, _) => const _StubScreen(name: 'status'),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: <RouteBase>[
              GoRoute(
                path: '/downloads',
                builder: (_, _) => const _StubScreen(name: 'downloads'),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: <RouteBase>[
              GoRoute(
                path: '/rashifal',
                builder: (_, _) => const _StubScreen(name: 'rashifal'),
              ),
            ],
          ),
        ],
      ),
    ],
  );
}

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
    chatType: chatEnabled ? 'content_chat' : null,
  ),
);

class _StubScreen extends StatelessWidget {
  const _StubScreen({required this.name});
  final String name;
  @override
  Widget build(BuildContext context) =>
      Scaffold(body: Center(child: Text(name)));
}
