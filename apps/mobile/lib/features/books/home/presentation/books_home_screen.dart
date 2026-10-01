import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme.dart';
import '../../application/books_navigation.dart';
import '../../data/books_models.dart';
import '../../presentation/books_widgets.dart';
import '../bloc/books_home_bloc.dart';
import '../bloc/books_home_event.dart';
import '../bloc/books_home_state.dart';

/// Books Home — Figma `534:5061`.
///
/// Lives INSIDE the TAM-58 shell (branch 4), so the bottom nav is the shell's,
/// not this screen's.
///
/// INTENTIONAL DIVERGENCE — the frame's `Basic Nav` (534:5163) carries a leading
/// back arrow. Books Home is the ROOT of a bottom-nav branch, so there is
/// nothing to pop and the arrow would be dead UI. Both sibling in-shell tabs
/// mark that slot `visible:false` in their own frames (Status 302:4384,
/// Horoscope 371:3796) — this frame simply left the nav component's default on.
/// Recorded as `intentional` in the cross-check + sweep table.
///
/// Everything here is FREE: no lock badges anywhere, and the gate fires on a
/// card tap via `BooksTapHandler` (#EXPORT_CRITICAL).
class BooksHomeScreen extends ConsumerWidget {
  const BooksHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return DecoratedBox(
      // Node 534:5061 fill — cream→white, NOT the reader's flat warm surface.
      decoration: const BoxDecoration(gradient: AppGradient.booksScaffold),
      child: Scaffold(
        backgroundColor: Colors.transparent,
        body: SafeArea(
          bottom: false,
          child: BlocBuilder<BooksHomeBloc, BooksHomeState>(
            builder: (context, state) => switch (state.status) {
              BooksHomeStatus.loading => const _HomeSkeleton(),
              BooksHomeStatus.failure => Center(
                  child: BooksMessage(
                    key: const ValueKey('books-home-error'),
                    message: state.offline
                        ? 'You seem to be offline. Please check your connection.'
                        : 'Could not load books. Please try again.',
                    retryKey: const ValueKey('books-home-retry'),
                    onRetry: () => context
                        .read<BooksHomeBloc>()
                        .add(const BooksHomeRetried()),
                  ),
                ),
              BooksHomeStatus.empty => const Center(
                  child: BooksMessage(
                    key: ValueKey('books-home-empty'),
                    message: 'No books yet. Please check back soon.',
                  ),
                ),
              BooksHomeStatus.ready => _HomeContent(state: state),
            },
          ),
        ),
      ),
    );
  }
}

/// Renders the server's sections, in the server's order, with the server's
/// headings.
///
/// Nothing here enumerates the page: there is no `if (hasCarousel)` chain and no
/// bundled 'Books'/'Browse Categories'/'Newly Added Books' copy left. A section's
/// LAYOUT is chosen by its stable [BooksSectionKey] — never by its title, which
/// the CMS may reword at any time — and a key this build doesn't know was already
/// dropped in the repository, so it can't reach this switch.
class _HomeContent extends ConsumerWidget {
  const _HomeContent({required this.state});
  final BooksHomeState state;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ListView(
      key: const ValueKey('books-home-scroll'),
      padding: EdgeInsets.zero,
      children: [
        // Nav title (node I534:5163;5186:10376) — no back arrow, see the class
        // doc. The bar takes the FIRST section's heading (the design's 'Books'
        // title and the carousel heading are the same string, node 534:5063), so
        // even the nav bar is CMS copy rather than a baked-in word.
        BooksNav(
          key: const ValueKey('books-home-nav'),
          title: state.sections.isEmpty ? '' : state.sections.first.title,
        ),
        for (var i = 0; i < state.sections.length; i++)
          _section(context, ref, state.sections[i], hideHeader: i == 0),
      ],
    );
  }

  /// When [hideHeader] is true, the section renders WITHOUT its own
  /// `BooksSectionHeader` because the [BooksNav] above already displays the
  /// same title (first-section title == nav title). Prevents a "Browse
  /// Categories" (or whatever the CMS puts first) from rendering twice.
  Widget _section(
    BuildContext context,
    WidgetRef ref,
    BooksHomeSectionView section, {
    bool hideHeader = false,
  }) {
    switch (section.key) {
      // Node 534:5063 — the carousel is the only section with a live "Show all"
      // (the other two are visible:false in Figma).
      case BooksSectionKey.carousel:
        // NOT `hideHeader`d — the carousel's header carries a live "Show all"
        // affordance that must stay visible even when the nav title duplicates
        // the section title.
        return _CarouselSection(
          key: const ValueKey('books-home-carousel-section'),
          title: section.title,
          books: section.books,
          sourceListType: section.key.sourceListType,
          onShowAll: () => booksOpenAllListing(context, ref),
          showAllKey: const ValueKey('books-home-show-all'),
          rowKey: const ValueKey('books-home-carousel'),
        );
      // Node 534:5106 — a 2-column grid of coloured category cards.
      case BooksSectionKey.categories:
        return _CategoriesSection(
          key: const ValueKey('books-home-categories-section'),
          title: section.title,
          categories: section.categories,
          hideHeader: hideHeader,
        );
      // Node 534:5136. Not `hideHeader`d — the newly-added carousel has no
      // "Show all" but we don't currently hide its header either; keep parity
      // with the existing design.
      case BooksSectionKey.newlyAdded:
        return _CarouselSection(
          key: const ValueKey('books-home-newly-added-section'),
          title: section.title,
          books: section.books,
          sourceListType: section.key.sourceListType,
          rowKey: const ValueKey('books-home-newly-added'),
        );
    }
  }
}

/// A carousel section (nodes 534:5063 / 534:5136) — header + horizontal row.
class _CarouselSection extends ConsumerWidget {
  const _CarouselSection({
    super.key,
    required this.title,
    required this.books,
    required this.sourceListType,
    required this.rowKey,
    this.onShowAll,
    this.showAllKey,
  });

  final String title;
  final List<BookCardView> books;
  final String sourceListType;
  final Key rowKey;
  final VoidCallback? onShowAll;
  final Key? showAllKey;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Padding(
      padding: const EdgeInsets.all(AppBooks.sectionPadding),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          BooksSectionHeader(
            title: title,
            onShowAll: onShowAll,
            showAllKey: showAllKey,
          ),
          const SizedBox(height: AppBooks.sectionHeaderGap),
          SizedBox(
            height: AppBooks.carouselHeight,
            child: ListView.separated(
              key: rowKey,
              scrollDirection: Axis.horizontal,
              padding: EdgeInsets.zero,
              itemCount: books.length,
              separatorBuilder: (_, _) =>
                  const SizedBox(width: AppBooks.carouselGap),
              itemBuilder: (context, i) {
                final book = books[i];
                return BookCard(
                  key: ValueKey('books-card-${book.contentId}'),
                  book: book,
                  width: AppBooks.cardWidth,
                  onTap: () => booksHandleCardTap(
                    context,
                    ref,
                    book: book,
                    sourceListType: sourceListType,
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

/// Browse Categories (node 534:5106) — a 2-column grid of coloured cards.
class _CategoriesSection extends ConsumerWidget {
  const _CategoriesSection({
    super.key,
    required this.title,
    required this.categories,
    this.hideHeader = false,
  });

  /// The server's heading — 'Browse Categories' used to be a literal here.
  final String title;
  final List<BookCategoryView> categories;

  /// Suppresses [BooksSectionHeader] when the parent [BooksNav] already shows
  /// the same title (the first section on the page).
  final bool hideHeader;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Padding(
      padding: const EdgeInsets.all(AppBooks.sectionPadding),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (!hideHeader) ...[
            BooksSectionHeader(title: title),
            const SizedBox(height: AppBooks.sectionHeaderGap),
          ],
          GridView.builder(
            key: const ValueKey('books-home-category-grid'),
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            padding: EdgeInsets.zero,
            itemCount: categories.length,
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: AppBooks.categoryColumns,
              mainAxisSpacing: AppBooks.categoryGap,
              crossAxisSpacing: AppBooks.categoryGap,
              childAspectRatio:
                  AppBooks.categoryCardWidth / AppBooks.categoryCardHeight,
            ),
            itemBuilder: (context, i) => BooksCategoryCard(
              key: ValueKey('books-category-${categories[i].category.wire}'),
              category: categories[i],
              // The whole card is forwarded, so the listing opens with the
              // server's title instead of the enum's wire value.
              onTap: () => booksOpenCategory(context, ref, categories[i]),
            ),
          ),
        ],
      ),
    );
  }
}

/// A Browse-Categories card (nodes 534:5112/5116/5120/5124).
///
/// Each card owns its fill, and its artwork is the Figma image at its designed
/// 15° rotation, flush with the card's right edge and clipped by it — which is
/// exactly what the composited Figma render shows.
class BooksCategoryCard extends StatelessWidget {
  const BooksCategoryCard({
    super.key,
    required this.category,
    required this.onTap,
  });

  final BookCategoryView category;
  final VoidCallback onTap;

  Color get _fill => switch (category.category) {
        BookCategory.chalisa => AppColors.booksCategoryChalisa,
        BookCategory.aarti => AppColors.booksCategoryAarti,
        BookCategory.kavach => AppColors.booksCategoryKavach,
        BookCategory.stotram => AppColors.booksCategoryStotram,
      };

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppBooks.categoryCardRadius),
        child: ColoredBox(
          color: _fill,
          child: Stack(
            children: [
              // Positioned by its ink origin at its natural size — it runs past
              // the card's right/bottom edges and the ClipRRect above cuts it,
              // which is the design's bleed (never BoxFit.contain into the
              // clipped region: that shrinks the art).
              Positioned(
                left: AppBooks.categoryArtLeft,
                top: AppBooks.categoryArtTop,
                width: AppBooks.categoryArtWidth,
                height: AppBooks.categoryArtHeight,
                child: Image.asset(
                  BooksAssets.category(category.category),
                  fit: BoxFit.fill,
                ),
              ),
              Positioned(
                left: AppBooks.categoryLabelInset,
                top: AppBooks.categoryLabelInset,
                // Label yields where the artwork begins.
                right: AppBooks.categoryCardWidth - AppBooks.categoryArtLeft,
                child: Text(
                  category.title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: AppText.labelLg(color: AppColors.booksCategoryLabel),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Loading skeleton (screen-spec `states.loading`) — the section rhythm, calm
/// and badge-free.
class _HomeSkeleton extends StatelessWidget {
  const _HomeSkeleton();

  @override
  Widget build(BuildContext context) {
    return const Center(
      key: ValueKey('books-home-loading'),
      child: CircularProgressIndicator(color: AppColors.primaryCta),
    );
  }
}
