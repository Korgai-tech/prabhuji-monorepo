import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../../../core/theme.dart';
import '../../../../shared/widgets/app_network_image.dart';
import '../../data/status_models.dart';

/// The FIXED Phase-1 overlay template (Figma node `I330:6125;322:1743`),
/// composited CLIENT-SIDE over the status media.
///
/// ## Sizing (AUTO — was fixed at `bottom × mediaHeight`)
///
/// TAM-71 originally shipped `overlaySafeArea.bottom` as the band's HEIGHT
/// as a fraction of the media. That constant height clipped when the text
/// grew (e.g. the empty-state prompt wrapping to 2 lines), producing the
/// familiar RenderFlex `BOTTOM OVERFLOWED BY N PIXELS` warning and cutting
/// off the avatar's top half. The band now sizes to its CONTENT:
///  * The `Positioned` uses `left/right/bottom` only (no height) so the
///    child determines its own height and the band grows UP from the bottom.
///  * The avatar sits in an outer `Stack(clipBehavior: Clip.none)` so its
///    top half can rise above the band without the band's border-radius
///    clipping it.
///
/// The safe-area fractions still drive:
///  * **`left` / `right`** — a MINIMUM horizontal inset for the band's
///    content (avatar + text). Applied as `max(figmaPadding, fraction × width)`
///    so live data can only ever push content INSIDE the safe region.
///  * **`top`** — headroom that must stay clear. Nothing is drawn above
///    the band even when it grows, so the deity's face is never covered
///    (PRD §6.7, §10) — asserted in the widget tests.
///
/// ## Render architecture (TAM-168)
///
/// For the on-screen preview this widget is the source of truth. For the
/// share export:
///  * **Filled profile** (`profile.hasNameOrPhoto == true`) — the export path
///    captures the on-screen `RepaintBoundary` around this subtree exactly
///    as-is (structural preview/export parity).
///  * **Empty profile** — the export path skips this widget entirely and
///    ships a deity-only creative, mirroring the video path. That is why
///    the empty-state prompt on-screen is BOTH a tappable discovery
///    affordance (`onEmptyStripTap`) and a visual placeholder — the tap
///    handler is UI-only; the exported file is unaffected.
class StatusOverlayBand extends StatelessWidget {
  const StatusOverlayBand({
    super.key,
    required this.profile,
    required this.safeArea,
    required this.mediaSize,
    this.onEmptyStripTap,
  });

  final StatusProfileData profile;
  final StatusSafeArea safeArea;
  final Size mediaSize;

  /// TAM-168 — invoked when the user taps the empty-state strip. When
  /// non-null AND the profile has no saved name/photo, the prompt is
  /// wrapped in a `GestureDetector` and the caller navigates to the details
  /// editor. When null (or when the profile is filled), the strip is
  /// display-only and the top-right Edit Details pill is the only edit path.
  final VoidCallback? onEmptyStripTap;

  double get _contentInsetLeft {
    final area = safeArea.orFigmaDefault;
    final fromSafeArea = mediaSize.width * area.left;
    return fromSafeArea > AppStatus.overlayPaddingH
        ? fromSafeArea
        : AppStatus.overlayPaddingH;
  }

  double get _contentInsetRight {
    final area = safeArea.orFigmaDefault;
    final fromSafeArea = mediaSize.width * area.right;
    return fromSafeArea > AppStatus.overlayPaddingH
        ? fromSafeArea
        : AppStatus.overlayPaddingH;
  }

  @override
  Widget build(BuildContext context) {
    final hasDetails = profile.hasNameOrPhoto;
    final promptTap = !hasDetails ? onEmptyStripTap : null;
    return Positioned(
      left: 0,
      right: 0,
      bottom: 0,
      // Auto-height: child dictates.
      //
      // TAM-168 — the outer GestureDetector wraps the ENTIRE strip (band +
      // avatar) so a tap on the avatar placeholder triggers the same
      // discovery affordance as a tap on the text. The avatar sits in a
      // Positioned sibling of the band; wrapping only the band's Container
      // (as we did originally) leaves the avatar untappable because
      // GestureDetector's hit region is its child's rect. Moving the
      // detector up one level captures the full outer Stack, which sizes
      // to `avatarRise + bandHeight` and therefore covers both. Filled
      // state → promptTap null → the detector consumes no gestures and
      // media siblings above the strip are unaffected.
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: promptTap,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            // BAND — pushed down by the avatar rise so the rounded top
            // corners don't clip the avatar's top half. `width:
            // double.infinity` forces the band decoration to span the full
            // card width; without it the Container would shrink to its
            // intrinsic child (the text Column uses `MainAxisSize.min`),
            // producing a band that clung to the text instead of the card
            // edges.
            Padding(
              padding: const EdgeInsets.only(top: AppStatus.overlayAvatarRise),
              child: Container(
                key: const Key('status-overlay-band'),
                width: double.infinity,
                decoration: const BoxDecoration(
                  // The template's own art — an IMAGE fill in Figma
                  // (ref 7678fa5a…), downloaded to
                  // assets/status/overlay_template_bg.png. Not invented.
                  image: DecorationImage(
                    image: AssetImage('assets/status/overlay_template_bg.png'),
                    fit: BoxFit.cover,
                  ),
                  border: Border(
                    top: BorderSide(
                      color: AppColors.statusOverlayBorder,
                      width: AppStatus.overlayBorder,
                    ),
                  ),
                  borderRadius: BorderRadius.vertical(
                    top: Radius.circular(AppStatus.overlayBandRadius),
                  ),
                ),
                clipBehavior: Clip.antiAlias,
                padding: EdgeInsets.only(
                  left: _contentInsetLeft + AppStatus.overlayTextInset,
                  right: _contentInsetRight,
                  top: AppStatus.overlayPaddingV + 6,
                  bottom: AppStatus.overlayPaddingV + 6,
                ),
                child: hasDetails
                    ? _OverlayText(profile: profile)
                    : const _OverlayPrompt(),
              ),
            ),
            // Avatar rises ABOVE the band. Positioned at top:0 relative to
            // the outer Stack (which starts `overlayAvatarRise` above the
            // band's decoration edge), so its top half sits over the media
            // area.
            Positioned(
              left: _contentInsetLeft,
              top: 0,
              child: StatusOverlayAvatar(imageUrl: profile.avatarImageUrl),
            ),
          ],
        ),
      ),
    );
  }
}

/// The saved personal name (Figma node I330:6125;322:1749). After TAM-168
/// the overlay is personal-only — the business subtitle + detail rows are
/// deleted. When only a photo is saved (name empty), a zero-width space
/// stands in for the text so the row's baseline metrics stay identical to
/// the "name saved" case and the band's intrinsic height is stable.
class _OverlayText extends StatelessWidget {
  const _OverlayText({required this.profile});
  final StatusProfileData profile;

  /// A zero-width space keeps the Text widget's baseline + metrics identical
  /// to the "name saved" case — a plain empty string ('') collapses the row
  /// height, which visibly shrinks the band in the photo-only branch.
  static const String _zeroWidthSpace = '​';

  @override
  Widget build(BuildContext context) {
    final title = profile.overlayTitle ?? _zeroWidthSpace;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          key: const Key('status-overlay-title'),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: AppText.labelLg(color: AppColors.statusOverlayName).copyWith(
            fontSize: AppStatus.overlayNameSize,
            height: AppStatus.overlayNameHeight / AppStatus.overlayNameSize,
          ),
        ),
      ],
    );
  }
}

/// Shown when the profile has neither a saved name nor a saved photo. TAM-168
/// — one line, in Hindi, prompting the user to add details. The sub-line
/// ("They'll appear on every status you share") was deleted; the strip is
/// now wrapped by [StatusOverlayBand] in a `GestureDetector` when the parent
/// screen supplied `onEmptyStripTap`.
class _OverlayPrompt extends StatelessWidget {
  const _OverlayPrompt();

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'अपना नाम और फोटो ऐड करें',
          key: const Key('status-overlay-prompt'),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: AppText.labelLg(color: AppColors.statusOverlayName).copyWith(
            fontSize: AppStatus.overlayNameSize,
            height: AppStatus.overlayNameHeight / AppStatus.overlayNameSize,
          ),
        ),
      ],
    );
  }
}

/// The overlay avatar (Figma node I330:6125;322:1768) — a 67.19 white ring
/// holding either the saved `avatarImageUrl` or the exported `user-01`
/// silhouette. The `plus-circle` badge only renders while [imageUrl] is
/// EMPTY (call-to-action to add a photo); once a photo is saved the badge
/// hides so the burned-in status doesn't advertise "add photo" to a user
/// who already has one.
class StatusOverlayAvatar extends StatelessWidget {
  const StatusOverlayAvatar({super.key, required this.imageUrl});

  final String? imageUrl;

  @override
  Widget build(BuildContext context) {
    final url = (imageUrl ?? '').trim();
    return SizedBox(
      key: const Key('status-overlay-avatar'),
      width: AppStatus.overlayAvatarSize,
      height: AppStatus.overlayAvatarSize,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Container(
            width: AppStatus.overlayAvatarSize,
            height: AppStatus.overlayAvatarSize,
            decoration: BoxDecoration(
              color: AppColors.statusAvatarFill,
              shape: BoxShape.circle,
              border: Border.all(
                color: AppColors.statusAvatarRing,
                width: AppStatus.overlayAvatarRing,
              ),
            ),
            alignment: Alignment.center,
            child: ClipOval(
              child: SizedBox(
                width: AppStatus.overlayAvatarInner,
                height: AppStatus.overlayAvatarInner,
                child: url.isEmpty
                    ? Center(
                        // Figma's own user-01 export; its #B8B8B8 stroke is the
                        // design colour, so it renders untinted.
                        child: SvgPicture.asset(
                          'assets/status/avatar_person.svg',
                          width: AppStatus.overlayAvatarGlyph,
                          height: AppStatus.overlayAvatarGlyph,
                        ),
                      )
                    : AppNetworkImage(url: url, fit: BoxFit.cover),
              ),
            ),
          ),
          if (url.isEmpty)
            Positioned(
              right: -2,
              bottom: 0,
              child: Container(
                width: AppStatus.overlayBadgeSize,
                height: AppStatus.overlayBadgeSize,
                decoration: BoxDecoration(
                  color: AppColors.statusAvatarBadgeFill,
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: AppColors.statusAvatarRing,
                    width: AppStatus.overlayAvatarRing,
                  ),
                ),
                alignment: Alignment.center,
                child: SvgPicture.asset(
                  'assets/status/plus_circle.svg',
                  width: AppStatus.overlayBadgeGlyph,
                  height: AppStatus.overlayBadgeGlyph,
                ),
              ),
          ),
        ],
      ),
    );
  }
}
