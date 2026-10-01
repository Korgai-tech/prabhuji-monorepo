import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../../../core/theme.dart';
import '../../domain/download_state.dart';

/// Selection returned by the four action sheets so the caller can dispatch
/// the right handler without threading a Widget-tree callback per row.
enum DownloadActionSheetSelection {
  cancelDownload,
  retryDownload,
  playNow,
  deleteDownload,
  viewAllDownloads,
}

/// Which sheet to render — chosen by the caller based on the row's
/// [DownloadState] and where the sheet is being opened from.
enum DownloadActionSheetKind {
  /// Figma `2632:21710` — Queued row on the library.
  queued,

  /// Figma `2632:21734` — Failed row on the library.
  failed,

  /// Figma `2632:21764` — Downloaded row from the library list.
  downloadedFromList,

  /// Figma `2632:21797` — Downloaded row from the play page (adds View All).
  downloadedFromPlayPage,
}

Future<DownloadActionSheetSelection?> showDownloadActionSheet({
  required BuildContext context,
  required DownloadActionSheetKind kind,
  required String title,
}) {
  return showModalBottomSheet<DownloadActionSheetSelection>(
    context: context,
    isScrollControlled: false,
    backgroundColor: AppColors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(
        top: Radius.circular(AppRadius.loginCardTop),
      ),
    ),
    builder: (context) => _DownloadActionSheet(kind: kind, title: title),
  );
}

class _DownloadActionSheet extends StatelessWidget {
  const _DownloadActionSheet({required this.kind, required this.title});

  final DownloadActionSheetKind kind;
  final String title;

  @override
  Widget build(BuildContext context) {
    final rows = <_ActionRow>[];
    switch (kind) {
      case DownloadActionSheetKind.queued:
        rows.add(_ActionRow.cancel());
      case DownloadActionSheetKind.failed:
        rows
          ..add(_ActionRow.retry())
          ..add(_ActionRow.cancel());
      case DownloadActionSheetKind.downloadedFromList:
        rows
          ..add(_ActionRow.play())
          ..add(_ActionRow.delete());
      case DownloadActionSheetKind.downloadedFromPlayPage:
        rows
          ..add(_ActionRow.play())
          ..add(_ActionRow.delete())
          ..add(_ActionRow.viewAll());
    }
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.medium),
        child: Column(
          key: Key('downloads-action-sheet-${kind.name}'),
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.medium,
                vertical: AppSpacing.xSmall,
              ),
              child: Text(
                title,
                style: AppText.labelLg(color: AppColors.grey500),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const Divider(height: 1, color: AppColors.grey200),
            for (final row in rows)
              InkWell(
                key: Key('downloads-action-${row.selection.name}'),
                onTap: () => Navigator.of(context).pop(row.selection),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.medium,
                    vertical: AppSpacing.medium,
                  ),
                  child: Row(
                    children: <Widget>[
                      if (row.assetPath != null)
                        SvgPicture.asset(row.assetPath!,
                            width: 20, height: 20)
                      else
                        Icon(row.icon, size: 20, color: row.tint),
                      const SizedBox(width: AppSpacing.small),
                      Expanded(
                        child: Text(
                          row.label,
                          style: AppText.bodyMd(color: row.tint),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _ActionRow {
  const _ActionRow({
    required this.selection,
    required this.label,
    this.icon,
    this.assetPath,
    required this.tint,
  });

  // Figma icon nodes: Cancel + Delete both use fi_484611 (trash, red 18×18).
  // Retry uses the outline refresh (black 18×18). Play uses filled black
  // play arrow — Material equivalent visually identical, kept as icon.
  // View-All uses the same downloads glyph as the empty-state avatar.
  factory _ActionRow.cancel() => const _ActionRow(
        selection: DownloadActionSheetSelection.cancelDownload,
        label: 'Cancel Download',
        assetPath: 'assets/downloads/trash.svg',
        tint: AppColors.error200,
      );

  factory _ActionRow.retry() => const _ActionRow(
        selection: DownloadActionSheetSelection.retryDownload,
        label: 'Retry Download',
        assetPath: 'assets/downloads/retry.svg',
        tint: AppColors.grey500,
      );

  factory _ActionRow.play() => const _ActionRow(
        selection: DownloadActionSheetSelection.playNow,
        label: 'Play Now',
        icon: Icons.play_arrow_rounded,
        tint: AppColors.grey500,
      );

  factory _ActionRow.delete() => const _ActionRow(
        selection: DownloadActionSheetSelection.deleteDownload,
        label: 'Delete Download',
        assetPath: 'assets/downloads/trash.svg',
        tint: AppColors.error200,
      );

  factory _ActionRow.viewAll() => const _ActionRow(
        selection: DownloadActionSheetSelection.viewAllDownloads,
        label: 'View All Downloads',
        assetPath: 'assets/downloads/download-avatar.svg',
        tint: AppColors.grey500,
      );

  final DownloadActionSheetSelection selection;
  final String label;
  final IconData? icon;
  final String? assetPath;
  final Color tint;
}
