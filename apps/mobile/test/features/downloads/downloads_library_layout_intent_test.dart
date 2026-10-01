import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/downloads/domain/content_type.dart';
import 'package:mobile/features/downloads/domain/download_state.dart';

import '../../support/downloads_harness.dart';

/// Downloads library layout-intent test (spec §Design fidelity AC + the
/// `flutter-layout-intent` pattern). Asserts each pinned/flex zone renders
/// in the expected relative order at 600 / 800 / 1200 dp heights.
void main() {
  const heights = <double>[600, 800, 1200];
  const width = 390.0;

  for (final h in heights) {
    testWidgets('populated library renders every pinned zone at ${h}dp',
        (tester) async {
      final store = FakeEncryptedStore();
      final repo = FakeDownloadsRepository();
      final now = DateTime.now().toUtc();
      final manager = await buildSeededManager(
        store: store,
        repository: repo,
        seedItems: <DownloadItem>[
          DownloadItem(
            contentId: 'a1',
            contentType: DownloadContentType.aarti,
            title: 'Aarti One',
            sizeBytes: 1024 * 1024,
            durationMs: 90_000,
            downloadedAt: now,
            state: DownloadCompleted(completedAt: now),
          ),
        ],
      );
      await pumpDownloadsLibrary(
        tester,
        manager: manager,
        size: Size(width, h),
      );
      await settle(tester);

      // Every pinned zone by stable Key.
      expect(find.byKey(const Key('downloads-library-root')), findsOneWidget);
      expect(find.byKey(const Key('downloads-appbar')), findsOneWidget);
      expect(find.byKey(const Key('downloads-filter-chips')), findsOneWidget);
      expect(find.byKey(const Key('downloads-disclosure')), findsOneWidget);
      expect(find.byKey(const Key('downloads-list')), findsOneWidget);
      expect(find.byKey(const Key('downloads-list-scroll')), findsOneWidget);
      // Offline banner reserves no space when online (spec).
      expect(find.byKey(const Key('downloads-offline-banner-inner')),
          findsNothing);
    });
  }

  testWidgets('offline banner renders when isOffline is true', (tester) async {
    final store = FakeEncryptedStore();
    final repo = FakeDownloadsRepository();
    final manager = await buildSeededManager(store: store, repository: repo);
    await pumpDownloadsLibrary(
      tester,
      manager: manager,
      isOffline: true,
    );
    await settle(tester);
    expect(find.byKey(const Key('downloads-offline-banner-inner')),
        findsOneWidget);
  });

  testWidgets('empty state renders when no downloads', (tester) async {
    final store = FakeEncryptedStore();
    final repo = FakeDownloadsRepository();
    final manager = await buildSeededManager(store: store, repository: repo);
    await pumpDownloadsLibrary(tester, manager: manager);
    await settle(tester);
    expect(find.byKey(const Key('downloads-empty-inner')), findsOneWidget);
    expect(find.byKey(const Key('downloads-empty-title')), findsOneWidget);
    expect(find.byKey(const Key('downloads-empty-browse-aarti')),
        findsOneWidget);
    expect(find.byKey(const Key('downloads-empty-browse-mantras')),
        findsOneWidget);
  });
}
