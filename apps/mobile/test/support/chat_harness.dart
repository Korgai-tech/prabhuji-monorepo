import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile/api/generated/openapi.dart';
import 'package:mobile/features/chat/application/chat_bloc.dart';
import 'package:mobile/features/chat/application/chat_event.dart';
import 'package:mobile/features/chat/application/chat_state.dart';
import 'package:mobile/features/chat/chat_providers.dart';
import 'package:mobile/features/chat/data/chat_counters.dart';
import 'package:mobile/features/chat/data/chat_repository.dart';
import 'package:mobile/features/chat/presentation/chat_screen.dart';
import 'fake_chat_video_port.dart';
import 'package:mobile/state/providers.dart' as app_providers;

/// Hand-rolled `ChatRepository` fake per the flutter-testing skill — NO
/// mockito/mocktail. Deterministic, test-writable behaviour.
class FakeChatRepository implements ChatRepository {
  FakeChatRepository({ChatHistoryResponseData? seedHistory})
    : historyResponse = seedHistory ?? _defaultHistory();

  ChatHistoryResponseData historyResponse;
  SendMessageResult? nextSendResult;
  Object? nextSendError;

  @override
  Future<ChatHistoryResponseData> getHistory({
    String? sessionId,
    String? cursor,
    int? limit,
  }) async {
    return historyResponse;
  }

  @override
  Future<SendMessageResult> sendMessage({
    required String message,
    required String agentId,
    String? sessionId,
  }) async {
    final err = nextSendError;
    if (err != null) throw err;
    final result = nextSendResult;
    if (result != null) return result;
    // Default: echo back a synthetic bot reply.
    return SendMessageResult(
      sessionId: sessionId ?? 'session-1',
      agentId: agentId,
      userMessage: _msg(
        'user-1',
        sessionId ?? 'session-1',
        ChatMessageRoleEnum.user,
        message,
      ),
      botMessage: _msg(
        'bot-1',
        sessionId ?? 'session-1',
        ChatMessageRoleEnum.bot,
        'Bot reply to $message',
      ),
    );
  }
}

ChatMessage _msg(
  String id,
  String sessionId,
  ChatMessageRoleEnum role,
  String body,
) {
  return ChatMessage(
    id: id,
    sessionId: sessionId,
    role: role,
    message: body,
    confidence: null,
    content: ChatContentGroups(
      aarti: const <ChatContentItem>[],
      bhajan: const <ChatContentItem>[],
      mantra: const <ChatContentItem>[],
      ringtone: const <ChatContentItem>[],
      status: const <ChatContentItem>[],
      wallpaper: const <ChatContentItem>[],
    ),
    createdAt: DateTime(2026, 8, 28, 9, 30),
  );
}

ChatHistoryResponseData _defaultHistory() {
  return ChatHistoryResponseData(
    sessionId: null,
    previousChat: const <ChatMessage>[],
    nextCursor: null,
    chatConfig: ChatScreenConfig(
      // TAM-177: nullable-but-required on the generated model. Two of the
      // three agents genuinely ship null, so null is the default fixture.
      introVideo: null,
      enabled: true,
      agentId: 'test-agent-id',
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
    ),
  );
}

/// Build a [ChatHistoryResponseData] pre-seeded with a transcript. `enabled`
/// flips between chat-live and read-only modes.
ChatHistoryResponseData buildHistoryWith({
  required List<ChatMessage> transcript,
  bool enabled = true,
  String? sessionId,
  String? agentId = 'test-agent-id',
}) {
  return ChatHistoryResponseData(
    sessionId: sessionId ?? (transcript.isEmpty ? null : 'session-1'),
    previousChat: transcript,
    nextCursor: null,
    chatConfig: ChatScreenConfig(
      // TAM-177: nullable-but-required on the generated model. Two of the
      // three agents genuinely ship null, so null is the default fixture.
      introVideo: null,
      enabled: enabled,
      agentId: enabled ? agentId : null,
      title: 'Namaste',
      subtitle: 'Aaj kya poochhna chahenge?',
      recommendedMessages: <ChatRecommendedMessage>[
        ChatRecommendedMessage(
          id: 'chip-1',
          order: 1,
          text: 'Aaj mann bahut pareshan hai',
        ),
      ],
    ),
  );
}

/// Convenience — pump the [ChatScreen] with a [FakeChatRepository] backing
/// the bloc and the composer field text controller wired up. Size defaults
/// to a mid-range device (390×800) matching downloads_harness.
Future<void> pumpChatScreen(
  WidgetTester tester, {
  FakeChatRepository? repository,
  bool isPro = true,
  Size size = const Size(390, 800),
  double textScaleFactor = 1.0,
  ChatState? initialState,
}) async {
  GoogleFonts.config.allowRuntimeFetching = false;
  await tester.binding.setSurfaceSize(size);
  final repo = repository ?? FakeChatRepository();
  final bloc = ChatBloc(
    repository: repo,
    counters: ChatCounters.inMemory(),
    isPro: () => isPro,
  );
  if (initialState is ChatReady || initialState is ChatReadOnly) {
    bloc.emit(initialState!);
  } else {
    bloc.add(const ChatStarted());
  }
  addTearDown(bloc.close);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        app_providers.analyticsProvider.overrideWithValue(null),
        // TAM-166 — chat_screen's `_AppBar` reads `chatCountersProvider`
        // to auto-persist and cold-start-resolve `kuldevta_name`. The
        // production factory pulls SharedPreferences out of the service
        // locator (not registered in widget tests), so swap for the
        // in-memory store here.
        chatCountersProvider.overrideWith((ref) => ChatCounters.inMemory()),
        // TAM-177 — `MediaKit.ensureInitialized()` only runs in `main()`, so a
        // real `Player()` throws synchronously under `flutter test`. Every
        // chat widget test must get the fake, not just the ones that render a
        // video: the intro card mounts from the transcript, so any test that
        // pumps a thread with an `introVideo` would otherwise blow up.
        chatVideoPortFactoryProvider.overrideWithValue(FakeChatVideoPort.new),
      ],
      child: MediaQuery(
        data: MediaQueryData(
          size: size,
          textScaler: TextScaler.linear(textScaleFactor),
        ),
        child: MaterialApp(
          home: BlocProvider<ChatBloc>.value(
            value: bloc,
            child: const ChatScreen(),
          ),
        ),
      ),
    ),
  );
  await settle(tester);
}

/// Pump enough frames for the bloc to fold its initial history-fetch into
/// state, plus any typing-indicator animation frames. Kept small — the
/// full `pumpAndSettle` would spin forever on the typing dots animation.
Future<void> settle(WidgetTester tester) async {
  for (var i = 0; i < 6; i++) {
    await tester.pump(const Duration(milliseconds: 20));
  }
}
