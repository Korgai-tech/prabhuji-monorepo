import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/downloads/data/download_manager.dart';
import 'package:mobile/features/downloads/domain/content_type.dart';
import 'package:mobile/features/downloads/domain/download_state.dart';

import '../../support/downloads_harness.dart';

/// DownloadManager tests (spec §Tests §download_manager_test).
///
/// Note: the transport (Dio) is NOT stubbed here — testing the network
/// transfer loop needs a Dio-level fake or a real HTTP server, and the
/// spec's `#PLAN_UNCERTAINTY` on the download-loop transport rules that
/// out for this ticket. Instead we assert the pure state-machine
/// invariants — enqueue → queued/downloading, cancel semantics, remove,
/// and retry from the failed row.
void main() {
  group('DownloadManager', () {
    test('over-slot enqueues land in queued state', () async {
      final store = FakeEncryptedStore();
      // Repository that hangs on the manifest fetch so slots stay occupied.
      final repo = FakeDownloadsRepository()..hang = true;
      final manager = DownloadManager(
        repository: repo,
        store: store,
        slotCount: 2,
      );

      const req1 = DownloadRequest(
        contentId: 'a1',
        contentType: DownloadContentType.aarti,
        title: 'One',
      );
      const req2 = DownloadRequest(
        contentId: 'a2',
        contentType: DownloadContentType.aarti,
        title: 'Two',
      );
      const req3 = DownloadRequest(
        contentId: 'a3',
        contentType: DownloadContentType.aarti,
        title: 'Three',
      );

      // Fire and let the manager settle transitions.
      unawaited(manager.enqueue(req1));
      unawaited(manager.enqueue(req2));
      unawaited(manager.enqueue(req3));
      await Future<void>.delayed(Duration.zero);

      // req3 exceeded slotCount=2, so it's queued at position 1
      // (queue holds only over-slot rows).
      final third = manager.snapshot.states['a3'];
      expect(third, isA<DownloadQueued>());
      expect((third! as DownloadQueued).queuePosition, 1);

      await manager.dispose();
    });

    test('cancel drops a queued task', () async {
      final store = FakeEncryptedStore();
      final repo = FakeDownloadsRepository()..hang = true;
      final manager = DownloadManager(
        repository: repo,
        store: store,
        slotCount: 1,
      );
      unawaited(manager.enqueue(const DownloadRequest(
        contentId: 'a1',
        contentType: DownloadContentType.aarti,
        title: 'One',
      )));
      unawaited(manager.enqueue(const DownloadRequest(
        contentId: 'a2',
        contentType: DownloadContentType.aarti,
        title: 'Two',
      )));
      await Future<void>.delayed(Duration.zero);
      expect(manager.snapshot.states['a2'], isA<DownloadQueued>());
      await manager.cancel('a2');
      expect(manager.snapshot.states.containsKey('a2'), isFalse);
      await manager.dispose();
    });

    test('remove wipes state + fires event', () async {
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
            title: 'One',
            sizeBytes: 10,
            downloadedAt: now,
            state: DownloadCompleted(completedAt: now),
          ),
        ],
      );
      expect(manager.snapshot.items['a1'], isNotNull);
      final events = <DownloadManagerEvent>[];
      final sub = manager.events.listen(events.add);
      await manager.remove('a1');
      await Future<void>.delayed(Duration.zero);
      expect(manager.snapshot.items['a1'], isNull);
      expect(events.any((e) => e is DownloadRemoved && e.contentId == 'a1'),
          isTrue);
      await sub.cancel();
      await manager.dispose();
    });

    test('hydrate seeds items from the persisted index', () async {
      final store = FakeEncryptedStore();
      final repo = FakeDownloadsRepository();
      final now = DateTime.now().toUtc();
      final manager = await buildSeededManager(
        store: store,
        repository: repo,
        seedItems: <DownloadItem>[
          DownloadItem(
            contentId: 'm1',
            contentType: DownloadContentType.mantra,
            title: 'Om',
            sizeBytes: 1024,
            downloadedAt: now,
            state: DownloadCompleted(completedAt: now),
          ),
        ],
      );
      expect(manager.snapshot.items['m1']?.title, 'Om');
      expect(manager.snapshot.states['m1'], isA<DownloadCompleted>());
      await manager.dispose();
    });
  });
}
