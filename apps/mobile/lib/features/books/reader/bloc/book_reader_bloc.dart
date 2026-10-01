// Private-field ctor params can't use initializing formals.
// ignore_for_file: prefer_initializing_formals

import 'dart:async';

import 'package:bloc/bloc.dart';

import '../../../../core/analytics.dart';
import '../../../audio/domain/audio_item.dart';
import '../../data/books_models.dart';
import '../../data/books_repository.dart';
import '../../data/offline_text_cache.dart';
import '../../data/reader_font_prefs.dart';
import 'book_reader_event.dart';
import 'book_reader_state.dart';
import 'reader_audio_port.dart';

/// Drives BOTH readers (TAM-76 AC "Book Reader" + "Non-Book Reader").
///
/// One bloc, two modes ([BookReaderMode]) because the flows share everything
/// that matters — body rendering, the global font size, the offline text cache,
/// the server Pro gate — and differ only in the chrome the major-book frame adds
/// (Listen Audio, Prev/Next, chapters drawer). The mode is fixed at construction
/// and [BookReaderState] derives all of that chrome from it, so a direct
/// scripture structurally cannot grow a drawer or a Next button (r11).
///
/// Reading + caching rules encoded here:
///  * **Pro gate is the server's** (TAM-75). A `403` → [BookReaderStatus.proRequired]
///    with no body; the screen routes to the paywall and NEVER previews.
///  * **Offline text cache** (r12/q2): every successful read is cached when the
///    server marked it `offlineCacheEligible`; an `offline` failure falls back to
///    the cache → `books_offline_cache_hit`, and a miss → `books_offline_cache_miss`
///    + the offline-unavailable state with Retry (q3). Audio is never cached.
///  * **Font size is global** (q4/r10): restored on open, persisted on change,
///    never scoped to a book.
class BookReaderBloc extends Bloc<BookReaderEvent, BookReaderState> {
  BookReaderBloc({
    required BooksRepository repository,
    required OfflineTextCache cache,
    required ReaderFontPrefs fontPrefs,
    required String contentId,
    required BookReaderMode mode,
    BookReaderAudioPort? audio,
    BookContents? contents,
    String? initialChapterId,
    // Books analytics is out of scope for the current contract (Sheet 1
    // has zero Books events); the ctor param is retained so existing call
    // sites don't break and re-adding tracking later is one line.
    // ignore: avoid_unused_constructor_parameters -- see class dartdoc
    Analytics? analytics,
  })  : _repository = repository,
        _cache = cache,
        _fontPrefs = fontPrefs,
        _contentId = contentId,
        _audio = audio,
        _seedContents = contents,
        _initialChapterId = initialChapterId,
        super(BookReaderState(mode: mode)) {
    on<BookReaderStarted>(_onStarted);
    on<BookReaderRetried>(_onRetried);
    on<BookReaderPreviousRequested>(_onPrevious);
    on<BookReaderNextRequested>(_onNext);
    on<BookReaderChapterSelected>(_onChapterSelected);
    on<BookReaderDrawerToggled>(_onDrawerToggled);
    on<BookReaderFontOverlayToggled>(_onFontOverlayToggled);
    on<BookReaderFontSizeChanged>(_onFontSizeChanged);
    on<BookReaderListenToggled>(_onListenToggled);
  }

  final BooksRepository _repository;
  final OfflineTextCache _cache;
  final ReaderFontPrefs _fontPrefs;
  final String _contentId;
  final BookReaderAudioPort? _audio;
  final BookContents? _seedContents;
  final String? _initialChapterId;
  String get contentId => _contentId;

  Future<void> _onStarted(
    BookReaderStarted event,
    Emitter<BookReaderState> emit,
  ) async {
    // Restore the persisted global size BEFORE the first paint of any body, so
    // the reader never flashes at the default and reflow to the user's size.
    final size = await _fontPrefs.load();
    emit(state.copyWith(fontSize: size));
    await _load(emit);
  }

  Future<void> _onRetried(
    BookReaderRetried event,
    Emitter<BookReaderState> emit,
  ) =>
      _load(emit);

  Future<void> _load(Emitter<BookReaderState> emit) async {
    emit(state.copyWith(status: BookReaderStatus.loading));
    if (state.mode == BookReaderMode.directScripture) {
      await _loadScripture(emit);
      return;
    }
    await _loadMajor(emit);
  }

  // ---- Direct scripture (647:4133) ------------------------------------------

  Future<void> _loadScripture(Emitter<BookReaderState> emit) async {
    try {
      final scripture = await _repository.fetchScripture(_contentId);
      unawaited(_cache.putScripture(
        contentId: _contentId,
        title: scripture.title,
        contentBody: scripture.contentBody,
        eligible: scripture.offlineCacheEligible,
      ));
      emit(state.copyWith(
        status: BookReaderStatus.ready,
        title: scripture.title,
        body: scripture.contentBody,
        fromCache: false,
        clearAudioUrl: true, // scripture never narrates (PRD §10)
      ));
    } catch (error) {
      await _recover(
        emit,
        error,
        readCache: () => _cache.getScripture(_contentId),
      );
    }
  }

  // ---- Major book (620:3904) ------------------------------------------------

  Future<void> _loadMajor(Emitter<BookReaderState> emit) async {
    var contents = state.contents ?? _seedContents;
    // Contents normally arrive via the route extra (Contents → reader). A deep
    // link / post-purchase resume may not have them — fetch once.
    if (contents == null) {
      try {
        contents = await _repository.fetchContents(_contentId);
      } catch (error) {
        await _failFromError(emit, error);
        return;
      }
    }
    final chapterId = state.chapterId ??
        _initialChapterId ??
        contents.firstChapter?.chapterId;
    if (chapterId == null) {
      emit(state.copyWith(status: BookReaderStatus.failure, contents: contents));
      return;
    }
    emit(state.copyWith(contents: contents, chapterId: chapterId));
    await _loadChapter(emit, chapterId);
  }

  Future<void> _loadChapter(
    Emitter<BookReaderState> emit,
    String chapterId,
  ) async {
    try {
      final chapter = await _repository.fetchChapter(_contentId, chapterId);
      unawaited(_cache.putChapter(
        contentId: _contentId,
        chapterId: chapterId,
        title: chapter.title,
        bodyText: chapter.bodyText,
        eligible: chapter.offlineCacheEligible,
      ));
      emit(state.copyWith(
        status: BookReaderStatus.ready,
        title: chapter.title,
        body: chapter.bodyText,
        chapterId: chapterId,
        subBookTitle: state.contents?.subBookOf(chapterId)?.title,
        clearSubBookTitle: state.contents?.subBookOf(chapterId) == null,
        audioUrl: chapter.canListen ? chapter.audioUrl : null,
        clearAudioUrl: !chapter.canListen,
        playing: false,
        fromCache: false,
      ));
    } catch (error) {
      await _recover(
        emit,
        error,
        readCache: () => _cache.getChapter(_contentId, chapterId),
        chapterId: chapterId,
      );
    }
  }

  // ---- Failure / offline recovery -------------------------------------------

  /// The offline path (r12): a network failure is only fatal if the content was
  /// never cached. A cached body reads normally — that is the whole point of the
  /// feature for the "older/traveling users with poor connectivity" this serves.
  Future<void> _recover(
    Emitter<BookReaderState> emit,
    Object error, {
    required Future<CachedText?> Function() readCache,
    String? chapterId,
  }) async {
    final kind = error is BooksException ? error.kind : BooksErrorKind.unknown;
    if (kind != BooksErrorKind.offline) {
      await _failFromError(emit, error);
      return;
    }

    final cached = await readCache();
    if (cached != null) {
      emit(state.copyWith(
        status: BookReaderStatus.ready,
        title: cached.title,
        body: cached.body,
        chapterId: chapterId,
        // Cached TEXT never carries audio (audio is never cached — Phase 2).
        clearAudioUrl: true,
        playing: false,
        fromCache: true,
      ));
      return;
    }

    emit(state.copyWith(status: BookReaderStatus.offlineUnavailable));
  }

  Future<void> _failFromError(
    Emitter<BookReaderState> emit,
    Object error,
  ) async {
    final kind = error is BooksException ? error.kind : BooksErrorKind.unknown;
    emit(state.copyWith(
      status: switch (kind) {
        BooksErrorKind.proRequired => BookReaderStatus.proRequired,
        BooksErrorKind.offline => BookReaderStatus.offlineUnavailable,
        _ => BookReaderStatus.failure,
      },
    ));
  }

  // ---- Navigation (q5: no wrap-around) --------------------------------------

  Future<void> _onPrevious(
    BookReaderPreviousRequested event,
    Emitter<BookReaderState> emit,
  ) async {
    if (!state.canGoPrevious) return; // disabled on the first chapter
    final target = state.readingOrder[state.currentIndex - 1];
    await _switchTo(emit, target.chapterId);
  }

  Future<void> _onNext(
    BookReaderNextRequested event,
    Emitter<BookReaderState> emit,
  ) async {
    if (!state.canGoNext) return; // disabled on the last chapter
    final target = state.readingOrder[state.currentIndex + 1];
    await _switchTo(emit, target.chapterId);
  }

  Future<void> _onChapterSelected(
    BookReaderChapterSelected event,
    Emitter<BookReaderState> emit,
  ) async {
    // Selecting from the drawer closes it — the reader is the destination.
    emit(state.copyWith(drawerOpen: false));
    await _switchTo(emit, event.chapterId);
  }

  /// Leaving a chapter stops its narration: audio is per-chapter, so carrying it
  /// into the next chapter's text would be wrong.
  Future<void> _switchTo(
    Emitter<BookReaderState> emit,
    String chapterId,
  ) async {
    if (state.playing) await _audio?.stop();
    emit(state.copyWith(
      status: BookReaderStatus.loading,
      chapterId: chapterId,
      playing: false,
    ));
    await _loadChapter(emit, chapterId);
  }

  // ---- Overlays -------------------------------------------------------------

  void _onDrawerToggled(
    BookReaderDrawerToggled event,
    Emitter<BookReaderState> emit,
  ) {
    if (!state.hasChapterChrome) return; // reader-only (r11)
    // The two overlays are mutually exclusive — the design never stacks them.
    emit(state.copyWith(drawerOpen: event.open, fontOverlayOpen: false));
  }

  void _onFontOverlayToggled(
    BookReaderFontOverlayToggled event,
    Emitter<BookReaderState> emit,
  ) {
    emit(state.copyWith(fontOverlayOpen: event.open, drawerOpen: false));
  }

  Future<void> _onFontSizeChanged(
    BookReaderFontSizeChanged event,
    Emitter<BookReaderState> emit,
  ) async {
    final size = clampFontSize(event.size);
    if (size == state.fontSize) return;
    emit(state.copyWith(fontSize: size));
    await _fontPrefs.save(size); // global + local (q4/r10)
  }

  // ---- Audio (TAM-59 shared engine — no bespoke player) ---------------------

  Future<void> _onListenToggled(
    BookReaderListenToggled event,
    Emitter<BookReaderState> emit,
  ) async {
    final url = state.audioUrl;
    final audio = _audio;
    // Structurally unreachable when the button is hidden; guarded anyway so a
    // stray event can never start a null-URL playback.
    if (audio == null || !state.canListen || url == null) return;

    if (state.playing) {
      await audio.pause();
      emit(state.copyWith(playing: false));
      return;
    }

    final itemId = _audioItemId;
    if (audio.isPlaying(itemId)) {
      await audio.resume();
    } else {
      await audio.play(AudioItem(
        id: itemId,
        title: state.title,
        audioUrl: url,
        subtitle: state.subBookTitle,
      ));
    }
    emit(state.copyWith(playing: true));
  }

  /// Stable id for the shared controller — chapter-scoped so re-tapping Listen
  /// on the SAME chapter resumes rather than restarting.
  String get _audioItemId => 'book:$_contentId:${state.chapterId ?? ''}';
}
