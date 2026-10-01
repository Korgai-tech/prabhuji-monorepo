import 'package:flutter/material.dart';

import '../../../../core/theme.dart';

/// Chat bubble (TAM-164). One widget, three variants keyed by [variant]:
///
///  * [ChatBubbleVariant.user] — right-aligned orange fill, white text
///    (Figma `2612:17963` variant=user).
///  * [ChatBubbleVariant.bot] — left-aligned peach fill, near-black text
///    (Figma `2612:17963` variant=bot).
///  * [ChatBubbleVariant.typing] — left-aligned grey pill hugging three
///    animated dots (Figma `2612:17934`). Used while a send is in flight.
///
/// Geometry (padding / radius / max-width fraction) comes from
/// [AppChat.bubblePaddingH], [AppChat.bubbleRadius], and
/// [AppChat.bubbleMaxWidthFraction] — every measurement in this widget is a
/// theme constant so a Phase 6 sweep is a one-file diff.
///
/// Multi-size discipline: the bubble's inner container uses
/// `BoxConstraints(minHeight: …)`, NEVER a rigid `height:`, so `textScaler
/// 2.0` (a11y) grows the pill vertically without a `RenderFlex overflow` —
/// see `patterns_library/testing/flutter-multi-size-smoke.md`.
enum ChatBubbleVariant { user, bot, typing }

class ChatBubble extends StatelessWidget {
  const ChatBubble({
    super.key,
    required this.variant,
    this.message,
    this.label,
    this.leading,
  }) : assert(
         variant == ChatBubbleVariant.typing ||
             message != null ||
             leading != null,
         'user + bot bubbles must carry a message, a leading widget, or both',
       );

  final ChatBubbleVariant variant;

  /// User-facing text. Ignored for [ChatBubbleVariant.typing].
  final String? message;

  /// Small label rendered ABOVE [message] inside the same bubble — the khoj
  /// flow's `1/6`…`6/6` progress marker (TAM-177, Figma `3938:26855`).
  ///
  /// This label is the ONLY progress indicator in the khoj flow: the old
  /// wizard's `LinearProgressIndicator` header is deleted, and the ticket is
  /// explicit that "the n/6 label on the bubble is the progress". Bot variant
  /// only — a user bubble has nothing to number.
  final String? label;

  /// Arbitrary content rendered ABOVE [message] (and below [label]) inside the
  /// bubble — the intro video card lives here, so the video and its caption
  /// read as one incoming message rather than two stacked bubbles
  /// (Figma `3934:14677`, `3975:24000`).
  ///
  /// Null is a first-class state: two of the three agents have no intro video
  /// yet, and the bubble must then collapse to caption-only with no empty gap.
  final Widget? leading;

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.of(context).size.width;
    switch (variant) {
      case ChatBubbleVariant.user:
        return Align(
          alignment: Alignment.centerRight,
          child: _pill(
            maxWidth: width * AppChat.bubbleUserMaxWidthFraction,
            fill: AppColors.chatUserBubbleFill,
            radius: _kUserRadius,
            child: _body(AppColors.chatUserBubbleText),
          ),
        );
      case ChatBubbleVariant.bot:
        // A bubble carrying MEDIA is a different shape from a text bubble:
        // narrower (0.694 vs 0.92) and hugging its media with 4dp rather than
        // 16dp. Both numbers are measured off the shared Figma component —
        // see AppChat.mediaBubbleMaxWidthFraction. Using the text geometry for
        // a video is what made the card span nearly the whole screen.
        final hasMedia = leading != null;
        return Align(
          alignment: Alignment.centerLeft,
          child: _pill(
            maxWidth:
                width *
                (hasMedia
                    ? AppChat.mediaBubbleMaxWidthFraction
                    : AppChat.bubbleBotMaxWidthFraction),
            fill: AppColors.chatBotBubbleFill,
            radius: _kBotRadius,
            padding: hasMedia
                ? const EdgeInsets.all(AppChat.mediaBubblePadding)
                : null,
            child: _body(AppColors.chatBotBubbleText),
          ),
        );
      case ChatBubbleVariant.typing:
        return Align(
          alignment: Alignment.centerLeft,
          child: Container(
            padding: const EdgeInsets.symmetric(
              horizontal: AppChat.typingBubblePaddingH,
              vertical: AppChat.typingBubblePaddingV,
            ),
            decoration: BoxDecoration(
              color: AppColors.chatTypingBubbleFill,
              // Typing bubble uses the same bot-tail radius set as the bot
              // bubble (Figma 2612:17934 Background frame has
              // `rCorners=[16,16,16,2]`).
              borderRadius: _kBotRadius,
              // Same subtle drop shadow every message bubble carries — Figma
              // `2612:17963` `drop-shadow-[0px_1px_1px_rgba(0,0,0,0.05)]`.
              boxShadow: AppChat.bubbleShadow,
            ),
            child: const _TypingDots(),
          ),
        );
    }
  }

  /// The bubble's inner column: optional [label], optional [leading], optional
  /// [message]. Every gap is conditional, so a caption-only bubble (no video)
  /// is pixel-identical to a plain bubble — that is what makes `introVideo ==
  /// null` a clean shipping state rather than a bubble with a hole in it.
  Widget _body(Color textColor) {
    final labelText = label;
    final leadingWidget = leading;
    final messageText = message;

    final rows = <Widget>[];
    if (labelText != null) {
      rows.add(Text(labelText, style: AppText.chatKhojLabel()));
      if (leadingWidget != null || messageText != null) {
        rows.add(const SizedBox(height: AppChat.bubbleLabelGap));
      }
    }
    if (leadingWidget != null) {
      rows.add(leadingWidget);
      if (messageText != null) {
        rows.add(const SizedBox(height: AppChat.bubbleLeadingGap));
      }
    }
    if (messageText != null) {
      final text = Text(
        messageText,
        style: AppText.chatBubbleText(color: textColor),
      );
      // Inside a media bubble the bubble padding drops to 4 so the media can
      // hug its edges — the caption then carries its own inset instead
      // (Figma: text at x=6 within the 242-wide media column).
      rows.add(
        leadingWidget == null
            ? text
            : Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppChat.mediaBubbleCaptionInsetH,
                  vertical: AppChat.mediaBubbleCaptionGap,
                ),
                child: text,
              ),
      );
    }
    if (rows.length == 1) return rows.single;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: rows,
    );
  }

  Widget _pill({
    required double maxWidth,
    required Color fill,
    required BorderRadius radius,
    required Widget child,
    EdgeInsets? padding,
  }) {
    return ConstrainedBox(
      constraints: BoxConstraints(maxWidth: maxWidth),
      child: Container(
        // minHeight, not height — keeps the bubble scalable under
        // `textScaleFactorTestValue = 2.0` per the multi-size smoke pattern.
        constraints: const BoxConstraints(minHeight: 0),
        padding:
            padding ??
            const EdgeInsets.symmetric(
              horizontal: AppChat.bubblePaddingH,
              vertical: AppChat.bubblePaddingV,
            ),
        decoration: BoxDecoration(
          color: fill,
          borderRadius: radius,
          // Every user + bot bubble carries the same drop shadow per Figma
          // `2612:17963` — `drop-shadow-[0px_1px_1px_rgba(0,0,0,0.05)]`.
          boxShadow: AppChat.bubbleShadow,
        ),
        child: child,
      ),
    );
  }
}

/// Per-variant bubble radii — Figma `2612:17963`. USER bubble tail sits at
/// bottom-right (`rCorners=[16,16,2,16]`), BOT bubble tail sits at
/// bottom-left (`rCorners=[16,16,16,2]`). Precomputed as `BorderRadius`
/// constants so the pill build is a pure `const` decoration.
const BorderRadius _kUserRadius = BorderRadius.only(
  topLeft: Radius.circular(AppChat.bubbleCornerLarge),
  topRight: Radius.circular(AppChat.bubbleCornerLarge),
  bottomLeft: Radius.circular(AppChat.bubbleCornerLarge),
  bottomRight: Radius.circular(AppChat.bubbleTailRadius),
);

const BorderRadius _kBotRadius = BorderRadius.only(
  topLeft: Radius.circular(AppChat.bubbleCornerLarge),
  topRight: Radius.circular(AppChat.bubbleCornerLarge),
  bottomLeft: Radius.circular(AppChat.bubbleTailRadius),
  bottomRight: Radius.circular(AppChat.bubbleCornerLarge),
);

/// Three animated dots inside the typing bubble. Kept internal — the only
/// caller is [ChatBubble] with [ChatBubbleVariant.typing].
class _TypingDots extends StatefulWidget {
  const _TypingDots();

  @override
  State<_TypingDots> createState() => _TypingDotsState();
}

class _TypingDotsState extends State<_TypingDots>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1200),
  )..repeat();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            for (var i = 0; i < 3; i++) ...<Widget>[
              _dot(i),
              if (i < 2) const SizedBox(width: AppChat.typingDotGap),
            ],
          ],
        );
      },
    );
  }

  Widget _dot(int index) {
    // Stagger the fade by 1/3 of the cycle per dot — classic "..." bounce.
    final t = (_controller.value - index / 3) % 1.0;
    final opacity = 0.35 + 0.65 * ((0.5 - (t - 0.5).abs()) * 2).clamp(0.0, 1.0);
    return Opacity(
      opacity: opacity,
      child: Container(
        width: AppChat.typingDotSize,
        height: AppChat.typingDotSize,
        decoration: const BoxDecoration(
          color: AppColors.chatTypingDot,
          shape: BoxShape.circle,
        ),
      ),
    );
  }
}
