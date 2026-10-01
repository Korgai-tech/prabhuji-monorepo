import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme.dart';
import '../../application/aarti_navigation.dart';
import '../../data/aarti_models.dart';
import '../../presentation/aarti_mini_player_host.dart';
import '../../presentation/aarti_widgets.dart';
import '../bloc/aarti_listing_bloc.dart';
import '../bloc/aarti_listing_event.dart';
import '../bloc/aarti_listing_state.dart';

/// Reusable 2-column listing (Figma 420:2909). ONE screen backs category /
/// deity / Show-all / recently-played / newly-added / most-played via the
/// injected [AartiListQuery]. Lazy keyset pagination; empty → calm empty state.
/// Scroll position is preserved on return from paywall-cancel / player-back
/// (push-nav keeps this State + its [ScrollController] mounted).
class AartiListingScreen extends ConsumerStatefulWidget {
  const AartiListingScreen({super.key, required this.query});
  final AartiListQuery query;

  @override
  ConsumerState<AartiListingScreen> createState() => _AartiListingScreenState();
}

class _AartiListingScreenState extends ConsumerState<AartiListingScreen> {
  final ScrollController _controller = ScrollController();

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

  void _maybeLoadMore() {
    if (!_controller.hasClients) return;
    final threshold = _controller.position.maxScrollExtent - 400;
    if (_controller.position.pixels >= threshold) {
      context.read<AartiListingBloc>().add(const AartiListingNextPageRequested());
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: const Key('aarti-listing-screen'),
      backgroundColor: AppColors.cardSurface,
      body: Column(
        children: [
          AartiTopNav(title: widget.query.title),
          Expanded(
            child: BlocBuilder<AartiListingBloc, AartiListingState>(
              builder: (context, state) => switch (state.status) {
                AartiListingStatus.loading =>
                  const Center(child: CircularProgressIndicator()),
                AartiListingStatus.empty => const _ListingEmpty(),
                AartiListingStatus.error => _ListingError(
                    onRetry: () => context
                        .read<AartiListingBloc>()
                        .add(const AartiListingRetryRequested()),
                  ),
                AartiListingStatus.loaded => _grid(context, state),
              },
            ),
          ),
        ],
      ),
      // See aarti_main_screen.dart for why SafeArea(top: false) — the
      // mini-player mounted directly as bottomNavigationBar needs its own
      // clearance for the Android system-bar inset.
      bottomNavigationBar: const SafeArea(
        top: false,
        child: AartiMiniPlayerHost(),
      ),
    );
  }

  Widget _grid(BuildContext context, AartiListingState state) {
    return GridView.builder(
      // Scroll position is preserved by the retained State + [_controller] across
      // the paywall/player push round-trip (the screen stays mounted).
      key: const Key('aarti-listing-grid'),
      controller: _controller,
      padding: const EdgeInsets.all(AppAarti.screenPadding),
      itemCount: state.items.length,
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        mainAxisSpacing: AppAarti.gridGap,
        crossAxisSpacing: AppAarti.gridGap,
        childAspectRatio: 159 / 190, // Figma card 159×190
      ),
      itemBuilder: (context, i) => AartiGridCard(
        audio: state.items[i],
        onTap: () {
          buildAartiTapHandler(context, ref).handleTap(
            audio: state.items[i],
            queue: state.items,
            index: i,
            sourceListType: widget.query.sourceListType,
            sourceFilter: widget.query.filterLabel,
          );
        },
      ),
    );
  }
}

class _ListingEmpty extends StatelessWidget {
  const _ListingEmpty();
  @override
  Widget build(BuildContext context) {
    return Center(
      key: const Key('aarti-listing-empty'),
      child: Text(
        'No audio found here yet.',
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
      key: const Key('aarti-listing-error'),
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
