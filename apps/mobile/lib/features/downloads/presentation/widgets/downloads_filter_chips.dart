import 'package:flutter/material.dart';

import '../../../../core/theme.dart';
import '../../domain/content_type.dart';
import '../../domain/downloads_filter.dart';

/// Filter chip row (Figma `2632:21376`). Four chips — All / Aarti / Bhajan
/// / Mantra — each with a live count derived from the UNFILTERED library
/// state (spec: "counts always reflect UNFILTERED totals").
///
/// Layout intent: single-row, horizontally-scrollable if the chips + counts
/// overflow at 320 dp width (spec's Layout-intent table).
class DownloadsFilterChips extends StatelessWidget {
  const DownloadsFilterChips({
    super.key,
    required this.counts,
    required this.selected,
    required this.onSelected,
  });

  final DownloadsFilterCounts counts;
  final DownloadsFilter selected;
  final ValueChanged<DownloadsFilter> onSelected;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      key: const Key('downloads-filter-chips-inner'),
      height: 44,
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.medium),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            _Chip(
              key: const Key('downloads-filter-chip-all'),
              label: 'All',
              count: counts.all,
              selected: selected == null,
              onTap: () => onSelected(null),
            ),
            const SizedBox(width: AppSpacing.xSmall),
            _Chip(
              key: const Key('downloads-filter-chip-aarti'),
              label: 'Aarti',
              count: counts.aarti,
              selected: selected == DownloadContentType.aarti,
              onTap: () => onSelected(DownloadContentType.aarti),
            ),
            const SizedBox(width: AppSpacing.xSmall),
            _Chip(
              key: const Key('downloads-filter-chip-bhajan'),
              label: 'Bhajan',
              count: counts.bhajan,
              selected: selected == DownloadContentType.bhajan,
              onTap: () => onSelected(DownloadContentType.bhajan),
            ),
            const SizedBox(width: AppSpacing.xSmall),
            _Chip(
              key: const Key('downloads-filter-chip-mantra'),
              label: 'Mantra',
              count: counts.mantra,
              selected: selected == DownloadContentType.mantra,
              onTap: () => onSelected(DownloadContentType.mantra),
            ),
          ],
        ),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({
    super.key,
    required this.label,
    required this.count,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final int count;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final bg = selected ? AppColors.brand300 : AppColors.grey100;
    final fg = selected ? AppColors.white : AppColors.grey500;
    return InkResponse(
      radius: 24,
      onTap: onTap,
      child: Container(
        constraints: const BoxConstraints(minHeight: 32),
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.small,
          vertical: AppSpacing.xxxSmall,
        ),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(AppRadius.pill),
          border: Border.all(
            color: selected ? AppColors.brand300 : AppColors.grey200,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.center,
          children: <Widget>[
            Text(label, style: AppText.downloadsFilterChip(color: fg)),
            const SizedBox(width: AppSpacing.xxxSmall),
            Text('($count)', style: AppText.downloadsFilterChip(color: fg)),
          ],
        ),
      ),
    );
  }
}
