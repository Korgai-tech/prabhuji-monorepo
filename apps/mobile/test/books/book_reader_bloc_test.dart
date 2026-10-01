import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme.dart';
import 'package:mobile/features/books/data/books_repository.dart';
import 'package:mobile/features/books/data/offline_text_cache.dart';
import 'package:mobile/features/books/data/reader_font_prefs.dart';
import 'package:mobile/features/books/reader/bloc/book_reader_bloc.dart';
import 'package:mobile/features/books/reader/bloc/book_reader_event.dart';
import 'package:mobile/features/books/reader/bloc/book_reader_state.dart';

import '../support/fake_books_services.dart';

BookReaderBloc _majorReader({
  FakeBooksRepository? repository,
  OfflineTextCache? cache,
  ReaderFontPrefs? fontPrefs,
  FakeBookReaderAudioPort? audio,
  String? initialChapterId,
  bool seedContents = true,
}) {
  return BookReaderBloc(
    repository: repository ?? FakeBooksRepository(),
    cache: cache ?? InMemoryOfflineTextCache(),
    fontPrefs: fontPrefs ?? InMemoryReaderFontPrefs(),
    contentId: 'major-1',
    mode: BookReaderMode.majorBook,
    audio: audio ?? FakeBookReaderAudioPort(),
    contents: seedContents ? fakeBookContents() : null,
    initialChapterId: initialChapterId,
  );
}

Future<void> _ready(BookReaderBloc bloc) => expectLater(
      bloc.stream,
      emitsThrough(predicate<BookReaderState>(
        (s) => s.status == BookReaderStatus.ready,
      )),
    );

void main() {
  group('BookReaderBloc — chapter navigation (q5)', () {
    test('opens the first chapter of the reading order by default', () async {
      final bloc = _majorReader()..add(const BookReaderStarted());
      addTearDown(bloc.close);
      await _ready(bloc);

      expect(bloc.state.chapterId, 'ch-1');
      expect(bloc.state.title, 'अध्याय 1');
      expect(bloc.state.subBookTitle, 'बाल-काण्ड');
    });

    test('Previous is DISABLED on the first chapter', () async {
      final bloc = _majorReader()..add(const BookReaderStarted());
      addTearDown(bloc.close);
      await _ready(bloc);

      expect(bloc.state.canGoPrevious, isFalse);
      expect(bloc.state.canGoNext, isTrue);
    });

    test('Next is DISABLED on the last chapter', () async {
      final bloc = _majorReader(initialChapterId: 'ch-4')
        ..add(const BookReaderStarted());
      addTearDown(bloc.close);
      await _ready(bloc);

      expect(bloc.state.canGoNext, isFalse);
      expect(bloc.state.canGoPrevious, isTrue);
    });

    test('Next walks the flat reading order ACROSS sub-books', () async {
      final bloc = _majorReader(initialChapterId: 'ch-2')
        ..add(const BookReaderStarted());
      addTearDown(bloc.close);
      await _ready(bloc);
      expect(bloc.state.subBookTitle, 'बाल-काण्ड');

      bloc.add(const BookReaderNextRequested());
      await expectLater(
        bloc.stream,
        emitsThrough(predicate<BookReaderState>(
          (s) => s.status == BookReaderStatus.ready && s.chapterId == 'ch-3',
        )),
      );
      // Crossing into kanda 2 re-titles the nav.
      expect(bloc.state.subBookTitle, 'अयोध्या-काण्ड');
    });

    test('Previous on the first chapter is inert — no fetch', () async {
      final repo = FakeBooksRepository();
      final bloc = _majorReader(repository: repo)
        ..add(const BookReaderStarted());
      addTearDown(bloc.close);
      await _ready(bloc);
      final before = repo.chapterCalls;

      bloc.add(const BookReaderPreviousRequested());
      await Future<void>.delayed(Duration.zero);

      expect(repo.chapterCalls, before);
    });

    test('drawer selection switches the body and closes the drawer', () async {
      final bloc = _majorReader()..add(const BookReaderStarted());
      addTearDown(bloc.close);
      await _ready(bloc);
      bloc.add(const BookReaderDrawerToggled(open: true));
      await Future<void>.delayed(Duration.zero);
      expect(bloc.state.drawerOpen, isTrue);

      bloc.add(const BookReaderChapterSelected('ch-3'));
      await expectLater(
        bloc.stream,
        emitsThrough(predicate<BookReaderState>(
          (s) => s.status == BookReaderStatus.ready && s.chapterId == 'ch-3',
        )),
      );

      expect(bloc.state.body, 'तीसरा अध्याय।');
      expect(bloc.state.drawerOpen, isFalse);
    });

    test('a book with NO sub-books still reads (loose chapters)', () async {
      final bloc = BookReaderBloc(
        repository: FakeBooksRepository(contents: fakeLooseChapterContents()),
        cache: InMemoryOfflineTextCache(),
        fontPrefs: InMemoryReaderFontPrefs(),
        contentId: 'major-2',
        mode: BookReaderMode.majorBook,
        contents: fakeLooseChapterContents(),
      )..add(const BookReaderStarted());
      addTearDown(bloc.close);
      await _ready(bloc);

      expect(bloc.state.chapterId, 'loose-1');
      expect(bloc.state.subBookTitle, isNull); // no kanda level
      expect(bloc.state.canGoNext, isTrue);
      expect(bloc.state.canGoPrevious, isFalse);
    });
  });

  group('BookReaderBloc — Listen Audio (PRD §10)', () {
    test('audioUrl present → canListen; plays via the shared engine', () async {
      final audio = FakeBookReaderAudioPort();
      final bloc = _majorReader(audio: audio)..add(const BookReaderStarted());
      addTearDown(bloc.close);
      await _ready(bloc);
      expect(bloc.state.canListen, isTrue);

      bloc.add(const BookReaderListenToggled());
      await expectLater(
        bloc.stream,
        emitsThrough(predicate<BookReaderState>((s) => s.playing)),
      );

      expect(audio.played, hasLength(1));
      expect(audio.played.single.audioUrl, 'https://cdn.test/ch-1.mp3');
      expect(audio.played.single.id, 'book:major-1:ch-1');
    });

    test('audioUrl null → canListen is false (button hidden, not disabled)',
        () async {
      final bloc = _majorReader(initialChapterId: 'ch-2')
        ..add(const BookReaderStarted());
      addTearDown(bloc.close);
      await _ready(bloc);

      expect(bloc.state.canListen, isFalse);
    });

    test('toggling while playing pauses', () async {
      final audio = FakeBookReaderAudioPort();
      final bloc = _majorReader(audio: audio)..add(const BookReaderStarted());
      addTearDown(bloc.close);
      await _ready(bloc);
      bloc.add(const BookReaderListenToggled());
      await expectLater(
        bloc.stream,
        emitsThrough(predicate<BookReaderState>((s) => s.playing)),
      );

      bloc.add(const BookReaderListenToggled());
      await expectLater(
        bloc.stream,
        emitsThrough(predicate<BookReaderState>((s) => !s.playing)),
      );
      expect(audio.pauseCalls, 1);
    });

    test('leaving a narrating chapter stops the audio', () async {
      final audio = FakeBookReaderAudioPort();
      final bloc = _majorReader(audio: audio)..add(const BookReaderStarted());
      addTearDown(bloc.close);
      await _ready(bloc);
      bloc.add(const BookReaderListenToggled());
      await expectLater(
        bloc.stream,
        emitsThrough(predicate<BookReaderState>((s) => s.playing)),
      );

      bloc.add(const BookReaderNextRequested());
      await expectLater(
        bloc.stream,
        emitsThrough(predicate<BookReaderState>(
          (s) => s.status == BookReaderStatus.ready && s.chapterId == 'ch-2',
        )),
      );

      expect(audio.stopCalls, 1);
      expect(bloc.state.playing, isFalse);
    });

    test('direct scripture NEVER listens, even with an audio port', () async {
      final audio = FakeBookReaderAudioPort();
      final bloc = BookReaderBloc(
        repository: FakeBooksRepository(),
        cache: InMemoryOfflineTextCache(),
        fontPrefs: InMemoryReaderFontPrefs(),
        contentId: 'chalisa-1',
        mode: BookReaderMode.directScripture,
        audio: audio,
      )..add(const BookReaderStarted());
      addTearDown(bloc.close);
      await _ready(bloc);

      expect(bloc.state.canListen, isFalse);
      expect(bloc.state.hasChapterChrome, isFalse);

      bloc.add(const BookReaderListenToggled());
      await Future<void>.delayed(Duration.zero);
      expect(audio.played, isEmpty);
    });
  });

  group('BookReaderBloc — direct scripture (647:4133)', () {
    test('opens the contentBody directly, with no chapter chrome', () async {
      final bloc = BookReaderBloc(
        repository: FakeBooksRepository(),
        cache: InMemoryOfflineTextCache(),
        fontPrefs: InMemoryReaderFontPrefs(),
        contentId: 'chalisa-1',
        mode: BookReaderMode.directScripture,
      )..add(const BookReaderStarted());
      addTearDown(bloc.close);
      await _ready(bloc);

      expect(bloc.state.title, 'Shri Hanuman Chalisa');
      expect(bloc.state.body, contains('जय हनुमान'));
      expect(bloc.state.canGoNext, isFalse);
      expect(bloc.state.canGoPrevious, isFalse);
      expect(bloc.state.hasChapterChrome, isFalse);
    });

    test('preserves line breaks verbatim', () async {
      final bloc = BookReaderBloc(
        repository: FakeBooksRepository(),
        cache: InMemoryOfflineTextCache(),
        fontPrefs: InMemoryReaderFontPrefs(),
        contentId: 'chalisa-1',
        mode: BookReaderMode.directScripture,
      )..add(const BookReaderStarted());
      addTearDown(bloc.close);
      await _ready(bloc);

      expect(bloc.state.body, contains('\n'));
      expect(bloc.state.body, fakeScripture().contentBody);
    });
  });

  group('BookReaderBloc — Pro gate (403)', () {
    test('403 on a chapter → proRequired with NO body', () async {
      final bloc = _majorReader(
        repository: FakeBooksRepository(
          failReadingWith: BooksErrorKind.proRequired,
        ),
      )..add(const BookReaderStarted());
      addTearDown(bloc.close);

      await expectLater(
        bloc.stream,
        emitsThrough(predicate<BookReaderState>(
          (s) => s.status == BookReaderStatus.proRequired,
        )),
      );
      expect(bloc.state.body, isEmpty);
    });

    test('403 on a scripture → proRequired with NO body', () async {
      final bloc = BookReaderBloc(
        repository:
            FakeBooksRepository(failReadingWith: BooksErrorKind.proRequired),
        cache: InMemoryOfflineTextCache(),
        fontPrefs: InMemoryReaderFontPrefs(),
        contentId: 'chalisa-1',
        mode: BookReaderMode.directScripture,
      )..add(const BookReaderStarted());
      addTearDown(bloc.close);

      await expectLater(
        bloc.stream,
        emitsThrough(predicate<BookReaderState>(
          (s) => s.status == BookReaderStatus.proRequired,
        )),
      );
      expect(bloc.state.body, isEmpty);
    });
  });

  group('BookReaderBloc — offline text cache (r12/q2)', () {
    test('a successful read is cached, then reads offline as a HIT', () async {
      final cache = InMemoryOfflineTextCache();

      // 1. Online read populates the cache.
      final online = _majorReader(cache: cache)..add(const BookReaderStarted());
      addTearDown(online.close);
      await _ready(online);
      expect(cache.length, 1);

      // 2. Offline reader over the SAME cache reads it back.
      final offline = _majorReader(
        repository: FakeBooksRepository(failReadingWith: BooksErrorKind.offline),
        cache: cache,
      )..add(const BookReaderStarted());
      addTearDown(offline.close);
      await _ready(offline);

      expect(offline.state.body, 'पहला अध्याय\n\nदूसरा पैराग्राफ।');
      expect(offline.state.fromCache, isTrue);
    });

    test('uncached + offline → offlineUnavailable', () async {
      final bloc = _majorReader(
        repository: FakeBooksRepository(failReadingWith: BooksErrorKind.offline),
        cache: InMemoryOfflineTextCache(),
      )..add(const BookReaderStarted());
      addTearDown(bloc.close);

      await expectLater(
        bloc.stream,
        emitsThrough(predicate<BookReaderState>(
          (s) => s.status == BookReaderStatus.offlineUnavailable,
        )),
      );
    });

    test('a cached chapter never carries audio (audio is Phase 2)', () async {
      final cache = InMemoryOfflineTextCache();
      final online = _majorReader(cache: cache)..add(const BookReaderStarted());
      addTearDown(online.close);
      await _ready(online);
      expect(online.state.canListen, isTrue); // online: audio available

      final offline = _majorReader(
        repository: FakeBooksRepository(failReadingWith: BooksErrorKind.offline),
        cache: cache,
      )..add(const BookReaderStarted());
      addTearDown(offline.close);
      await _ready(offline);

      expect(offline.state.canListen, isFalse);
    });

    test('offlineCacheEligible:false content is NOT cached', () async {
      final cache = InMemoryOfflineTextCache();
      final bloc = BookReaderBloc(
        repository: FakeBooksRepository(
          scripture: fakeScripture(offlineCacheEligible: false),
        ),
        cache: cache,
        fontPrefs: InMemoryReaderFontPrefs(),
        contentId: 'chalisa-1',
        mode: BookReaderMode.directScripture,
      )..add(const BookReaderStarted());
      addTearDown(bloc.close);
      await _ready(bloc);

      expect(cache.length, 0); // the server's flag is honoured verbatim
    });

    test('a scripture caches + reads back offline', () async {
      final cache = InMemoryOfflineTextCache();
      final online = BookReaderBloc(
        repository: FakeBooksRepository(),
        cache: cache,
        fontPrefs: InMemoryReaderFontPrefs(),
        contentId: 'chalisa-1',
        mode: BookReaderMode.directScripture,
      )..add(const BookReaderStarted());
      addTearDown(online.close);
      await _ready(online);

      final offline = BookReaderBloc(
        repository:
            FakeBooksRepository(failReadingWith: BooksErrorKind.offline),
        cache: cache,
        fontPrefs: InMemoryReaderFontPrefs(),
        contentId: 'chalisa-1',
        mode: BookReaderMode.directScripture,
      )..add(const BookReaderStarted());
      addTearDown(offline.close);
      await _ready(offline);

      expect(offline.state.fromCache, isTrue);
      expect(offline.state.body, contains('जय हनुमान'));
    });
  });

  group('BookReaderBloc — font size (q4/r10: global + local)', () {
    test('defaults to the design size when never set', () async {
      final bloc = _majorReader()..add(const BookReaderStarted());
      addTearDown(bloc.close);
      await _ready(bloc);

      expect(bloc.state.fontSize, AppBooks.readerFontDefault);
    });

    test('change → persisted; relaunch → restored', () async {
      final prefs = InMemoryReaderFontPrefs();
      final first = _majorReader(fontPrefs: prefs)..add(const BookReaderStarted());
      addTearDown(first.close);
      await _ready(first);

      first.add(const BookReaderFontSizeChanged(22));
      await expectLater(
        first.stream,
        emitsThrough(predicate<BookReaderState>((s) => s.fontSize == 22)),
      );
      expect(await prefs.load(), 22);

      // "Relaunch" — a brand-new bloc over the same prefs.
      final second = _majorReader(fontPrefs: prefs)..add(const BookReaderStarted());
      addTearDown(second.close);
      await _ready(second);
      expect(second.state.fontSize, 22);
    });

    test('the persisted size is GLOBAL — a different book restores it too',
        () async {
      final prefs = InMemoryReaderFontPrefs();
      final major = _majorReader(fontPrefs: prefs)..add(const BookReaderStarted());
      addTearDown(major.close);
      await _ready(major);
      major.add(const BookReaderFontSizeChanged(20));
      await expectLater(
        major.stream,
        emitsThrough(predicate<BookReaderState>((s) => s.fontSize == 20)),
      );

      final scripture = BookReaderBloc(
        repository: FakeBooksRepository(),
        cache: InMemoryOfflineTextCache(),
        fontPrefs: prefs,
        contentId: 'chalisa-1',
        mode: BookReaderMode.directScripture,
      )..add(const BookReaderStarted());
      addTearDown(scripture.close);
      await _ready(scripture);

      expect(scripture.state.fontSize, 20);
    });

    test('sizes clamp to the design range', () async {
      final bloc = _majorReader()..add(const BookReaderStarted());
      addTearDown(bloc.close);
      await _ready(bloc);

      bloc.add(const BookReaderFontSizeChanged(99));
      await expectLater(
        bloc.stream,
        emitsThrough(predicate<BookReaderState>(
          (s) => s.fontSize == AppBooks.readerFontMax,
        )),
      );

      bloc.add(const BookReaderFontSizeChanged(1));
      await expectLater(
        bloc.stream,
        emitsThrough(predicate<BookReaderState>(
          (s) => s.fontSize == AppBooks.readerFontMin,
        )),
      );
    });

    // The book_font_size_changed analytics assertion was dropped when Books
    // tracking left the contract (Sheet 1 has zero Books events). The font-
    // size behaviour is still covered by the persistence / re-render tests
    // above.
  });

  group('BookReaderBloc — overlays are mutually exclusive', () {
    test('opening the drawer closes the font overlay', () async {
      final bloc = _majorReader()..add(const BookReaderStarted());
      addTearDown(bloc.close);
      await _ready(bloc);

      bloc.add(const BookReaderFontOverlayToggled(open: true));
      await Future<void>.delayed(Duration.zero);
      expect(bloc.state.fontOverlayOpen, isTrue);

      bloc.add(const BookReaderDrawerToggled(open: true));
      await Future<void>.delayed(Duration.zero);
      expect(bloc.state.drawerOpen, isTrue);
      expect(bloc.state.fontOverlayOpen, isFalse);
    });

    test('a direct scripture can never open the drawer (r11)', () async {
      final bloc = BookReaderBloc(
        repository: FakeBooksRepository(),
        cache: InMemoryOfflineTextCache(),
        fontPrefs: InMemoryReaderFontPrefs(),
        contentId: 'chalisa-1',
        mode: BookReaderMode.directScripture,
      )..add(const BookReaderStarted());
      addTearDown(bloc.close);
      await _ready(bloc);

      bloc.add(const BookReaderDrawerToggled(open: true));
      await Future<void>.delayed(Duration.zero);

      expect(bloc.state.drawerOpen, isFalse);
    });

    // The drawer + font-settings open-event analytics assertions were
    // dropped when Books tracking left the contract. Behaviour tests
    // above already cover mutual-exclusivity of the two overlays.
  });
}
