import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../../../core/theme.dart';
import '../../../../shared/widgets/app_network_image.dart';

/// Identity block on the main Profile screen (Figma `1923:17991` Free,
/// `1932:19710` VIP). Shows the avatar (image or initial-letter fallback),
/// name, phone, and an orange-ringed VIP badge for Pro users.
///
/// The block itself is tap-friendly — tapping anywhere pushes to Edit
/// Profile per AC. A trailing pencil (`edit_pencil.svg`) mirrors the Figma
/// affordance for users who scan for an obvious edit target.
class ProfileIdentityCard extends StatelessWidget {
  const ProfileIdentityCard({
    super.key,
    required this.avatarImageUrl,
    required this.displayName,
    required this.phone,
    required this.isVip,
    required this.onEditTap,
  });

  final String? avatarImageUrl;

  /// The name to render. Callers resolve the fallback chain
  /// (`personalDisplayName ?? MeUser.name`) before passing; this widget
  /// only decides between "show name" and "show placeholder".
  final String? displayName;

  /// Formatted `+<code> <number>` or null when the user has no phone on
  /// file (rare — every phone-account user has a phone).
  final String? phone;

  /// When true, renders the VIP ring around the avatar + the yellow "VIP"
  /// pill next to the name (Figma `1932:19710` / `1932:19700`).
  final bool isVip;

  final VoidCallback onEditTap;

  @override
  Widget build(BuildContext context) {
    // Fallback for the initial-letter avatar. Grapheme-safe: use the first
    // character of the trimmed display name; empty string falls back to a
    // silhouette glyph (the Figma neutral placeholder).
    final trimmedName = (displayName ?? '').trim();
    final initial = trimmedName.isNotEmpty
        ? String.fromCharCode(trimmedName.runes.first).toUpperCase()
        : '';

    return Semantics(
      key: const Key('profile-identity-card'),
      button: true,
      onTap: onEditTap,
      child: InkWell(
        onTap: onEditTap,
        child: Container(
          color: AppColors.brand100,
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.medium,
            vertical: AppSpacing.medium,
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: <Widget>[
              _AvatarWithBadge(
                key: const Key('profile-identity-avatar'),
                imageUrl: avatarImageUrl,
                initial: initial,
                isVip: isVip,
              ),
              const SizedBox(width: AppSpacing.medium),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    if (isVip)
                      Padding(
                        padding:
                            const EdgeInsets.only(bottom: AppSpacing.xxxSmall),
                        child: _VipPill(),
                      ),
                    Text(
                      trimmedName.isEmpty ? 'Add your name' : trimmedName,
                      key: const Key('profile-identity-name'),
                      style: AppText.headingXs(color: AppColors.black),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if ((phone ?? '').isNotEmpty)
                      Padding(
                        padding:
                            const EdgeInsets.only(top: AppSpacing.xxxSmall),
                        child: Text(
                          phone!,
                          key: const Key('profile-identity-phone'),
                          style: AppText.headingXs(color: AppColors.grey400),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                  ],
                ),
              ),
              SizedBox(
                width: 44,
                height: 44,
                child: IconButton(
                  key: const Key('profile-identity-edit'),
                  padding: EdgeInsets.zero,
                  onPressed: onEditTap,
                  icon: SvgPicture.asset(
                    'assets/status/edit_pencil.svg',
                    width: 22,
                    height: 22,
                    colorFilter: const ColorFilter.mode(
                      AppColors.black,
                      BlendMode.srcIn,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The circular avatar plus its camera badge (Figma `1923:17993` Free /
/// `1932:19710` VIP with ring). Uses a stack so the camera badge sits at
/// the bottom-right of the circle. On VIP, a 2 dp orange ring wraps the
/// avatar (Figma `Colors/Brand/300`).
class _AvatarWithBadge extends StatelessWidget {
  const _AvatarWithBadge({
    super.key,
    required this.imageUrl,
    required this.initial,
    required this.isVip,
  });

  static const double _size = 68;
  static const double _badgeSize = 26;

  final String? imageUrl;
  final String initial;
  final bool isVip;

  @override
  Widget build(BuildContext context) {
    final url = (imageUrl ?? '').trim();
    return SizedBox(
      width: _size,
      height: _size,
      child: Stack(
        clipBehavior: Clip.none,
        children: <Widget>[
          Container(
            width: _size,
            height: _size,
            decoration: BoxDecoration(
              color: AppColors.white,
              shape: BoxShape.circle,
              border: Border.all(
                color: isVip ? AppColors.brand300 : AppColors.grey200,
                width: isVip ? 2 : 1,
              ),
            ),
            alignment: Alignment.center,
            child: ClipOval(
              child: SizedBox(
                width: _size - 6,
                height: _size - 6,
                child: url.isEmpty
                    ? _InitialAvatar(initial: initial)
                    : AppNetworkImage(url: url, fit: BoxFit.cover),
              ),
            ),
          ),
          Positioned(
            right: -2,
            bottom: -2,
            child: Container(
              width: _badgeSize,
              height: _badgeSize,
              decoration: BoxDecoration(
                color: AppColors.brand300,
                shape: BoxShape.circle,
                border: Border.all(color: AppColors.white, width: 2),
              ),
              alignment: Alignment.center,
              // Figma's own camera export is already white → untinted.
              child: SvgPicture.asset(
                'assets/status/camera.svg',
                width: 14,
                height: 14,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _InitialAvatar extends StatelessWidget {
  const _InitialAvatar({required this.initial});

  final String initial;

  @override
  Widget build(BuildContext context) {
    if (initial.isEmpty) {
      // Figma neutral placeholder — the same avatar_person SVG the Status
      // details screen renders when nothing is picked yet.
      return Center(
        child: SvgPicture.asset(
          'assets/status/avatar_person.svg',
          width: 32,
          height: 32,
          colorFilter: const ColorFilter.mode(
            AppColors.grey300,
            BlendMode.srcIn,
          ),
        ),
      );
    }
    return Container(
      color: AppColors.grey100,
      alignment: Alignment.center,
      child: Text(
        initial,
        style: AppText.headingSm(color: AppColors.brand300),
      ),
    );
  }
}

/// Yellow "VIP" pill next to the name on the Pro state (Figma `1932:19700`,
/// pill fill `#FFE9BC` / stroke `#FFD97A`). Kept as its own class so the
/// pill's geometry (padding + border-radius + star icon) is testable in
/// isolation.
class _VipPill extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      key: const Key('profile-identity-vip-pill'),
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.xSmall,
        vertical: 2,
      ),
      decoration: BoxDecoration(
        color: const Color(0xFFFFE9BC),
        borderRadius: BorderRadius.circular(AppRadius.pill),
        border: Border.all(color: const Color(0xFFFFD97A), width: 1),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          const Icon(Icons.star_rounded, size: 14, color: Color(0xFFC08A00)),
          const SizedBox(width: 4),
          Text(
            'VIP',
            style: AppText.labelSm(color: const Color(0xFFC08A00)),
          ),
        ],
      ),
    );
  }
}
