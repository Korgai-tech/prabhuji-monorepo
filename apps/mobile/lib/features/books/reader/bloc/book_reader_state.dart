import 'package:equatable/equatable.dart';

import '../../../../core/theme.dart';
import '../../data/books_models.dart';

/// Which reader is on screen — the two Figma frames differ structurally, not
/// cosmetically (#PATH_DECISION).
enum BookReaderMode {
  /// 620:3904 — chapter title, Listen Audio, Prev/Next, chapters drawer.
  majorBook,

  /// 647:4133 — the scripture body only: no audio, no drawer, no Prev/Next.
  directScripture,
}

enum BookReaderStatus {
  loading,
  ready,

  /// `403` — server Pro gate. Renders nothing; routes to the paywall.
  proRequired,

  /// Offline AND this content was never cached (q3/r12) — the
  /// offline-unavailable state + Retry. NOT a blank reader.
  offlineUnavailable,

  failure,
}

/// State of both readers (Figma 620:3904 / 647:4133).
class BookReaderState extends Equatable {
  const BookReaderState({
    required this.mode,
    this.status = BookReaderStatus.loading,
    this.title = '',
    this.body = '',
    this.chapterId,
    this.subBookTitle,
    this.contents,
    this.audioUrl,
    this.playing = false,
    this.drawerOpen = false,
    this.fontOverlayOpen = false,
    this.fontSize = AppBooks.readerFontDefault,
    this.fromCache = false,
  });

  final BookReaderMode mode;
  final BookReaderStatus status;

  /// Chapter title (major) or scripture title (direct) — the reader's H1.
  final String title;

  /// Devanagari body, rendered VERBATIM (line breaks preserved, never
  /// truncated).
  final String body;

  final String? chapterId;

  /// The kanda name the nav renders (node I620:3917;5186:10376). `null` for a
  /// loose chapter or a direct scripture.
  final String? subBookTitle;

  /// The book hierarchy — drives Prev/Next + the drawer. `null` for scripture.
  final BookContents? contents;

  /// Resolved narration URL for THIS chapter; `null`/blank ⇒ the Listen Audio
  /// button is HIDDEN (PRD §10). Always `null` for direct scripture.
  final String? audioUrl;

  final bool playing;
  final bool drawerOpen;
  final bool fontOverlayOpen;

  /// Global reader font size (q4/r10) — restored on open, persisted on change.
  final double fontSize;

  /// This body came from the offline cache — drives `books_offline_cache_hit`.
  final bool fromCache;

  /// Data-driven Listen Audio visibility. Direct scripture can never show it.
  bool get canListen =>
      mode == BookReaderMode.majorBook && (audioUrl ?? '').trim().isNotEmpty;

  /// Reader-only chrome (r11) — the drawer/Prev/Next never exist outside the
  /// major-book reader.
  bool get hasChapterChrome => mode == BookReaderMode.majorBook;

  /// The flat reading order Prev/Next walk.
  List<BookChapterSummaryView> get readingOrder =>
      contents?.readingOrder ?? const [];

  int get currentIndex {
    final id = chapterId;
    if (id == null) return -1;
    return readingOrder.indexWhere((c) => c.chapterId == id);
  }

  /// q5 — Previous is DISABLED on the first chapter (no wrap-around, no
  /// cross-book navigation).
  bool get canGoPrevious => hasChapterChrome && currentIndex > 0;

  /// q5 — Next is DISABLED on the last chapter.
  bool get canGoNext =>
      hasChapterChrome &&
      currentIndex >= 0 &&
      currentIndex < readingOrder.length - 1;

  BookReaderState copyWith({
    BookReaderStatus? status,
    String? title,
    String? body,
    String? chapterId,
    String? subBookTitle,
    bool clearSubBookTitle = false,
    BookContents? contents,
    String? audioUrl,
    bool clearAudioUrl = false,
    bool? playing,
    bool? drawerOpen,
    bool? fontOverlayOpen,
    double? fontSize,
    bool? fromCache,
  }) {
    return BookReaderState(
      mode: mode,
      status: status ?? this.status,
      title: title ?? this.title,
      body: body ?? this.body,
      chapterId: chapterId ?? this.chapterId,
      subBookTitle:
          clearSubBookTitle ? null : (subBookTitle ?? this.subBookTitle),
      contents: contents ?? this.contents,
      audioUrl: clearAudioUrl ? null : (audioUrl ?? this.audioUrl),
      playing: playing ?? this.playing,
      drawerOpen: drawerOpen ?? this.drawerOpen,
      fontOverlayOpen: fontOverlayOpen ?? this.fontOverlayOpen,
      fontSize: fontSize ?? this.fontSize,
      fromCache: fromCache ?? this.fromCache,
    );
  }

  @override
  List<Object?> get props => [
        mode,
        status,
        title,
        body,
        chapterId,
        subBookTitle,
        contents,
        audioUrl,
        playing,
        drawerOpen,
        fontOverlayOpen,
        fontSize,
        fromCache,
      ];
}
