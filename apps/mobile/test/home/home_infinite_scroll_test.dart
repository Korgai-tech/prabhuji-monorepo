import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/home/presentation/home_feed_card.dart';

import '../support/fake_home_services.dart';
import '../support/home_harness.dart';

/// Cursor-paginated infinite scroll (AC), driven through the REAL widget tree —
/// the bloc-level pagination cases live in `home_feed_bloc_test.dart`.
void main() {
  testWidgets('pagination follows the SERVER cursor chain, never an offset',
      (tester) async {
    final repo = FakeHomeRepository(pageSize: 2);
    await pumpHome(tester, repository: repo, viewportHeight: 900);

    // The first page always goes out with no cursor.
    expect(repo.feedCursors.first, isNull);

    await tester.drag(find.byKey(const Key('home-scroll')), const Offset(0, -1200));
    await homeSettle(tester);

    // Subsequent pages use the cursor the SERVER handed back ('2', '4', …) —
    // the client never computes its own offset. Note the prefetch is eager by
    // design (AppHome.prefetchTailDistance = 3): with a 2-item page every card
    // is already within 3 of the tail, so page 2 may be in flight before the
    // first drag. What matters is the chain, not the timing.
    expect(repo.feedCursors.length, greaterThan(1));
    expect(repo.feedCursors[1], '2');
    expect(repo.feedCursors.skip(1), everyElement(isNotNull));
  });

  testWidgets('appended pages keep SERVER order across the page boundary',
      (tester) async {
    final repo = FakeHomeRepository(pageSize: 2);
    await pumpHome(tester, repository: repo, viewportHeight: 900);

    for (var i = 0; i < 6; i++) {
      await tester.drag(
        find.byKey(const Key('home-scroll')),
        const Offset(0, -1500),
      );
      await homeSettle(tester);
    }

    // Every page the fake served, concatenated in order — the client must not
    // group the mixed types even as pages append.
    expect(repo.feedCursors, containsAllInOrder([null, '2', '4']));

    final rendered = tester
        .widgetList<HomeFeedCard>(find.byType(HomeFeedCard))
        .map((c) => c.item.id)
        .toList();
    // Only the on-screen slice is built (lazy slivers), but whatever IS built
    // must appear in the fixture's server order.
    final fixtureOrder = homeFeedFixtures().map((i) => i.id).toList();
    final indices = rendered.map(fixtureOrder.indexOf).toList();
    final sorted = [...indices]..sort();
    expect(indices, sorted, reason: 'rendered cards drifted from server order');
  });

  testWidgets('the last page stops paginating (nextCursor null)',
      (tester) async {
    final repo = FakeHomeRepository(pageSize: 6); // the whole fixture in one page
    await pumpHome(tester, repository: repo, viewportHeight: 900);

    for (var i = 0; i < 4; i++) {
      await tester.drag(
        find.byKey(const Key('home-scroll')),
        const Offset(0, -1500),
      );
      await homeSettle(tester);
    }

    // One call, ever — there was no next cursor to follow.
    expect(repo.feedCursors, [null]);
  });
}
