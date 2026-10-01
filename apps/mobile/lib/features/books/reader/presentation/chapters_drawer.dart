import 'package:flutter/material.dart';

import '../../../../core/theme.dart';
import '../../../../shared/widgets/blend_layer.dart';
import '../../data/books_models.dart';
import '../../presentation/books_widgets.dart';

/// The reader's chapters drawer — Figma `637:4191`, panel node `637:4366`.
///
/// Reader-only (r11): it is built exclusively by the major-book reader, and the
/// state's `hasChapterChrome` keeps a direct scripture from ever reaching it.
///
/// 280 wide, right-aligned, over a #000000@0.60 scrim (node 637:4459). The
/// header (637:4417) is an orange gradient with a texture that blends OVERLAY at
/// 30% — hence [BlendLayer], not a plain Image.
class ChaptersDrawer extends StatelessWidget {
  const ChaptersDrawer({
    super.key,
    required this.contents,
    required this.bookTitle,
    required this.coverImageUrl,
    required this.activeChapterId,
    required this.subBookTitle,
    required this.onSelect,
    required this.onDismiss,
  });

  final BookContents contents;
  final String bookTitle;
  final String coverImageUrl;
  final String? activeChapterId;

  /// The kanda the active chapter belongs to — the header's "पुस्तक 1 - बाल-काण्ड"
  /// line (node 637:4427).
  final String? subBookTitle;

  final ValueChanged<String> onSelect;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    final chapters = contents.readingOrder;
    return Stack(
      children: [
        // Scrim — tapping it dismisses (standard drawer affordance).
        Positioned.fill(
          child: GestureDetector(
            key: const ValueKey('books-drawer-scrim'),
            onTap: onDismiss,
            behavior: HitTestBehavior.opaque,
            child: const ColoredBox(color: AppColors.booksDrawerScrim),
          ),
        ),
        Positioned(
          top: 0,
          right: 0,
          bottom: 0,
          width: AppBooks.drawerWidth,
          child: Material(
            color: AppColors.booksDrawerSurface,
            child: Column(
              children: [
                _Header(
                  bookTitle: bookTitle,
                  coverImageUrl: coverImageUrl,
                  subBookTitle: subBookTitle,
                  totalChapters: contents.totalChapterCount,
                ),
                Expanded(
                  child: ListView.builder(
                    key: const ValueKey('books-drawer-list'),
                    padding: EdgeInsets.zero,
                    itemCount: chapters.length,
                    itemBuilder: (context, i) {
                      final chapter = chapters[i];
                      final active = chapter.chapterId == activeChapterId;
                      return _ChapterRow(
                        key: ValueKey('books-drawer-chapter-${chapter.chapterId}'),
                        title: chapter.title,
                        active: active,
                        onTap: () => onSelect(chapter.chapterId),
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

/// Drawer header (node 637:4417) — cover + book title + kanda + total chapters.
class _Header extends StatelessWidget {
  const _Header({
    required this.bookTitle,
    required this.coverImageUrl,
    required this.subBookTitle,
    required this.totalChapters,
  });

  final String bookTitle;
  final String coverImageUrl;
  final String? subBookTitle;
  final int totalChapters;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: AppBooks.drawerHeaderHeight,
      child: Stack(
        fit: StackFit.expand,
        children: [
          const DecoratedBox(
            decoration: BoxDecoration(gradient: AppGradient.booksDrawerHeader),
          ),
          // Node 637:4418 — opacity 0.30, blendMode OVERLAY.
          BlendLayer(
            blendMode: BlendMode.overlay,
            opacity: AppBooks.drawerTextureOpacity,
            child: Image.asset(
              BooksAssets.drawerHeaderTexture,
              fit: BoxFit.cover,
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(AppBooks.drawerHeaderPadding),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // The `sm` card variant (node 637:4420) — title hidden.
                BookCard(
                  key: const ValueKey('books-drawer-cover'),
                  book: BookCardView(
                    contentId: '',
                    contentType: BookContentType.majorBook,
                    category: null,
                    title: bookTitle,
                    coverImageUrl: coverImageUrl,
                    author: null,
                    languages: const [],
                    offlineCacheEligible: false,
                  ),
                  width: AppBooks.cardWidthSm,
                  showTitle: false,
                ),
                const SizedBox(width: AppBooks.drawerDetailsInset),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(top: AppBooks.drawerDetailsTop),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          bookTitle,
                          key: const ValueKey('books-drawer-title'),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: AppText.booksDrawerTitle(),
                        ),
                        if (subBookTitle != null) ...[
                          const SizedBox(height: AppSpacing.xxxSmall),
                          Text(
                            subBookTitle!,
                            key: const ValueKey('books-drawer-subbook'),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: AppText.booksDrawerMeta(),
                          ),
                        ],
                        const Spacer(),
                        Text(
                          'Total Chapters: $totalChapters',
                          key: const ValueKey('books-drawer-total'),
                          style: AppText.booksDrawerMeta(),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// One chapter row (nodes 637:4369 active / 637:4371 idle).
class _ChapterRow extends StatelessWidget {
  const _ChapterRow({
    super.key,
    required this.title,
    required this.active,
    required this.onTap,
  });

  final String title;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        constraints: const BoxConstraints(minHeight: AppBooks.drawerRowHeight),
        color: active ? AppColors.booksDrawerActiveFill : null,
        padding: const EdgeInsets.symmetric(
          horizontal: AppBooks.drawerRowPaddingH,
          vertical: AppBooks.drawerRowPaddingV,
        ),
        alignment: Alignment.centerLeft,
        child: Text(
          title,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: AppText.booksDrawerChapter(
            color: active
                ? AppColors.booksDrawerChapterActive
                : AppColors.booksDrawerChapterIdle,
          ),
        ),
      ),
    );
  }
}
