import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme.dart';
import '../../../features/home/home_routes.dart';
import '../../../state/providers.dart';
import '../../aarti/aarti_routes.dart';
import '../../aarti/data/aarti_models.dart';
import '../../audio/application/audio_providers.dart';
import '../../audio/domain/audio_item.dart';
import '../../mantras/data/mantras_models.dart';
import '../../mantras/mantras_routes.dart';
import '../application/offline_watcher.dart';
import '../bloc/downloads_library_bloc.dart';
import '../bloc/downloads_library_event.dart';
import '../bloc/downloads_library_state.dart';
import '../domain/content_type.dart';
import '../domain/download_state.dart';
import '../domain/downloads_filter.dart';
import '../downloads_analytics.dart';
import '../downloads_providers.dart';
import 'widgets/download_action_sheets.dart';
import 'widgets/download_row.dart';
import 'widgets/downloads_empty.dart';
import 'widgets/downloads_filter_chips.dart';
import 'widgets/offline_banner.dart';

/// Downloads library screen (Figma `2632:21373`). Owns the app bar +
/// offline banner + filter chips + quiet disclosure + list, per the
/// spec's Layout-intent table. The bottom nav lives OUTSIDE this branch
/// content (owned by `AppShellScaffold`).
class DownloadsLibraryScreen extends ConsumerStatefulWidget {
  const DownloadsLibraryScreen({super.key});

  @override
  ConsumerState<DownloadsLibraryScreen> createState() =>
      _DownloadsLibraryScreenState();
}

class _DownloadsLibraryScreenState
    extends ConsumerState<DownloadsLibraryScreen> {
  bool _firstPaintFired = false;

  @override
  void initState() {
    super.initState();
    // Fire `downloads_page_viewed` after the first frame — spec §Analytics.
    // Uses `bottom_nav` as the entry point when opened via the shell; the
    // Profile → My Downloads push fires the same event with `entry_point:
    // 'profile'` at its own call site.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || _firstPaintFired) return;
      _firstPaintFired = true;
      final analytics = ref.read(analyticsProvider);
      final asyncOffline = ref.read(isOfflineProvider);
      final isOffline = asyncOffline.hasValue ? asyncOffline.value! : false;
      final downloadCount =
          ref.read(downloadManagerProvider).snapshot.items.length;
      unawaited(analytics?.trackEvent(
        DownloadsEvents.downloadsPageViewed,
        properties: <String, Object?>{
          DownloadsEventProps.entryPoint: DownloadsEntryPoint.bottomNav,
          DownloadsEventProps.downloadCount: downloadCount,
          DownloadsEventProps.isOffline: isOffline,
        },
      ));
    });
  }

  @override
  Widget build(BuildContext context) {
    // Bridge the Riverpod offline flag into the bloc. Riverpod → bloc is
    // an intentional one-way arrow so the bloc stays test-friendly with
    // hand-rolled fakes.
    ref.listen<AsyncValue<bool>>(isOfflineProvider, (_, next) {
      next.whenData((offline) {
        context
            .read<DownloadsLibraryBloc>()
            .add(DownloadsLibraryOfflineChanged(offline));
        if (offline) {
          final analytics = ref.read(analyticsProvider);
          final downloadCount =
              ref.read(downloadManagerProvider).snapshot.items.length;
          unawaited(analytics?.trackEvent(
            DownloadsEvents.appOfflineModeEntered,
            properties: <String, Object?>{
              DownloadsEventProps.downloadCount: downloadCount,
              DownloadsEventProps.sourceScreen: 'downloads_library',
            },
          ));
        }
      });
    });

    // Downloads → back-press should always land the user on Home, never
    // exit the app and never leave them on a blank stack. The shell's own
    // PopScope also routes non-home branches to Home, but declaring it
    // here at the screen level guarantees the behaviour even when the
    // screen is reached OUTSIDE the shell (e.g. the cold-start offline
    // bootstrap that boots straight into `/downloads` — the router's
    // history has no `/home` entry to fall back to, so the shell-level
    // handler is the only thing that would otherwise fire).
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        if (!context.mounted) return;
        context.go(HomeRoutes.home);
      },
      child: Scaffold(
        key: const Key('downloads-library-screen'),
        backgroundColor: AppColors.white,
        body: SafeArea(
          child: BlocBuilder<DownloadsLibraryBloc, DownloadsLibraryState>(
            builder: (context, state) {
              return Column(
                key: const Key('downloads-library-root'),
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: <Widget>[
                  const _AppBar(),
                  OfflineBanner(
                    key: const Key('downloads-offline-banner'),
                    visible: state.isOffline,
                  ),
                  DownloadsFilterChips(
                    key: const Key('downloads-filter-chips'),
                    counts: state.counts,
                    selected: state.filter,
                    onSelected: (filter) =>
                        _onFilterChanged(context, state, filter),
                  ),
                  _Disclosure(key: const Key('downloads-disclosure')),
                  Expanded(
                    child: state.isTotalEmpty
                        ? const DownloadsEmpty()
                        : _DownloadsList(
                            key: const Key('downloads-list'),
                            items: state.filteredItems,
                            onRowTap: _onRowTap,
                            onRowMore: (item) => _onRowMore(context, item),
                          ),
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }

  void _onFilterChanged(
    BuildContext context,
    DownloadsLibraryState state,
    DownloadsFilter filter,
  ) {
    context
        .read<DownloadsLibraryBloc>()
        .add(DownloadsLibraryFilterChanged(filter));
    final analytics = ref.read(analyticsProvider);
    unawaited(analytics?.trackEvent(
      DownloadsEvents.downloadsFilterClicked,
      properties: <String, Object?>{
        DownloadsEventProps.filterType: _filterWire(filter),
        DownloadsEventProps.resultCount: state.counts.forFilter(filter),
      },
    ));
  }

  String _filterWire(DownloadsFilter filter) {
    if (filter == null) return DownloadsFilterType.all;
    switch (filter) {
      case DownloadContentType.aarti:
        return DownloadsFilterType.aarti;
      case DownloadContentType.bhajan:
        return DownloadsFilterType.bhajan;
      case DownloadContentType.mantra:
        return DownloadsFilterType.mantra;
    }
  }

  Future<void> _onRowTap(DownloadItem item) async {
    // Play the DOWNLOADED encrypted file directly through the shared audio
    // controller — no network round-trip, works offline. `AudioSource
    // .downloaded` tells `AudioController._startCurrentSource` to call
    // `setDownloadedSource` (backed by the encrypted store) instead of
    // `setUrl`. The mini-player promotes automatically and renders its
    // OFFLINE pill because `AudioItem.source == downloaded`.
    if (!mounted) return;
    final audioItem = AudioItem(
      id: item.contentId,
      title: item.title,
      audioUrl: '', // unused when source==downloaded
      subtitle: item.subtitle,
      artworkUrl: item.artworkUrl,
      module: _audioModuleFor(item.contentType),
      source: AudioSource.downloaded,
      downloadSizeBytes: item.sizeBytes > 0 ? item.sizeBytes : null,
    );
    unawaited(
      ref.read(audioControllerProvider.notifier).play(audioItem),
    );
    // Increment the play counter on the DownloadItem (persisted in
    // `index.json`) so `downloaded_content_played` analytics carries the
    // correct `play_count` next time.
    unawaited(ref.read(downloadManagerProvider).notePlay(item.contentId));
    final analytics = ref.read(analyticsProvider);
    final downloadedAt = item.downloadedAt;
    unawaited(analytics?.trackEvent(
      DownloadsEvents.downloadedContentPlayed,
      properties: <String, Object?>{
        DownloadsEventProps.contentId: item.contentId,
        DownloadsEventProps.contentType: item.contentType.wire,
        DownloadsEventProps.isOffline: ref.read(isOfflineProvider).maybeWhen(
              data: (v) => v,
              orElse: () => false,
            ),
        DownloadsEventProps.daysSinceDownload: downloadedAt == null
            ? null
            : DateTime.now().difference(downloadedAt).inDays,
        DownloadsEventProps.playCount: item.playCount + 1,
      },
    ));
    // Promote to the full-screen player so the download-row tap matches the
    // rest of the app (elsewhere, tapping an audio row opens the full
    // player, not just the mini-player). `autoStart: false` — playback is
    // already running on the shared engine via the controller.play() call
    // above; the player bloc's `alreadyActive` id-match short-circuits any
    // re-play attempt on the fetched detail, so the downloaded stream
    // continues uninterrupted while the server-side detail (engagement
    // counts / like state / etc.) hydrates the UI.
    if (!mounted) return;
    switch (item.contentType) {
      case DownloadContentType.aarti:
      case DownloadContentType.bhajan:
        unawaited(context.push(
          AartiRoutes.player,
          extra: AartiPlayerArgs(
            audioId: item.contentId,
            queue: const <AartiAudio>[],
            index: 0,
            sourceListType: 'downloads',
            autoStart: false,
          ),
        ));
      case DownloadContentType.mantra:
        unawaited(context.push(
          MantrasRoutes.player,
          extra: MantrasPlayerArgs(
            itemId: item.contentId,
            queue: const <MantraAudio>[],
            index: 0,
            playlistSource: '',
            autoStart: false,
          ),
        ));
    }
  }

  AudioModule _audioModuleFor(DownloadContentType type) {
    switch (type) {
      case DownloadContentType.aarti:
      case DownloadContentType.bhajan:
        return AudioModule.aarti;
      case DownloadContentType.mantra:
        return AudioModule.mantras;
    }
  }

  Future<void> _onRowMore(BuildContext context, DownloadItem item) async {
    final kind = switch (item.state) {
      DownloadQueued() => DownloadActionSheetKind.queued,
      DownloadFailed() => DownloadActionSheetKind.failed,
      DownloadCompleted() => DownloadActionSheetKind.downloadedFromList,
      DownloadInProgress() => DownloadActionSheetKind.queued,
    };
    final selection = await showDownloadActionSheet(
      context: context,
      kind: kind,
      title: item.title,
    );
    if (selection == null) return;
    final manager = ref.read(downloadManagerProvider);
    switch (selection) {
      case DownloadActionSheetSelection.cancelDownload:
        await manager.cancel(item.contentId);
      case DownloadActionSheetSelection.retryDownload:
        await manager.retry(item.contentId);
      case DownloadActionSheetSelection.playNow:
        await _onRowTap(item);
      case DownloadActionSheetSelection.deleteDownload:
        await manager.remove(item.contentId);
      case DownloadActionSheetSelection.viewAllDownloads:
        // Only reachable from the play-page sheet variant — no-op here.
        break;
    }
  }
}

class _AppBar extends StatelessWidget {
  const _AppBar();

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      key: const Key('downloads-appbar'),
      height: AppNav.height,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.medium),
        child: Row(
          children: <Widget>[
            Expanded(
              child: Text(
                'Downloads',
                key: const Key('downloads-appbar-title'),
                style: AppText.headingSm(color: AppColors.black),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Quiet one-line disclosure below the filter chips (spec §q5 default).
class _Disclosure extends StatelessWidget {
  const _Disclosure({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minHeight: 32),
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.medium,
        vertical: AppSpacing.xxxSmall,
      ),
      alignment: Alignment.centerLeft,
      child: Text(
        'Downloads play only inside Prabhuji.',
        style: AppText.bodyXs(color: AppColors.grey400),
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
      ),
    );
  }
}

class _DownloadsList extends StatelessWidget {
  const _DownloadsList({
    super.key,
    required this.items,
    required this.onRowTap,
    required this.onRowMore,
  });

  final List<DownloadItem> items;
  final ValueChanged<DownloadItem> onRowTap;
  final ValueChanged<DownloadItem> onRowMore;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return Center(
        key: const Key('downloads-list-filtered-empty'),
        child: Text(
          'No downloads match this filter.',
          style: AppText.bodyMd(color: AppColors.grey400),
        ),
      );
    }
    return ListView.separated(
      key: const Key('downloads-list-scroll'),
      padding: EdgeInsets.zero,
      itemCount: items.length,
      separatorBuilder: (_, _) =>
          const Divider(height: 1, color: AppColors.grey200),
      itemBuilder: (context, i) {
        final item = items[i];
        return DownloadRow(
          item: item,
          onTap: () => onRowTap(item),
          onMoreTap: () => onRowMore(item),
        );
      },
    );
  }
}
