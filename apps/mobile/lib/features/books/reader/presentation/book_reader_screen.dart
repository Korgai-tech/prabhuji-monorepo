import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/theme.dart';
import '../../../../core/user_properties.dart';
import '../../../paywall/paywall_analytics.dart';
import '../../../paywall/presentation/paywall_screen.dart';
import '../../presentation/books_widgets.dart';
import '../bloc/book_reader_bloc.dart';
import '../bloc/book_reader_event.dart';
import '../bloc/book_reader_state.dart';
import 'chapters_drawer.dart';
import 'font_size_overlay.dart';

/// BOTH readers — Figma `620:3904` (major book) and `647:4133` (direct
/// scripture).
///
/// One screen, two modes, because the frames are structurally the same column
/// (warm surface → title → body) and differ only in the chrome the major-book
/// frame adds. `state.hasChapterChrome` / `state.canListen` drive that, so a
/// direct scripture can never render Listen Audio, Prev/Next or the drawer
/// (r11) — the frames' own `visible:false` flags say exactly this
/// (I647:4139;5186:10380 is hidden, I647:4139;5186:10379 is not).
///
/// Reading is Pro-gated SERVER-side: a `403` renders nothing and bounces to the
/// paywall. Body text is rendered VERBATIM — line breaks preserved, never
/// truncated, always scrollable (PRD §15).
class BookReaderScreen extends ConsumerWidget {
  const BookReaderScreen({super.key, required this.bookTitle, this.coverImageUrl = ''});

  /// The BOOK title (drawer header). The nav shows the KANDA name instead —
  /// node I620:3917;5186:10376 renders 'बाल-काण्ड', not the book.
  final String bookTitle;
  final String coverImageUrl;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      // Node 620:3904 fill — a FLAT warm surface, not the home gradient.
      backgroundColor: AppColors.booksReaderSurface,
      body: SafeArea(
        bottom: false,
        child: BlocConsumer<BookReaderBloc, BookReaderState>(
          listenWhen: (prev, next) =>
              next.status == BookReaderStatus.proRequired &&
              prev.status != BookReaderStatus.proRequired,
          listener: (context, state) => unawaited(context.push(
            '/paywall',
            extra: const PaywallArgs(
              triggerModule: UserPropertyModule.books,
              triggerAction: PaywallTriggerAction.openBook,
              entrySource: PaywallEntrySource.feature,
            ),
          )),
          builder: (context, state) {
            return Stack(
              children: [
                Column(
                  children: [
                    _ReaderNav(state: state),
                    Expanded(child: _Body(state: state)),
                  ],
                ),
                // Overlays sit under the nav, over the text (node 620:3844 at
                // y=116 = the nav's bottom edge).
                if (state.fontOverlayOpen)
                  Positioned(
                    top: AppBooks.navHeight,
                    left: 0,
                    right: 0,
                    child: FontSizeOverlay(
                      key: const ValueKey('books-font-overlay'),
                      fontSize: state.fontSize,
                      onChanged: (size) => context
                          .read<BookReaderBloc>()
                          .add(BookReaderFontSizeChanged(size)),
                    ),
                  ),
                if (state.drawerOpen && state.contents != null)
                  Positioned(
                    top: AppBooks.navHeight,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    child: ChaptersDrawer(
                      key: const ValueKey('books-chapters-drawer'),
                      contents: state.contents!,
                      bookTitle: bookTitle,
                      coverImageUrl: coverImageUrl,
                      activeChapterId: state.chapterId,
                      subBookTitle: state.subBookTitle,
                      onSelect: (id) => context
                          .read<BookReaderBloc>()
                          .add(BookReaderChapterSelected(id)),
                      onDismiss: () => context
                          .read<BookReaderBloc>()
                          .add(const BookReaderDrawerToggled(open: false)),
                    ),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}

/// Reader nav (node 620:3917) — back + kanda title + font-settings + chapters.
class _ReaderNav extends StatelessWidget {
  const _ReaderNav({required this.state});
  final BookReaderState state;

  @override
  Widget build(BuildContext context) {
    final bloc = context.read<BookReaderBloc>();
    return BooksNav(
      key: const ValueKey('books-reader-nav'),
      // Node I620:3917;5186:10376 = the kanda name; a loose chapter or a
      // scripture has none, so the reader falls back to its own title.
      title: state.subBookTitle ?? state.title,
      onBack: () => context.pop(),
      actions: [
        BooksNavAction(
          key: const ValueKey('books-reader-font-btn'),
          asset: BooksAssets.fontSettings,
          onTap: () => bloc.add(
            BookReaderFontOverlayToggled(open: !state.fontOverlayOpen),
          ),
        ),
        // Reader-only chrome (r11): the scripture frame hides this slot.
        if (state.hasChapterChrome)
          BooksNavAction(
            key: const ValueKey('books-reader-drawer-btn'),
            asset: BooksAssets.chaptersList,
            // Node I637:4196;…;620:4063 — the glyph turns orange while open.
            color: state.drawerOpen
                ? AppColors.booksReaderNavIconActive
                : AppColors.booksReaderNavIcon,
            onTap: () => bloc.add(
              BookReaderDrawerToggled(open: !state.drawerOpen),
            ),
          ),
      ],
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({required this.state});
  final BookReaderState state;

  @override
  Widget build(BuildContext context) {
    final bloc = context.read<BookReaderBloc>();

    return switch (state.status) {
      BookReaderStatus.loading => const Center(
          key: ValueKey('books-reader-loading'),
          child: CircularProgressIndicator(color: AppColors.primaryCta),
        ),
      // Pro gate — render NOTHING (the listener pushes the paywall).
      BookReaderStatus.proRequired =>
        const SizedBox.shrink(key: ValueKey('books-reader-pro')),
      BookReaderStatus.offlineUnavailable => Center(
          child: BooksMessage(
            key: const ValueKey('books-reader-offline'),
            message: 'This chapter is not available offline yet.\n'
                'Reconnect to read it, then it will be saved for later.',
            retryKey: const ValueKey('books-reader-offline-retry'),
            onRetry: () => bloc.add(const BookReaderRetried()),
          ),
        ),
      BookReaderStatus.failure => Center(
          child: BooksMessage(
            key: const ValueKey('books-reader-error'),
            message: 'Could not open this reading. Please try again.',
            retryKey: const ValueKey('books-reader-retry'),
            onRetry: () => bloc.add(const BookReaderRetried()),
          ),
        ),
      BookReaderStatus.ready => _ReaderColumn(state: state),
    };
  }
}

/// The reading column (node 620:4077) — 16h/32top/10bottom padding, 22 gaps.
class _ReaderColumn extends StatelessWidget {
  const _ReaderColumn({required this.state});
  final BookReaderState state;

  @override
  Widget build(BuildContext context) {
    final bloc = context.read<BookReaderBloc>();

    return SingleChildScrollView(
      key: const ValueKey('books-reader-scroll'),
      padding: const EdgeInsets.only(
        left: AppBooks.readerPaddingH,
        right: AppBooks.readerPaddingH,
        top: AppBooks.readerPaddingTop,
        bottom: AppBooks.readerPaddingBottom,
      ),
      // `stretch`, not `start`: node 620:4077 is a VERTICAL auto-layout whose
      // children fill the 328 column (title 621:4078 and body 620:4076 are both
      // 328 wide). With `start` the Text nodes shrink-wrap — the wrap width is
      // the same, but the design's left-aligned block becomes a hugging one, so
      // any later change of textAlign would silently drift.
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            state.title,
            key: const ValueKey('books-reader-title'),
            style: AppText.booksReaderTitle(),
          ),
          // Listen Audio (node 663:7474) — shown ONLY when the chapter carries an
          // audioUrl; hidden otherwise, never disabled (PRD §10). Centred, as in
          // the frame (x=116, w=127 on a 360 frame).
          if (state.canListen) ...[
            const SizedBox(height: AppBooks.readerBlockGap),
            Center(
              child: BooksGradientButton(
                key: const ValueKey('books-reader-listen'),
                // Component variants 663:4296 (Listen) / 663:4295 (Pause).
                label: state.playing ? 'Pause' : 'Listen Audio',
                iconAsset: state.playing
                    ? BooksAssets.listenPause
                    : BooksAssets.listenPlay,
                onTap: () => bloc.add(const BookReaderListenToggled()),
              ),
            ),
          ],
          const SizedBox(height: AppBooks.readerBlockGap),
          // The body: VERBATIM. `softWrap` + no maxLines/overflow means line
          // breaks survive and the text is never truncated; the parent scrolls.
          Text(
            state.body,
            key: const ValueKey('books-reader-body'),
            softWrap: true,
            style: AppText.booksReaderBody(fontSize: state.fontSize),
          ),
          // Prev/Next (node 663:4305) — reader-only, disabled at the ends (q5).
          if (state.hasChapterChrome) ...[
            const SizedBox(height: AppBooks.readerBlockGap),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                BooksGradientButton(
                  key: const ValueKey('books-reader-previous'),
                  label: 'Previous',
                  iconAsset: BooksAssets.skipBackward,
                  enabled: state.canGoPrevious,
                  onTap: () => bloc.add(const BookReaderPreviousRequested()),
                ),
                BooksGradientButton(
                  key: const ValueKey('books-reader-next'),
                  label: 'Next',
                  iconAsset: BooksAssets.skipForward,
                  iconLeading: false,
                  enabled: state.canGoNext,
                  onTap: () => bloc.add(const BookReaderNextRequested()),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
