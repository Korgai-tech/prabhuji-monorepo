import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme.dart';
import '../../../../state/providers.dart';
import '../../application/mantras_navigation.dart';
import '../../data/mantras_models.dart';
import '../../mantras_analytics.dart';
import '../../presentation/mantras_mini_player_host.dart';
import '../../presentation/mantras_widgets.dart';
import '../bloc/mantras_listing_bloc.dart';
import '../bloc/mantras_listing_event.dart';
import '../bloc/mantras_listing_state.dart';

/// Reusable 2-column Show-all listing (Figma 1066:3358). ONE screen backs
/// recently-played / newly-added via the injected [MantraListQuery] with a
/// dynamic title. Lazy keyset pagination; the listing order becomes the player
/// playlist. Mirrors the Aarti listing pattern (TAM-64).
class MantrasListingScreen extends ConsumerStatefulWidget {
  const MantrasListingScreen({super.key, required this.query});
  final MantraListQuery query;

  @override
  ConsumerState<MantrasListingScreen> createState() =>
      _MantrasListingScreenState();
}

class _MantrasListingScreenState extends ConsumerState<MantrasListingScreen> {
  final ScrollController _controller = ScrollController();

  /// Guard so `mantras_browsing_page_viewed` fires exactly once per screen
  /// (initial load OR retry-after-error), not on every next-page emit.
  bool _pageViewReported = false;

  @override
  void initState() {
    super.initState();
    _controller.addListener(_maybeLoadMore);
  }

  @override
  void dispose() {
    _controller.removeListener(_maybeLoadMore);
    _controller.dispose();
    super.dispose();
  }

  /// Sheet 1 row 66 — `mantras_browsing_page_viewed`. "Show All/category
  /// listing becomes visible" = the first render with a resolved result
  /// count, which is either loaded OR empty. Fired at most once per
  /// screen instance so pagination doesn't re-emit.
  void _reportPageViewIfReady(MantrasListingState state) {
    if (_pageViewReported) return;
    if (state.status != MantrasListingStatus.loaded &&
        state.status != MantrasListingStatus.empty) {
      return;
    }
    _pageViewReported = true;
    final browseType = _browseType(widget.query);
    unawaited(ref.read(analyticsProvider)?.trackEvent(
          MantrasEvents.browsingPageViewed,
          properties: {
            MantrasEventProps.browseType: browseType,
            MantrasEventProps.browseId: _browseId(widget.query),
            MantrasEventProps.resultCount: state.items.length,
          },
        ));
  }

  /// `browse_type` per Sheet 2/1: deity / category / show_all / recently_played.
  String _browseType(MantraListQuery q) {
    if (q.deityId != null) return 'deity';
    if (q.categoryId != null) return 'category';
    if (q.section == MantraListSection.recentlyPlayed) return 'recently_played';
    return 'show_all';
  }

  String? _browseId(MantraListQuery q) =>
      q.deityId ?? q.categoryId ?? q.section?.wire;

  void _maybeLoadMore() {
    if (!_controller.hasClients) return;
    final threshold = _controller.position.maxScrollExtent - 400;
    if (_controller.position.pixels >= threshold) {
      context
          .read<MantrasListingBloc>()
          .add(const MantrasListingNextPageRequested());
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: const Key('mantras-listing-screen'),
      backgroundColor: AppColors.cardSurface,
      body: Column(
        children: [
          MantrasTopNav(title: widget.query.title),
          Expanded(
            child: BlocConsumer<MantrasListingBloc, MantrasListingState>(
              listener: (_, state) => _reportPageViewIfReady(state),
              builder: (context, state) => switch (state.status) {
                MantrasListingStatus.loading =>
                  const Center(child: CircularProgressIndicator()),
                MantrasListingStatus.empty => const _ListingEmpty(),
                MantrasListingStatus.error => _ListingError(
                    onRetry: () => context
                        .read<MantrasListingBloc>()
                        .add(const MantrasListingRetryRequested()),
                  ),
                MantrasListingStatus.loaded => _grid(context, state),
              },
            ),
          ),
        ],
      ),
      // See mantras_main_screen.dart for why SafeArea(top: false) — the
      // mini-player mounted directly as bottomNavigationBar needs its own
      // clearance for the Android system-bar inset.
      bottomNavigationBar: const SafeArea(
        top: false,
        child: MantrasMiniPlayerHost(),
      ),
    );
  }

  Widget _grid(BuildContext context, MantrasListingState state) {
    return GridView.builder(
      key: const Key('mantras-listing-grid'),
      controller: _controller,
      padding: const EdgeInsets.all(AppMantras.screenPadding),
      itemCount: state.items.length,
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        mainAxisSpacing: AppMantras.gridGap,
        crossAxisSpacing: AppMantras.gridGap,
        childAspectRatio: 159 / 190,
      ),
      itemBuilder: (context, i) => MantrasGridCard(
        audio: state.items[i],
        onTap: () => buildMantrasTapHandler(context, ref).handleAudioTap(
          item: state.items[i],
          queue: state.items,
          index: i,
          sourceSection: widget.query.sourceListType,
        ),
      ),
    );
  }
}

class _ListingEmpty extends StatelessWidget {
  const _ListingEmpty();
  @override
  Widget build(BuildContext context) {
    return Center(
      key: const Key('mantras-listing-empty'),
      child: Text(
        'Mantras abhi uplabdh nahi hain. Kripya thodi der baad phir dekhein.',
        textAlign: TextAlign.center,
        style: AppText.bodyMd(color: AppColors.textSecondary),
      ),
    );
  }
}

class _ListingError extends StatelessWidget {
  const _ListingError({required this.onRetry});
  final VoidCallback onRetry;
  @override
  Widget build(BuildContext context) {
    return Center(
      key: const Key('mantras-listing-error'),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            'Could not load this list.',
            style: AppText.bodyMd(color: AppColors.textSecondary),
          ),
          const SizedBox(height: AppSpacing.medium),
          TextButton(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    );
  }
}
