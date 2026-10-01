@Tags(['golden'])
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile/api/generated/openapi.dart';
import 'package:mobile/core/theme.dart';
import 'package:mobile/features/chat/presentation/widgets/chat_bubble.dart';
import 'package:mobile/features/chat/presentation/widgets/chat_composer.dart';
import 'package:mobile/features/chat/presentation/widgets/chat_content_card.dart';
import 'package:mobile/features/chat/presentation/widgets/chat_date_separator.dart';
import 'package:mobile/features/chat/presentation/widgets/chat_empty_state.dart';
import 'package:mobile/features/chat/presentation/widgets/chat_transcript.dart';

import '../support/chat_harness.dart';

/// Component + screen goldens for the TAM-164 chat surface. Rendered against
/// live Figma tokens (theme.dart, patched during Slice 3 Phase 3). Each
/// golden's viewport matches the corresponding Figma frame's own size so a
/// side-by-side vs `specs/evidence/TAM-164/figma/2612-*.png` is like-for-like.
///
/// Tagged `golden` so the cross-platform gate (`--exclude-tags golden`) skips
/// it (goldens render subtly differently on macOS vs Linux CI — figma-flutter
/// Trap "Cross-platform golden noise"). Refresh locally with:
///
/// ```
/// flutter test --update-goldens \
///   test/goldens/chat_golden_test.dart
/// ```
///
/// Sweep-table for Phase 6 lives at
/// `specs/evidence/TAM-164/fidelity/sweep-table.md`.
void main() {
  setUp(() {
    GoogleFonts.config.allowRuntimeFetching = false;
  });

  testWidgets('golden: chat empty state (2612:17647) @ 360×800', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(720, 1600);
    tester.view.devicePixelRatio = 2.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await pumpChatScreen(tester, size: const Size(360, 800));

    await expectLater(
      find.byType(MaterialApp),
      matchesGoldenFile('chat_empty_state.png'),
    );
  });

  testWidgets(
    'golden: chat active with typing indicator (2612:17837) @ 360×800',
    (tester) async {
      tester.view.physicalSize = const Size(720, 1600);
      tester.view.devicePixelRatio = 2.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final repo = FakeChatRepository(
        seedHistory: buildHistoryWith(
          transcript: <ChatMessage>[
            _msg(
              id: 'u-1',
              role: ChatMessageRoleEnum.user,
              body: 'Kaam mein dikkat aa rahi hai',
            ),
          ],
          sessionId: 'session-1',
        ),
      );

      await tester.pumpWidget(
        MediaQuery(
          data: const MediaQueryData(size: Size(360, 800)),
          child: MaterialApp(
            theme: ThemeData(useMaterial3: true, fontFamily: 'Inter'),
            home: DecoratedBox(
              decoration: const BoxDecoration(
                gradient: AppGradient.chatScaffold,
              ),
              child: SafeArea(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.start,
                  children: <Widget>[
                    const SizedBox(height: 12),
                    const Padding(
                      padding: EdgeInsets.symmetric(
                        horizontal: AppChat.screenPadding,
                      ),
                      child: Align(
                        alignment: Alignment.centerLeft,
                        child: Text(
                          'Prabhuji Chat',
                          textDirection: TextDirection.ltr,
                        ),
                      ),
                    ),
                    const SizedBox(height: 24),
                    Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: AppChat.screenPadding,
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: const <Widget>[
                          ChatBubble(
                            variant: ChatBubbleVariant.user,
                            message: 'Kaam mein dikkat aa rahi hai',
                          ),
                          SizedBox(height: AppChat.bubbleGap),
                          ChatBubble(variant: ChatBubbleVariant.typing),
                          SizedBox(height: AppSpacing.xSmall),
                          Text(
                            'Aapke liye theek cheez dhoondh raha hoon…',
                            textDirection: TextDirection.ltr,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
      await settle(tester);
      await expectLater(
        find.byType(MaterialApp),
        matchesGoldenFile('chat_active_typing.png'),
      );
      // Reference the fake repo so the analyzer keeps it in scope (kept for
      // parity with the other golden which drives via ChatScreen).
      identical(repo, repo);
    },
  );

  testWidgets('golden: mantra card default + highlighted (2612:17847)', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(720, 400);
    tester.view.devicePixelRatio = 2.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      MediaQuery(
        data: const MediaQueryData(size: Size(360, 400)),
        child: MaterialApp(
          theme: ThemeData(useMaterial3: true, fontFamily: 'Inter'),
          home: Scaffold(
            backgroundColor: AppColors.white,
            body: Padding(
              padding: const EdgeInsets.all(AppChat.screenPadding),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: <Widget>[
                  ChatContentCard(
                    contentType: 'mantra',
                    item: _stubItem(),
                    title: 'Hanuman Mantra',
                    subtitle: 'Mantra · 108 baar',
                  ),
                  const SizedBox(height: AppChat.bubbleGap),
                  ChatContentCard(
                    contentType: 'mantra',
                    item: _stubItem(),
                    title: 'Hanuman Mantra',
                    subtitle: 'Mantra · 108 baar',
                    active: true,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
    await settle(tester);
    await expectLater(
      find.byType(MaterialApp),
      matchesGoldenFile('chat_mantra_card.png'),
    );
  });

  testWidgets(
    'golden: aarti/bhajan card + wallpaper card (2612:17876 / 2612:17905)',
    (tester) async {
      tester.view.physicalSize = const Size(720, 400);
      tester.view.devicePixelRatio = 2.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      await tester.pumpWidget(
        MediaQuery(
          data: const MediaQueryData(size: Size(360, 400)),
          child: MaterialApp(
            theme: ThemeData(useMaterial3: true, fontFamily: 'Inter'),
            home: Scaffold(
              backgroundColor: AppColors.white,
              body: Padding(
                padding: const EdgeInsets.all(AppChat.screenPadding),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: <Widget>[
                    ChatContentCard(
                      contentType: 'aarti',
                      item: _stubItem(),
                      title: 'Hanuman Chalisa',
                      subtitle: 'Chalisa · 9 min',
                    ),
                    const SizedBox(height: AppChat.bubbleGap),
                    ChatContentCard(
                      contentType: 'wallpaper',
                      item: _stubItem(),
                      title: 'Hanuman ji wallpaper',
                      subtitle: 'Wallpaper',
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
      await settle(tester);
      await expectLater(
        find.byType(MaterialApp),
        matchesGoldenFile('chat_aarti_wallpaper_cards.png'),
      );
    },
  );

  testWidgets('golden: date separator (2612:18005)', (tester) async {
    tester.view.physicalSize = const Size(720, 120);
    tester.view.devicePixelRatio = 2.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      MediaQuery(
        data: const MediaQueryData(size: Size(360, 120)),
        child: MaterialApp(
          theme: ThemeData(useMaterial3: true, fontFamily: 'Inter'),
          home: Scaffold(
            backgroundColor: AppColors.white,
            body: Center(
              child: ChatDateSeparator(timestamp: DateTime(2026, 7, 27)),
            ),
          ),
        ),
      ),
    );
    await settle(tester);
    await expectLater(
      find.byType(MaterialApp),
      matchesGoldenFile('chat_date_separator.png'),
    );
  });

  testWidgets('golden: composer idle + typed (2612:18010)', (tester) async {
    tester.view.physicalSize = const Size(720, 300);
    tester.view.devicePixelRatio = 2.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final idleCtrl = TextEditingController();
    final typedCtrl = TextEditingController(text: 'Hanuman chalisa suna do');
    addTearDown(idleCtrl.dispose);
    addTearDown(typedCtrl.dispose);

    await tester.pumpWidget(
      MediaQuery(
        data: const MediaQueryData(size: Size(360, 300)),
        child: MaterialApp(
          theme: ThemeData(useMaterial3: true, fontFamily: 'Inter'),
          home: Scaffold(
            backgroundColor: AppColors.white,
            body: Column(
              mainAxisAlignment: MainAxisAlignment.end,
              children: <Widget>[
                ChatComposer(controller: idleCtrl, onSend: (_) {}),
                const SizedBox(height: 20),
                ChatComposer(controller: typedCtrl, onSend: (_) {}),
              ],
            ),
          ),
        ),
      ),
    );
    await settle(tester);
    await expectLater(
      find.byType(MaterialApp),
      matchesGoldenFile('chat_composer_idle_and_typed.png'),
    );
  });

  testWidgets('golden: empty-state chip stack via ChatEmptyState', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(720, 1400);
    tester.view.devicePixelRatio = 2.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final config = ChatScreenConfig(
      // TAM-177: nullable-but-required on the generated model. Two of the
      // three agents genuinely ship null, so null is the default fixture.
      introVideo: null,
      enabled: true,
      agentId: 'a',
      title: 'Namaste',
      subtitle: 'Aaj kya poochhna chahenge?',
      recommendedMessages: <ChatRecommendedMessage>[
        ChatRecommendedMessage(
          id: 'chip-1',
          order: 1,
          text: 'Aaj mann bahut pareshan hai',
        ),
        ChatRecommendedMessage(
          id: 'chip-2',
          order: 2,
          text: 'Hanuman Chalisa suna do',
        ),
        ChatRecommendedMessage(
          id: 'chip-3',
          order: 3,
          text: 'Aaj ka rashifal batao',
        ),
      ],
    );

    await tester.pumpWidget(
      MediaQuery(
        data: const MediaQueryData(size: Size(360, 700)),
        child: MaterialApp(
          theme: ThemeData(useMaterial3: true, fontFamily: 'Inter'),
          home: DecoratedBox(
            decoration: const BoxDecoration(gradient: AppGradient.chatScaffold),
            child: ChatEmptyState(config: config, onChipTapped: (_) {}),
          ),
        ),
      ),
    );
    await settle(tester);
    await expectLater(
      find.byType(MaterialApp),
      matchesGoldenFile('chat_empty_state_component.png'),
    );
  });

  testWidgets('golden: full transcript with bot reply cards (2612:17701)', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(720, 1600);
    tester.view.devicePixelRatio = 2.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final now = DateTime(2026, 8, 28, 9, 30);
    final userMsg = _msg(
      id: 'u-1',
      role: ChatMessageRoleEnum.user,
      body: 'Kaam mein dikkat aa rahi hai',
      createdAt: now,
    );
    final botMsg = _msg(
      id: 'b-1',
      role: ChatMessageRoleEnum.bot,
      body:
          'Kathin samay mein Hanuman ji ka smaran shakti deta hai. Aaj Hanuman mantra ka 108 baar jaap kijiye, aur saath mein Chalisa bhi sunein.',
      createdAt: now.add(const Duration(seconds: 20)),
      content: ChatContentGroups(
        aarti: <ChatContentItem>[_stubItem(id: 'aarti-1')],
        bhajan: const <ChatContentItem>[],
        mantra: <ChatContentItem>[_stubItem(id: 'mantra-1')],
        ringtone: const <ChatContentItem>[],
        status: const <ChatContentItem>[],
        wallpaper: <ChatContentItem>[_stubItem(id: 'wall-1')],
      ),
    );

    await tester.pumpWidget(
      MediaQuery(
        data: const MediaQueryData(size: Size(360, 900)),
        child: MaterialApp(
          theme: ThemeData(useMaterial3: true, fontFamily: 'Inter'),
          home: DecoratedBox(
            decoration: const BoxDecoration(gradient: AppGradient.chatScaffold),
            child: ChatTranscript(
              messages: <ChatMessage>[userMsg, botMsg],
              showTypingIndicator: false,
              hasMoreOlder: false,
              paginating: false,
              onLoadOlder: () {},
              onCardTapped: (_, _, _) {},
            ),
          ),
        ),
      ),
    );
    await settle(tester);
    await expectLater(
      find.byType(MaterialApp),
      matchesGoldenFile('chat_transcript_with_cards.png'),
    );
  });
}

// -----------------------------------------------------------------------------
// Local fixture helpers — kept private to this golden file so they don't leak.
// -----------------------------------------------------------------------------

ChatMessage _msg({
  required String id,
  required ChatMessageRoleEnum role,
  required String body,
  DateTime? createdAt,
  ChatContentGroups? content,
}) {
  return ChatMessage(
    id: id,
    sessionId: 'session-1',
    role: role,
    message: body,
    confidence: null,
    content:
        content ??
        ChatContentGroups(
          aarti: const <ChatContentItem>[],
          bhajan: const <ChatContentItem>[],
          mantra: const <ChatContentItem>[],
          ringtone: const <ChatContentItem>[],
          status: const <ChatContentItem>[],
          wallpaper: const <ChatContentItem>[],
        ),
    createdAt: createdAt ?? DateTime(2026, 8, 28, 9, 30),
  );
}

ChatContentItem _stubItem({String id = 'item-1', String? title}) {
  return ChatContentItem(
    id: id,
    title: title ?? 'Hanuman Chalisa',
    playUrl: 'https://cdn.test/$id.mp3',
    icon: '', // AppNetworkImage short-circuits to branded fallback
  );
}
