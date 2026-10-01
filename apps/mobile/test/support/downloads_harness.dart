import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile/core/analytics.dart';
import 'package:mobile/features/downloads/bloc/downloads_library_bloc.dart';
import 'package:mobile/features/downloads/bloc/downloads_library_event.dart';
import 'package:mobile/features/downloads/data/download_manager.dart';
import 'package:mobile/features/downloads/application/offline_watcher.dart';
import 'package:mobile/features/downloads/data/downloads_repository.dart';
import 'package:mobile/features/downloads/data/encrypted_store.dart';
import 'package:mobile/features/downloads/domain/content_type.dart';
import 'package:mobile/features/downloads/domain/download_manifest.dart';
import 'package:mobile/features/downloads/domain/download_state.dart';
import 'package:mobile/features/downloads/downloads_providers.dart';
import 'package:mobile/features/downloads/presentation/downloads_library_screen.dart';
import 'package:mobile/state/providers.dart';

/// Hand-rolled fakes per the flutter-testing skill — NO mockito/mocktail
/// (spec constraint). Every fake is a plain class implementing the
/// production interface with deterministic, test-writable behaviour.

class FakeEncryptedStore implements EncryptedStore {
  final Map<String, List<int>> files = <String, List<int>>{};
  List<Map<String, Object?>> _index = <Map<String, Object?>>[];
  bool failWrite = false;

  @override
  Future<int> writeStream(String contentId, Stream<List<int>> source) async {
    if (failWrite) throw DownloadStoreException('forced');
    final chunks = <int>[];
    await for (final chunk in source) {
      chunks.addAll(chunk);
    }
    files[contentId] = chunks;
    return chunks.length;
  }

  @override
  Future<int> plaintextSize(String contentId) async =>
      files[contentId]?.length ?? 0;

  @override
  Stream<Uint8List> decryptStream(
    String contentId, {
    int? offset,
    int? end,
  }) async* {
    final data = files[contentId];
    if (data == null) return;
    final s = offset ?? 0;
    final e = end ?? data.length;
    yield Uint8List.fromList(data.sublist(s, e.clamp(s, data.length)));
  }

  @override
  Future<bool> exists(String contentId) async => files.containsKey(contentId);

  @override
  Future<void> delete(String contentId) async => files.remove(contentId);

  @override
  Future<void> deleteAll() async => files.clear();

  @override
  Future<List<Map<String, Object?>>> readIndex() async =>
      List<Map<String, Object?>>.of(_index);

  @override
  Future<void> writeIndex(List<Map<String, Object?>> entries) async {
    _index = List<Map<String, Object?>>.of(entries);
  }
}

class FakeDownloadsRepository implements DownloadsRepository {
  FakeDownloadsRepository();

  /// If set, all fetches throw the exception (test the paywall branch).
  Exception? failure;

  /// When true, `fetchManifest` never resolves — used by state-machine
  /// tests to keep a slot occupied so over-slot enqueues stay `queued`.
  bool hang = false;

  /// Bytes to stream for a "download" — hand-crafted by the test.
  List<int> bytes = List<int>.generate(1024, (i) => i % 256);
  int sizeBytes = 1024;
  int? durationMs = 5000;
  String checksum = 'a' * 64;

  @override
  Future<DownloadManifest> fetchManifest({
    required DownloadContentType type,
    required String contentId,
  }) async {
    final f = failure;
    if (f != null) throw f;
    if (hang) {
      // Never resolves — the manager stays in the "manifest fetch in
      // flight" phase, occupying its slot.
      return Completer<DownloadManifest>().future;
    }
    return DownloadManifest(
      signedUrl: 'https://fake/$contentId',
      sizeBytes: sizeBytes,
      durationMs: durationMs,
      checksum: checksum,
      expiresAt: DateTime.now().toUtc().add(const Duration(minutes: 5)),
    );
  }
}

/// Convenience builder — writes items straight into the store's index so
/// `manager.hydrate()` picks them up as `Downloaded` on the first
/// snapshot. Cleaner than wrangling the manager's private state.
Future<DownloadManager> buildSeededManager({
  required FakeEncryptedStore store,
  required FakeDownloadsRepository repository,
  List<DownloadItem> seedItems = const <DownloadItem>[],
}) async {
  for (final item in seedItems) {
    // Ensure the ciphertext-exists check inside `hydrate` passes.
    store.files[item.contentId] = <int>[1, 2, 3];
  }
  await store.writeIndex(
    seedItems
        .map((i) => <String, Object?>{
              'contentId': i.contentId,
              'contentType': i.contentType.wire,
              'title': i.title,
              'subtitle': i.subtitle,
              'artworkUrl': i.artworkUrl,
              'sizeBytes': i.sizeBytes,
              'durationMs': i.durationMs,
              'downloadedAt':
                  i.downloadedAt?.toIso8601String() ??
                      DateTime.now().toUtc().toIso8601String(),
              'playCount': i.playCount,
            })
        .toList(),
  );
  final manager = DownloadManager(repository: repository, store: store);
  await manager.hydrate();
  return manager;
}

/// Pump the Downloads library screen with the given manager. Overrides
/// `analyticsProvider` (which defaults to null already) and
/// `downloadManagerProvider` so widget effects don't crash.
Future<void> pumpDownloadsLibrary(
  WidgetTester tester, {
  required DownloadManager manager,
  Size size = const Size(390, 800),
  double textScaleFactor = 1.0,
  bool isOffline = false,
}) async {
  // Disable Google Fonts runtime fetching — the theme uses `GoogleFonts.getFont`
  // and without this the widget-tester hangs trying to reach fonts.google.com.
  GoogleFonts.config.allowRuntimeFetching = false;
  await tester.binding.setSurfaceSize(size);
  final bloc = DownloadsLibraryBloc(manager: manager)
    ..add(const DownloadsLibraryStarted());
  addTearDown(bloc.close);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        downloadManagerProvider.overrideWithValue(manager),
        analyticsProvider.overrideWith((ref) => null as Analytics?),
        // Never let the widget hit the real connectivity_plus channel.
        isOfflineProvider.overrideWith((ref) => Stream<bool>.value(isOffline)),
      ],
      child: MediaQuery(
        data: MediaQueryData(
          size: size,
          textScaler: TextScaler.linear(textScaleFactor),
        ),
        child: MaterialApp(
          home: BlocProvider<DownloadsLibraryBloc>.value(
            value: bloc,
            child: const DownloadsLibraryScreen(),
          ),
        ),
      ),
    ),
  );
}

/// Pumps a few frames so bloc + stream listeners have a chance to fold
/// into the state. Avoids `pumpAndSettle` (which can hang on any
/// TweenAnimationBuilder frame) and avoids `Future.delayed(Duration.zero)`
/// (which under the widget-test fake scheduler can wedge).
Future<void> settle(WidgetTester tester) async {
  for (var i = 0; i < 4; i++) {
    await tester.pump(const Duration(milliseconds: 10));
  }
}
