import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/entitlement.dart';
import 'package:mobile/features/chat/chat_analytics.dart';
import 'package:mobile/features/chat/chat_providers.dart';
import 'package:mobile/features/chat/data/chat_counters.dart';
import 'package:mobile/features/home/presentation/home_chat_fab.dart';
import 'package:mobile/features/onboarding/data/users_repository.dart';
import 'package:mobile/state/providers.dart';

import '../../../support/fake_analytics.dart';

MeUser _me({required bool enabled, String? chatType}) => MeUser(
  id: 'test-user',
  name: 'Tester',
  selectedLanguage: 'hi',
  onboardingCompletedAt: DateTime(2026),
  phoneCountryCode: '+91',
  phoneNumber: '9999999999',
  chatConfig: MeChatConfig(
    enabled: enabled,
    agentId: enabled ? 'agent-1' : null,
    chatType: chatType,
  ),
);

/// Two-branch shell (Home / Chat) so the FAB's `goBranch(ShellBranch.chat)`
/// has a real target. Home hosts the FAB with a fixed [extended].
GoRouter _router({required bool extended}) => GoRouter(
  initialLocation: '/home',
  routes: [
    StatefulShellRoute.indexedStack(
      builder: (_, _, shell) => shell,
      branches: [
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/home',
              builder: (_, _) => Scaffold(
                floatingActionButton: HomeChatFab(extended: extended),
              ),
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/chat',
              builder: (_, _) => const Scaffold(body: Text('chat-branch')),
            ),
          ],
        ),
      ],
    ),
  ],
);

Future<RecordingAnalytics> _pump(
  WidgetTester tester, {
  required MeUser me,
  bool extended = true,
}) async {
  final analytics = RecordingAnalytics();
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        meProvider.overrideWith((ref) async => me),
        analyticsProvider.overrideWithValue(analytics),
        chatCountersProvider.overrideWithValue(ChatCounters.inMemory()),
        // Pro → PaywallGate runs the branch swap straight away.
        entitlementProvider.overrideWithValue(true),
      ],
      child: MaterialApp.router(routerConfig: _router(extended: extended)),
    ),
  );
  await tester.pumpAndSettle();
  return analytics;
}

void main() {
  group('HomeChatFab', () {
    for (final entry in HomeChatFab.labels.entries) {
      testWidgets('${entry.key} → "${entry.value}"', (tester) async {
        await _pump(tester, me: _me(enabled: true, chatType: entry.key));
        expect(find.byKey(const Key('home-chat-fab')), findsOneWidget);
        expect(find.text(entry.value), findsOneWidget);
      });
    }

    testWidgets('control arm (chat not granted) → no FAB', (tester) async {
      await _pump(tester, me: _me(enabled: false, chatType: 'control'));
      expect(find.byKey(const Key('home-chat-fab')), findsNothing);
    });

    testWidgets('unknown arm → no FAB', (tester) async {
      await _pump(tester, me: _me(enabled: true, chatType: 'some_new_arm'));
      expect(find.byKey(const Key('home-chat-fab')), findsNothing);
    });

    testWidgets('collapsed → icon only, no label', (tester) async {
      await _pump(
        tester,
        me: _me(enabled: true, chatType: 'content_chat'),
        extended: false,
      );
      expect(find.byKey(const Key('home-chat-fab')), findsOneWidget);
      expect(find.byKey(const Key('home-chat-fab-label')), findsNothing);
      // Collapsed is a 48×48 circle.
      expect(
        tester.getSize(find.byKey(const Key('home-chat-fab'))),
        const Size(48, 48),
      );
    });

    for (final extended in [true, false]) {
      testWidgets('tap (${extended ? 'extended' : 'collapsed'}) fires '
          'chat_button_clicked with chat_type and opens chat', (tester) async {
        final analytics = await _pump(
          tester,
          me: _me(enabled: true, chatType: 'bhagwat_gita_chat'),
          extended: extended,
        );

        await tester.tap(find.byKey(const Key('home-chat-fab')));
        await tester.pumpAndSettle();

        expect(analytics.allProps(ChatEvents.chatButtonClicked), hasLength(1));
        final props = analytics.propsFor(ChatEvents.chatButtonClicked);
        expect(props[ChatEventProps.chatType], 'bhagwat_gita_chat');
        expect(props[ChatEventProps.agentId], 'agent-1');
        expect(props[ChatEventProps.entryPoint], ChatEntryPoint.home);
        expect(find.text('chat-branch'), findsOneWidget);
      });
    }
  });
}
