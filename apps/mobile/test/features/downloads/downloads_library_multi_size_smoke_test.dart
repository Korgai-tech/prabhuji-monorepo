import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/downloads/domain/content_type.dart';
import 'package:mobile/features/downloads/domain/download_state.dart';

import '../../support/downloads_harness.dart';

/// Multi-size smoke test (`flutter-multi-size-smoke` pattern). Asserts NO
/// `RenderFlex` overflow across 320 / 390 / 428 dp widths × 600 / 800 /
/// 1200 dp heights AND with `textScaleFactor = 2.0` — the trap the row
/// spec calls out (Figma `height: 89` → BoxConstraints(minHeight: 89), not
/// a rigid height).
void main() {
  const widths = <double>[320, 390, 428];
  const heights = <double>[600, 800, 1200];
  const scales = <double>[1.0, 2.0];

  final now = DateTime.now().toUtc();
  final seededItem = DownloadItem(
    contentId: 'a1',
    contentType: DownloadContentType.aarti,
    title: 'Very Long Aarti Title That Would Break A Fixed-Height Row',
    subtitle: 'Some singer with a long name that wraps too',
    sizeBytes: 6_500_000,
    durationMs: 352_000,
    downloadedAt: now,
    state: DownloadCompleted(completedAt: now),
  );

  for (final w in widths) {
    for (final h in heights) {
      for (final s in scales) {
        testWidgets('library smoke @${w}x$h textScale=$s', (tester) async {
          final store = FakeEncryptedStore();
          final repo = FakeDownloadsRepository();
          final manager = await buildSeededManager(
            store: store,
            repository: repo,
            seedItems: <DownloadItem>[seededItem],
          );
          await pumpDownloadsLibrary(
            tester,
            manager: manager,
            size: Size(w, h),
            textScaleFactor: s,
          );
          await settle(tester);
          // FlutterError.onError populates `exception` for RenderFlex
          // overflows; asserting `takeException` returns null is the
          // canonical guard.
          expect(tester.takeException(), isNull,
              reason: 'RenderFlex overflow at ${w}x$h textScale=$s');
        });
      }
    }
  }
}
