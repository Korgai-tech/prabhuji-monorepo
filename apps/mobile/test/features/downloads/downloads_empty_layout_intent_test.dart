import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/downloads_harness.dart';

/// Empty-state layout intent (`flutter-layout-intent` pattern) at three
/// device heights. The empty state must render its icon avatar + title +
/// body + browse CTAs + disclosure card without overflow at any of them.
void main() {
  const heights = <double>[600, 800, 1200];

  for (final h in heights) {
    testWidgets('empty state at ${h}dp shows every zone', (tester) async {
      final store = FakeEncryptedStore();
      final repo = FakeDownloadsRepository();
      final manager = await buildSeededManager(store: store, repository: repo);
      await pumpDownloadsLibrary(
        tester,
        manager: manager,
        size: Size(390, h),
      );
      await settle(tester);
      expect(find.byKey(const Key('downloads-empty-inner')), findsOneWidget);
      expect(find.byKey(const Key('downloads-empty-title')), findsOneWidget);
      expect(find.byKey(const Key('downloads-empty-body')), findsOneWidget);
      expect(find.byKey(const Key('downloads-empty-browse-aarti')),
          findsOneWidget);
      expect(find.byKey(const Key('downloads-empty-browse-mantras')),
          findsOneWidget);
      expect(find.byKey(const Key('downloads-disclosure-card')),
          findsOneWidget);
    });
  }
}
