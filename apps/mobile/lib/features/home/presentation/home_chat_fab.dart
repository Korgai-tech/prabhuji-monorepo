import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme.dart';
import '../../../state/providers.dart';
import '../../chat/chat_analytics.dart';
import '../../shell/application/open_chat.dart';

/// Home's chat entry — an extended FAB that replaced the bottom-nav Chat tab
/// (Figma `3914:11348`, "Different CTA").
///
/// Fully extended (glyph + arm label) while Home sits at the top; collapses to
/// the glyph alone once the user scrolls down ([extended], driven by
/// `HomeScreen`'s scroll controller). A tap in either state goes through
/// [openChatFromShell], so `chat_button_clicked` fires with the same
/// `chat_type` / `agent_id` attribution the nav tab used to send.
///
/// Renders nothing unless `/users/me` has granted chat AND the arm has a
/// label — the control arm (and a still-loading or unknown arm) gets no FAB.
class HomeChatFab extends ConsumerWidget {
  const HomeChatFab({super.key, required this.extended});

  final bool extended;

  /// FAB label per A/B arm (`chatConfig.chatType`). No entry → no FAB.
  static const Map<String, String> labels = <String, String>{
    'content_chat': 'प्रभुजी से पूछें',
    'bhagwat_gita_chat': 'गीता से पूछें',
    'kuldevta_chat': 'कुलदेवता से पूछें',
  };

  static const double _height = 48;
  static const double _iconSize = 24;
  static const Duration _duration = Duration(milliseconds: 200);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final chatConfig = ref.watch(meProvider).value?.chatConfig;
    final label = chatConfig?.enabled == true
        ? labels[chatConfig?.chatType]
        : null;
    if (label == null) return const SizedBox.shrink();

    return Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      child: Material(
        key: const Key('home-chat-fab'),
        color: AppColors.primaryCta,
        shape: const StadiumBorder(),
        elevation: 6,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => openChatFromShell(
            context: context,
            ref: ref,
            goBranch: StatefulNavigationShell.of(context).goBranch,
            sourceScreen: 'home',
            entryPoint: ChatEntryPoint.home,
          ),
          child: SizedBox(
            height: _height,
            child: Padding(
              // (48 − 24) / 2 keeps the collapsed state a perfect circle.
              padding: const EdgeInsets.symmetric(
                horizontal: (_height - _iconSize) / 2,
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  SvgPicture.asset(
                    'assets/chat/nav_chat.svg',
                    width: _iconSize,
                    height: _iconSize,
                    colorFilter: const ColorFilter.mode(
                      Colors.white,
                      BlendMode.srcIn,
                    ),
                  ),
                  AnimatedSize(
                    duration: _duration,
                    curve: Curves.easeOut,
                    alignment: Alignment.centerLeft,
                    child: extended
                        ? Padding(
                            key: const Key('home-chat-fab-label'),
                            padding: const EdgeInsets.only(left: 8, right: 4),
                            child: Text(
                              label,
                              maxLines: 1,
                              softWrap: false,
                              style: AppText.labelLg(
                                color: Colors.white,
                              ).copyWith(fontWeight: FontWeight.w600),
                            ),
                          )
                        : const SizedBox.shrink(),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
