import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/api/generated/openapi.dart';
import 'package:mobile/core/entitlement.dart';
import 'package:mobile/core/paywall_gate.dart';
import 'package:mobile/features/aarti/aarti_routes.dart';
import 'package:mobile/features/chat/application/chat_bloc.dart';
import 'package:mobile/features/chat/application/chat_event.dart';
import 'package:mobile/features/chat/chat_providers.dart';
import 'package:mobile/features/chat/chat_routes.dart';
import 'package:mobile/features/chat/data/chat_counters.dart';
import 'package:mobile/features/chat/presentation/chat_screen.dart';
import 'package:mobile/features/horoscope/horoscope_routes.dart';
import 'package:mobile/features/mantras/mantras_routes.dart';
import 'package:mobile/features/paywall/presentation/paywall_screen.dart';
import 'package:mobile/features/ringtone/ringtone_routes.dart';
import 'package:mobile/features/shell/presentation/app_shell_scaffold.dart';
import 'package:mobile/features/status/status_routes.dart';
import 'package:mobile/features/wallpaper/wallpaper_providers.dart';
import 'package:mobile/features/wallpaper/wallpaper_routes.dart';

import '../../support/chat_harness.dart';
import '../../support/fake_repositories.dart';

/// Every chat content-card destination, driven through the REAL [ChatScreen]
/// inside the REAL [AppShellScaffold], now that chat has no nav tab (entry is
/// the Home FAB):
///
///  * module screens are pushed OVER the shell → back returns to chat;
///  * Status / Rashifal are shell tabs → back follows the shell rule and
///    lands on Home, like any other tab.
///
/// The shell mirrors `router.dart`: five branches, module routes registered
/// top-level (over the shell), the chat status pin riding on the Status
/// branch's own `/status` route as `?pinnedId=`.

const _msgId = 'bot-1';

ChatContentItem _item(String id, {String? playUrl = 'https://cdn/x'}) =>
    ChatContentItem(id: id, title: 'Item $id', playUrl: playUrl, icon: '');

/// [stripped] mirrors what the server actually serves a FREE caller:
/// `chat.content.ts` withholds `playUrl` on the gated types (aarti, bhajan,
/// mantra, ringtone) and serves it on the rest. That null is what paints the
/// lock badge, so a free-user test must not be handed a Pro payload.
ChatHistoryResponseData _history({bool stripped = false}) => buildHistoryWith(
  transcript: <ChatMessage>[
    ChatMessage(
      id: _msgId,
      sessionId: 'session-1',
      role: ChatMessageRoleEnum.bot,
      message: 'Yeh dekhiye',
      confidence: null,
      content: ChatContentGroups(
        aarti: [_item('a1', playUrl: stripped ? null : 'https://cdn/x')],
        mantra: [_item('m1', playUrl: stripped ? null : 'https://cdn/x')],
        ringtone: [_item('r1', playUrl: stripped ? null : 'https://cdn/x')],
        // Ungated on every surface — served to free callers too.
        wallpaper: [_item('w1')],
        status: [_item('s1')],
        // Horoscope never carries a playUrl; '' = open Rashifal main,
        // a zodiac slug = push the daily result.
        horoscope: [_item(''), _item('aries', playUrl: null)],
      ),
      createdAt: DateTime(2026, 9, 17),
    ),
  ],
);

Widget _dest(String name) => Scaffold(body: Center(child: Text('dest:$name')));

GoRouter _router({required bool isPro}) => GoRouter(
  initialLocation: ChatRoutes.chat,
  routes: [
    StatefulShellRoute.indexedStack(
      builder: (_, _, shell) => AppShellScaffold(navigationShell: shell),
      branches: [
        StatefulShellBranch(
          routes: [GoRoute(path: '/home', builder: (_, _) => _dest('home'))],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: ChatRoutes.chat,
              builder: (_, _) => BlocProvider<ChatBloc>(
                create: (_) => ChatBloc(
                  repository: FakeChatRepository(
                    seedHistory: _history(stripped: !isPro),
                  ),
                  counters: ChatCounters.inMemory(),
                  isPro: () => isPro,
                )..add(const ChatStarted()),
                child: const ChatScreen(),
              ),
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: StatusRoutes.home,
              builder: (_, state) {
                final pin =
                    state.uri.queryParameters[StatusRoutes.pinnedIdParam];
                return _dest(pin == null ? 'status' : 'status-pinned-$pin');
              },
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(path: '/downloads', builder: (_, _) => _dest('downloads')),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: HoroscopeRoutes.main,
              builder: (_, _) => _dest('rashifal'),
            ),
          ],
        ),
      ],
    ),
    GoRoute(
      path: AartiRoutes.deepLinkPattern,
      builder: (_, s) => _dest('aarti-${s.pathParameters['audioId']}'),
    ),
    GoRoute(
      path: MantrasRoutes.deepLinkPattern,
      builder: (_, s) => _dest('mantra-${s.pathParameters['itemId']}'),
    ),
    GoRoute(
      path: RingtoneRoutes.previewPattern,
      builder: (_, s) => _dest('ringtone-${s.pathParameters['id']}'),
    ),
    GoRoute(
      path: WallpaperRoutes.preview,
      builder: (_, _) => _dest('wallpaper-preview'),
    ),
    GoRoute(
      path: HoroscopeRoutes.resultPattern,
      builder: (_, s) => _dest('horoscope-${s.pathParameters['zodiacId']}'),
    ),
    // Renders its attribution into the destination text so the free-user
    // group can assert trigger_module / trigger_action / entry_source
    // without an analytics fake.
    GoRoute(
      path: '/paywall',
      builder: (_, s) {
        final args = s.extra as PaywallArgs?;
        return _dest(
          'paywall-${args?.triggerModule}-${args?.triggerAction}'
          '-${args?.entrySource}',
        );
      },
    ),
  ],
);

/// A flippable Pro flag — `refreshEntitlement` is the gate's purchase seam,
/// so flipping it there is exactly "the user bought Pro on the paywall".
class _ProFlag {
  _ProFlag(this.value);
  bool value;
}

/// [isPro] drives the content-card gate (`_gateContentTap`). Pro is the
/// destination-navigation case every test below asserts; the free case is its
/// own group at the bottom, where the same taps must land on the paywall.
///
/// The gate is overridden wholesale rather than just [entitlementProvider]
/// because `paywallGateProvider`'s real `refreshEntitlement` hits
/// `/subscription/status` through secure storage — no business of a
/// navigation test.
Future<void> _pump(
  WidgetTester tester, {
  bool isPro = true,
  bool purchasesOnPaywall = false,
}) async {
  final pro = _ProFlag(isPro);
  tester.view.physicalSize = const Size(400, 2400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        chatCountersProvider.overrideWith((ref) => ChatCounters.inMemory()),
        wallpaperRepositoryProvider.overrideWithValue(
          FakeWallpaperRepository(),
        ),
        entitlementProvider.overrideWithValue(isPro),
        paywallGateProvider.overrideWithValue(
          PaywallGate(
            isPro: () => pro.value,
            refreshEntitlement: () async {
              if (purchasesOnPaywall) pro.value = true;
            },
          ),
        ),
      ],
      child: MaterialApp.router(routerConfig: _router(isPro: isPro)),
    ),
  );
  await _settle(tester);
}

/// Chat keeps a looping animation alive, so `pumpAndSettle` never returns —
/// pump past the route transitions (300ms) instead.
Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 10; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Finder _card(String type, String id) =>
    find.byKey(Key('chat-card-$_msgId:$type:$id'));

Future<void> _tapCard(WidgetTester tester, String type, String id) async {
  await tester.ensureVisible(_card(type, id));
  await tester.tap(_card(type, id));
  await _settle(tester);
}

/// Android system back.
Future<void> _back(WidgetTester tester) async {
  await tester.binding.handlePopRoute();
  await _settle(tester);
}

void _expectOnChat() {
  expect(
    find.byKey(const Key('chat-composer-zone')),
    findsOneWidget,
    reason: 'back must land on chat',
  );
  expect(
    find.byKey(const Key('nav-tab-home')),
    findsNothing,
    reason: 'chat renders without the bottom nav',
  );
}

void main() {
  group('chat → content → back', () {
    // Pushed OVER the shell: no nav, back pops to chat.
    for (final (type, id, dest) in [
      ('aarti', 'a1', 'aarti-a1'),
      ('mantra', 'm1', 'mantra-m1'),
      ('ringtone', 'r1', 'ringtone-r1'),
      ('wallpaper', 'w1', 'wallpaper-preview'),
      ('horoscope', 'aries', 'horoscope-aries'),
    ]) {
      testWidgets('$type opens $dest over the shell', (tester) async {
        await _pump(tester);
        _expectOnChat();

        await _tapCard(tester, type, id);
        expect(find.text('dest:$dest'), findsOneWidget);
        expect(find.byKey(const Key('nav-tab-home')), findsNothing);

        await _back(tester);
        _expectOnChat();
      });
    }

    testWidgets('status opens the pinned status in the Status tab; one back '
        'goes Home', (tester) async {
      await _pump(tester);

      await _tapCard(tester, 'status', 's1');
      expect(find.text('dest:status-pinned-s1'), findsOneWidget);
      expect(
        find.byKey(const Key('nav-tab-status')),
        findsOneWidget,
        reason: 'status opens inside the shell with the nav visible',
      );

      // One back → Home. It used to pop to a second, identical-looking
      // Status feed first (the pin was a nested page on top of /status).
      await _back(tester);
      expect(find.text('dest:home'), findsOneWidget);
      expect(find.text('dest:status'), findsNothing);
    });

    testWidgets('generic horoscope opens the Rashifal tab; back goes Home', (
      tester,
    ) async {
      await _pump(tester);

      await _tapCard(tester, 'horoscope', '');
      expect(find.text('dest:rashifal'), findsOneWidget);
      expect(find.byKey(const Key('nav-tab-rashifal')), findsOneWidget);

      await _back(tester);
      expect(find.text('dest:home'), findsOneWidget);
    });

    testWidgets('chat is still reachable from Home after a tab hand-off', (
      tester,
    ) async {
      await _pump(tester);

      await _tapCard(tester, 'horoscope', '');
      await _back(tester);
      expect(find.text('dest:home'), findsOneWidget);

      // The chat branch kept its state (IndexedStack) — the transcript is
      // still there when the user returns.
      StatefulNavigationShell.of(
        tester.element(find.text('dest:home')),
      ).goBranch(1);
      await _settle(tester);
      _expectOnChat();
      expect(_card('status', 's1'), findsOneWidget);
    });
  });

  /// Chat entry is FREE (`CHAT_REQUIRES_PRO = false`), so a non-Pro user
  /// reaches these cards. Every one of them opens the paywall instead of the
  /// module — including the Pro-locked ones, which used to be inert cards
  /// with a lock badge and no tap at all.
  group('chat → content → paywall (free user)', () {
    for (final (type, id, module, action) in [
      ('aarti', 'a1', 'aarti_bhajans', 'play_audio'),
      ('mantra', 'm1', 'mantras_stutis', 'play_audio'),
      ('ringtone', 'r1', 'ringtone', 'play_ringtone'),
      ('wallpaper', 'w1', 'wallpaper', 'set_wallpaper'),
      ('status', 's1', 'status_sharing', 'share_status'),
      ('horoscope', 'aries', 'horoscope', 'open_horoscope'),
    ]) {
      testWidgets('$type opens the paywall as $module/$action', (tester) async {
        await _pump(tester, isPro: false);

        await _tapCard(tester, type, id);
        // entry_source is `chat` on every one — the surface. `trigger_module`
        // is the module being bought, so this aggregates with that module's
        // own gate.
        expect(find.text('dest:paywall-$module-$action-chat'), findsOneWidget);

        await _back(tester);
        _expectOnChat();
      });
    }

    testWidgets('a Pro-locked card is tappable — it was a dead end before', (
      tester,
    ) async {
      await _pump(tester, isPro: false);

      // `playUrl: null` (the server stripped it), which used to null out the
      // card's onTap entirely.
      expect(_card('aarti', 'a1'), findsOneWidget);
      await _tapCard(tester, 'aarti', 'a1');
      expect(find.text('dest:aarti-a1'), findsNothing);
      expect(
        find.textContaining('dest:paywall-'),
        findsOneWidget,
        reason: 'the lock must lead somewhere',
      );
    });

    testWidgets('purchasing on the paywall opens the content that was tapped', (
      tester,
    ) async {
      await _pump(tester, isPro: false, purchasesOnPaywall: true);

      await _tapCard(tester, 'aarti', 'a1');
      expect(find.text('dest:paywall-aarti_bhajans-play_audio-chat'),
          findsOneWidget);

      // Paywall dismissed after a successful purchase — the gate re-reads
      // entitlement and resumes the ORIGINAL tap. Navigating by contentId is
      // what makes this work while the transcript's `playUrl` is still null.
      await _back(tester);
      expect(find.text('dest:aarti-a1'), findsOneWidget);

      // And the content stacked on CHAT, not on Home. This is what the
      // paywall's `returnToCaller` dismiss mode buys: the purchase pops back
      // to chat first, so the resumed push has chat underneath it. With the
      // paywall's default `goHome` the user would land here with Home behind
      // them and the conversation gone from the back stack.
      await _back(tester);
      _expectOnChat();
    });

    testWidgets('cancelling on the paywall leaves the user on chat', (
      tester,
    ) async {
      await _pump(tester, isPro: false);

      await _tapCard(tester, 'mantra', 'm1');
      await _back(tester);
      _expectOnChat();
      expect(find.text('dest:mantra-m1'), findsNothing);
    });
  });
}
