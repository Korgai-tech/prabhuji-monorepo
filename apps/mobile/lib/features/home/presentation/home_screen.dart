import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme.dart';
import '../../modals/presentation/modal_host.dart';
import '../../shell/application/tab_reselect.dart';
import '../feed/bloc/home_feed_bloc.dart';
import '../feed/bloc/home_feed_event.dart';
import '../feed/bloc/home_feed_state.dart';
import 'home_banner_carousel.dart';
import 'home_chat_fab.dart';
import 'home_feed_card.dart';
import 'home_header.dart';
import 'home_shortcut_grid.dart';

/// Home (Figma frame `285:3464` "Home+Infinite scroll feed") — the app's
/// primary discovery surface and the canonical use of
/// `patterns_library/ui/flutter-feed-screen.md`.
///
/// A `CustomScrollView` of slivers, one per section, in the frame's own order:
/// header (285:3482) → banners (285:3506) → shortcut grid (285:3508) → mixed
/// infinite feed (285:3538). The bottom nav comes from the TAM-58 shell — Home
/// is branch 0, so this screen deliberately builds no nav of its own. Chat's
/// entry is Home's own extended FAB ([HomeChatFab], Figma 3914:11348), which
/// collapses to its icon once the feed scrolls off the top.
///
/// ## The two rules this screen exists to honour
///
/// 1. **Home never gates.** Opening Home, entering a module, and browsing the
///    feed NEVER show the paywall (PRD §5). The only Home-origin trigger is a
///    server-flagged `isProFeatureDiscovery` banner tap, which goes through
///    TAM-58's `PaywallGate` inside `HomeBannerCarousel`. Free and Pro users see
///    the identical feed with no lock badges.
/// 2. **Sections fail independently** (pattern §2, PRD §16). The header is the
///    only static chrome left and always renders; banners and the shortcut grid
///    hide on failure; the feed shows a retry CTA. That is why each is its own
///    sliver rather than one gated tree.
///
///    The shortcut grid USED to be static chrome — four labels + their order
///    baked into the client. It is CMS content (`GET /home/shortcuts`) as of the
///    static-data sweep, so it now loads and fails like any other remote section.
class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  final ScrollController _scrollController = ScrollController();
  final GlobalKey<RefreshIndicatorState> _refreshKey =
      GlobalKey<RefreshIndicatorState>();

  /// Chat FAB shows its label only while Home is at the top. A notifier (not
  /// `setState`) so a scroll edge rebuilds the FAB alone, never the feed.
  final ValueNotifier<bool> _fabExtended = ValueNotifier<bool>(true);

  /// Scroll offset past which the FAB collapses — a few px of slack so the
  /// pull-to-refresh overscroll and sub-pixel settles don't flicker it.
  static const double _fabCollapseOffset = 8;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  void _onScroll() {
    _fabExtended.value = _scrollController.offset <= _fabCollapseOffset;
  }

  @override
  void dispose() {
    _scrollController
      ..removeListener(_onScroll)
      ..dispose();
    _fabExtended.dispose();
    super.dispose();
  }

  /// Home tab re-tapped while already on Home: scroll to the top, then run
  /// the same refresh as a pull-down. `show()` animates the indicator and
  /// calls `onRefresh`, and is a no-op while a refresh is already running.
  Future<void> _onReselected() async {
    if (_scrollController.hasClients && _scrollController.offset > 0) {
      await _scrollController.animateTo(
        0,
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOut,
      );
    }
    if (!mounted) return;
    await _refreshKey.currentState?.show();
  }

  @override
  Widget build(BuildContext context) {
    ref.listen<TabReselect?>(tabReselectProvider, (_, next) {
      if (next?.branchIndex == ShellBranch.home) unawaited(_onReselected());
    });
    // TAM-174 — arms the ONE generalized-modal cold-start check
    // (`GET /modals/next`) and shows/reports whatever it returns. Home's own
    // layout and failure behaviour are untouched: `ModalHost` renders
    // [child] unchanged and swallows every modal failure itself (see its
    // header doc) — Home "never gates" and its sections "fail
    // independently" (this file's own header), and that holds regardless of
    // whether the modal check succeeds.
    return ModalHost(
      child: Container(
        key: const Key('home-screen'),
        // Frame root fill (node 285:3464) — cream→white, not a flat colour.
        decoration: const BoxDecoration(gradient: AppGradient.homeScaffold),
        child: Scaffold(
          backgroundColor: Colors.transparent,
          floatingActionButton: ValueListenableBuilder<bool>(
            valueListenable: _fabExtended,
            builder: (_, extended, _) => HomeChatFab(extended: extended),
          ),
          body: SafeArea(
            bottom: false,
            child: BlocBuilder<HomeFeedBloc, HomeFeedState>(
              builder: (context, state) => RefreshIndicator(
                key: _refreshKey,
                color: AppColors.homeWordmark,
                // Dispatch the refresh event and return its Completer future — the
                // indicator stays visible until banners+shortcuts+feed all settle.
                // Dedupe (impressed / viewed) survives; audio playback survives.
                onRefresh: () {
                  final event = HomeFeedRefreshRequested();
                  context.read<HomeFeedBloc>().add(event);
                  return event.completer.future;
                },
                child: CustomScrollView(
                  key: const Key('home-scroll'),
                  controller: _scrollController,
                  // AlwaysScrollable so the pull gesture triggers even when the
                  // feed is shorter than the viewport (empty / error states).
                  physics: const AlwaysScrollableScrollPhysics(),
                  slivers: [
                    // --- Static chrome: always renders, whatever the network did ---
                    const SliverToBoxAdapter(child: HomeHeader()),

                    // --- Banners (285:3506): hidden entirely on failure/empty ---
                    if (state.showBanners)
                      SliverToBoxAdapter(
                        child: HomeBannerCarousel(banners: state.banners),
                      )
                    else if (state.bannerStatus == HomeSectionStatus.loading)
                      const SliverToBoxAdapter(child: _BannerSkeleton()),

                    // --- Shortcut cards (285:3508 / 300:4338) --------------------
                    // CMS-driven now (labels/order/membership), so it hides on
                    // failure/empty like the banners rather than falling back to
                    // bundled copy.
                    if (state.showShortcuts)
                      SliverToBoxAdapter(
                        child: HomeShortcutGrid(shortcuts: state.shortcuts),
                      )
                    else if (state.shortcutStatus == HomeSectionStatus.loading)
                      const SliverToBoxAdapter(child: _ShortcutSkeleton()),

                    // --- Mixed infinite feed (285:3538) --------------------------
                    if (state.showFeedRetry)
                      const SliverToBoxAdapter(child: _FeedRetry())
                    else if (state.feedStatus == HomeSectionStatus.loading)
                      const SliverToBoxAdapter(child: _FeedSkeleton())
                    else if (state.showFeed)
                      SliverList.builder(
                        itemCount: state.items.length,
                        itemBuilder: (context, i) => HomeFeedCard(
                          // The item id keys the element so a page append never
                          // re-associates a card's audio/visibility state.
                          key: ValueKey('home-feed-item-${state.items[i].id}'),
                          item: state.items[i],
                          index: i,
                        ),
                      ),

                    // Tail spinner while the next cursor page loads.
                    if (state.loadingMore)
                      const SliverToBoxAdapter(child: _TailSpinner()),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Feed failure → a retry CTA directly below the shortcut cards (§16). The
/// cards themselves stay on screen — that is the whole point of the placement.
class _FeedRetry extends StatelessWidget {
  const _FeedRetry();

  @override
  Widget build(BuildContext context) {
    return Padding(
      key: const Key('home-feed-retry'),
      padding: const EdgeInsets.all(AppHome.screenPadding),
      child: Column(
        children: [
          Text(
            'Could not load your feed.',
            style: AppText.bodySm(color: AppColors.homeCardTitle),
          ),
          const SizedBox(height: AppSpacing.small),
          TextButton(
            key: const Key('home-feed-retry-button'),
            onPressed: () => context.read<HomeFeedBloc>().add(
              const HomeFeedRetryRequested(),
            ),
            child: Text(
              'Retry',
              style: AppText.labelMd(color: AppColors.homeWordmark),
            ),
          ),
        ],
      ),
    );
  }
}

/// Banner skeleton (AC: "loading → static chrome immediately, banners/feed
/// skeletons"). Same box the real carousel occupies, so nothing jumps.
class _BannerSkeleton extends StatelessWidget {
  const _BannerSkeleton();

  @override
  Widget build(BuildContext context) {
    return Padding(
      key: const Key('home-banner-skeleton'),
      padding: const EdgeInsets.fromLTRB(
        AppHome.screenPadding,
        AppHome.bannerBlockPaddingTop,
        AppHome.screenPadding,
        AppHome.bannerBlockPaddingBottom,
      ),
      child: Container(
        height: AppHome.bannerHeight,
        decoration: BoxDecoration(
          color: AppColors.shimmerBase,
          borderRadius: BorderRadius.circular(AppHome.bannerRadius),
        ),
      ),
    );
  }
}

/// Shortcut-grid skeleton — the same box the real 2×2 grid occupies, so the feed
/// below it doesn't jump when the tiles land.
class _ShortcutSkeleton extends StatelessWidget {
  const _ShortcutSkeleton();

  @override
  Widget build(BuildContext context) {
    return Padding(
      key: const Key('home-shortcut-skeleton'),
      padding: const EdgeInsets.only(
        left: AppHome.screenPadding,
        right: AppHome.screenPadding,
        bottom: AppHome.shortcutGridPaddingBottom,
      ),
      child: Container(
        height: AppHome.shortcutCardHeight * 2 + AppHome.shortcutGap,
        decoration: BoxDecoration(
          color: AppColors.shimmerBase,
          borderRadius: BorderRadius.circular(AppHome.shortcutCardRadius),
        ),
      ),
    );
  }
}

class _FeedSkeleton extends StatelessWidget {
  const _FeedSkeleton();

  @override
  Widget build(BuildContext context) {
    return Container(
      key: const Key('home-feed-skeleton'),
      height: AppHome.audioAreaHeight,
      margin: const EdgeInsets.only(top: AppHome.screenPadding),
      color: AppColors.shimmerBase,
    );
  }
}

class _TailSpinner extends StatelessWidget {
  const _TailSpinner();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      key: Key('home-feed-tail-spinner'),
      padding: EdgeInsets.all(AppSpacing.medium),
      child: Center(
        child: SizedBox(
          width: AppSpacing.large,
          height: AppSpacing.large,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      ),
    );
  }
}
