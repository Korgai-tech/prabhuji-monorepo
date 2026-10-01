import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../../core/theme.dart';
import '../../../shared/widgets/app_network_image.dart';
import '../data/mantras_models.dart';

/// Counter bottom sheet (Figma 1054:4130). A radio list of the SERVER's
/// selectable japa targets; tapping a radio **immediately selects, and pops the
/// chosen target** so the caller saves + closes (§6.9) — NO Continue button, NO
/// "Reporting is private…" helper copy (both are stray Figma copy explicitly
/// excluded).
///
/// [targets] is `availableTargets` from `GET /mantras/counter-preference`. The
/// sheet used to render `RepeatCounter.options` — a hardcoded `[7, 11, 21, 108,
/// 1008]`. An EMPTY list renders an empty sheet on purpose: the client has no
/// authored option list to fall back to, and guessing one risks offering a target
/// the server's `PUT` would reject.
///
/// Returns the tapped target, or `null` if dismissed without a choice.
Future<int?> showMantrasCounterSheet(
  BuildContext context, {
  required int currentTarget,
  required List<int> targets,
}) {
  return showModalBottomSheet<int>(
    context: context,
    backgroundColor: AppColors.cardSurface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(
        top: Radius.circular(AppMantras.sheetRadius),
      ),
    ),
    builder: (sheetContext) =>
        _CounterSheet(currentTarget: currentTarget, targets: targets),
  );
}

class _CounterSheet extends StatelessWidget {
  const _CounterSheet({required this.currentTarget, required this.targets});
  final int currentTarget;
  final List<int> targets;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      key: const Key('mantras-counter-sheet'),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppMantras.sheetPadding,
          vertical: AppMantras.sheetPadding,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 32,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.grey300,
                  borderRadius: BorderRadius.circular(4),
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.medium),
            Text('Counter', style: AppText.headingXs()),
            const SizedBox(height: AppSpacing.small),
            for (final target in targets)
              _CounterRow(
                target: target,
                selected: target == currentTarget,
                // Save-on-tap: pop the chosen target immediately (no Continue).
                onTap: () => Navigator.of(context).pop(target),
              ),
          ],
        ),
      ),
    );
  }
}

class _CounterRow extends StatelessWidget {
  const _CounterRow({
    required this.target,
    required this.selected,
    required this.onTap,
  });

  final int target;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      key: Key('mantras-counter-option-$target'),
      onTap: onTap,
      child: SizedBox(
        height: AppMantras.counterRowHeight,
        child: Row(
          children: [
            SvgPicture.asset(
              selected
                  ? 'assets/mantras/radio-selected.svg'
                  : 'assets/mantras/radio-unselected.svg',
              width: AppMantras.radioSize,
              height: AppMantras.radioSize,
            ),
            const SizedBox(width: AppSpacing.small),
            Text('$target', style: AppText.bodyMd(color: AppColors.textPrimary)),
          ],
        ),
      ),
    );
  }
}

/// Playlist bottom sheet (Figma 1054:4302 / item 1054:4350). Items show
/// thumbnail, title and singer; tapping an item **pops its index** so the caller
/// starts it and resets the counter (§6.10). The Figma "Report User" header +
/// helper copy are stray (cloned from a report sheet) and NOT implemented.
///
/// Returns the tapped item index, or `null` if dismissed.
Future<int?> showMantrasPlaylistSheet(
  BuildContext context, {
  required List<MantraAudio> items,
  required int currentIndex,
}) {
  return showModalBottomSheet<int>(
    context: context,
    backgroundColor: AppColors.cardSurface,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(
        top: Radius.circular(AppMantras.sheetRadius),
      ),
    ),
    builder: (sheetContext) =>
        _PlaylistSheet(items: items, currentIndex: currentIndex),
  );
}

class _PlaylistSheet extends StatelessWidget {
  const _PlaylistSheet({required this.items, required this.currentIndex});
  final List<MantraAudio> items;
  final int currentIndex;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      key: const Key('mantras-playlist-sheet'),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: AppMantras.sheetPadding),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: AppSpacing.small),
            Center(
              child: Container(
                width: 32,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.grey300,
                  borderRadius: BorderRadius.circular(4),
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.medium),
            Text('Playlist', style: AppText.headingXs()),
            const SizedBox(height: AppSpacing.small),
            Flexible(
              child: ListView.builder(
                shrinkWrap: true,
                itemCount: items.length,
                itemBuilder: (context, i) => _PlaylistRow(
                  audio: items[i],
                  active: i == currentIndex,
                  onTap: () => Navigator.of(context).pop(i),
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.small),
          ],
        ),
      ),
    );
  }
}

class _PlaylistRow extends StatelessWidget {
  const _PlaylistRow({
    required this.audio,
    required this.active,
    required this.onTap,
  });

  final MantraAudio audio;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      key: Key('mantras-playlist-item-${audio.id}'),
      onTap: onTap,
      child: SizedBox(
        height: AppMantras.playlistItemHeight,
        child: Row(
          children: [
            AppNetworkImage(
              url: audio.artworkUrl,
              width: AppMantras.playlistThumb,
              height: AppMantras.playlistThumb,
              borderRadius: BorderRadius.circular(AppMantras.playlistThumbRadius),
            ),
            const SizedBox(width: AppMantras.playlistInnerGap),
            Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    audio.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppText.labelMd(
                      color: active
                          ? AppColors.brand400
                          : AppColors.aartiCardTitle,
                    ),
                  ),
                  if ((audio.singerName ?? '').isNotEmpty)
                    Text(
                      audio.singerName!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppText.aartiCardSubtitle(),
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
