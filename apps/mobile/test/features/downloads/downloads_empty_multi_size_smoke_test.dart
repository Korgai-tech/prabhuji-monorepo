import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/downloads_harness.dart';

void main() {
  const widths = <double>[320, 390, 428];
  const heights = <double>[600, 800, 1200];
  const scales = <double>[1.0, 2.0];

  for (final w in widths) {
    for (final h in heights) {
      for (final s in scales) {
        testWidgets('empty state smoke @${w}x$h textScale=$s',
            (tester) async {
          final store = FakeEncryptedStore();
          final repo = FakeDownloadsRepository();
          final manager =
              await buildSeededManager(store: store, repository: repo);
          await pumpDownloadsLibrary(
            tester,
            manager: manager,
            size: Size(w, h),
            textScaleFactor: s,
          );
          await settle(tester);
          expect(tester.takeException(), isNull);
        });
      }
    }
  }
}
