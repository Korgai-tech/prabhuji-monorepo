import 'dart:async';

import 'package:flutter/material.dart';

import '../../../../core/analytics.dart';
import '../../../../core/theme.dart';
import '../../status_analytics.dart';
import '../data/story_share_launcher.dart';

/// Show the "Share your status" bottom sheet and resolve to the destination
/// the user picked, or `null` if they dismissed it.
///
/// The sheet asks [launcher] up front which of the four supported apps are
/// installed and only surfaces those tiles; a "More apps" row is ALWAYS
/// present as the OS-chooser fallback so the user is never stranded when
/// nothing else is installed.
///
/// Pass [analytics] plus the [shareSessionId] / [statusId] / [mediaType] /
/// [isProAtEvent] context minted by the caller at the Share CTA tap to emit
/// `status_share_sheet_viewed` — the funnel step between "tapped Share" and
/// "picked a destination". [ctaTappedAt] is the CTA-tap timestamp and is what
/// `time_to_sheet_ms` is measured from; omit the whole group (all default to
/// null) and the sheet stays silent, which is what tests and any
/// not-yet-wired caller get.
Future<StoryShareTarget?> showStatusStoryShareSheet({
  required BuildContext context,
  required StoryShareLauncher launcher,
  Analytics? analytics,
  String? shareSessionId,
  String? statusId,
  String? mediaType,
  bool? isProAtEvent,
  DateTime? ctaTappedAt,
}) {
  return showModalBottomSheet<StoryShareTarget>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    barrierColor: AppColors.booksDrawerScrim,
    builder: (sheetContext) => _StatusStoryShareSheet(
      launcher: launcher,
      analytics: analytics,
      shareSessionId: shareSessionId,
      statusId: statusId,
      mediaType: mediaType,
      isProAtEvent: isProAtEvent,
      ctaTappedAt: ctaTappedAt,
    ),
  );
}

class _StatusStoryShareSheet extends StatefulWidget {
  const _StatusStoryShareSheet({
    required this.launcher,
    this.analytics,
    this.shareSessionId,
    this.statusId,
    this.mediaType,
    this.isProAtEvent,
    this.ctaTappedAt,
  });

  final StoryShareLauncher launcher;
  final Analytics? analytics;
  final String? shareSessionId;
  final String? statusId;
  final String? mediaType;
  final bool? isProAtEvent;
  final DateTime? ctaTappedAt;

  @override
  State<_StatusStoryShareSheet> createState() => _StatusStoryShareSheetState();
}

class _StatusStoryShareSheetState extends State<_StatusStoryShareSheet> {
  /// The installed set is resolved async on first build. Until it lands we
  /// render a placeholder shimmer row rather than flashing empty tiles.
  Future<Set<StoryShareTarget>>? _installed;

  @override
  void initState() {
    super.initState();
    final probe = widget.launcher.installedTargets();
    _installed = probe;
    // `status_share_sheet_viewed` fires HERE — when the probe resolves — and
    // not on first paint. Until then every tile is rendered dimmed and
    // untappable (see `_TargetsGrid`), so a first-paint event would report
    // `apps_shown: []` on every single share and make the property useless.
    // The trade-off is that a sheet dismissed before the probe lands emits
    // nothing, which is correct: the user never saw a usable sheet.
    unawaited(probe.then(
      _trackSheetViewed,
      // A failed probe still shows a usable sheet (the "More apps" row is
      // always there), so report it as a zero-app view rather than dropping
      // the funnel step.
      onError: (_) => _trackSheetViewed(const <StoryShareTarget>{}),
    ));
  }

  void _trackSheetViewed(Set<StoryShareTarget> installed) {
    // The probe outlives the sheet — dismissing does not cancel it. A user
    // who backed out before it landed never saw a usable sheet, so counting
    // them as having reached this funnel step would overstate it and
    // understate the tap → sheet drop-off this event exists to measure.
    if (!mounted) return;
    final analytics = widget.analytics;
    if (analytics == null) return;
    // `more_apps` is excluded on purpose: that row is ALWAYS rendered as the
    // OS-chooser fallback, so counting it would add a constant to every row
    // and inflate `apps_shown_count` by exactly one forever.
    final shown = installed
        .where((t) => t != StoryShareTarget.moreApps)
        .map((t) => t.name)
        .toList()
      ..sort(); // stable ordering — the set's iteration order is not.
    final tappedAt = widget.ctaTappedAt;
    unawaited(analytics.trackEvent(
      StatusEvents.shareSheetViewed,
      properties: {
        StatusEventProps.shareSessionId: widget.shareSessionId,
        StatusEventProps.statusId: widget.statusId,
        StatusEventProps.mediaType: widget.mediaType,
        StatusEventProps.isProAtEvent: widget.isProAtEvent,
        StatusEventProps.timeToSheetMs: tappedAt == null
            ? null
            : DateTime.now().difference(tappedAt).inMilliseconds,
        StatusEventProps.appsShown: shown,
        StatusEventProps.appsShownCount: shown.length,
      },
    ));
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;
    return Padding(
      // Lift above the software keyboard (defensive — this sheet has no input
      // today, but a future caption field wouldn't need to re-plumb this).
      padding: EdgeInsets.only(bottom: bottomInset),
      child: Container(
        key: const Key('status-story-share-sheet'),
        decoration: const BoxDecoration(
          color: AppColors.white,
          borderRadius: BorderRadius.vertical(
            top: Radius.circular(AppMantras.sheetRadius),
          ),
        ),
        child: SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: AppSpacing.small),
              _SheetHandle(),
              const SizedBox(height: AppSpacing.medium),
              _SheetHeader(),
              const SizedBox(height: AppSpacing.large),
              _TargetsGrid(installed: _installed),
              const SizedBox(height: AppSpacing.small),
              const Divider(
                height: 1,
                thickness: 1,
                color: AppColors.dividerHairline,
              ),
              _MoreAppsRow(
                onTap: () =>
                    Navigator.of(context).pop(StoryShareTarget.moreApps),
              ),
              const SizedBox(height: AppSpacing.small),
            ],
          ),
        ),
      ),
    );
  }
}

class _SheetHandle extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 40,
      height: 4,
      decoration: BoxDecoration(
        color: AppColors.grey200,
        borderRadius: BorderRadius.circular(2),
      ),
    );
  }
}

class _SheetHeader extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.large),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Text(
            'Share your status',
            style: AppText.headingXs(color: AppColors.statusTitle),
          ),
          const SizedBox(height: AppSpacing.xxxSmall),
          Text(
            'Post directly to your story or share in a chat',
            textAlign: TextAlign.center,
            style: AppText.bodySm(color: AppColors.textSecondary),
          ),
        ],
      ),
    );
  }
}

class _TargetsGrid extends StatelessWidget {
  const _TargetsGrid({required this.installed});

  final Future<Set<StoryShareTarget>>? installed;

  static const _all = <_StoryTargetSpec>[
    _StoryTargetSpec(
      target: StoryShareTarget.whatsapp,
      label: 'WhatsApp\nStatus',
      background: Color(0xFF25D366),
      foreground: AppColors.white,
      icon: Icons.chat,
    ),
    _StoryTargetSpec(
      target: StoryShareTarget.instagram,
      label: 'Instagram\nStory',
      background: Color(0xFFE4405F),
      foreground: AppColors.white,
      icon: Icons.camera_alt,
    ),
    _StoryTargetSpec(
      target: StoryShareTarget.facebook,
      label: 'Facebook\nStory',
      background: Color(0xFF1877F2),
      foreground: AppColors.white,
      icon: Icons.facebook,
    ),
    _StoryTargetSpec(
      target: StoryShareTarget.snapchat,
      label: 'Snapchat\nStory',
      background: Color(0xFFFFFC00),
      foreground: AppColors.black,
      icon: Icons.camera,
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<Set<StoryShareTarget>>(
      future: installed,
      builder: (context, snapshot) {
        final resolved = snapshot.connectionState == ConnectionState.done;
        final installedSet = snapshot.data ?? const <StoryShareTarget>{};
        // Before the plugin resolves, dim every tile so nothing is tappable
        // yet — otherwise a rapid tap could hand a file to an app that turns
        // out to be uninstalled.
        return Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.medium),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              for (final spec in _all)
                _TargetTile(
                  spec: spec,
                  enabled: resolved && installedSet.contains(spec.target),
                  onTap: () => Navigator.of(context).pop(spec.target),
                ),
            ],
          ),
        );
      },
    );
  }
}

class _TargetTile extends StatelessWidget {
  const _TargetTile({
    required this.spec,
    required this.enabled,
    required this.onTap,
  });

  final _StoryTargetSpec spec;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    const diameter = 56.0;
    final disc = Container(
      width: diameter,
      height: diameter,
      decoration: BoxDecoration(
        color: enabled ? spec.background : AppColors.grey200,
        shape: BoxShape.circle,
      ),
      child: Icon(
        spec.icon,
        color: enabled ? spec.foreground : AppColors.grey300,
        size: 28,
      ),
    );
    final label = Text(
      spec.label,
      textAlign: TextAlign.center,
      maxLines: 2,
      style: AppText.labelSm(
        color: enabled ? AppColors.textPrimary : AppColors.grey300,
      ),
    );

    final child = Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        disc,
        const SizedBox(height: AppSpacing.xSmall),
        label,
      ],
    );

    if (!enabled) {
      // Not-installed tile: still visible so the user knows the option exists,
      // but not tappable. No tooltip — kept quiet and consistent with the
      // rest of the module's calm empty-state treatment.
      return SizedBox(
        key: Key('story-target-${spec.target.name}-disabled'),
        width: 72,
        child: Opacity(opacity: 0.55, child: child),
      );
    }
    return InkResponse(
      key: Key('story-target-${spec.target.name}'),
      onTap: onTap,
      radius: 40,
      child: SizedBox(width: 72, child: child),
    );
  }
}

class _MoreAppsRow extends StatelessWidget {
  const _MoreAppsRow({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      key: const Key('story-target-more-apps'),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.large,
          vertical: AppSpacing.medium,
        ),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: const BoxDecoration(
                color: AppColors.brand100,
                shape: BoxShape.circle,
              ),
              alignment: Alignment.center,
              child: const Icon(
                Icons.more_horiz,
                color: AppColors.brand400,
                size: 22,
              ),
            ),
            const SizedBox(width: AppSpacing.medium),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'More apps',
                    style: AppText.labelLg(color: AppColors.textPrimary),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'Open the system share sheet',
                    style: AppText.bodyXs(color: AppColors.textSecondary),
                  ),
                ],
              ),
            ),
            const Icon(
              Icons.chevron_right,
              color: AppColors.grey400,
              size: 20,
            ),
          ],
        ),
      ),
    );
  }
}

class _StoryTargetSpec {
  const _StoryTargetSpec({
    required this.target,
    required this.label,
    required this.background,
    required this.foreground,
    required this.icon,
  });

  final StoryShareTarget target;
  final String label;
  final Color background;
  final Color foreground;
  final IconData icon;
}
