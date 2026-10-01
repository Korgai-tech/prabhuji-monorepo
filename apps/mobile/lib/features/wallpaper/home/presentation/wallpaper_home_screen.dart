import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:visibility_detector/visibility_detector.dart';

import '../../../../api/generated/openapi.dart';
import '../../../../core/theme.dart';
import '../../../../shared/widgets/deity_filter_row.dart';
import '../../../../state/providers.dart';
import '../../application/wallpaper_navigation.dart';
import '../../data/wallpaper_models.dart';
import '../../presentation/wallpaper_widgets.dart';
import '../../wallpaper_analytics.dart';
import '../../wallpaper_routes.dart';
import '../bloc/wallpaper_home_bloc.dart';
import '../bloc/wallpaper_home_event.dart';
import '../bloc/wallpaper_home_state.dart';

/// Wallpaper Home (Figma 704:5223). Back + "Wallpapers" title, an "All
/// Gods"-default deity filter row (TAM-58), and CMS horizontal rows of
/// vertical-ratio cards from `GET /wallpaper/home`. Discovery is FREE — no
/// paywall on entry/filter/tap; a card tap opens the preview directly.
class WallpaperHomeScreen extends ConsumerStatefulWidget {
  const WallpaperHomeScreen({super.key});

  @override
  ConsumerState<WallpaperHomeScreen> createState() =>
      _WallpaperHomeScreenState();
}

class _WallpaperHomeScreenState extends ConsumerState<WallpaperHomeScreen> {
  @override
  Widget build(BuildContext context) {
    final deities = ref.watch(deitiesProvider);
    return Scaffold(
      key: const Key('wallpaper-home-screen'),
      backgroundColor: AppColors.cardSurface,
      body: Column(
        children: [
          WallpaperTopBar(
            title: 'Wallpapers',
            onBack: () => Navigator.of(context).maybePop(),
          ),
          _DeityFilter(deities: deities),
          Expanded(
            child: BlocBuilder<WallpaperHomeBloc, WallpaperHomeState>(
              builder: (context, state) => switch (state.status) {
                WallpaperHomeStatus.loading => const Center(
                    key: Key('wallpaper-home-skeleton'),
                    child: CircularProgressIndicator(),
                  ),
                WallpaperHomeStatus.error => WallpaperMessageState(
                    stateKey: const Key('wallpaper-home-error'),
                    message: "Couldn't load wallpapers.",
                    retryKey: const Key('wallpaper-home-retry'),
                    onRetry: () => context
                        .read<WallpaperHomeBloc>()
                        .add(const WallpaperHomeRetryRequested()),
                  ),
                WallpaperHomeStatus.empty => const WallpaperMessageState(
                    stateKey: Key('wallpaper-home-empty'),
                    message: 'No wallpapers available yet.',
                  ),
                WallpaperHomeStatus.loaded => _RowsList(rows: state.rows),
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _DeityFilter extends ConsumerWidget {
  const _DeityFilter({required this.deities});
  final AsyncValue<List<DeityView>> deities;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return BlocBuilder<WallpaperHomeBloc, WallpaperHomeState>(
      buildWhen: (a, b) => a.selectedDeityId != b.selectedDeityId,
      builder: (context, state) => Padding(
        padding: const EdgeInsets.only(top: AppSpacing.xSmall),
        child: DeityFilterRow(
          deities: deities,
          selectedSlug: state.selectedDeityId,
          onSelected: (slug) {
            String? name;
            final list = deities.asData?.value ?? const <DeityView>[];
            for (final d in list) {
              if (d.slug == slug) {
                name = d.displayName;
                break;
              }
            }
            context.read<WallpaperHomeBloc>().add(
                  WallpaperHomeDeitySelected(deityId: slug, deityName: name),
                );
          },
        ),
      ),
    );
  }
}

class _RowsList extends StatelessWidget {
  const _RowsList({required this.rows});
  final List<WallpaperHomeRowData> rows;

  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      key: const Key('wallpaper-home-rows'),
      padding: const EdgeInsets.symmetric(
        horizontal: AppWallpaper.screenPadding,
        vertical: AppWallpaper.screenPadding,
      ),
      itemCount: rows.length,
      separatorBuilder: (_, _) =>
          const SizedBox(height: AppWallpaper.sectionGap),
      itemBuilder: (context, i) => _HomeRow(row: rows[i], positionIndex: i),
    );
  }
}

class _HomeRow extends ConsumerWidget {
  const _HomeRow({required this.row, required this.positionIndex});
  final WallpaperHomeRowData row;
  final int positionIndex;

  /// Row impression: ≥50% of the row on screen (the same threshold Home's feed
  /// uses). Dedup lives in the bloc, not here — see [WallpaperHomeRowViewed].
  void _onVisibility(BuildContext context, VisibilityInfo info) {
    // VisibilityDetector fires a final 0-visibility callback AFTER dispose;
    // reading a deactivated element's bloc would throw.
    if (!context.mounted) return;
    if (info.visibleFraction < AppHome.viewVisibleFraction) return;
    context.read<WallpaperHomeBloc>().add(
          WallpaperHomeRowViewed(
            rowId: row.rowId,
            rowType: row.rowType,
            rowName: row.title,
            positionIndex: positionIndex,
            itemCount: row.items.length,
          ),
        );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return VisibilityDetector(
      key: Key('wallpaper-home-row-visibility-${row.rowId}'),
      onVisibilityChanged: (info) => _onVisibility(context, info),
      child: _buildRow(context, ref),
    );
  }

  Widget _buildRow(BuildContext context, WidgetRef ref) {
    return Column(
      key: Key('wallpaper-home-row-${row.rowId}'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        WallpaperRowHeader(
          rowId: row.rowId,
          title: row.title,
          // The server's key drives the glyph — the client used to hardcode
          // `rowType == 'top_live'` while parsing `iconKey` and dropping it.
          iconKey: row.iconKey,
          onShowAll: () => pushWallpaperListing(
            context,
            WallpaperListQuery(
              title: row.title,
              rowId: row.rowId,
              sourceContext: 'row_${row.rowType}',
            ),
          ),
        ),
        const SizedBox(height: AppWallpaper.rowHeaderGap),
        SizedBox(
          height: AppWallpaper.rowCardStripHeight,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: row.items.length,
            separatorBuilder: (_, _) =>
                const SizedBox(width: AppWallpaper.homeCardGap),
            itemBuilder: (context, index) {
              final item = row.items[index];
              return WallpaperRowCard(
                item: item,
                onTap: () {
                  // Sheet 1 row 130 — `wallpaper_selected`. Fires from the
                  // home row (`selection_source: 'row_<rowType>'`); the
                  // listing grid fires the SAME event with
                  // `selection_source: 'listing'`.
                  unawaited(ref.read(analyticsProvider)?.trackEvent(
                    WallpaperEvents.selected,
                    properties: {
                      WallpaperEventProps.wallpaperId: item.id,
                      WallpaperEventProps.wallpaperName: item.title,
                      WallpaperEventProps.mediaType: item.mediaType.name,
                      WallpaperEventProps.selectionSource:
                          'row_${row.rowType}',
                      WallpaperEventProps.rowName: row.title,
                      WallpaperEventProps.positionIndex: index,
                    },
                  ));
                  pushWallpaperPreview(
                    context,
                    WallpaperPreviewArgs(
                      items: row.items,
                      startIndex: index,
                      query: WallpaperListQuery(
                        title: row.title,
                        rowId: row.rowId,
                        sourceContext: 'row_${row.rowType}',
                      ),
                      sourceContext: 'row_${row.rowType}',
                    ),
                  );
                },
              );
            },
          ),
        ),
      ],
    );
  }
}
