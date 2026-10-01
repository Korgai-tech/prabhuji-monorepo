import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/theme.dart';
import '../../../../core/user_properties.dart';
import '../../../paywall/paywall_analytics.dart';
import '../../../paywall/presentation/paywall_screen.dart';
import '../../books_routes.dart';
import '../../data/books_models.dart';
import '../../presentation/books_widgets.dart';
import '../bloc/book_contents_bloc.dart';
import '../bloc/book_contents_event.dart';
import '../bloc/book_contents_state.dart';

/// Book Contents — Figma `639:3947`. Major books only, Pro-gated server-side.
///
/// A `403` renders NOTHING and bounces to the paywall — the client never shows a
/// preview (#EXPORT_CRITICAL). Reached only via `BooksTapHandler`, so a free user
/// normally sees the paywall before ever getting here; the 403 branch covers the
/// entitlement expiring mid-session or a deep link.
class BookContentsScreen extends ConsumerWidget {
  const BookContentsScreen({super.key, required this.card});

  /// The tapped card — supplies the cover/title so the hero paints instantly
  /// while `/contents` is in flight.
  final BookCardView? card;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return DecoratedBox(
      decoration: const BoxDecoration(gradient: AppGradient.booksScaffold),
      child: Scaffold(
        backgroundColor: Colors.transparent,
        body: SafeArea(
          bottom: false,
          child: BlocConsumer<BookContentsBloc, BookContentsState>(
            listenWhen: (prev, next) =>
                next.status == BookContentsStatus.proRequired &&
                prev.status != BookContentsStatus.proRequired,
            listener: (context, state) {
              // Server said Pro-only → the paywall IS the screen. Never a preview.
              unawaited(context.push(
                '/paywall',
                extra: const PaywallArgs(
                  triggerModule: UserPropertyModule.books,
                  triggerAction: PaywallTriggerAction.openBook,
                  entrySource: PaywallEntrySource.feature,
                ),
              ));
            },
            builder: (context, state) => switch (state.status) {
              BookContentsStatus.loading => const _ContentsChrome(
                  child: Center(
                    key: ValueKey('books-contents-loading'),
                    child: CircularProgressIndicator(color: AppColors.primaryCta),
                  ),
                ),
              BookContentsStatus.proRequired => const _ContentsChrome(
                  child: SizedBox.shrink(key: ValueKey('books-contents-pro')),
                ),
              BookContentsStatus.failure => _ContentsChrome(
                  child: Center(
                    child: BooksMessage(
                      key: const ValueKey('books-contents-error'),
                      message: state.offline
                          ? 'You seem to be offline. Please check your connection.'
                          : 'Could not load this book. Please try again.',
                      retryKey: const ValueKey('books-contents-retry'),
                      onRetry: () => context
                          .read<BookContentsBloc>()
                          .add(const BookContentsRetried()),
                    ),
                  ),
                ),
              BookContentsStatus.ready => _ContentsBody(
                  contents: state.contents!,
                  coverImageUrl:
                      card?.coverImageUrl ?? state.contents!.coverImageUrl,
                ),
            },
          ),
        ),
      ),
    );
  }
}

/// The nav that's present in every state.
class _ContentsChrome extends StatelessWidget {
  const _ContentsChrome({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        BooksNav(
          key: const ValueKey('books-contents-nav'),
          onBack: () => context.pop(),
        ),
        Expanded(child: child),
      ],
    );
  }
}

class _ContentsBody extends ConsumerWidget {
  const _ContentsBody({required this.contents, required this.coverImageUrl});

  final BookContents contents;
  final String coverImageUrl;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Frame-relative geometry is quoted from the 52px-status-bar frame; SafeArea
    // already consumed that, so the offsets shift up by 52.
    const statusBar = 52.0;
    final first = contents.firstChapter;

    // Every child is Positioned + StackFit.expand: a non-positioned child would
    // collapse the Stack to its own height (the 64px nav) and squash the panel.
    return Stack(
      fit: StackFit.expand,
      children: [
        // The chapters panel is full-bleed white from y=393 (node 639:4029) and
        // scrolls under everything above it.
        Positioned(
          top: AppBooks.contentsPanelTop - statusBar,
          left: 0,
          right: 0,
          bottom: 0,
          child: _ChaptersPanel(contents: contents, coverImageUrl: coverImageUrl),
        ),
        // Nav paints BEFORE the cover — node order (663:7564 then 639:4019) has
        // the cover on top, overlapping the nav's lower edge by ~17px.
        Positioned(
          top: 0,
          left: 0,
          right: 0,
          child: BooksNav(
            key: const ValueKey('books-contents-nav'),
            onBack: () => context.pop(),
          ),
        ),
        Positioned(
          top: AppBooks.contentsCardTop - statusBar,
          left: 0,
          right: 0,
          child: Center(
            child: BookCard(
              key: const ValueKey('books-contents-hero'),
              book: BookCardView(
                contentId: contents.contentId,
                contentType: BookContentType.majorBook,
                category: null,
                title: contents.title,
                coverImageUrl: coverImageUrl,
                author: contents.author,
                languages: contents.languages,
                offlineCacheEligible: contents.offlineCacheEligible,
              ),
              width: AppBooks.cardWidth,
            ),
          ),
        ),
        // Start Reading (node 639:4105) — opens the reader at the FIRST chapter
        // of the reading order (q5). Hidden when the book has no chapters at all.
        if (first != null)
          Positioned(
            top: AppBooks.contentsCtaTop - statusBar,
            left: 0,
            right: 0,
            child: Center(
              child: BooksGradientButton(
                key: const ValueKey('books-contents-start-reading'),
                label: 'Start Reading',
                compact: true,
                onTap: () => _openReader(context, ref, first.chapterId,
                    startReading: true),
              ),
            ),
          ),
      ],
    );
  }

  void _openReader(
    BuildContext context,
    WidgetRef ref,
    String chapterId, {
    bool startReading = false,
  }) {
    // Books analytics is out of scope for the current contract (Sheet 1
    // has zero Books events). Signature intentionally still accepts `ref`
    // and `startReading` so re-adding tracking later needs no call-site
    // change.
    unawaited(context.push(
      BooksRoutes.read(contents.contentId),
      extra: BookReaderArgs(
        contentId: contents.contentId,
        title: contents.title,
        chapterId: chapterId,
        contents: contents,
        coverImageUrl: coverImageUrl,
      ),
    ));
  }
}

/// The white "Chapters List" panel (node 639:4029).
///
/// Renders the kanda list when the book HAS sub-books, and falls straight
/// through to a chapter list when it doesn't — a major book with loose chapters
/// and no kanda level is legal in the contract and must render just as happily.
class _ChaptersPanel extends ConsumerWidget {
  const _ChaptersPanel({required this.contents, required this.coverImageUrl});

  final BookContents contents;
  final String coverImageUrl;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final subBooks = [...contents.subBooks]
      ..sort((a, b) => a.order.compareTo(b.order));
    final loose = [...contents.chapters]
      ..sort((a, b) => a.order.compareTo(b.order));

    return ColoredBox(
      color: AppColors.booksContentsPanel,
      child: ListView(
        key: const ValueKey('books-contents-list'),
        padding: EdgeInsets.zero,
        children: [
          for (var i = 0; i < subBooks.length; i++)
            _Row(
              key: ValueKey('books-subbook-${subBooks[i].subBookId}'),
              // The design numbers the kandas ("1. Bala Kanda …", node 639:4046).
              title: '${i + 1}. ${subBooks[i].title}',
              trailing: '${subBooks[i].chapterCount} chapters',
              onTap: () => _open(context, ref, _firstOf(subBooks[i])),
            ),
          for (final chapter in loose)
            _Row(
              key: ValueKey('books-chapter-${chapter.chapterId}'),
              title: chapter.title,
              onTap: () => _open(context, ref, chapter.chapterId),
            ),
        ],
      ),
    );
  }

  String? _firstOf(BookSubBookView subBook) {
    if (subBook.chapters.isEmpty) return null;
    final sorted = [...subBook.chapters]..sort((a, b) => a.order.compareTo(b.order));
    return sorted.first.chapterId;
  }

  void _open(BuildContext context, WidgetRef ref, String? chapterId) {
    if (chapterId == null) return; // an empty kanda is a no-op, never a crash
    unawaited(context.push(
      BooksRoutes.read(contents.contentId),
      extra: BookReaderArgs(
        contentId: contents.contentId,
        title: contents.title,
        chapterId: chapterId,
        contents: contents,
        coverImageUrl: coverImageUrl,
      ),
    ));
  }
}

/// One kanda/chapter row (node 639:4045) — title left, count right.
class _Row extends StatelessWidget {
  const _Row({
    super.key,
    required this.title,
    required this.onTap,
    this.trailing,
  });

  final String title;
  final String? trailing;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        constraints: const BoxConstraints(minHeight: AppBooks.contentsRowHeight),
        padding: const EdgeInsets.symmetric(
          horizontal: AppBooks.contentsRowPaddingH,
          vertical: AppBooks.contentsRowPaddingV,
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppText.booksContentsItem(),
              ),
            ),
            if (trailing != null) ...[
              const SizedBox(width: AppSpacing.xSmall),
              Text(trailing!, style: AppText.booksContentsCount()),
            ],
          ],
        ),
      ),
    );
  }
}
