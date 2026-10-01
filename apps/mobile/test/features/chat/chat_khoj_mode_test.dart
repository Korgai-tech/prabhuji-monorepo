import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile/features/chat/application/chat_bloc.dart';
import 'package:mobile/features/chat/application/chat_event.dart';
import 'package:mobile/features/chat/application/chat_state.dart';
import 'package:mobile/features/chat/chat_analytics.dart';
import 'package:mobile/features/chat/chat_providers.dart';
import 'package:mobile/features/chat/data/chat_counters.dart';
import 'package:mobile/features/chat/presentation/chat_screen.dart';
import 'package:mobile/features/kuldevta/application/kuldevta_bloc.dart';
import 'package:mobile/features/kuldevta/application/kuldevta_event.dart';
import 'package:mobile/features/kuldevta/data/kuldevta_counters.dart';
import 'package:mobile/features/kuldevta/domain/kuldevta_questions.dart';
import 'package:mobile/features/kuldevta/kuldevta_analytics.dart';
import 'package:mobile/features/kuldevta/kuldevta_providers.dart';
import 'package:mobile/features/onboarding/data/users_repository.dart';
import 'package:mobile/state/providers.dart' as app_providers;

import '../../support/chat_harness.dart';
import '../../support/fake_analytics.dart';
import '../../support/fake_chat_video_port.dart';
import '../../support/kuldevta_harness.dart';

/// TAM-177 — the khoj now runs INSIDE the chat screen, which removes the
/// old route-level guard ("a non-Pro user must never mount the chat screen
/// even for a frame"). Everything that guard used to buy is now bought by
/// the per-mode gate, so it has to be asserted rather than assumed.
///
/// The four #EXPORT_CRITICAL invariants under test:
///   1. The six khoj answers fire `kuldevta_question_answered` and NEVER
///      `chat_message_sent` — never both for one answer.
///   2. `chat_closed.message_count` excludes them.
///   3. A non-Pro user in khoj mode cannot send a free-form message, and no
///      `paywallRequiredNonce` is emitted.
///   4. `answer_method` distinguishes typed / pata_nahi / voice.
MeUser _khojMe({bool assigned = false}) => MeUser(
  id: 'test-user',
  name: 'Tester',
  selectedLanguage: 'hi',
  onboardingCompletedAt: DateTime(2026),
  phoneCountryCode: '+91',
  phoneNumber: '9999999999',
  // The khoj-mode condition: qualified for kuldevta chat, no assignment yet.
  chatConfig: MeChatConfig(
    enabled: true,
    agentId: 'test-agent-id',
    showKuldevtaChat: true,
    kuldevtaAssigned: assigned,
  ),
);

void main() {
  /// What `/users/me` currently reports for `kuldevtaAssigned`. Mutable so a
  /// test can simulate the post-assignment refetch landing mid-flow, which is
  /// exactly when the sticky-mode guard has to hold.
  var meAssigned = false;
  setUp(() => meAssigned = false);

  /// Pump the chat screen in khoj mode. Returns the ChatBloc so a test can
  /// interrogate the session counters `chat_closed` reports.
  Future<({ChatBloc chat, KuldevtaBloc kuldevta})> pumpKhoj(
    WidgetTester tester, {
    required RecordingAnalytics analytics,
    bool isPro = true,
  }) async {
    GoogleFonts.config.allowRuntimeFetching = false;
    await tester.binding.setSurfaceSize(const Size(390, 800));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    final chatBloc = ChatBloc(
      repository: FakeChatRepository(),
      counters: ChatCounters.inMemory(),
      isPro: () => isPro,
      analytics: analytics,
    )..add(const ChatStarted());
    addTearDown(chatBloc.close);

    final kuldevtaBloc = KuldevtaBloc(
      repository: FakeKuldevtaRepository()..nextResult = sampleKuldevtaDevi(),
      counters: KuldevtaCounters.inMemory(),
      isPro: () => isPro,
      typingDelay: Duration.zero,
      analytics: analytics,
    );
    addTearDown(kuldevtaBloc.close);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          app_providers.meProvider.overrideWith(
            (ref) => Future<MeUser?>.value(_khojMe(assigned: meAssigned)),
          ),
          app_providers.analyticsProvider.overrideWithValue(analytics),
          chatCountersProvider.overrideWith((ref) => ChatCounters.inMemory()),
          chatVideoPortFactoryProvider.overrideWithValue(FakeChatVideoPort.new),
          kuldevtaBlocProvider.overrideWith((ref) => kuldevtaBloc),
        ],
        child: MaterialApp(
          home: BlocProvider<ChatBloc>.value(
            value: chatBloc,
            child: const ChatScreen(),
          ),
        ),
      ),
    );
    await settle(tester);
    return (chat: chatBloc, kuldevta: kuldevtaBloc);
  }

  /// Walk the whole six-question flow, answering by the given methods.
  Future<void> answerAll(
    WidgetTester tester, {
    required List<String> methods,
  }) async {
    await tester.tap(find.byKey(const Key('khoj-start-button')));
    await settle(tester);
    for (var i = 0; i < kKuldevtaQuestions.length; i++) {
      switch (methods[i]) {
        case 'pata_nahi':
          await tester.tap(find.byKey(const Key('khoj-pata-nahi-button')));
        default:
          await tester.enterText(
            find.byKey(const Key('chat-composer-field')),
            'Answer $i',
          );
          await settle(tester);
          await tester.tap(find.byKey(const Key('chat-composer-send')));
      }
      await settle(tester);
    }
  }

  group('khoj mode — the screen renders the khoj thread', () {
    testWidgets('header reads "Kuldevta Khoj", not "Prabhuji Chat"', (
      tester,
    ) async {
      final analytics = RecordingAnalytics();
      await pumpKhoj(tester, analytics: analytics);

      expect(find.byKey(const Key('chat-appbar-khoj-title')), findsOneWidget);
      expect(
        find.byKey(const Key('chat-appbar-generic-title')),
        findsNothing,
        reason: 'a khoj user is unassigned, so the generic tier must not win',
      );
      expect(find.text('Kuldevta Khoj'), findsOneWidget);
    });

    testWidgets('the intro bubble + Shuru Kijiye render, video-less', (
      tester,
    ) async {
      final analytics = RecordingAnalytics();
      await pumpKhoj(tester, analytics: analytics);

      expect(find.byKey(const Key('khoj-intro-bubble')), findsOneWidget);
      expect(find.byKey(const Key('khoj-video-bubble')), findsOneWidget);
      expect(find.byKey(const Key('khoj-start-button')), findsOneWidget);
      // The kuldevta agent has no asset (locked decision D3), so the card is
      // absent by design — this is the SHIPPING path, not a degradation.
      expect(find.byKey(const Key('khoj-intro-video')), findsNothing);
      expect(
        find.text(
          '6 asan sawalon ke jawab dekar 2 min mein apna kuldevta jaaniye.',
        ),
        findsOneWidget,
        reason: 'the caption must still render when there is no video',
      );
    });

    testWidgets('every question bubble carries its N/6 label', (tester) async {
      final analytics = RecordingAnalytics();
      await pumpKhoj(tester, analytics: analytics);
      await tester.tap(find.byKey(const Key('khoj-start-button')));
      await settle(tester);

      // Q1 is labelled too — Figma 3936:25985 omits it but the ticket says
      // all six are labelled, and the ticket wins (#RESOLVED R1).
      expect(find.text('1/6'), findsOneWidget);
      expect(find.text('Apka surname kya he?'), findsOneWidget);
      expect(find.byKey(const Key('khoj-pata-nahi-button')), findsOneWidget);
    });
  });

  group('#EXPORT_CRITICAL — khoj answers never reach ChatBloc', () {
    testWidgets(
      'six answers fire kuldevta_question_answered and NEVER chat_message_sent',
      (tester) async {
        final analytics = RecordingAnalytics();
        await pumpKhoj(tester, analytics: analytics);
        await answerAll(
          tester,
          methods: List<String>.filled(kKuldevtaQuestions.length, 'typed'),
        );

        expect(
          analytics.allProps(KuldevtaEvents.questionAnswered).length,
          kKuldevtaQuestions.length,
          reason: 'one per question',
        );
        expect(
          analytics.fired(ChatEvents.chatMessageSent),
          isFalse,
          reason:
              'a khoj answer must never also look like a chat message — '
              'never both for the same answer',
        );
      },
    );

    testWidgets('chat_closed.message_count excludes the khoj answers', (
      tester,
    ) async {
      final analytics = RecordingAnalytics();
      final blocs = await pumpKhoj(tester, analytics: analytics);
      await answerAll(
        tester,
        methods: List<String>.filled(kKuldevtaQuestions.length, 'typed'),
      );

      blocs.chat.onSessionClose(exitReason: ChatExitReason.back);
      await tester.pump();

      expect(
        analytics.propsFor(ChatEvents.chatClosed)[ChatEventProps.messageCount],
        0,
        reason:
            'six answers went through KuldevtaBloc, so ChatBloc counted none',
      );
    });

    testWidgets('a NON-PRO user can complete the khoj but cannot send free '
        'text, and no paywall nonce is emitted', (tester) async {
      final analytics = RecordingAnalytics();
      final blocs = await pumpKhoj(tester, analytics: analytics, isPro: false);

      // Discovery is free: the whole flow runs with no paywall.
      await answerAll(
        tester,
        methods: List<String>.filled(kKuldevtaQuestions.length, 'typed'),
      );
      expect(
        analytics.allProps(KuldevtaEvents.questionAnswered).length,
        kKuldevtaQuestions.length,
      );

      // And nothing reached the send path, so the send-time re-gate that
      // would emit a paywall nonce never ran.
      final state = blocs.chat.state;
      expect(
        state is ChatReady ? state.paywallRequiredNonce : null,
        isNull,
        reason: 'ChatBloc._onSubmitted is unreachable in khoj mode',
      );
      expect(analytics.fired(ChatEvents.chatMessageSent), isFalse);
    });
  });

  group('answer_method distinguishes how the answer arrived', () {
    testWidgets('typed and pata_nahi are recorded distinctly', (tester) async {
      final analytics = RecordingAnalytics();
      await pumpKhoj(tester, analytics: analytics);
      await answerAll(
        tester,
        methods: const [
          'typed',
          'pata_nahi',
          'typed',
          'pata_nahi',
          'typed',
          'typed',
        ],
      );

      final methods = analytics
          .allProps(KuldevtaEvents.questionAnswered)
          .map((p) => p[KuldevtaEventProps.answerMethod])
          .toList();
      expect(methods, <String>[
        KuldevtaAnswerMethod.typed,
        KuldevtaAnswerMethod.pataNahi,
        KuldevtaAnswerMethod.typed,
        KuldevtaAnswerMethod.pataNahi,
        KuldevtaAnswerMethod.typed,
        KuldevtaAnswerMethod.typed,
      ]);

      // A pata-nahi answer sends "" on the wire, never null.
      final pataNahiProps = analytics
          .allProps(KuldevtaEvents.questionAnswered)
          .where((p) => p[KuldevtaEventProps.answerMethod] == 'pata_nahi');
      for (final p in pataNahiProps) {
        expect(p[KuldevtaEventProps.answerText], '');
      }
    });

    testWidgets('a voice answer records answer_method: voice', (tester) async {
      final analytics = RecordingAnalytics();
      final blocs = await pumpKhoj(tester, analytics: analytics);
      await tester.tap(find.byKey(const Key('khoj-start-button')));
      await settle(tester);

      // Drive the same event the composer's onVoiceSubmit seam dispatches.
      blocs.kuldevta.add(
        const KuldevtaAnswerSubmitted('Agrawal', byVoice: true),
      );
      await settle(tester);

      expect(
        analytics.propsFor(
          KuldevtaEvents.questionAnswered,
        )[KuldevtaEventProps.answerMethod],
        KuldevtaAnswerMethod.voice,
      );
      expect(analytics.fired(ChatEvents.chatMessageSent), isFalse);
    });
  });

  /// The handoff from khoj to the deity chat, for a NON-PRO user.
  ///
  /// This is the shape that broke in the field. The client only learned about
  /// the assignment inside the paywall gate's `pending` action — which a free
  /// user never reaches — so after completing the khoj and dismissing the
  /// paywall they were left in khoj mode with a nameless header, and
  /// re-entering replayed a khoj they had already finished.
  group('khoj → deity handoff survives a non-Pro user', () {
    testWidgets('the result card is NOT yanked away when the assignment '
        'refetch lands mid-reveal', (tester) async {
      final analytics = RecordingAnalytics();
      await pumpKhoj(tester, analytics: analytics, isPro: false);
      await answerAll(
        tester,
        methods: List<String>.filled(kKuldevtaQuestions.length, 'typed'),
      );

      expect(find.byKey(const Key('kuldevta-result-card')), findsOneWidget);

      // The refetch triggered by assignment success comes back: the server now
      // says the user HAS a kuldevta. Without the sticky-mode guard this flips
      // `_khojMode` false and drops the whole khoj scaffold — taking the reveal
      // with it on the very frame it was meant to be read.
      meAssigned = true;
      ProviderScope.containerOf(
        tester.element(find.byType(ChatScreen)),
      ).invalidate(app_providers.meProvider);
      await settle(tester);

      expect(
        find.byKey(const Key('kuldevta-result-card')),
        findsOneWidget,
        reason: 'the card is the last beat of khoj mode, not the first beat of '
            'the deity chat — it must outlive kuldevtaAssigned flipping',
      );
      // AND the screen is still khoj mode underneath. This is the assertion
      // that actually pins the guard: the card alone would survive either way,
      // because conversation mode re-renders it once `_persona` is set. What
      // the guard prevents is the entire scaffold — header, thread, composer —
      // being rebuilt into the deity chat behind a scrim the user is still
      // reading, which is a visible flicker at the emotional peak of the flow.
      expect(
        find.text('Kuldevta Khoj'),
        findsOneWidget,
        reason: 'the khoj scaffold must not be swapped out under the open card',
      );
    });

    testWidgets('once the card is dismissed the screen leaves khoj mode for '
        'good', (tester) async {
      final analytics = RecordingAnalytics();
      await pumpKhoj(tester, analytics: analytics, isPro: false);
      await answerAll(
        tester,
        methods: List<String>.filled(kKuldevtaQuestions.length, 'typed'),
      );

      meAssigned = true;
      ProviderScope.containerOf(
        tester.element(find.byType(ChatScreen)),
      ).invalidate(app_providers.meProvider);
      await settle(tester);

      // Dismiss via the scrim — the path a user takes when they do not tap the
      // CTA at all, which is precisely the non-Pro case.
      await tester.tapAt(const Offset(195, 20));
      await settle(tester);

      expect(find.byKey(const Key('kuldevta-result-card')), findsNothing);
      expect(
        find.text('Kuldevta Khoj'),
        findsNothing,
        reason: 'a user who has been assigned a kuldevta must never be shown '
            'the khoj header again',
      );
      // The header now NAMES the deity. This pins the second half of the fix:
      // the persona identity is written at the reveal, not inside the paywall
      // gate's `pending` action. When it lived there, a free user who dismissed
      // the paywall left it null, so the header fell back to the nameless tier
      // and tapping it did nothing — `onPersonaTap` is wired only when a
      // persona exists.
      expect(
        find.text('Karni Mata'),
        findsWidgets,
        reason: 'the deity name must reach the header without anyone paying',
      );
    });
  });
}
