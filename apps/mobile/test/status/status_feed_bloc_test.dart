import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/status/data/status_models.dart';
import 'package:mobile/features/status/feed/bloc/status_feed_bloc.dart';
import 'package:mobile/features/status/feed/bloc/status_feed_event.dart';
import 'package:mobile/features/status/feed/bloc/status_feed_state.dart';

import '../support/fake_repositories.dart';
import '../support/fake_analytics.dart';

/// The view threshold is injected so the "≥2s" rule is asserted deterministically
/// without a real 2-second wait.
const _fastThreshold = Duration(milliseconds: 20);

StatusFeedBloc _bloc(
  FakeStatusRepository repo, {
  RecordingAnalytics? analytics,
  Duration threshold = _fastThreshold,
}) =>
    StatusFeedBloc(
      repository: repo,
      analytics: analytics,
      viewThreshold: threshold,
    );

void main() {
  group('start', () {
    test('loads template + profile + the first page and fires status_page_viewed',
        () async {
      final repo = FakeStatusRepository(profile: statusPersonalProfileFixture());
      final analytics = RecordingAnalytics();
      final bloc = _bloc(repo, analytics: analytics);
      addTearDown(bloc.close);

      bloc.add(const StatusFeedStarted(entrySource: 'home_widget'));
      await bloc.stream.firstWhere((s) => s.status == StatusFeedStatus.ready);

      expect(bloc.state.items, hasLength(6)); // pageSize
      expect(bloc.state.profile.overlayTitle, 'Aditya Nath');
      // Sheet 1 row 86 — `status_page_viewed`. `entry_source` rides in from
      // the event so the funnel can attribute the launch (Home widget vs
      // bottom nav vs deep link).
      expect(analytics.names, contains('status_page_viewed'));
      expect(
        analytics.propsFor('status_page_viewed')['entry_source'],
        'home_widget',
      );
    });


    test('a profile failure does NOT break the feed', () async {
      final repo = FakeStatusRepository(failProfile: true);
      final bloc = _bloc(repo);
      addTearDown(bloc.close);

      bloc.add(const StatusFeedStarted());
      await bloc.stream.firstWhere((s) => s.status == StatusFeedStatus.ready);

      expect(bloc.state.items, isNotEmpty);
      // TAM-168 — the strip's gate is `hasNameOrPhoto`; an empty profile
      // (fetch failure ⇒ StatusProfileData.empty) has neither.
      expect(bloc.state.profile.hasNameOrPhoto, isFalse);
    });

    test('a feed failure surfaces the error state', () async {
      final repo = FakeStatusRepository(failFeed: true);
      final bloc = _bloc(repo);
      addTearDown(bloc.close);

      bloc.add(const StatusFeedStarted());
      await bloc.stream.firstWhere((s) => s.status == StatusFeedStatus.failure);

      expect(bloc.state.errorMessage, isNotNull);
    });
  });

  group('tab re-tap refresh', () {
    test('reloads page 1 under the current filter, back on the first card, '
        'without re-firing status_page_viewed', () async {
      final repo = FakeStatusRepository();
      final analytics = RecordingAnalytics();
      final bloc = _bloc(repo, analytics: analytics);
      addTearDown(bloc.close);

      bloc.add(const StatusFeedStarted());
      await bloc.stream.firstWhere((s) => s.status == StatusFeedStatus.ready);
      bloc.add(const StatusFeedDeitySelected('hanuman'));
      await bloc.stream.firstWhere(
        (s) => s.status == StatusFeedStatus.ready && s.deitySlug == 'hanuman',
      );
      bloc.add(const StatusFeedIndexChanged(3));
      await bloc.stream.firstWhere((s) => s.activeIndex == 3);
      final callsBefore = repo.fetchFeedCalls;
      final profileCallsBefore = repo.fetchProfileCalls;

      bloc.add(const StatusFeedRefreshRequested());
      await bloc.stream.firstWhere((s) => s.status == StatusFeedStatus.loading);
      await bloc.stream.firstWhere((s) => s.status == StatusFeedStatus.ready);

      expect(repo.fetchFeedCalls, greaterThan(callsBefore));
      expect(repo.fetchProfileCalls, profileCallsBefore + 1);
      expect(repo.lastFeedDeityId, 'hanuman', reason: 'filter is kept');
      expect(repo.pinnedIdCalls.last, isNull);
      expect(bloc.state.activeIndex, 0);
      expect(bloc.state.items, hasLength(6));
      expect(
        analytics.names.where((n) => n == 'status_page_viewed'),
        hasLength(1),
        reason: 'a refresh is not a new page view',
      );
    });

    test('a failed refresh surfaces the error state', () async {
      final repo = FakeStatusRepository();
      final bloc = _bloc(repo);
      addTearDown(bloc.close);

      bloc.add(const StatusFeedStarted());
      await bloc.stream.firstWhere((s) => s.status == StatusFeedStatus.ready);
      repo.failFeed = true;

      bloc.add(const StatusFeedRefreshRequested());
      await bloc.stream.firstWhere((s) => s.status == StatusFeedStatus.failure);

      expect(bloc.state.items, isEmpty);
      expect(bloc.state.errorMessage, isNotNull);
    });
  });

  group('deity filter', () {
    test('passes the slug to the repo and fires status_deity_selected',
        () async {
      final repo = FakeStatusRepository();
      final analytics = RecordingAnalytics();
      final bloc = _bloc(repo, analytics: analytics);
      addTearDown(bloc.close);

      bloc.add(const StatusFeedStarted());
      await bloc.stream.firstWhere((s) => s.status == StatusFeedStatus.ready);

      bloc.add(const StatusFeedDeitySelected(
        'hanuman',
        deityName: 'Hanuman',
        positionIndex: 2,
      ));
      await bloc.stream.firstWhere(
        (s) => s.status == StatusFeedStatus.ready && s.deitySlug == 'hanuman',
      );

      expect(repo.lastFeedDeityId, 'hanuman');
      // Sheet 1 row 88 — the sheet's canonical `deity_id` (using the slug)
      // + `deity_name` + `position_index`. All Gods (the null-slug path)
      // maps to the string `all` so the funnel can bucket "filter cleared".
      expect(analytics.propsFor('status_deity_selected')['deity_id'], 'hanuman');
      expect(analytics.propsFor('status_deity_selected')['deity_name'], 'Hanuman');
      expect(analytics.propsFor('status_deity_selected')['position_index'], 2);
    });

    test('All Gods clears the filter (null == no deityId)', () async {
      final repo = FakeStatusRepository();
      final bloc = _bloc(repo);
      addTearDown(bloc.close);

      bloc.add(const StatusFeedStarted());
      await bloc.stream.firstWhere((s) => s.status == StatusFeedStatus.ready);
      bloc.add(const StatusFeedDeitySelected('hanuman'));
      await bloc.stream.firstWhere((s) => s.deitySlug == 'hanuman');

      bloc.add(const StatusFeedDeitySelected(null));
      await bloc.stream.firstWhere(
        (s) => s.status == StatusFeedStatus.ready && s.deitySlug == null,
      );

      expect(repo.lastFeedDeityId, isNull);
    });

    test('a deity with no status yields the empty state', () async {
      final repo = FakeStatusRepository(emptyDeityId: 'ram');
      final bloc = _bloc(repo);
      addTearDown(bloc.close);

      bloc.add(const StatusFeedStarted());
      await bloc.stream.firstWhere((s) => s.status == StatusFeedStatus.ready);

      bloc.add(const StatusFeedDeitySelected('ram'));
      await bloc.stream.firstWhere((s) => s.isEmpty);

      expect(bloc.state.items, isEmpty);
      expect(bloc.state.isEmpty, isTrue);
    });
  });

  group('view threshold (q5 — ≥2s visible)', () {
    test('does NOT fire before the threshold elapses', () async {
      final repo = FakeStatusRepository();
      final analytics = RecordingAnalytics();
      final bloc = _bloc(repo, analytics: analytics, threshold: const Duration(seconds: 2));
      addTearDown(bloc.close);

      bloc.add(const StatusFeedStarted());
      await bloc.stream.firstWhere((s) => s.status == StatusFeedStatus.ready);

      await Future<void>.delayed(const Duration(milliseconds: 30));
      expect(analytics.names, isNot(contains('status_viewed')));
      expect(repo.recordViewCalls, 0);
    });

    test('fires once the card has dwelled, and POSTs the view', () async {
      final repo = FakeStatusRepository();
      final analytics = RecordingAnalytics();
      final bloc = _bloc(repo, analytics: analytics);
      addTearDown(bloc.close);

      bloc.add(const StatusFeedStarted());
      await bloc.stream.firstWhere((s) => s.status == StatusFeedStatus.ready);
      await Future<void>.delayed(const Duration(milliseconds: 60));

      expect(analytics.names, contains('status_viewed'));
      expect(analytics.propsFor('status_viewed')['status_id'], 's0');
      expect(repo.recordViewCalls, 1);
      expect(bloc.state.viewedIds, contains('s0'));
      // The server count replaces the seeded one.
      expect(bloc.state.items.first.viewCount, repo.viewCountResult);
    });

    test('a fast swipe past a card does NOT count it', () async {
      final repo = FakeStatusRepository();
      final analytics = RecordingAnalytics();
      final bloc = _bloc(repo, analytics: analytics, threshold: const Duration(milliseconds: 80));
      addTearDown(bloc.close);

      bloc.add(const StatusFeedStarted());
      await bloc.stream.firstWhere((s) => s.status == StatusFeedStatus.ready);

      // Swipe away well before the threshold.
      await Future<void>.delayed(const Duration(milliseconds: 10));
      bloc.add(const StatusFeedIndexChanged(1));
      await Future<void>.delayed(const Duration(milliseconds: 120));

      final viewed = analytics.allProps('status_viewed')
          .map((p) => p['status_id'])
          .toList();
      expect(viewed, isNot(contains('s0')), reason: 'swiped past before 2s');
      expect(viewed, contains('s1'));
    });

    test('counts a card ONCE even when revisited', () async {
      final repo = FakeStatusRepository();
      final analytics = RecordingAnalytics();
      final bloc = _bloc(repo, analytics: analytics);
      addTearDown(bloc.close);

      bloc.add(const StatusFeedStarted());
      await bloc.stream.firstWhere((s) => s.status == StatusFeedStatus.ready);
      await Future<void>.delayed(const Duration(milliseconds: 60));

      bloc.add(const StatusFeedIndexChanged(1));
      await Future<void>.delayed(const Duration(milliseconds: 60));
      bloc.add(const StatusFeedIndexChanged(0)); // back to s0
      await Future<void>.delayed(const Duration(milliseconds: 60));

      final s0Views = analytics.allProps('status_viewed')
          .where((p) => p['status_id'] == 's0')
          .length;
      expect(s0Views, 1);
    });

    test('a failed view POST is swallowed (the local threshold still fires)',
        () async {
      final repo = FakeStatusRepository(failView: true);
      final analytics = RecordingAnalytics();
      final bloc = _bloc(repo, analytics: analytics);
      addTearDown(bloc.close);

      bloc.add(const StatusFeedStarted());
      await bloc.stream.firstWhere((s) => s.status == StatusFeedStatus.ready);
      await Future<void>.delayed(const Duration(milliseconds: 60));

      expect(analytics.names, contains('status_viewed'));
      expect(bloc.state.errorMessage, isNull, reason: 'never surfaces to the user');
    });
  });

  group('like (FREE, optimistic)', () {
    test('toggles optimistically then reconciles with the server', () async {
      final repo = FakeStatusRepository()
        ..likedResult = true
        ..likeCountResult = 24001;
      final analytics = RecordingAnalytics();
      final bloc = _bloc(repo, analytics: analytics, threshold: const Duration(days: 1));
      addTearDown(bloc.close);

      bloc.add(const StatusFeedStarted());
      await bloc.stream.firstWhere((s) => s.status == StatusFeedStatus.ready);
      expect(bloc.state.items.first.likedByMe, isFalse);

      bloc.add(const StatusFeedLikeToggled());
      // The FIRST emission is the optimistic flip — before the repo answers.
      final optimistic = await bloc.stream.first;
      expect(optimistic.items.first.likedByMe, isTrue);
      expect(optimistic.items.first.likeCount, 24001);

      await bloc.stream.firstWhere((s) => s.items.first.likeCount == 24001);
      expect(repo.toggleLikeCalls, 1);
      // Sheet 1 row 90 — `status_like_changed` with canonical `action`
      // wire values (`like` / `unlike`), mirroring Home's like event.
      expect(analytics.propsFor('status_like_changed')['action'], 'like');
    });

    test('reverts to the pre-tap truth when the like fails', () async {
      final repo = FakeStatusRepository(failLike: true);
      final bloc = _bloc(repo, threshold: const Duration(days: 1));
      addTearDown(bloc.close);

      bloc.add(const StatusFeedStarted());
      await bloc.stream.firstWhere((s) => s.status == StatusFeedStatus.ready);
      final before = bloc.state.items.first;

      bloc.add(const StatusFeedLikeToggled());
      await bloc.stream.firstWhere((s) => s.errorMessage != null);

      expect(bloc.state.items.first.likedByMe, before.likedByMe);
      expect(bloc.state.items.first.likeCount, before.likeCount);
    });

    test('unlike decrements', () async {
      final repo = FakeStatusRepository(
        feed: [statusItemFixture('s0', like: 10, liked: true)],
      )
        ..likedResult = false
        ..likeCountResult = 9;
      final bloc = _bloc(repo, threshold: const Duration(days: 1));
      addTearDown(bloc.close);

      bloc.add(const StatusFeedStarted());
      await bloc.stream.firstWhere((s) => s.status == StatusFeedStatus.ready);

      bloc.add(const StatusFeedLikeToggled());
      final optimistic = await bloc.stream.first;
      expect(optimistic.items.first.likedByMe, isFalse);
      expect(optimistic.items.first.likeCount, 9);
    });
  });

  group('navigation + pagination', () {
    test('Next advances the active card (analytics dropped: no Sheet row)',
        () async {
      // Removed: `status_next_tapped` was dropped as an orphan — Sheet 1
      // rows 86–101 have no matching row, so the event is deleted from the
      // contract. `viaNext` remains on the event for future routing hooks
      // (page-view attribution, etc.).
      final repo = FakeStatusRepository();
      final analytics = RecordingAnalytics();
      final bloc = _bloc(repo, analytics: analytics, threshold: const Duration(days: 1));
      addTearDown(bloc.close);

      bloc.add(const StatusFeedStarted());
      await bloc.stream.firstWhere((s) => s.status == StatusFeedStatus.ready);

      bloc.add(const StatusFeedIndexChanged(1, viaNext: true));
      await bloc.stream.firstWhere((s) => s.activeIndex == 1);

      expect(bloc.state.activeItem?.id, 's1');
      expect(analytics.names, isNot(contains('status_next_tapped')));
    });

    test('a plain swipe advances the active card and fires no navigation event',
        () async {
      final repo = FakeStatusRepository();
      final analytics = RecordingAnalytics();
      final bloc = _bloc(repo, analytics: analytics, threshold: const Duration(days: 1));
      addTearDown(bloc.close);

      bloc.add(const StatusFeedStarted());
      await bloc.stream.firstWhere((s) => s.status == StatusFeedStatus.ready);

      bloc.add(const StatusFeedIndexChanged(1));
      await bloc.stream.firstWhere((s) => s.activeIndex == 1);

      expect(analytics.names, isNot(contains('status_next_tapped')));
    });

    test('approaching the tail pulls the next cursor page', () async {
      final repo = FakeStatusRepository(pageSize: 6);
      final bloc = _bloc(repo, threshold: const Duration(days: 1));
      addTearDown(bloc.close);

      bloc.add(const StatusFeedStarted());
      await bloc.stream.firstWhere((s) => s.status == StatusFeedStatus.ready);
      expect(bloc.state.items, hasLength(6));

      bloc.add(const StatusFeedIndexChanged(4));
      await bloc.stream.firstWhere((s) => s.items.length > 6);

      expect(bloc.state.items, hasLength(8)); // the 8-item fixture, fully loaded
      expect(bloc.state.hasMore, isFalse);
    });

    test('an out-of-range index is ignored', () async {
      final repo = FakeStatusRepository();
      final bloc = _bloc(repo, threshold: const Duration(days: 1));
      addTearDown(bloc.close);

      bloc.add(const StatusFeedStarted());
      await bloc.stream.firstWhere((s) => s.status == StatusFeedStatus.ready);

      bloc.add(const StatusFeedIndexChanged(99));
      await Future<void>.delayed(const Duration(milliseconds: 20));
      expect(bloc.state.activeIndex, 0);
    });
  });

  group('pinnedId (TAM-166 — chat status-card deep link)', () {
    test('a pin arriving on a filtered feed drops the deity filter',
        () async {
      final repo = FakeStatusRepository(pageSize: 6);
      final bloc = _bloc(repo, threshold: const Duration(days: 1));
      addTearDown(bloc.close);

      bloc.add(const StatusFeedStarted());
      await bloc.stream.firstWhere((s) => s.status == StatusFeedStatus.ready);
      bloc.add(const StatusFeedDeitySelected('hanuman'));
      await bloc.stream.firstWhere(
        (s) => s.status == StatusFeedStatus.ready && s.deitySlug == 'hanuman',
      );

      // Chat pins a status onto the already-open Status page.
      bloc.add(const StatusFeedStarted(pinnedStatusId: 'pin-xyz'));
      await bloc.stream.firstWhere((s) => s.status == StatusFeedStatus.loading);
      await bloc.stream.firstWhere((s) => s.status == StatusFeedStatus.ready);

      expect(bloc.state.deitySlug, isNull);
      expect(repo.lastFeedDeityId, isNull,
          reason: 'a filter could exclude the pinned id server-side');
      expect(repo.lastFeedPinnedId, 'pin-xyz');
      expect(bloc.state.activeIndex, 0);
    });

    test(
        'FIRST fetchFeed carries pinnedId, subsequent load-more calls do NOT '
        'and state remembers the pinnedStatusId', () async {
      final repo = FakeStatusRepository(pageSize: 6);
      final bloc = _bloc(repo, threshold: const Duration(days: 1));
      addTearDown(bloc.close);

      bloc.add(const StatusFeedStarted(pinnedStatusId: 'pin-xyz'));
      await bloc.stream.firstWhere((s) => s.status == StatusFeedStatus.ready);

      // First page carried the pin through to the repo…
      expect(repo.pinnedIdCalls, ['pin-xyz']);
      expect(repo.lastFeedPinnedId, 'pin-xyz');
      // …and the state remembers it across its lifetime (for audit/debug).
      expect(bloc.state.pinnedStatusId, 'pin-xyz');

      // Approaching the tail pulls the next cursor page (auto-triggered by
      // `_onIndexChanged` — same path as production). That page must NOT
      // re-send the pin (backend ignores it on cursor pages anyway — this
      // is the client-side defense in depth).
      bloc.add(const StatusFeedIndexChanged(4));
      await bloc.stream.firstWhere((s) => s.items.length > 6);

      expect(repo.pinnedIdCalls, ['pin-xyz', null],
          reason: 'cursor page (load-more) must NOT re-send pinnedId');
      expect(bloc.state.pinnedStatusId, 'pin-xyz',
          reason: 'state retains the pin id even after load-more');
    });

    test('deity re-select after a pinned start does NOT re-send pinnedId',
        () async {
      final repo = FakeStatusRepository();
      final bloc = _bloc(repo, threshold: const Duration(days: 1));
      addTearDown(bloc.close);

      bloc.add(const StatusFeedStarted(pinnedStatusId: 'pin-xyz'));
      await bloc.stream.firstWhere((s) => s.status == StatusFeedStatus.ready);

      bloc.add(const StatusFeedDeitySelected('hanuman'));
      await bloc.stream.firstWhere(
        (s) => s.status == StatusFeedStatus.ready && s.deitySlug == 'hanuman',
      );

      // The deity re-fetch is a fresh page-1 request driven by the filter,
      // NOT by the deep link — must NOT re-carry the pin.
      expect(repo.pinnedIdCalls, ['pin-xyz', null]);
    });

    test('no pinnedStatusId ⇒ pinnedId omitted (existing tab-branch entry)',
        () async {
      final repo = FakeStatusRepository();
      final bloc = _bloc(repo, threshold: const Duration(days: 1));
      addTearDown(bloc.close);

      bloc.add(const StatusFeedStarted());
      await bloc.stream.firstWhere((s) => s.status == StatusFeedStatus.ready);

      expect(repo.pinnedIdCalls, [null]);
      expect(bloc.state.pinnedStatusId, isNull);
    });
  });

  test('profile refresh re-reads the active profile (overlay follows the save)',
      () async {
    final repo = FakeStatusRepository(profile: StatusProfileData.empty);
    final bloc = _bloc(repo, threshold: const Duration(days: 1));
    addTearDown(bloc.close);

    bloc.add(const StatusFeedStarted());
    await bloc.stream.firstWhere((s) => s.status == StatusFeedStatus.ready);
    expect(bloc.state.profile.hasNameOrPhoto, isFalse);

    // TAM-168 — mobile only saves personal profiles now. Simulates the
    // details flow having saved a name.
    await repo.saveProfile(statusPersonalProfileFixture());

    bloc.add(const StatusFeedProfileRefreshed());
    await bloc.stream.firstWhere((s) => s.profile.hasNameOrPhoto);

    expect(bloc.state.profile.overlayTitle, 'Aditya Nath');
  });
}
