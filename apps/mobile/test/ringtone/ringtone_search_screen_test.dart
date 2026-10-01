import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fake_repositories.dart';
import '../support/ringtone_harness.dart';

void main() {
  testWidgets('search results show the heading + query in the field + grid',
      (tester) async {
    await pumpRingtoneSearch(
      tester,
      repository: FakeRingtoneRepository(pageSize: 6),
      query: 'Krishna',
    );
    expect(find.byKey(const Key('ringtone-search-heading')), findsOneWidget);
    expect(find.text('Search Results'), findsOneWidget);
    expect(find.text('Krishna'), findsOneWidget); // echoed in the field
    expect(find.byKey(const Key('ringtone-grid')), findsOneWidget);
  });

  testWidgets('zero results → "No results found"', (tester) async {
    await pumpRingtoneSearch(
      tester,
      repository: FakeRingtoneRepository(),
      query: 'zzzznone',
    );
    expect(find.byKey(const Key('ringtone-search-empty')), findsOneWidget);
    expect(find.text('No results found'), findsOneWidget);
  });
}
