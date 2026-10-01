import 'package:flutter/material.dart';

import '../../../../api/generated/openapi.dart';
import '../../../../core/theme.dart';
import '../../chat_analytics.dart';
import 'chat_bubble.dart';
import 'chat_intro_video_card.dart';

/// The first-time intro block at the top of an empty Content / Gita thread
/// (TAM-178, Figma `3975:24000` content and `3975:24001` gita).
///
/// One incoming bubble holding the portrait video card and, in the SAME
/// bubble, the caption "Aaj aap kya poochna chahenge?" — then the three
/// suggestion chips beneath it. Structurally identical to the khoj thread's
/// opening bubble, which is why both go through [ChatBubble]'s `leading` slot
/// rather than each inventing a video-plus-caption layout.
///
/// Shown only while the thread is empty AND this agent's intro has not been
/// seen before on this install. Once the user sends anything the chat behaves
/// exactly as it does today and this never returns.
///
/// The video is optional: an agent with no asset renders caption + chips with
/// no card and no gap. That is a designed state, not a degradation.
class ChatIntroBlock extends StatelessWidget {
  const ChatIntroBlock({
    super.key,
    required this.agentId,
    required this.chips,
    required this.onChipTapped,
    required this.pauseSignal,
    this.introVideo,
  });

  final String agentId;

  /// The server's openers. Sorted by `order` and capped at three — the server
  /// may send any number, the design shows three.
  final List<ChatRecommendedMessage> chips;

  final ValueChanged<ChatRecommendedMessage> onChipTapped;

  /// Lets a chip tap stop the video, the same way the composer's first
  /// keystroke does — tapping a chip IS starting to answer.
  final ChatVideoPauseSignal pauseSignal;

  final ChatIntroVideo? introVideo;

  /// The caption, inside the video's bubble (Figma `3975:24000`).
  static const String caption = 'Aaj aap kya poochna chahenge?';

  @override
  Widget build(BuildContext context) {
    final video = introVideo;
    final ordered = [...chips]..sort((a, b) => a.order.compareTo(b.order));
    final shown = ordered.take(3).toList();

    return Column(
      // START, not stretch: stretch hands every child a TIGHT full-width
      // constraint, which overrides the bubble's own max-width and the chips'
      // hug. Both are supposed to size themselves.
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        ChatBubble(
          key: const Key('chat-intro-bubble'),
          variant: ChatBubbleVariant.bot,
          message: caption,
          leading: video == null
              ? null
              : ChatIntroVideoCard(
                  key: const Key('chat-intro-video'),
                  videoUrl: video.url,
                  videoId: video.videoId,
                  videoDurationMs: video.durationMs.toInt(),
                  posterUrl: video.posterUrl,
                  agentId: agentId,
                  pauseSignal: pauseSignal,
                ),
        ),
        const SizedBox(height: AppChat.bubbleGap),
        for (final chip in shown)
          Padding(
            padding: const EdgeInsets.only(
              left: AppChat.introChipInset,
              bottom: AppChat.introChipGap,
            ),
            child: _IntroChip(
              chipKey: Key('chat-intro-chip-${chip.id}'),
              text: chip.text,
              onTap: () {
                // Tapping a chip is answering, so the video yields to it —
                // same rule as the first keystroke.
                pauseSignal.requestPause(ChatVideoPauseTrigger.answerStarted);
                onChipTapped(chip);
              },
            ),
          ),
      ],
    );
  }
}

/// A suggestion chip as the new design draws it: a plain outlined pill with
/// orange text, left-aligned, hugging its label.
///
/// Deliberately NOT the old `_RecommendedChip` (64 dp card, icon tile, shadow,
/// under a "RECOMMENDED" heading) — the intro block replaces that whole
/// treatment, and reusing it here would carry the old visual language into the
/// new screen.
class _IntroChip extends StatelessWidget {
  const _IntroChip({
    required this.chipKey,
    required this.text,
    required this.onTap,
  });

  /// Applied to the PILL, not to this widget's root.
  ///
  /// The root is an `Align`, which legitimately fills the available width — so
  /// a key there measures the row, not the chip, and a hug regression would
  /// sail straight past a width assertion. Keying the visible box is what
  /// makes "does this chip hug its label" testable at all.
  final Key chipKey;

  final String text;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      // Align hands the child LOOSE constraints, which is what lets the chip
      // shrink-wrap its label.
      //
      // The trap this replaces: a `Container` with a non-null `alignment`
      // EXPANDS to its constraints instead of sizing to its child, so every
      // chip came out the same full width and the block read as the old
      // RECOMMENDED card stack. No `alignment` anywhere below — the Align
      // above does the positioning.
      child: Material(
        key: chipKey,
        color: AppColors.white,
        borderRadius: BorderRadius.circular(AppChat.introChipRadius),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(AppChat.introChipRadius),
          child: DecoratedBox(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(AppChat.introChipRadius),
              border: Border.all(color: AppColors.chatCardBorder),
            ),
            child: ConstrainedBox(
              // minHeight, never a rigid height: at textScale 2.0 the label
              // needs to grow the pill rather than overflow it. A long chip on
              // a narrow phone wraps to a second line and the pill grows with
              // it — which is also why there is no maxLines here.
              constraints: const BoxConstraints(
                minHeight: AppChat.introChipMinHeight,
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppChat.introChipPaddingH,
                  vertical: AppSpacing.xSmall,
                ),
                child: Center(
                  widthFactor: 1,
                  heightFactor: 1,
                  child: Text(text, style: AppText.chatCardCta()),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
