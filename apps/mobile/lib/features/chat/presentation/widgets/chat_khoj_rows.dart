import 'package:flutter/material.dart';

import '../../../../core/theme.dart';
import '../../../kuldevta/application/kuldevta_state.dart';
import '../../../kuldevta/domain/kuldevta_answers.dart';
import '../../../kuldevta/domain/kuldevta_questions.dart';
import 'chat_bubble.dart';
import 'chat_date_separator.dart';
import 'chat_intro_video_card.dart';

/// Verbatim khoj copy. Held here rather than inlined so a copy review is a
/// one-file diff and the strings survive the deletion of the four wizard
/// screens they came from.
class KhojCopy {
  KhojCopy._();

  static const String intro = 'Apne kuldevta janiye';
  static const String introCaption =
      '6 asan sawalon ke jawab dekar 2 min mein apna kuldevta jaaniye.';
  static const String start = 'Shuru Kijiye';
  static const String pataNahi = 'Pata Nahi';
  static const String identifying =
      'Apke parivar ki parampara khoji ja rahi he…';
  static const String errorTitle = 'Kuch galat ho gaya';
  static const String errorNetwork = 'Internet check karein aur retry karein.';
  static const String errorGeneric =
      'Retry karein — hum dobara koshish karenge.';
  static const String retry = 'Retry';
  static const String back = 'Wapas';

  /// The composer hint across every chat surface (Figma `3934:14677`,
  /// `3964:14628`, `3975:24000` all show it).
  static const String composerHint = 'Yaha pe likhiye...';
}

/// Everything the khoj thread needs to render its intro video, or `null` when
/// the agent has no asset. Two of the three agents ship `null` today, so this
/// being nullable is the shipping path, not a degradation.
class KhojIntroVideo {
  const KhojIntroVideo({
    required this.url,
    required this.videoId,
    required this.durationMs,
    this.posterUrl,
  });

  final String url;
  final String videoId;
  final int durationMs;
  final String? posterUrl;
}

/// Builds the khoj conversation as a flat list of transcript rows, oldest →
/// newest, for [ChatTranscript.leadingRows].
///
/// These rows are CLIENT-ONLY. The six answers never become server-side
/// `ChatMessage`s — `POST /kuldevta/identify` creates none, and the chat
/// service opens a fresh provider conversation once the deity is assigned. So
/// the khoj thread is not a transcript that has to be cleared on hand-off; it
/// simply stops being rendered when the screen leaves khoj mode.
///
/// That is also why khoj answers can never fire `chat_message_sent` or inflate
/// `chat_closed.message_count`: they never enter `ChatBloc` at all.
List<Widget> buildKhojRows({
  required KuldevtaState state,
  required String agentId,
  required ChatVideoPauseSignal pauseSignal,
  KhojIntroVideo? introVideo,
}) {
  final rows = <Widget>[
    ChatDateSeparator(key: const Key('khoj-date'), timestamp: DateTime.now()),
    const ChatBubble(
      key: Key('khoj-intro-bubble'),
      variant: ChatBubbleVariant.bot,
      message: KhojCopy.intro,
    ),
    // The video and its caption are ONE incoming message, not two stacked
    // bubbles (Figma `3934:14677`). When there is no asset the bubble
    // collapses to caption-only with no gap — ChatBubble's slots are all
    // conditional, which is what makes the null case look intentional.
    ChatBubble(
      key: const Key('khoj-video-bubble'),
      variant: ChatBubbleVariant.bot,
      message: KhojCopy.introCaption,
      leading: introVideo == null
          ? null
          : ChatIntroVideoCard(
              key: const Key('khoj-intro-video'),
              videoUrl: introVideo.url,
              videoId: introVideo.videoId,
              videoDurationMs: introVideo.durationMs,
              posterUrl: introVideo.posterUrl,
              agentId: agentId,
              pauseSignal: pauseSignal,
            ),
    ),
  ];

  // Before "Shuru Kijiye" the thread is just the intro.
  if (state is KuldevtaEntry) return rows;

  rows.add(
    const ChatBubble(
      key: Key('khoj-start-echo'),
      variant: ChatBubbleVariant.user,
      message: KhojCopy.start,
    ),
  );

  // How many questions have been answered — every state past Entry carries the
  // full answers object, so this works identically while answering, while
  // identifying, and on the failure path.
  final answered = switch (state) {
    KuldevtaAnsweringQuestion(:final stepIndex) => stepIndex,
    _ => kKuldevtaQuestions.length,
  };

  for (var i = 0; i < answered; i++) {
    rows.add(_questionBubble(i));
    rows.add(_answerBubble(i, state.answers));
  }

  // The question currently awaiting an answer — or, for the beat before it
  // lands, a typing bubble in its place. Same bubble the identify step uses, so
  // the "he is composing" cue is one thing the user learns once.
  if (state is KuldevtaAnsweringQuestion) {
    rows.add(
      state.botTyping
          ? const ChatBubble(
              key: Key('khoj-question-typing'),
              variant: ChatBubbleVariant.typing,
            )
          : _questionBubble(state.stepIndex),
    );
  }

  if (state is KuldevtaIdentifying) {
    rows.add(
      const ChatBubble(
        key: Key('khoj-typing'),
        variant: ChatBubbleVariant.typing,
      ),
    );
    rows.add(
      Padding(
        padding: const EdgeInsets.only(top: AppSpacing.xSmall),
        child: Text(
          KhojCopy.identifying,
          key: const Key('khoj-identifying-hint'),
          style: AppText.chatTypingHint(),
        ),
      ),
    );
  }

  if (state is KuldevtaFailed) {
    rows.add(
      ChatBubble(
        key: const Key('khoj-error'),
        variant: ChatBubbleVariant.bot,
        message:
            '${KhojCopy.errorTitle}\n'
            '${state.errorKind == 'network' ? KhojCopy.errorNetwork : KhojCopy.errorGeneric}',
      ),
    );
  }

  return rows;
}

/// A question, labelled `N/6`.
///
/// That label IS the progress indicator — the old wizard's
/// `LinearProgressIndicator` header is deleted and nothing else reports
/// position in the flow.
///
/// Note the Figma inconsistency resolved here: frame `3936:25985` draws Q1
/// with no label while `3938:26855` onward label every question. The ticket
/// says all six are labelled, and the ticket wins (TAM-177 #RESOLVED R1).
Widget _questionBubble(int index) {
  final q = kKuldevtaQuestions[index];
  final helper = q.helperSubtitle;
  return ChatBubble(
    key: Key('khoj-question-$index'),
    variant: ChatBubbleVariant.bot,
    label: '${index + 1}/${kKuldevtaQuestions.length}',
    message: helper == null ? q.title : '${q.title}\n$helper',
  );
}

/// The user's answer. A "Pata Nahi" answer is stored as the empty string (the
/// server contract wants `""`, never null) — render the affordance's own label
/// rather than an empty bubble.
Widget _answerBubble(int index, KuldevtaAnswers answers) {
  final text = answers.fieldAt(index);
  return ChatBubble(
    key: Key('khoj-answer-$index'),
    variant: ChatBubbleVariant.user,
    message: text.trim().isEmpty ? KhojCopy.pataNahi : text,
  );
}
