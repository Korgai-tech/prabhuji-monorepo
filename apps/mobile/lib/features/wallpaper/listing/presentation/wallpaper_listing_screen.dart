import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme.dart';
import '../../../../state/providers.dart';
import '../../application/wallpaper_navigation.dart';
import '../../presentation/wallpaper_widgets.dart';
import '../../wallpaper_analytics.dart';
import '../../wallpaper_routes.dart';
import '../bloc/wallpaper_list_bloc.dart';
import '../bloc/wallpaper_list_event.dart';
import '../bloc/wallpaper_list_state.dart';

/// Wallpaper Listing (Figma 707:6427). Dynamic title, two-column vertical grid
/// with a LIVE badge on live cards, infinite scroll via `GET /wallpaper/list`.
/// A grid tap opens the reels preview seeded with the SAME listing feed so
/// vertical swipe continues this exact context (PRD §6.8). Discovery is FREE.
class WallpaperListingScreen extends ConsumerStatefulWidget {
  const WallpaperListingScreen({super.key, required this.query});
  final WallpaperListQuery query;

  @override
  ConsumerState<WallpaperListingScreen> createState() =>
      _WallpaperListingScreenState();
}

class _WallpaperListingScreenState
    extends ConsumerState<WallpaperListingScreen> {
  final ScrollController _scroll = ScrollController();

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scroll.removeListener(_onScroll);
    _scroll.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scroll.position.pixels >= _scroll.position.maxScrollExtent - 600) {
      context.read<WallpaperListBloc>().add(
            const WallpaperListNextPageRequested(),
          );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: const Key('wallpaper-listing-screen'),
      backgroundColor: AppColors.cardSurface,
      body: Column(
        children: [
          WallpaperTopBar(
            title: widget.query.title,
            onBack: () => Navigator.of(context).maybePop(),
          ),
          Expanded(
            child: BlocBuilder<WallpaperListBloc, WallpaperListState>(
              builder: (context, state) => switch (state.status) {
                WallpaperListStatus.loading => const Center(
                    key: Key('wallpaper-listing-skeleton'),
                    child: CircularProgressIndicator(),
                  ),
                WallpaperListStatus.error => WallpaperMessageState(
                    stateKey: const Key('wallpaper-listing-error'),
                    message: "Couldn't load wallpapers.",
                    retryKey: const Key('wallpaper-listing-retry'),
                    onRetry: () => context
                        .read<WallpaperListBloc>()
                        .add(const WallpaperListRetryRequested()),
                  ),
                WallpaperListStatus.empty => const WallpaperMessageState(
                    stateKey: Key('wallpaper-listing-empty'),
                    message: 'No wallpapers available yet.',
                  ),
                WallpaperListStatus.loaded => _Grid(
                    query: widget.query,
                    state: state,
                    controller: _scroll,
                  ),
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _Grid extends ConsumerWidget {
  const _Grid({
    required this.query,
    required this.state,
    required this.controller,
  });

  final WallpaperListQuery query;
  final WallpaperListState state;
  final ScrollController controller;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return GridView.builder(
      key: const Key('wallpaper-grid'),
      controller: controller,
      padding: const EdgeInsets.all(AppWallpaper.screenPadding),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: AppWallpaper.listColumns,
        mainAxisSpacing: AppWallpaper.listGridGap,
        crossAxisSpacing: AppWallpaper.listGridGap,
        childAspectRatio: AppWallpaper.listCardAspectRatio,
      ),
      itemCount: state.items.length,
      itemBuilder: (context, index) {
        final item = state.items[index];
        return WallpaperGridCard(
          item: item,
          onTap: () {
            // Sheet 1 row 130 — `wallpaper_selected` from the listing grid
            // (`selection_source: 'listing'`; the home row fires the SAME
            // event with `selection_source: 'row_<rowType>'`).
            unawaited(ref.read(analyticsProvider)?.trackEvent(
              WallpaperEvents.selected,
              properties: {
                WallpaperEventProps.wallpaperId: item.id,
                WallpaperEventProps.wallpaperName: item.title,
                WallpaperEventProps.mediaType: item.mediaType.name,
                WallpaperEventProps.selectionSource: 'listing',
                WallpaperEventProps.rowName: query.title,
                WallpaperEventProps.positionIndex: index,
              },
            ));
            pushWallpaperPreview(
              context,
              WallpaperPreviewArgs(
                items: state.items,
                startIndex: index,
                query: query,
                nextCursor: state.nextCursor,
                sourceContext: query.sourceContext,
              ),
            );
          },
        );
      },
    );
  }
}
