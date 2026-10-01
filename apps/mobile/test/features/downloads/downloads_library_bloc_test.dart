import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/downloads/bloc/downloads_library_bloc.dart';
import 'package:mobile/features/downloads/bloc/downloads_library_event.dart';
import 'package:mobile/features/downloads/domain/content_type.dart';
import 'package:mobile/features/downloads/domain/download_state.dart';

import '../../support/downloads_harness.dart';

void main() {
  group('DownloadsLibraryBloc', () {
    test('empty on cold start with no downloads', () async {
      final store = FakeEncryptedStore();
      final repo = FakeDownloadsRepository();
      final manager = await buildSeededManager(store: store, repository: repo);
      final bloc = DownloadsLibraryBloc(manager: manager);
      bloc.add(const DownloadsLibraryStarted());
      await Future<void>.delayed(Duration.zero);
      expect(bloc.state.isTotalEmpty, isTrue);
      expect(bloc.state.counts.all, 0);
      await bloc.close();
    });

    test('counts always reflect UNFILTERED totals', () async {
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
            title: 'Aarti one',
            sizeBytes: 100,
            downloadedAt: now,
            state: DownloadCompleted(completedAt: now),
          ),
          DownloadItem(
            contentId: 'a2',
            contentType: DownloadContentType.aarti,
            title: 'Aarti two',
            sizeBytes: 100,
            downloadedAt: now,
            state: DownloadCompleted(completedAt: now),
          ),
          DownloadItem(
            contentId: 'm1',
            contentType: DownloadContentType.mantra,
            title: 'Mantra one',
            sizeBytes: 100,
            downloadedAt: now,
            state: DownloadCompleted(completedAt: now),
          ),
        ],
      );
      final bloc = DownloadsLibraryBloc(manager: manager);
      bloc.add(const DownloadsLibraryStarted());
      await Future<void>.delayed(Duration.zero);
      expect(bloc.state.counts.all, 3);
      expect(bloc.state.counts.aarti, 2);
      expect(bloc.state.counts.mantra, 1);
      expect(bloc.state.counts.bhajan, 0);

      // Filter to Aarti — counts stay UNFILTERED, filteredItems narrows.
      bloc.add(const DownloadsLibraryFilterChanged(DownloadContentType.aarti));
      await Future<void>.delayed(Duration.zero);
      expect(bloc.state.filter, DownloadContentType.aarti);
      expect(bloc.state.counts.all, 3, reason: 'counts stay unfiltered');
      expect(bloc.state.filteredItems.length, 2);

      await bloc.close();
    });

    test('offline flag mirrors OfflineChanged event', () async {
      final store = FakeEncryptedStore();
      final repo = FakeDownloadsRepository();
      final manager = await buildSeededManager(store: store, repository: repo);
      final bloc = DownloadsLibraryBloc(manager: manager);
      bloc.add(const DownloadsLibraryStarted());
      await Future<void>.delayed(Duration.zero);
      expect(bloc.state.isOffline, isFalse);
      bloc.add(const DownloadsLibraryOfflineChanged(true));
      await Future<void>.delayed(Duration.zero);
      expect(bloc.state.isOffline, isTrue);
      await bloc.close();
    });
  });
}
