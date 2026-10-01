import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../../../core/theme.dart';
import '../../../../shared/widgets/app_network_image.dart';
import '../../data/status_models.dart';
import '../bloc/status_profile_bloc.dart';
import '../bloc/status_profile_cubit.dart';
import '../bloc/status_profile_event.dart';
import '../bloc/status_profile_state.dart';
import 'status_form_widgets.dart';

/// The personal details flow (Figma frame `371:2185`).
///
/// TAM-168 retired the Business persona from the mobile app: the Personal /
/// Business tab group is gone, `_BusinessForm` and its controllers are
/// deleted, and grandfathered `activeProfileType='business'` accounts land on
/// the personal form without a server rewrite (see the TAM-168 spec's
/// #PATH_DECISION). Editing and saving are FREE (PRD §5); the details flow
/// is no longer a prerequisite for opening the share sheet after TAM-168.
class StatusDetailsScreen extends StatefulWidget {
  const StatusDetailsScreen({super.key, this.entryMessage});

  /// Optional toast to show on first mount. TAM-168 removed the forced
  /// details bounce on Share, so this is only used by legacy callers.
  final String? entryMessage;

  @override
  State<StatusDetailsScreen> createState() => _StatusDetailsScreenState();
}

class _StatusDetailsScreenState extends State<StatusDetailsScreen> {
  // TAM-168 — Business controllers deleted with the tab. Only the personal
  // name field survives.
  final _personalName = TextEditingController();

  @override
  void initState() {
    super.initState();
    final msg = widget.entryMessage;
    if (msg != null && msg.isNotEmpty) {
      // Show the entry-message toast on the FIRST frame after mount, so the
      // Scaffold's ScaffoldMessenger is available and the SnackBar sits on
      // top of the freshly-pushed route (not the previous one).
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(msg)),
        );
      });
    }
  }

  @override
  void dispose() {
    _personalName.dispose();
    super.dispose();
  }

  /// Sync controllers from state ONLY when the value genuinely differs — so
  /// loading/saving repopulates the form without stealing the caret mid-typing.
  void _sync(StatusProfileState state) {
    if (_personalName.text != state.personalName) {
      _personalName.text = state.personalName;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: const Key('status-details-screen'),
      backgroundColor: AppColors.white,
      body: SafeArea(
        child: BlocConsumer<StatusProfileBloc, StatusProfileState>(
          // Fire when a message appears OR when the save just transitioned to
          // `saved` — the latter is the trigger for auto-returning to the
          // Status screen so the user sees the details they just saved
          // reflected in the overlay band immediately.
          listenWhen: (a, b) =>
              (a.message != b.message && b.message != null) ||
              (a.status != b.status &&
                  b.status == StatusProfileStatus.saved),
          listener: (context, state) {
            if (state.message != null) {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text(state.message!)),
              );
              context.read<StatusProfileBloc>().add(
                    const StatusProfileMessageCleared(),
                  );
            }
            if (state.status == StatusProfileStatus.saved) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Details saved')),
              );
              // Refresh the app-scoped read cubit so surfaces that consume it
              // (Home feed status cards) pick up the new overlay profile
              // immediately, without waiting for their own next re-fetch.
              // Fire-and-forget: the pop happens right after, and a failure
              // here just leaves stale data — the next natural refresh fixes
              // it. Guarded because the cubit is provided at app-shell in
              // production but may be absent under some legacy test harnesses.
              try {
                unawaited(context.read<StatusProfileCubit>().refresh());
              } catch (_) {
                // No hoisted cubit in this tree — safe to ignore.
              }
              // Pop back to Status. `maybePop` matches the back-arrow behaviour
              // above and is a no-op if this route is the root.
              Navigator.of(context).maybePop();
            }
          },
          builder: (context, state) {
            _sync(state);
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _DetailsNav(hasNameOrPhoto: state.hasNameOrPhoto),
                const SizedBox(height: AppStatus.tabsToContentGap),
                Expanded(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppStatus.screenPadding,
                    ),
                    child: _PersonalForm(
                      state: state,
                      personalName: _personalName,
                    ),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

/// Basic Nav (Figma node `371:2371`) — the exported back arrow + title. The
/// nav's trailing gear/phone/pencil slots are `visible:false` in Figma and are
/// correctly not rendered.
///
/// TAM-168 — the title text is state-driven:
///  * `अपना नाम और फोटो डालें` when the profile is empty
///  * `अपना नाम और फोटो बदलें` when a name OR photo is saved
class _DetailsNav extends StatelessWidget {
  const _DetailsNav({required this.hasNameOrPhoto});

  final bool hasNameOrPhoto;

  static const String _titleAdd = 'अपना नाम और फोटो डालें';
  static const String _titleEdit = 'अपना नाम और फोटो बदलें';

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: AppStatus.detailsNavHeight,
      child: Row(
        children: [
          GestureDetector(
            key: const Key('status-details-back'),
            behavior: HitTestBehavior.opaque,
            onTap: () => Navigator.of(context).maybePop(),
            child: SizedBox(
              width: AppStatus.backArrowFrame,
              height: AppStatus.backArrowFrame,
              child: Center(
                child: SvgPicture.asset(
                  'assets/status/back.svg',
                  width: AppStatus.backArrowGlyph,
                  height: AppStatus.backArrowGlyph,
                  colorFilter: const ColorFilter.mode(
                    AppColors.statusBackArrow,
                    BlendMode.srcIn,
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(width: AppSpacing.xSmall),
          // Flexible + ellipsis so the title compresses instead of overflowing
          // at large system text scales (Figma's own metrics leave slack).
          Flexible(
            child: Text(
              hasNameOrPhoto ? _titleEdit : _titleAdd,
              key: const Key('status-details-title'),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppText.headingSm(color: AppColors.statusDetailsTitle),
            ),
          ),
        ],
      ),
    );
  }
}

/// Personal face (Figma `371:2185`) — avatar picker, `Your name`, Save.
class _PersonalForm extends StatelessWidget {
  const _PersonalForm({required this.state, required this.personalName});

  final StatusProfileState state;
  final TextEditingController personalName;

  @override
  Widget build(BuildContext context) {
    final bloc = context.read<StatusProfileBloc>();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Center(
          child: StatusAvatarPickerField(
            imageUrl: state.avatarImageUrl,
            onTap: () => bloc.add(const StatusProfileAvatarRequested()),
          ),
        ),
        const SizedBox(height: AppStatus.pickerToFieldGap),
        StatusTextField(
          fieldKey: const Key('status-field-personal-name'),
          label: 'Your name',
          controller: personalName,
          maxLength: StatusLimits.personalName,
          errorText: state.visiblePersonalNameError,
          onChanged: (v) => bloc.add(StatusProfileFieldChanged(personalName: v)),
        ),
        const SizedBox(height: AppStatus.contentToSaveGap),
        StatusSaveButton(
          busy: state.isSaving,
          onTap: () => bloc.add(const StatusProfileSaveRequested()),
        ),
      ],
    );
  }
}

/// The 128px avatar circle + camera badge (Figma node `371:3556`).
class StatusAvatarPickerField extends StatelessWidget {
  const StatusAvatarPickerField({
    super.key,
    required this.imageUrl,
    required this.onTap,
  });

  final String? imageUrl;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final url = (imageUrl ?? '').trim();
    return GestureDetector(
      key: const Key('status-avatar-picker'),
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: SizedBox(
        width: AppStatus.pickerSize,
        height: AppStatus.pickerSize,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
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
                // Figma's own camera export is already white → untinted.
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
