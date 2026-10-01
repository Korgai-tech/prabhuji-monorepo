import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../../core/theme.dart';
import '../../../shared/widgets/app_network_image.dart';
import '../../../state/providers.dart';
import '../../status/data/status_avatar_picker.dart';
import '../../status/data/status_models.dart';
import '../../status/status_providers.dart';
import '../profile_analytics.dart';

/// Edit Profile screen (Figma `1527:10036`, TAM-N-profile-v2). Personal-
/// only in v2 (Personal/Business tabs OUT of scope — Business editing
/// stays in Status details).
///
/// Layout intent (spec's Layout intent table):
///   - App bar pinned top
///   - Content column (avatar + fields) flex-fill
///   - Save CTA pinned bottom
///
/// Save flow (data-flow contract from the spec's Backend integration):
///   1. Build a `StatusProfileData` with the edited personal name +
///      avatar and passthrough of business fields UNCHANGED.
///   2. `PUT /status/profile` via `StatusRepository.saveProfile`.
///   3. On 2xx: `ref.invalidate(statusProfileProvider)` so both this
///      screen and the Status details screen see the fresh data on
///      their next build; pop back; show a success snackbar.
///   4. Fire `profile_name_edit_result` (if the name changed) and
///      `profile_avatar_edit_result` per rules.
class EditProfileScreen extends ConsumerStatefulWidget {
  const EditProfileScreen({super.key});

  @override
  ConsumerState<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends ConsumerState<EditProfileScreen> {
  final _nameController = TextEditingController();
  final _nameFocus = FocusNode();

  /// The base row we last successfully fetched — used to compute "did
  /// anything change?" and to preserve the business fields verbatim on
  /// save. Rebuilt from the shared `statusProfileProvider` when it
  /// emits data.
  StatusProfileData? _base;

  /// The staged avatar URL. `null` means "no change" — save sends the
  /// base row's `avatarImageUrl`. A non-null string is a freshly-picked
  /// URL from the avatar picker.
  String? _stagedAvatarUrl;

  bool _saving = false;

  @override
  void dispose() {
    _nameController.dispose();
    _nameFocus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final statusProfile = ref.watch(statusProfileProvider);
    final me = ref.watch(meProvider).value;

    return Scaffold(
      key: const Key('edit-profile-screen'),
      backgroundColor: AppColors.white,
      body: SafeArea(
        child: Column(
          key: const Key('edit-profile-root'),
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            const _EditNav(),
            Expanded(
              key: const Key('edit-profile-scroll-region'),
              child: statusProfile.when(
                loading: () => const Center(
                  key: Key('edit-profile-loading'),
                  child: CircularProgressIndicator(),
                ),
                error: (error, stackTrace) => _ErrorState(
                  onRetry: () => ref.invalidate(statusProfileProvider),
                ),
                data: (profile) {
                  _seedControllers(profile, me?.name);
                  return SingleChildScrollView(
                    key: const Key('edit-profile-scroll'),
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppStatus.screenPadding,
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: <Widget>[
                        const SizedBox(height: AppSpacing.large),
                        Center(
                          child: _AvatarPicker(
                            imageUrl: _resolveAvatarUrl(profile),
                            onTap: _handleAvatarTap,
                          ),
                        ),
                        const SizedBox(height: AppSpacing.xLarge),
                        _NameField(
                          controller: _nameController,
                          focusNode: _nameFocus,
                        ),
                        const SizedBox(height: AppSpacing.large),
                        _PhoneDisplay(
                          text: _formatPhone(
                            code: me?.phoneCountryCode,
                            number: me?.phoneNumber,
                          ),
                        ),
                        const SizedBox(height: AppSpacing.large),
                      ],
                    ),
                  );
                },
              ),
            ),
            Padding(
              key: const Key('edit-profile-save-region'),
              padding: const EdgeInsets.symmetric(
                horizontal: AppStatus.screenPadding,
                vertical: AppSpacing.medium,
              ),
              child: _SaveButton(
                busy: _saving,
                enabled: _canSave(),
                onTap: _handleSave,
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _seedControllers(StatusProfileData profile, String? meName) {
    // Seed once per new profile snapshot. If the user is typing, don't
    // clobber the caret — only sync when the controller matches the
    // previously-seeded base (i.e. the user hasn't touched the field
    // since last seed).
    final resolvedName = (profile.personalDisplayName?.trim().isNotEmpty ?? false)
        ? profile.personalDisplayName!
        : (meName ?? '');

    final baseChanged = _base?.updatedAt != profile.updatedAt ||
        _base?.personalDisplayName != profile.personalDisplayName ||
        _base?.avatarImageUrl != profile.avatarImageUrl;

    if (_base == null || baseChanged) {
      _base = profile;
      if (_nameController.text.isEmpty ||
          _nameController.text == (profile.personalDisplayName ?? '')) {
        _nameController.text = resolvedName;
      }
      // Wipe the staged avatar when the base changes — the fresh fetch
      // is the new baseline; anything the user picked before applied to
      // the previous snapshot.
      _stagedAvatarUrl = null;
    }
  }

  String? _resolveAvatarUrl(StatusProfileData profile) {
    if (_stagedAvatarUrl != null) return _stagedAvatarUrl;
    return profile.avatarImageUrl;
  }

  /// The Save CTA is enabled ONLY when at least one of (name changed,
  /// avatar changed) is true — per AC.
  bool _canSave() {
    final base = _base;
    if (base == null || _saving) return false;
    final currentName = _nameController.text.trim();
    final baseName = (base.personalDisplayName ?? '').trim();
    final nameChanged = currentName != baseName;
    final avatarChanged = _stagedAvatarUrl != null &&
        _stagedAvatarUrl != base.avatarImageUrl;
    // Cannot save an empty name — server enforces length; client just
    // requires non-empty after trim.
    if (currentName.isEmpty) return false;
    return nameChanged || avatarChanged;
  }

  Future<void> _handleAvatarTap() async {
    final picker = ref.read(statusAvatarPickerProvider);
    final analytics = ref.read(analyticsProvider);
    final result = await picker.pickAvatar();
    switch (result.status) {
      case StatusAvatarPickStatus.picked:
        unawaited(analytics?.trackEvent(
          ProfileEvents.avatarEditResult,
          properties: <String, Object?>{
            ProfileEventProps.avatarStatus: 'picked',
          },
        ));
        if (!mounted) return;
        setState(() {
          _stagedAvatarUrl = result.imageUrl;
        });
      case StatusAvatarPickStatus.cancelled:
        unawaited(analytics?.trackEvent(
          ProfileEvents.avatarEditResult,
          properties: <String, Object?>{
            ProfileEventProps.avatarStatus: 'cancelled',
          },
        ));
      // No state change, no snackbar (per AC).
      case StatusAvatarPickStatus.failed:
        unawaited(analytics?.trackEvent(
          ProfileEvents.avatarEditResult,
          properties: <String, Object?>{
            ProfileEventProps.avatarStatus: 'failed',
            ProfileEventProps.errorCode: result.errorCode,
          },
        ));
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text(kAvatarUploadUnavailableCopy)),
        );
      case StatusAvatarPickStatus.unavailable:
        unawaited(analytics?.trackEvent(
          ProfileEvents.avatarEditResult,
          properties: <String, Object?>{
            ProfileEventProps.avatarStatus: 'unavailable',
          },
        ));
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text(kAvatarUploadUnavailableCopy)),
        );
    }
  }

  Future<void> _handleSave() async {
    final base = _base;
    if (base == null || _saving) return;

    final analytics = ref.read(analyticsProvider);
    final currentName = _nameController.text.trim();
    final baseName = (base.personalDisplayName ?? '').trim();
    final nameChanged = currentName != baseName;

    setState(() => _saving = true);
    try {
      // Build the WHOLE record: pass the business fields through unchanged
      // so a Profile-v2 save never nulls them out (spec critical note #1).
      final payload = StatusProfileData(
        activeProfileType: StatusProfileType.personal,
        personalDisplayName: currentName,
        businessName: base.businessName,
        businessDetails: base.businessDetails,
        businessMobileNumber: base.businessMobileNumber,
        avatarImageUrl: _stagedAvatarUrl ?? base.avatarImageUrl,
      );
      await ref.read(statusRepositoryProvider).saveProfile(payload);

      // Shared-cache invalidation — the Status details screen (and any
      // future consumer of `statusProfileProvider`) picks up the new
      // record on its next build without a manual re-fetch.
      ref.invalidate(statusProfileProvider);

      if (nameChanged) {
        unawaited(analytics?.trackEvent(
          ProfileEvents.nameEditResult,
          properties: <String, Object?>{
            ProfileEventProps.result: 'success',
            ProfileEventProps.nameLengthBucket:
                profileNameLengthBucket(currentName.length),
            ProfileEventProps.errorCode: null,
          },
        ));
      }

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Profile updated')),
      );
      Navigator.of(context).maybePop();
    } catch (error) {
      final code = error is Exception ? error.runtimeType.toString() : null;
      if (nameChanged) {
        unawaited(analytics?.trackEvent(
          ProfileEvents.nameEditResult,
          properties: <String, Object?>{
            ProfileEventProps.result: 'failure',
            ProfileEventProps.nameLengthBucket:
                profileNameLengthBucket(currentName.length),
            ProfileEventProps.errorCode: code,
          },
        ));
      }
      if (!mounted) return;
      setState(() => _saving = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Couldn't save. Try again.")),
      );
      return;
    }
    if (mounted) setState(() => _saving = false);
  }

  String? _formatPhone({String? code, String? number}) {
    final n = (number ?? '').trim();
    if (n.isEmpty) return null;
    return n;
  }
}

/// Top nav (Figma `1527:10038`) — back arrow + "Edit Profile" title.
class _EditNav extends StatelessWidget {
  const _EditNav();

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      key: const Key('edit-profile-appbar'),
      height: AppNav.height,
      child: Row(
        children: <Widget>[
          const SizedBox(width: AppSpacing.xSmall),
          InkResponse(
            key: const Key('edit-profile-back'),
            radius: 24,
            onTap: () => Navigator.of(context).maybePop(),
            child: SizedBox(
              width: 44,
              height: 44,
              child: Center(
                child: SvgPicture.asset(
                  'assets/aarti/back-arrow.svg',
                  width: 24,
                  height: 24,
                  colorFilter: const ColorFilter.mode(
                    AppColors.black,
                    BlendMode.srcIn,
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(width: AppSpacing.xSmall),
          Expanded(
            child: Text(
              'Edit Profile',
              key: const Key('edit-profile-title'),
              style: AppText.headingSm(color: AppColors.black),
            ),
          ),
        ],
      ),
    );
  }
}

/// The 128×128 avatar + camera badge (Figma `1527:10041`). Almost identical
/// to `StatusAvatarPickerField` from the Status details screen, but is a
/// separate widget so a rename here doesn't ripple.
class _AvatarPicker extends StatelessWidget {
  const _AvatarPicker({required this.imageUrl, required this.onTap});

  final String? imageUrl;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final url = (imageUrl ?? '').trim();
    return GestureDetector(
      key: const Key('edit-profile-avatar-picker'),
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: SizedBox(
        width: AppStatus.pickerSize,
        height: AppStatus.pickerSize,
        child: Stack(
          clipBehavior: Clip.none,
          children: <Widget>[
            Container(
              width: AppStatus.pickerSize,
              height: AppStatus.pickerSize,
              decoration: BoxDecoration(
                color: AppColors.statusAvatarFill,
                shape: BoxShape.circle,
                border: Border.all(
                  color: AppColors.statusPickerRing,
                  width: AppStatus.pickerRing,
                ),
              ),
              alignment: Alignment.center,
              child: ClipOval(
                child: SizedBox(
                  width: AppStatus.pickerInner,
                  height: AppStatus.pickerInner,
                  child: url.isEmpty
                      ? Center(
                          child: SvgPicture.asset(
                            'assets/status/avatar_person.svg',
                            width: AppStatus.pickerGlyph,
                            height: AppStatus.pickerGlyph,
                          ),
                        )
                      : AppNetworkImage(url: url, fit: BoxFit.cover),
                ),
              ),
            ),
            Positioned(
              right: 0,
              bottom: AppSpacing.xSmall,
              child: Container(
                key: const Key('edit-profile-camera-badge'),
                width: AppStatus.pickerBadge,
                height: AppStatus.pickerBadge,
                decoration: BoxDecoration(
                  color: AppColors.statusPickerBadgeFill,
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: AppColors.statusPickerBadgeBorder,
                    width: AppStatus.pickerBadgeBorder,
                  ),
                ),
                alignment: Alignment.center,
                child: SvgPicture.asset(
                  'assets/status/camera.svg',
                  width: AppStatus.pickerBadgeGlyph,
                  height: AppStatus.pickerBadgeGlyph,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Personal-name field (Figma `1527:10044`) — orange floating label +
/// pill border, matches the Status details field styling.
class _NameField extends StatefulWidget {
  const _NameField({required this.controller, required this.focusNode});

  final TextEditingController controller;
  final FocusNode focusNode;

  @override
  State<_NameField> createState() => _NameFieldState();
}

class _NameFieldState extends State<_NameField> {
  @override
  void initState() {
    super.initState();
    widget.focusNode.addListener(() => setState(() {}));
  }

  @override
  Widget build(BuildContext context) {
    final focused = widget.focusNode.hasFocus;
    final borderColor = focused
        ? AppColors.statusFieldBorderFocused
        : AppColors.statusFieldBorder;
    final labelColor = focused
        ? AppColors.statusFieldLabelFocused
        : AppColors.statusFieldLabel;
    final borderWidth = focused
        ? AppStatus.fieldBorderFocused
        : AppStatus.fieldBorder;
    return SizedBox(
      // minHeight rather than a fixed height — the row grows if the user
      // has system text scaling turned up (figma-flutter trap).
      height: AppStatus.fieldHeight,
      child: Stack(
        clipBehavior: Clip.none,
        children: <Widget>[
          Container(
            height: AppStatus.fieldHeight,
            padding: const EdgeInsets.symmetric(
              horizontal: AppStatus.fieldPaddingH,
            ),
            decoration: BoxDecoration(
              color: AppColors.statusFieldFill,
              borderRadius: BorderRadius.circular(AppStatus.fieldRadius),
              border: Border.all(color: borderColor, width: borderWidth),
            ),
            alignment: Alignment.center,
            child: TextField(
              key: const Key('edit-profile-name-field'),
              controller: widget.controller,
              focusNode: widget.focusNode,
              inputFormatters: <TextInputFormatter>[
                LengthLimitingTextInputFormatter(StatusLimits.personalName),
              ],
              style: AppText.bodyMd(color: AppColors.statusFieldText)
                  .copyWith(fontSize: AppStatus.fieldTextSize),
              decoration: const InputDecoration(
                isDense: true,
                border: InputBorder.none,
                contentPadding: EdgeInsets.zero,
                counterText: '',
              ),
              onChanged: (_) {
                // Bubble a rebuild to the parent so Save's `enabled` flag
                // recomputes. StatefulWidget owner (the screen) inspects
                // controller.text in `_canSave`.
                (context.findAncestorStateOfType<_EditProfileScreenState>())
                    ?.setState(() {});
              },
            ),
          ),
          Positioned(
            left: AppStatus.fieldPaddingH,
            top: -AppStatus.fieldLabelSize / 2,
            child: ColoredBox(
              color: AppColors.statusFieldFill,
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.xxxSmall,
                ),
                child: Text(
                  'Your name',
                  style: AppText.labelSm(color: labelColor),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Disabled phone display (Figma `1527:10133`) — grey pill, no tap, no
/// text edit. Reads pre-populated `+<code> <number>` from `MeUser`.
class _PhoneDisplay extends StatelessWidget {
  const _PhoneDisplay({required this.text});

  final String? text;

  @override
  Widget build(BuildContext context) {
    return Container(
      key: const Key('edit-profile-phone-display'),
      height: AppStatus.fieldHeight,
      alignment: Alignment.centerLeft,
      padding: const EdgeInsets.symmetric(
        horizontal: AppStatus.fieldPaddingH,
      ),
      decoration: BoxDecoration(
        color: AppColors.grey200,
        borderRadius: BorderRadius.circular(AppStatus.fieldRadius),
        border: Border.all(
          color: AppColors.grey300,
          width: AppStatus.fieldBorder,
        ),
      ),
      child: Text(
        (text ?? '').isEmpty ? '—' : text!,
        style: AppText.bodyMd(color: AppColors.grey500)
            .copyWith(fontSize: AppStatus.fieldTextSize),
      ),
    );
  }
}

/// Save CTA (Figma `1527:10050`) — full-width gradient pill pinned at the
/// bottom of the screen. Disabled state renders at 40% opacity.
class _SaveButton extends StatelessWidget {
  const _SaveButton({
    required this.busy,
    required this.enabled,
    required this.onTap,
  });

  final bool busy;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: enabled ? 1.0 : 0.4,
      child: GestureDetector(
        key: const Key('edit-profile-save'),
        behavior: HitTestBehavior.opaque,
        onTap: enabled && !busy ? onTap : null,
        child: Container(
          height: AppStatus.saveBtnHeight,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            gradient: AppGradient.ctaLR,
            borderRadius: BorderRadius.circular(AppStatus.saveBtnRadius),
          ),
          child: busy
              ? const SizedBox(
                  key: Key('edit-profile-save-progress'),
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    valueColor: AlwaysStoppedAnimation(AppColors.white),
                  ),
                )
              : Text(
                  'Save',
                  style: AppText.labelLg(color: AppColors.white),
                ),
        ),
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      key: const Key('edit-profile-error'),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Text(
            "Couldn't load your profile.",
            style: AppText.bodyMd(color: AppColors.grey500),
          ),
          const SizedBox(height: AppSpacing.medium),
          TextButton(
            onPressed: onRetry,
            child: Text(
              'Retry',
              style: AppText.labelLg(color: AppColors.brand300),
            ),
          ),
        ],
      ),
    );
  }
}
