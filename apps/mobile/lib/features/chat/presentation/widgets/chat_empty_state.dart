import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../../../api/generated/openapi.dart';
import '../../../../core/theme.dart';

/// Chat empty state (Figma `2612:17647`). Rendered when the caller has
/// never sent a message — `GET /chat/history` returned `sessionId == null`
/// AND `previousChat == []`.
///
/// Layout inside the transcript zone (top → bottom):
///
///  1. Deity roundel (128 dp peach circle + orange inner ring + Om/temple
///     glyph)
///  2. Title — [ChatScreenConfig.title] (e.g. "Namaste") 32/40 w600
///  3. Subtitle — [ChatScreenConfig.subtitle] 16/24 w400 grey
///  4. "RECOMMENDED" label — 12/16 w500 uppercase letter-spaced grey
///  5. Column of chips — [ChatScreenConfig.recommendedMessages] sorted
///     by `order`, keyed by `id` for analytics.
///
/// Tapping a chip invokes [onChipTapped] with the message — the parent
/// (chat_screen) then fires `chat_recommended_tapped` AND
/// `ChatMessageSubmitted(promptSource: 'recommended', promptId: id)` — the
/// spec is explicit: the recommended-tap analytics event fires BEFORE the
/// send so we measure the discovery even if the send later fails.
class ChatEmptyState extends StatelessWidget {
  const ChatEmptyState({
    super.key,
    required this.config,
    required this.onChipTapped,
    this.enabled = true,
  });

  final ChatScreenConfig config;

  /// Fired when the user taps a recommended chip. The callback receives
  /// the ORIGINAL [ChatRecommendedMessage] so the parent can plumb both
  /// `id` (for analytics) and `text` (for the send body).
  final ValueChanged<ChatRecommendedMessage> onChipTapped;

  /// Read-only mode hides the chips (there's no point suggesting sends
  /// when send is disabled) — spec §Read-only mode. The roundel + title +
  /// subtitle still render.
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final chips = [...config.recommendedMessages]
      ..sort((a, b) => a.order.compareTo(b.order));
    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: AppChat.screenPadding,
        vertical: AppSpacing.xLarge,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          const Center(child: _DeityRoundel()),
          const SizedBox(height: AppChat.emptyTitleGap),
          Text(
            config.title,
            key: const Key('chat-empty-title'),
            textAlign: TextAlign.center,
            style: AppText.chatEmptyTitle(),
          ),
          const SizedBox(height: AppChat.emptySubtitleGap),
          Text(
            config.subtitle,
            key: const Key('chat-empty-subtitle'),
            textAlign: TextAlign.center,
            style: AppText.chatEmptySubtitle(),
          ),
          if (enabled && chips.isNotEmpty) ...<Widget>[
            const SizedBox(height: AppChat.emptyRecommendedGap),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: Text(
                'RECOMMENDED',
                key: const Key('chat-empty-recommended-label'),
                style: AppText.chatEmptyRecommendedLabel(),
              ),
            ),
            const SizedBox(height: AppChat.emptyRecommendedLabelGap),
            for (var i = 0; i < chips.length; i++) ...<Widget>[
              _RecommendedChip(
                key: Key('chat-empty-chip-${chips[i].id}'),
                chip: chips[i],
                onTap: () => onChipTapped(chips[i]),
              ),
              if (i < chips.length - 1)
                const SizedBox(height: AppChat.emptyChipGap),
            ],
          ],
        ],
      ),
    );
  }
}

class _DeityRoundel extends StatelessWidget {
  const _DeityRoundel();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: AppChat.emptyDeityRoundel,
      height: AppChat.emptyDeityRoundel,
      decoration: BoxDecoration(
        color: AppColors.chatEmptyDeityFill,
        shape: BoxShape.circle,
      ),
      child: Center(
        child: Container(
          width: AppChat.emptyDeityRoundel * 0.75,
          height: AppChat.emptyDeityRoundel * 0.75,
          decoration: BoxDecoration(
            color: AppColors.chatEmptyDeityFill,
            shape: BoxShape.circle,
            border: Border.all(
              color: AppColors.chatEmptyDeityRing,
              width: AppChat.emptyDeityInnerRingWidth,
            ),
          ),
          child: Center(
            child: SvgPicture.asset(
              'assets/chat/deity_om_temple.svg',
              width: AppChat.emptyDeityGlyph,
              height: AppChat.emptyDeityGlyph,
              colorFilter: const ColorFilter.mode(
                AppColors.chatEmptyDeityGlyph,
                BlendMode.srcIn,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _RecommendedChip extends StatelessWidget {
  const _RecommendedChip({super.key, required this.chip, required this.onTap});

  final ChatRecommendedMessage chip;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    // Chip carries a soft drop shadow `#000 @0.02 offset(0,1) radius=2`
    // per Figma `2612:17647 → Button - Suggestion Card {1,2,3}`. Confirmed
    // via Figma REST 2026-09-02. Painted on a wrapper `DecoratedBox` so it
    // sits behind the Material fill.
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(AppChat.emptyChipRadius),
        boxShadow: AppChat.emptyChipShadow,
      ),
      child: Material(
        color: AppColors.chatEmptyChipFill,
        borderRadius: BorderRadius.circular(AppChat.emptyChipRadius),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(AppChat.emptyChipRadius),
          child: Container(
            constraints: const BoxConstraints(
              minHeight: AppChat.emptyChipMinHeight,
            ),
            padding: const EdgeInsets.symmetric(
              horizontal: AppChat.emptyChipPaddingH,
              vertical: AppChat.emptyChipPaddingV,
            ),
            decoration: BoxDecoration(
              color: AppColors.chatEmptyChipFill,
              borderRadius: BorderRadius.circular(AppChat.emptyChipRadius),
              border: Border.all(
                color: AppColors.chatEmptyChipBorder,
                width: 1,
              ),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: <Widget>[
                Container(
                  width: AppChat.emptyChipIconTile,
                  height: AppChat.emptyChipIconTile,
                  decoration: BoxDecoration(
                    color: AppColors.chatEmptyChipIconFill,
                    borderRadius: BorderRadius.circular(
                      AppChat.emptyChipIconRadius,
                    ),
                  ),
                  child: Center(
                    child: SvgPicture.asset(
                      'assets/chat/chip_message.svg',
                      width: AppChat.emptyChipIconGlyph,
                      height: AppChat.emptyChipIconGlyph,
                      colorFilter: const ColorFilter.mode(
                        AppColors.chatEmptyChipIconGlyph,
                        BlendMode.srcIn,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: AppChat.emptyChipGap),
                Expanded(
                  child: Text(
                    chip.text,
                    style: AppText.chatEmptyChip(),
                    maxLines: 2,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
