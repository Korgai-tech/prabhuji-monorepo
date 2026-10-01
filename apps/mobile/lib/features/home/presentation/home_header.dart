import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme.dart';
import '../../../state/providers.dart';
import '../../support/support_analytics.dart';
import '../../support/support_routes.dart';
import '../home_analytics.dart';
import '../home_routes.dart';

/// Home header (Figma node 285:3482): logo + wordmark, help icon, profile avatar.
///
/// #EXPORT_CRITICAL — the frame's **search bar (285:3499) and mic (285:3505) are
/// deliberately NOT built** (PRD §6, §17: search is out of Phase 1). That is why
/// this renders 64 tall where the Figma frame is 108: the search row and its
/// 12px gap are the missing 44. Recorded as an authorized divergence in
/// `specs/evidence/TAM-62/fidelity/cross-check.md`.
///
/// The **Pro crown/VIP badge** is NOT rendered: it was **dropped from Phase 1 by
/// product decision (2026-07-15)**. The Figma file contains no crown/VIP node
/// anywhere (the Home frame and the unified paywall 493:3349 were both swept),
/// and the STRICT gate (TAM-56 Decision 2) forbids authoring or substituting art,
/// so nothing was invented to fill the gap. Deferred to Phase 2 if the design
/// owner adds a node — see the spec's Evidence section.
class HomeHeader extends ConsumerWidget {
  const HomeHeader({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Container(
      key: const Key('home-header'),
      height: AppHome.headerHeight,
      padding: const EdgeInsets.symmetric(
        horizontal: AppHome.screenPadding,
        vertical: AppHome.headerPaddingV,
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          // Leading: logo + wordmark (node 285:3484).
          Flexible(
            child: Row(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.center,
              spacing: AppHome.logoWordmarkGap,
              children: [
                Container(
                  key: const Key('home-header-logo'),
                  width: AppHome.logoSize,
                  height: AppHome.logoSize,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: AppColors.homeLogoRing,
                      width: AppHome.logoRingWidth,
                    ),
                  ),
                  // 2-tone (orange body + white knockout) → rendered UNTINTED;
                  // a srcIn tint would erase the knockout.
                  child: SvgPicture.asset(
                    'assets/home/logo-mark.svg',
                    width: AppHome.logoSize,
                    height: AppHome.logoSize,
                  ),
                ),
                Flexible(
                  child: Text(
                    'Prabhuji',
                    key: const Key('home-header-wordmark'),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppText.wordmarkFigma(
                      fontSize: AppHome.wordmarkSize,
                      color: AppColors.homeWordmark,
                    ),
                  ),
                ),
              ],
            ),
          ),
          // Trailing: help + avatar (node 285:3494). NO search, NO mic.
          Row(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.center,
            spacing: AppHome.headerTrailingGap,
            children: [
              GestureDetector(
                key: const Key('home-header-help'),
                behavior: HitTestBehavior.opaque,
                onTap: () {
                  // Fire the LEGACY `support_clicked` event alongside the new
                  // `support_opened` (initState fires that one from the pushed
                  // screen). The two events live side-by-side per the spec:
                  // "keep firing until the analytics-contract owner retires
                  // the row" — mirror of the logout_clicked / logout_result
                  // intent-vs-result pattern.
                  unawaited(
                    ref
                        .read(analyticsProvider)
                        ?.trackEvent(HomeEvents.supportClicked),
                  );
                  context.push(
                    SupportRoutes.support,
                    extra: SupportEntrySource.homeHeader,
                  );
                },
                child: SvgPicture.asset(
                  'assets/home/help.svg',
                  width: AppHome.helpGlyph,
                  height: AppHome.helpGlyph,
                  colorFilter: const ColorFilter.mode(
                    AppColors.homeHelpGlyph,
                    BlendMode.srcIn,
                  ),
                ),
              ),
              const _ProfileAvatar(),
            ],
          ),
        ],
      ),
    );
  }
}

/// Profile avatar (node 285:3497) — a #D83A00 circle with the user's initial
/// (node 285:3498 renders "M"). The initial comes from the live session, never
/// from a hardcoded letter.
///
/// Tapping the avatar opens the [HomeRoutes.profile] menu, which lets the user
/// either change their language or log out — the language screen itself is one
/// tap deeper from there.
class _ProfileAvatar extends ConsumerWidget {
  const _ProfileAvatar();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return GestureDetector(
      key: const Key('home-header-avatar'),
      behavior: HitTestBehavior.opaque,
      onTap: () {
        unawaited(
          ref.read(analyticsProvider)?.trackEvent(HomeEvents.profileClicked),
        );
        context.push(HomeRoutes.profile);
      },
      child: Container(
        width: AppHome.avatarSize,
        height: AppHome.avatarSize,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: AppColors.homeAvatarFill,
          boxShadow: const [
            BoxShadow(
              color: AppColors.homeAvatarShadow,
              offset: Offset(0, 1),
              blurRadius: 2,
            ),
          ],
        ),
        child: Text(
          _initial(ref),
          style: AppText.homeAvatarInitial(),
        ),
      ),
    );
  }

  /// The signed-in user's own initial (the design mocks "M", node 285:3498).
  ///
  /// Keyed on the user's NAME, from `GET /users/me` via [meProvider].
  ///
  /// It used to key on the JWT's `email` claim, on the reasoning that this was
  /// the only identity fact the client held. Both halves of that stopped being
  /// true: phone accounts no longer carry an email at all (the claim is simply
  /// absent), and `/users/me` — which the onboarding orchestrator already calls
  /// — returns the real name. The old behaviour was also wrong in practice: for
  /// every phone user the claim was the synthetic `otp-<id>@prabhuji.internal`,
  /// so everyone saw the same meaningless "O".
  ///
  /// Falls back to the brand's own initial while the fetch is in flight, on
  /// error, when there is no session, and when the user has not set a name —
  /// inventing a letter is still not an option.
  String _initial(WidgetRef ref) {
    final name = ref.watch(meProvider).value?.name?.trim() ?? '';
    if (name.isEmpty) return 'P';
    return name.characters.first.toUpperCase();
  }
}
