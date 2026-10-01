import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/service_locator.dart';
import 'data/books_repository.dart';
import 'data/offline_text_cache.dart';
import 'data/reader_font_prefs.dart';

/// The Books data seam (TAM-76). Defaults to the dio-backed impl over the
/// get_it-owned auth-injecting [Dio];
/// overridden with a `FakeBooksRepository` in tests so surfaces run offline.
final booksRepositoryProvider = Provider<BooksRepository>(
  (ref) => DioBooksRepository(serviceLocator<Dio>()),
);

/// Offline TEXT cache for opened chapters/scriptures (r12/q2). Overridden with
/// `InMemoryOfflineTextCache` in tests — `shared_preferences` needs a platform
/// channel that widget tests don't have.
final booksOfflineCacheProvider = Provider<OfflineTextCache>(
  (ref) => PrefsOfflineTextCache(),
);

/// The GLOBAL reader font size (q4/r10) — one value across the whole reader,
/// persisted on the device only.
final booksReaderFontPrefsProvider = Provider<ReaderFontPrefs>(
  (ref) => PrefsReaderFontPrefs(),
);
