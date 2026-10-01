import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/theme.dart';
import '../../application/books_navigation.dart';
import '../../data/books_models.dart';
import '../../presentation/books_widgets.dart';
import '../bloc/books_listing_bloc.dart';
import '../bloc/books_listing_event.dart';
import '../bloc/books_listing_state.dart';

/// The reusable 2-column listing — Figma `562:5565`.
///
/// One screen for All Books AND each of the four category listings (the design
/// explicitly reuses this frame — see rough_plan/prabhuji-books-plan/figma-links.md).
/// Pushes OVER the shell with its own back-nav, so no bottom tabs.
///
/// FREE: covers + titles for everyone, no lock badges. Tapping a card runs the
/// `BooksTapHandler` gate.
class BooksListingScreen extends ConsumerStatefulWidget {
  const BooksListingScreen({super.key, required this.query});

  final BookListQuery query;

  @override
  ConsumerState<BooksListingScreen> createState() => _BooksListingScreenState();
}

class _BooksListingScreenState extends ConsumerState<BooksListingScreen> {
  final ScrollController _controller = ScrollController();

  @override
  void initState() {
    super.initState();
    _controller.addListener(_onScroll);
  }

  @override
  void dispose() {
    _controller.removeListener(_onScroll);
    _controller.dispose();
    super.dispose();
  }

  /// Prefetch the next keyset page ~1.5 viewports early. The bloc guards against
  /// double-fetching, so an eager listener is safe.
  void _onScroll() {
    if (!_controller.hasClients) return;
    final position = _controller.position;
    if (position.pixels >= position.maxScrollExtent - 400) {
      context.read<BooksListingBloc>().add(const BooksListingNextPageRequested());
    }
  }

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(gradient: AppGradient.booksScaffold),
      child: Scaffold(
        backgroundColor: Colors.transparent,
        body: SafeArea(
          bottom: false,
          child: Column(
            children: [
              // The heading is the SERVER's (`data.title`), with the route's
              // server-sourced hint covering the first frame. The client used to
              // hardcode 'All Books' and to render the category enum's wire value
              // here.
              BlocBuilder<BooksListingBloc, BooksListingState>(
                buildWhen: (a, b) => a.title != b.title,
                builder: (context, state) => BooksNav(
                  key: const ValueKey('books-listing-nav'),
                  title: state.title ?? widget.query.titleHint ?? '',
                  onBack: () => context.pop(),
                ),
              ),
              Expanded(
                child: BlocBuilder<BooksListingBloc, BooksListingState>(
                  builder: (context, state) => switch (state.status) {
                    BooksListingStatus.loading => const Center(
                        key: ValueKey('books-listing-loading'),
                        child: CircularProgressIndicator(
                          color: AppColors.primaryCta,
                        ),
                      ),
                    BooksListingStatus.failure => Center(
                        child: BooksMessage(
                          key: const ValueKey('books-listing-error'),
                          message: state.offline
                              ? 'You seem to be offline. Please check your connection.'
                              : 'Could not load books. Please try again.',
                          retryKey: const ValueKey('books-listing-retry'),
                          onRetry: () => context
                              .read<BooksListingBloc>()
                              .add(const BooksListingRetried()),
                        ),
                      ),
                    BooksListingStatus.empty => const Center(
                        child: BooksMessage(
                          key: ValueKey('books-listing-empty'),
                          message: 'Nothing here yet. Please check back soon.',
                        ),
                      ),
                    BooksListingStatus.ready => _Grid(
                        state: state,
                        controller: _controller,
                        sourceListType: widget.query.sourceListType,
                      ),
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The 2-column grid (node 562:5566 — layoutMode GRID, 16 padding, 10/10 gaps).
class _Grid extends ConsumerWidget {
  const _Grid({
    required this.state,
    required this.controller,
    required this.sourceListType,
  });

  final BooksListingState state;
  final ScrollController controller;
  final String sourceListType;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return GridView.builder(
      key: const ValueKey('books-listing-grid'),
      controller: controller,
      padding: const EdgeInsets.all(AppBooks.screenPadding),
      // The footer spinner rides as a trailing cell so it can't disturb the grid.
      itemCount: state.items.length + (state.loadingMore ? 1 : 0),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: AppBooks.listColumns,
        mainAxisSpacing: AppBooks.listGap,
        crossAxisSpacing: AppBooks.listGap,
        childAspectRatio: AppBooks.cardWidthLg / AppBooks.listCardHeight,
      ),
      itemBuilder: (context, i) {
        if (i >= state.items.length) {
          return const Center(
            key: ValueKey('books-listing-loading-more'),
            child: CircularProgressIndicator(color: AppColors.primaryCta),
          );
        }
        final book = state.items[i];
        return BookCard(
          key: ValueKey('books-card-${book.contentId}'),
          book: book,
          width: AppBooks.cardWidthLg,
          onTap: () => booksHandleCardTap(
            context,
            ref,
            book: book,
            sourceListType: sourceListType,
          ),
        );
      },
    );
  }
}
