import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/aarti/data/aarti_models.dart';

import '../support/aarti_harness.dart';
import '../support/fake_repositories.dart';

const _query = AartiListQuery(
  title: 'Aarti',
  sourceListType: 'category',
  categoryId: 'c1',
);

void main() {
  testWidgets('listing renders the dynamic title + 2-column grid', (tester) async {
    await pumpAartiListing(
      tester,
      repository: FakeAartiRepository(pageSize: 4),
      query: _query,
    );
    expect(find.text('Aarti'), findsOneWidget);
    expect(find.byKey(const Key('aarti-listing-grid')), findsOneWidget);
    expect(find.byKey(const Key('aarti-grid-card-a0')), findsOneWidget);
  });

  testWidgets('scrolling to the bottom lazily loads the next page',
      (tester) async {
    // Short viewport so the first page (4 items) overflows and is scrollable.
    await pumpAartiListing(
      tester,
      repository: FakeAartiRepository(pageSize: 4),
      query: _query,
      viewportHeight: 400,
    );
    // First page is a0..a3 — a page-2 item (a5) is not loaded yet.
    expect(find.byKey(const Key('aarti-grid-card-a5'), skipOffstage: false),
        findsNothing);

    await tester.drag(
        find.byKey(const Key('aarti-listing-grid')), const Offset(0, -2000));
    await tester.pumpAndSettle();

    // The next page (a4..a7) has been fetched and appended.
    expect(find.byKey(const Key('aarti-grid-card-a5'), skipOffstage: false),
        findsOneWidget);
  });

  testWidgets('empty result → calm empty state', (tester) async {
    await pumpAartiListing(
      tester,
      repository: FakeAartiRepository(listing: const []),
      query: _query,
    );
    expect(find.byKey(const Key('aarti-listing-empty')), findsOneWidget);
    expect(find.text('No audio found here yet.'), findsOneWidget);
  });
}
