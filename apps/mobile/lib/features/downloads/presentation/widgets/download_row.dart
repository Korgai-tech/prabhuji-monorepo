import 'package:flutter/material.dart';

import '../../../../core/theme.dart';
import '../../../../shared/widgets/app_network_image.dart';
import '../../domain/download_state.dart';
import 'download_ring.dart';

/// Library-row for a single download (Figma component `2632:21395` —
/// designed 360×89). Critical: `constraints: BoxConstraints(minHeight: 89)`
/// — NOT a rigid `height: 89` — so at `textScaleFactor = 2.0` the row grows
/// instead of overflowing (spec's Design-fidelity AC + the multi-size
/// smoke test).
class DownloadRow extends StatelessWidget {
  const DownloadRow({
    super.key,
    required this.item,
    required this.onTap,
    required this.onMoreTap,
  });

  final DownloadItem item;
  final VoidCallback onTap;
  final VoidCallback onMoreTap;

  static const double _minRowHeight = 89;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: item.title,
      child: InkWell(
        key: Key('downloads-row-${item.contentId}'),
        onTap: item.state is DownloadCompleted ? onTap : null,
        child: Container(
          constraints: const BoxConstraints(minHeight: _minRowHeight),
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.medium,
            vertical: AppSpacing.small,
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: <Widget>[
              _Artwork(url: item.artworkUrl),
              const SizedBox(width: AppSpacing.small),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: <Widget>[
                    Text(
                      item.title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: AppText.downloadRowTitle(color: AppColors.black),
                    ),
                    const SizedBox(height: AppSpacing.xxxSmall),
                    Text(
                      _subtitleFor(item),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: AppText.downloadRowSubtitle(color: AppColors.grey400),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.small),
              _StateIndicator(state: item.state),
              InkResponse(
                radius: 20,
                key: Key('downloads-row-more-${item.contentId}'),
                onTap: onMoreTap,
                child: const SizedBox(
                  width: 32,
                  height: 32,
                  child: Icon(Icons.more_vert_rounded,
                      size: 20, color: AppColors.grey500),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  static String _subtitleFor(DownloadItem item) {
    final duration = _formatDuration(item.durationMs);
    final size = _formatSize(item.sizeBytes);
    final typeLabel = _label(item);
    return '$typeLabel · $duration · $size';
  }

  static String _label(DownloadItem item) {
    return item.contentType.displayLabel;
  }

  static String _formatDuration(int? ms) {
    if (ms == null || ms <= 0) return '—';
    final totalSeconds = ms ~/ 1000;
    final minutes = totalSeconds ~/ 60;
    final seconds = totalSeconds % 60;
    return '$minutes:${seconds.toString().padLeft(2, '0')}';
  }

  static String _formatSize(int bytes) {
    if (bytes <= 0) return '—';
    const kb = 1024;
    const mb = kb * 1024;
    if (bytes >= mb) {
      final mbVal = bytes / mb;
      return '${mbVal.toStringAsFixed(mbVal >= 10 ? 0 : 1)} MB';
    }
    final kbVal = bytes / kb;
    return '${kbVal.toStringAsFixed(0)} KB';
  }
}

class _Artwork extends StatelessWidget {
  const _Artwork({required this.url});
  final String? url;

  @override
  Widget build(BuildContext context) {
    // Route through `AppNetworkImage` (backed by cached_network_image) so the
    // thumbnail is disk-cached on first render and survives the offline case.
    // A raw `Image.network` would refetch every time and blank when the
    // network drops.
    if (url == null || url!.isEmpty) {
      return _placeholder();
    }
    return AppNetworkImage(
      url: url!,
      width: 56,
      height: 56,
      fit: BoxFit.cover,
      borderRadius: BorderRadius.circular(AppRadius.card - 4),
      fallback: _placeholder(),
    );
  }

  Widget _placeholder() => ClipRRect(
        borderRadius: BorderRadius.circular(AppRadius.card - 4),
        child: Container(
          width: 56,
          height: 56,
          color: AppColors.grey200,
          alignment: Alignment.center,
          child: const Icon(
            Icons.music_note_rounded,
            size: 22,
            color: AppColors.grey400,
          ),
        ),
      );
}

class _StateIndicator extends StatelessWidget {
  const _StateIndicator({required this.state});
  final DownloadState state;

  @override
  Widget build(BuildContext context) {
    final s = state;
    if (s is DownloadInProgress) {
      return DownloadRing(progress: s.progress, size: 20);
    }
    if (s is DownloadQueued) {
      // Figma `State=Queued` (2632:21858) is text-only — no leading icon.
      return Text('Queued', style: AppText.downloadRowStatus(color: AppColors.grey400));
    }
    if (s is DownloadCompleted) {
      return const Icon(Icons.download_done_rounded,
          size: 20, color: AppColors.brand400);
    }
    if (s is DownloadFailed) {
      // Figma `State=Failed` (2632:21870) uses a filled red warning triangle
      // with exclamation dot — Icons.warning_rounded is the exact material
      // equivalent, tinted error200 to match #DA1F1F.
      return const Icon(Icons.warning_rounded,
          size: 20, color: AppColors.error200);
    }
    return const SizedBox.shrink();
  }
}
