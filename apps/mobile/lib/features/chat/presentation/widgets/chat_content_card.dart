import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../../../api/generated/openapi.dart';
import '../../../../core/theme.dart';
import '../../../../shared/widgets/app_network_image.dart';

/// Content-card variant styling — matches Figma `2612:17847` (mantra),
/// `2612:17876` (aarti/bhajan/chalisa) and `2612:17905` (wallpaper). All
/// three cards share the same shape; only the subtitle format + CTA copy
/// differ per content type.
///
/// The card renders in ONE of two visual states:
///
///  * default — 1 dp grey hairline border.
///  * active — 2 dp orange border (spec: "client-side transient", tap
///    signal; exact toggle rule is a Phase 6 product call).
///
/// The `playUrl == null` variant renders WITH the icon (spec §Content-card
/// tap behaviour) and a subtle lock badge — the server withheld a Pro-only
/// play URL from a free caller (`chat.content.ts`).
///
/// That variant IS TAPPABLE. It used to be a dead card, on the premise that
/// chat entry was already Pro-gated so a free user could never see one; that
/// premise died with `CHAT_REQUIRES_PRO = false` (chat is free now, see
/// `chat_paywall.dart`), which left free users staring at a lock they could
/// not act on. The tap POLICY — open the module, or open the paywall — is not
/// this widget's to make: it lives in one place,
/// `chat_screen.dart:_onCardTapped`, which runs every tap through
/// [PaywallGate]. This widget only ever reports the tap.
///
/// Per-type CTA copy is LOCKED in [chatContentCtaCopy] — six strings, no
/// per-item override. Spec §Content-card tap behaviour.
class ChatContentCard extends StatelessWidget {
  const ChatContentCard({
    super.key,
    required this.contentType,
    required this.item,
    required this.title,
    this.subtitle,
    this.active = false,
    this.onTap,
  });

  /// One of the six content types: `aarti | bhajan | mantra | ringtone |
  /// status | wallpaper`. Drives the CTA copy via [chatContentCtaCopy].
  final String contentType;

  /// The chat-recommended item (server-authoritative id + playUrl + icon).
  final ChatContentItem item;

  /// Human-readable title. In v1 the server returns id + icon + playUrl on
  /// the item; a display title / subtitle for the card comes from wherever
  /// the client resolves it (e.g. content-resolver lookup in Slice 3).
  /// Passed in explicitly here so the widget stays presentational.
  final String title;

  /// Optional secondary line (e.g. "Mantra · 108 baar", "Aarti · 5 min",
  /// "Wallpaper"). Rendered when non-null / non-empty.
  final String? subtitle;

  /// Client-side "active" (last-tapped / currently-playing) transient —
  /// paints the 2 dp orange border variant. Off by default.
  final bool active;

  /// Fired on a tap of the header or the CTA row — ALWAYS honoured when
  /// non-null, including on the locked variant, whose tap opens the paywall
  /// (see class doc). Null only where a call site has nothing to do with a
  /// tap, e.g. the goldens.
  final VoidCallback? onTap;

  /// Horoscope cards have NO playable media asset by design — the
  /// content is the daily result screen inside the Rashifal module,
  /// not audio/image data on the item. `playUrl: null` is expected on
  /// every horoscope item and must NOT gate the tap. The Rashifal
  /// module's own paywall (on the zodiac-result push) is what gates
  /// access, matching every other daily-result entry point.
  ///
  /// VISUAL ONLY — the lock badge and the greyed CTA. It no longer disables
  /// the tap; see the class doc. `chat_screen.dart:_onCardTapped` computes the
  /// same expression for its own (analytics + defensive) purposes, so the two
  /// must be kept in step.
  bool get _proLocked => contentType != 'horoscope' && item.playUrl == null;

  @override
  Widget build(BuildContext context) {
    final ctaCopy = chatContentCtaCopy[contentType] ?? '';
    return Semantics(
      button: onTap != null,
      label: '$title. $ctaCopy',
      // Card carries `DROP_SHADOW #000 @0.05 offset(0,1) radius=2` on BOTH
      // `stroke=Normal` and `stroke=Highlighted` variants per Figma
      // `2612:17876` / `2612:17847` / `2612:17905` — confirmed via Figma
      // REST 2026-09-02. Painted on a wrapper `DecoratedBox` around the
      // `Material` so the shadow shows through the material fill.
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(AppChat.cardRadius),
          boxShadow: AppChat.surfaceShadow,
        ),
        child: Material(
          color: AppColors.chatCardSurface,
          borderRadius: BorderRadius.circular(AppChat.cardRadius),
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(AppChat.cardRadius),
            child: Container(
              decoration: BoxDecoration(
                color: AppColors.chatCardSurface,
                borderRadius: BorderRadius.circular(AppChat.cardRadius),
                border: Border.all(
                  color: active
                      ? AppColors.chatCardBorderActive
                      : AppColors.chatCardBorder,
                  width: active
                      ? AppChat.cardBorderWidthActive
                      : AppChat.cardBorderWidth,
                ),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: <Widget>[
                  _CardHeader(
                    item: item,
                    title: title,
                    subtitle: subtitle,
                    proLocked: _proLocked,
                  ),
                  if (ctaCopy.isNotEmpty)
                    const Divider(
                      height: 1,
                      thickness: 1,
                      color: AppColors.chatCardDivider,
                    ),
                  if (ctaCopy.isNotEmpty)
                    _CardCta(
                      label: ctaCopy,
                      active: active,
                      disabled: _proLocked,
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

class _CardHeader extends StatelessWidget {
  const _CardHeader({
    required this.item,
    required this.title,
    required this.subtitle,
    required this.proLocked,
  });

  final ChatContentItem item;
  final String title;
  final String? subtitle;
  final bool proLocked;

  @override
  Widget build(BuildContext context) {
    return ConstrainedBox(
      // minHeight — Figma's `height: 84` translated to a floor. Text can
      // grow this taller under textScaler; do NOT use rigid `height:`
      // around scalable text.
      constraints: const BoxConstraints(minHeight: AppChat.cardHeaderMinHeight),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppChat.cardHeaderPaddingH,
          vertical: AppChat.cardHeaderPaddingV,
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: <Widget>[
            _Thumb(iconUrl: item.icon, locked: proLocked),
            const SizedBox(width: AppChat.cardHeaderGap),
            Expanded(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(
                    title,
                    style: AppText.chatCardTitle(),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (subtitle != null && subtitle!.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(
                        subtitle!,
                        style: AppText.chatCardSubtitle(),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Thumb extends StatelessWidget {
  const _Thumb({required this.iconUrl, required this.locked});

  final String iconUrl;
  final bool locked;

  @override
  Widget build(BuildContext context) {
    final img = AppNetworkImage(
      url: iconUrl,
      width: AppChat.cardThumb,
      height: AppChat.cardThumb,
      borderRadius: BorderRadius.circular(AppChat.cardThumbRadius),
    );
    if (!locked) return img;
    // Defensive fallback — subtle bottom-right lock badge. Kept intentionally
    // small: the spec calls this "rare-to-never" under the entry-gate model.
    return Stack(
      alignment: Alignment.bottomRight,
      children: <Widget>[
        img,
        Padding(
          padding: const EdgeInsets.all(2),
          child: Container(
            padding: const EdgeInsets.all(3),
            decoration: BoxDecoration(
              color: AppColors.grey500.withValues(alpha: 0.85),
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.lock_outline,
              size: 10,
              color: AppColors.white,
            ),
          ),
        ),
      ],
    );
  }
}

class _CardCta extends StatelessWidget {
  const _CardCta({
    required this.label,
    required this.active,
    required this.disabled,
  });

  final String label;
  final bool active;
  final bool disabled;

  @override
  Widget build(BuildContext context) {
    final color = disabled
        ? AppColors.grey400
        : (active ? AppColors.chatCardCta : AppColors.chatCardCta);
    return ConstrainedBox(
      constraints: const BoxConstraints(minHeight: AppChat.cardCtaMinHeight),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppChat.cardCtaPaddingH,
          vertical: 12,
        ),
        child: Row(
          children: <Widget>[
            Expanded(
              child: Text(
                label,
                style: AppText.chatCardCta(color: color),
                maxLines: 2,
              ),
            ),
            SvgPicture.asset(
              'assets/chat/chevron_right.svg',
              width: AppChat.cardCtaChevron,
              height: AppChat.cardCtaChevron,
              colorFilter: ColorFilter.mode(color, BlendMode.srcIn),
            ),
          ],
        ),
      ),
    );
  }
}

/// Locked per-content-type CTA copy. Spec §Content-card tap behaviour. Do
/// NOT localise or override per-item in v1.
///
/// **NOTE — Slice 3 correction (2026-09-02):** The spec's copy strings
/// include a trailing " →" (Unicode right-arrow) for each value. Figma
/// renders the arrow as a SEPARATE SVG chevron (`assets/chat/chevron_right.svg`),
/// not as part of the text — see 2612:17847 / 17876 / 17905 highlighted
/// variants where the text nodes are plainly `'Jaap shuru karein'` etc.
/// Keeping both would ship a double-arrow. The strings below drop the
/// trailing arrow; the SVG chevron in `_CardCta` supplies the visual.
/// Follow-up: BSA to amend the spec's §Content-card tap behaviour block
/// (see `specs/evidence/TAM-164/fidelity/token-diff.md` § Follow-ups F-2).
const Map<String, String> chatContentCtaCopy = <String, String>{
  'mantra': 'Jaap shuru karein',
  // Aarti and Bhajan SHARE the same copy — reused via the map, NEVER
  // duplicated as two separate string literals (spec-locked).
  'aarti': 'Sunna shuru karein',
  'bhajan': 'Sunna shuru karein',
  'wallpaper': 'Wallpaper lagayein',
  'ringtone': 'Ringtone lagayein',
  'status': 'Status dekhein',
  'horoscope': 'Rashifal dekhein',
};

/// Compile-time sanity — the seven content-type keys are the same seven
/// keys the backend's `ChatContentGroups` schema always ships (spec
/// §API Contract: "every key is always present"). Kept as a `Set` so a
/// future re-order or rename of any key here fails fast in tests that
/// iterate this set. Horoscope joined the set when PRD §12 clarified
/// that "Aaj ka rashifal" queries hand off to the Horoscope section.
@visibleForTesting
const Set<String> kChatContentTypes = <String>{
  'aarti',
  'bhajan',
  'mantra',
  'ringtone',
  'status',
  'wallpaper',
  'horoscope',
};
