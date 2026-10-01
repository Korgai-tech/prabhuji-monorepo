import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/chat/application/chat_bloc.dart';
import 'package:mobile/features/chat/application/chat_event.dart';
import 'package:mobile/features/chat/application/chat_state.dart';
import 'package:mobile/features/chat/chat_analytics.dart';
import 'package:mobile/features/chat/data/chat_counters.dart';

import '../../support/chat_harness.dart';
import '../../support/fake_analytics.dart';

/// TAM-166 — the bloc's `chat_message_sent` fire must carry
/// `input_method: 'voice'` and the widget-minted `voice_note_id` when
/// `ChatMessageSubmitted.promptSource == 'voice'`. Existing typed / retry
/// sends must continue to report `input_method: 'typed'` with an empty
/// `voice_note_id`. This suite locks that mapping.
void main() {
  Future<ChatBloc> seedReady({
    required RecordingAnalytics analytics,
    required FakeChatRepository repo,
  }) async {
    final bloc = ChatBloc(
      repository: repo,
      counters: ChatCounters.inMemory(),
      isPro: () => true,
      analytics: analytics,
    );
    // Wait for ChatStarted → history fetch → ChatReady, then also for
    // page_viewed to fire.
    bloc.add(const ChatStarted());
    await bloc.stream.firstWhere((s) => s is ChatReady);
    // Give the microtask queue a hop so the analytics fires drain.
    await Future<void>.delayed(Duration.zero);
    return bloc;
  }

  test('ChatMessageSubmitted(promptSource: voice, voiceNoteId: X) fires '
      'chat_message_sent with input_method=voice + voice_note_id=X', () async {
    final analytics = RecordingAnalytics();
    final repo = FakeChatRepository();
    final bloc = await seedReady(analytics: analytics, repo: repo);
    addTearDown(bloc.close);

    bloc.add(
      const ChatMessageSubmitted(
        message: 'Aap kaise hain',
        promptSource: 'voice',
        voiceNoteId: 'voice-note-abc',
        audioDurationMs: 3500,
      ),
    );
    // Let the async _onSubmitted handler flush.
    await Future<void>.delayed(const Duration(milliseconds: 20));

    final sent = analytics.propsFor(ChatEvents.chatMessageSent);
    expect(sent[ChatEventProps.inputMethod], ChatInputMethod.voice);
    expect(sent[ChatEventProps.voiceNoteId], 'voice-note-abc');
    expect(sent[ChatEventProps.messageText], 'Aap kaise hain');
    expect(sent[ChatEventProps.messageNumber], 1);
  });

  test('ChatMessageSubmitted(promptSource: typed) still fires '
      'input_method=typed + empty voice_note_id (no regression)', () async {
    final analytics = RecordingAnalytics();
    final repo = FakeChatRepository();
    final bloc = await seedReady(analytics: analytics, repo: repo);
    addTearDown(bloc.close);

    bloc.add(
      const ChatMessageSubmitted(message: 'Namaste', promptSource: 'typed'),
    );
    await Future<void>.delayed(const Duration(milliseconds: 20));

    final sent = analytics.propsFor(ChatEvents.chatMessageSent);
    expect(sent[ChatEventProps.inputMethod], ChatInputMethod.typed);
    expect(sent[ChatEventProps.voiceNoteId], '');
  });

  test('messageNumberForNextSend returns _messageCount + 1 (widget-side '
      'analytics rely on this so chat_voice_recorded aligns with '
      'chat_message_sent)', () async {
    final analytics = RecordingAnalytics();
    final repo = FakeChatRepository();
    final bloc = await seedReady(analytics: analytics, repo: repo);
    addTearDown(bloc.close);

    expect(bloc.messageNumberForNextSend, 1);
    bloc.add(
      const ChatMessageSubmitted(message: 'first', promptSource: 'typed'),
    );
    await Future<void>.delayed(const Duration(milliseconds: 20));
    expect(bloc.messageNumberForNextSend, 2);
  });
}
