import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/session_context.dart';
import 'package:mobile/features/home/data/home_models.dart';
import 'package:mobile/features/home/feed/bloc/home_feed_bloc.dart';
import 'package:mobile/features/home/feed/bloc/home_feed_event.dart';
import 'package:mobile/features/home/feed/bloc/home_feed_state.dart';
import 'package:mobile/features/home/home_analytics.dart';

import '../support/fake_analytics.dart';
import '../support/fake_home_services.dart';

/// [HomeFeedBloc] unit tests (TAM-62 Testing Strategy → Unit Tests).
void main() {
  HomeFeedBloc build(
    FakeHomeRepository repo, {
    RecordingAnalytics? analytics,
    SessionContext? sessionContext,
    Duration viewThreshold = const Duration(milliseconds: 10),
  }) =>
      HomeFeedBloc(
        repository: repo,
        analytics: analytics,
        sessionContext: sessionContext,
        viewThreshold: viewThreshold,
      );

  group('load', () {
    test('loads banners + the first feed page and fires home_screen_viewed',
        () async {
      final analytics = RecordingAnalytics();
      final bloc = build(FakeHomeRepository(), analytics: analytics);
      addTearDown(bloc.close);

      bloc.add(const HomeStarted());
      await pumpEventQueue();

      expect(bloc.state.bannerStatus, HomeSectionStatus.ready);
      expect(bloc.state.banners, hasLength(4));
      expect(bloc.state.feedStatus, HomeSectionStatus.ready);
      expect(bloc.state.items, hasLength(3)); // pageSize
      expect(analytics.fired(HomeEvents.pageViewed), isTrue);
      // Sheet 1 row 27 — `home_page_viewed` carries entry_source +
      // load_time_ms. entry_source falls back to cold_start when no
      // SessionContext is wired (the default in this test build).
      final props = analytics.propsFor(HomeEvents.pageViewed);
      expect(props[HomeEventProps.entrySource], HomeEntrySource.coldStart);
      expect(props[HomeEventProps.loadTimeMs], isA<int>());
      expect((props[HomeEventProps.loadTimeMs] as int) >= 0, isTrue);
    });

    test(
        'home_page_viewed picks up SessionContext.entrySource so a resume '
        'from background is attributed as `resume`, not `cold_start`',
        () async {
      final analytics = RecordingAnalytics();
      final session = SessionContext()..markResume();
      final bloc = build(
        FakeHomeRepository(),
        analytics: analytics,
        sessionContext: session,
      );
      addTearDown(bloc.close);

      bloc.add(const HomeStarted());
      await pumpEventQueue();

      expect(
        analytics.propsFor(HomeEvents.pageViewed)[HomeEventProps.entrySource],
        HomeEntrySource.resume,
      );
    });

    test(
        'home_page_viewed fires AFTER the loaders resolve — its load_time_ms '
        'measures actual time-to-viewable, not time-to-mount', () async {
      final analytics = RecordingAnalytics();
      final bloc = build(FakeHomeRepository(), analytics: analytics);
      addTearDown(bloc.close);

      bloc.add(const HomeStarted());
      // Before the loaders resolve, the event MUST NOT have fired — otherwise
      // its `load_time_ms` would be zero on every event and the property
      // would be useless.
      expect(analytics.fired(HomeEvents.pageViewed), isFalse);
      await pumpEventQueue();
      expect(analytics.fired(HomeEvents.pageViewed), isTrue);
    });

    test('feed is MIXED and preserves server order — never grouped by type',
        () async {
      final bloc = build(FakeHomeRepository(pageSize: 6));
      addTearDown(bloc.close);

      bloc.add(const HomeStarted());
      await pumpEventQueue();

      // The fixture interleaves wallpaper → aarti → status → ringtone → mantra
      // → wallpaper. Any client-side grouping would cluster the two wallpapers.
      expect(
        bloc.state.items.map((i) => i.contentType.wire).toList(),
        ['wallpaper', 'aarti', 'status', 'ringtone', 'mantra', 'wallpaper'],
      );
    });

    test('banner failure HIDES the section but leaves the feed intact',
        () async {
      final bloc = build(FakeHomeRepository(failBanners: true));
      addTearDown(bloc.close);

      bloc.add(const HomeStarted());
      await pumpEventQueue();

      expect(bloc.state.showBanners, isFalse);
      expect(bloc.state.banners, isEmpty);
      // Independent sections: the feed still loaded.
      expect(bloc.state.feedStatus, HomeSectionStatus.ready);
      expect(bloc.state.items, isNotEmpty);
    });

    test('feed failure shows retry but leaves the banners intact', () async {
      final bloc = build(FakeHomeRepository(failFeed: true));
      addTearDown(bloc.close);

      bloc.add(const HomeStarted());
      await pumpEventQueue();

      expect(bloc.state.showFeedRetry, isTrue);
      expect(bloc.state.bannerStatus, HomeSectionStatus.ready);
      expect(bloc.state.banners, isNotEmpty);
    });

    test('a banner with no media is dropped; the rest still render', () async {
      final bloc = build(FakeHomeRepository(banners: [
        homeBanner(
          id: 'ok',
          destinationType: HomeDestinationType.linkedModule,
          destinationValue: 'wallpaper',
        ),
        homeBanner(
          id: 'broken',
          destinationType: HomeDestinationType.linkedModule,
          destinationValue: 'wallpaper',
          mediaUrl: '',
        ),
      ]));
      addTearDown(bloc.close);

      bloc.add(const HomeStarted());
      await pumpEventQueue();

      expect(bloc.state.banners.map((b) => b.id), ['ok']);
      expect(bloc.state.showBanners, isTrue);
    });

    test('empty feed hides the section (no retry — nothing failed)', () async {
      final bloc = build(FakeHomeRepository(items: const []));
      addTearDown(bloc.close);

      bloc.add(const HomeStarted());
      await pumpEventQueue();

      expect(bloc.state.showFeed, isFalse);
      expect(bloc.state.showFeedRetry, isFalse);
    });
  });

  group('pagination', () {
    test('appends the next cursor page', () async {
      final repo = FakeHomeRepository(pageSize: 2);
      final bloc = build(repo);
      addTearDown(bloc.close);

      bloc.add(const HomeStarted());
      await pumpEventQueue();
      expect(bloc.state.items, hasLength(2));
      expect(bloc.state.hasMore, isTrue);

      bloc.add(const HomeFeedMoreRequested());
      await pumpEventQueue();

      expect(bloc.state.items, hasLength(4));
      expect(repo.feedCursors, [null, '2']);
      // Still server order across the page boundary.
      expect(
        bloc.state.items.map((i) => i.id),
        ['f-wallpaper', 'f-aarti', 'f-status', 'f-ringtone'],
      );
    });

    test('stops at the last page (nextCursor null)', () async {
      final bloc = build(FakeHomeRepository(pageSize: 6));
      addTearDown(bloc.close);

      bloc.add(const HomeStarted());
      await pumpEventQueue();

      expect(bloc.state.hasMore, isFalse);
      bloc.add(const HomeFeedMoreRequested());
      await pumpEventQueue();
      expect(bloc.state.items, hasLength(6)); // no-op
    });

    test('a pagination failure is SILENT — the loaded feed keeps working',
        () async {
      final repo = FakeHomeRepository(pageSize: 2);
      final bloc = build(repo);
      addTearDown(bloc.close);

      bloc.add(const HomeStarted());
      await pumpEventQueue();
      repo.failFeed = true;

      bloc.add(const HomeFeedMoreRequested());
      await pumpEventQueue();

      expect(bloc.state.items, hasLength(2)); // page 1 survives
      expect(bloc.state.feedStatus, HomeSectionStatus.ready);
      expect(bloc.state.errorMessage, isNull);
      expect(bloc.state.loadingMore, isFalse);
    });

    test('retry re-requests the feed and fires home_feed_retry_tapped',
        () async {
      final analytics = RecordingAnalytics();
      final repo = FakeHomeRepository(failFeed: true);
      final bloc = build(repo, analytics: analytics);
      addTearDown(bloc.close);

      bloc.add(const HomeStarted());
      await pumpEventQueue();
      expect(bloc.state.showFeedRetry, isTrue);

      repo.failFeed = false;
      bloc.add(const HomeFeedRetryRequested());
      await pumpEventQueue();

      expect(bloc.state.feedStatus, HomeSectionStatus.ready);
      expect(bloc.state.items, isNotEmpty);
      // Removed: home_feed_retry_tapped dropped from analytics contract.
    });
  });

  group('view threshold (2s @ ≥50%)', () {
    test('fires home_feed_item_viewed only after the dwell elapses', () async {
      final analytics = RecordingAnalytics();
      final repo = FakeHomeRepository();
      final bloc = build(
        repo,
        analytics: analytics,
        viewThreshold: const Duration(milliseconds: 50),
      );
      addTearDown(bloc.close);

      bloc.add(const HomeStarted());
      await pumpEventQueue();

      bloc.add(const HomeFeedItemVisibilityChanged(
        itemId: 'f-wallpaper',
        visible: true,
      ));
      await Future<void>.delayed(const Duration(milliseconds: 20));
      // Not yet — only 20ms of the 50ms dwell.
      expect(analytics.fired(HomeEvents.contentViewed), isFalse);

      await Future<void>.delayed(const Duration(milliseconds: 50));
      await pumpEventQueue();

      expect(analytics.fired(HomeEvents.contentViewed), isTrue);
      expect(bloc.state.viewedIds, contains('f-wallpaper'));
      // …and it POSTed to /home/engagement/view.
      expect(repo.viewCalls, ['f-wallpaper']);
    });

    test('scrolling past before the dwell cancels the timer — no view',
        () async {
      final analytics = RecordingAnalytics();
      final repo = FakeHomeRepository();
      final bloc = build(
        repo,
        analytics: analytics,
        viewThreshold: const Duration(milliseconds: 50),
      );
      addTearDown(bloc.close);

      bloc.add(const HomeStarted());
      await pumpEventQueue();

      bloc.add(const HomeFeedItemVisibilityChanged(
        itemId: 'f-wallpaper',
        visible: true,
      ));
      await Future<void>.delayed(const Duration(milliseconds: 20));
      bloc.add(const HomeFeedItemVisibilityChanged(
        itemId: 'f-wallpaper',
        visible: false,
      ));
      await Future<void>.delayed(const Duration(milliseconds: 60));
      await pumpEventQueue();

      expect(analytics.fired(HomeEvents.contentViewed), isFalse);
      expect(repo.viewCalls, isEmpty);
    });

    test('deduped per session — re-entering the viewport never re-counts',
        () async {
      final analytics = RecordingAnalytics();
      final repo = FakeHomeRepository();
      final bloc = build(
        repo,
        analytics: analytics,
        viewThreshold: const Duration(milliseconds: 20),
      );
      addTearDown(bloc.close);

      bloc.add(const HomeStarted());
      await pumpEventQueue();

      for (var i = 0; i < 3; i++) {
        bloc.add(const HomeFeedItemVisibilityChanged(
          itemId: 'f-wallpaper',
          visible: true,
        ));
        await Future<void>.delayed(const Duration(milliseconds: 40));
        await pumpEventQueue();
        bloc.add(const HomeFeedItemVisibilityChanged(
          itemId: 'f-wallpaper',
          visible: false,
        ));
        await pumpEventQueue();
      }

      expect(analytics.allProps(HomeEvents.contentViewed), hasLength(1));
      expect(repo.viewCalls, ['f-wallpaper']);
    });

    test('impression fires once per item, on the first visible pixel', () async {
      final analytics = RecordingAnalytics();
      final bloc = build(FakeHomeRepository(), analytics: analytics);
      addTearDown(bloc.close);

      bloc.add(const HomeStarted());
      await pumpEventQueue();

      bloc
        ..add(const HomeFeedItemImpressed('f-wallpaper'))
        ..add(const HomeFeedItemImpressed('f-wallpaper'))
        ..add(const HomeFeedItemImpressed('f-aarti'));
      await pumpEventQueue();

      // Removed: home_feed_item_impression dropped; per-item impressions now
      // aggregate into `home_feed_depth_reached` (Sheet 1 row 39) at
      // checkpoints 10 / 25 / 50 / 100.
      expect(bloc.state.impressedIds, containsAll(['f-wallpaper', 'f-aarti']));
    });

    test(
        'home_feed_depth_reached fires once each at 10/25/50/100 impressions',
        () async {
      // Sheet 1 row 39 — one checkpoint fire per session at 10/25/50/100.
      // Drive 105 distinct impressions through a synthetic-item fixture so
      // every checkpoint is crossed; re-impressing an already-impressed id
      // must not double-fire (idempotence per session).
      final items = List<HomeFeedItemView>.generate(
        105,
        (i) => homeFeedItem(
          id: 'depth-$i',
          contentType: HomeContentType.wallpaper,
          module: 'wallpaper',
        ),
      );
      final analytics = RecordingAnalytics();
      final bloc = build(
        FakeHomeRepository(items: items, pageSize: 105),
        analytics: analytics,
      );
      addTearDown(bloc.close);

      bloc.add(const HomeStarted());
      await pumpEventQueue();

      for (final item in items) {
        bloc.add(HomeFeedItemImpressed(item.id));
      }
      // Re-impress the first 30 — must not re-fire any checkpoint.
      for (var i = 0; i < 30; i++) {
        bloc.add(HomeFeedItemImpressed('depth-$i'));
      }
      await pumpEventQueue();

      final fires = analytics.allProps(HomeEvents.feedDepthReached);
      expect(
        fires.map((p) => p[HomeEventProps.itemsSeenCount]).toList(),
        [10, 25, 50, 100],
      );
    });

    test('a failed view POST never surfaces to the user', () async {
      final repo = FakeHomeRepository(failView: true);
      final bloc = build(repo, viewThreshold: const Duration(milliseconds: 10));
      addTearDown(bloc.close);

      bloc.add(const HomeStarted());
      await pumpEventQueue();
      bloc.add(const HomeFeedItemVisibilityChanged(
        itemId: 'f-wallpaper',
        visible: true,
      ));
      await Future<void>.delayed(const Duration(milliseconds: 30));
      await pumpEventQueue();

      expect(bloc.state.errorMessage, isNull);
      expect(bloc.state.viewedIds, contains('f-wallpaper'));
    });
  });

  group('like', () {
    test('optimistic: updates immediately, then reconciles to the server truth',
        () async {
      final analytics = RecordingAnalytics();
      final repo = FakeHomeRepository(latency: const Duration(milliseconds: 30));
      final bloc = build(repo, analytics: analytics);
      addTearDown(bloc.close);

      bloc.add(const HomeStarted());
      await Future<void>.delayed(const Duration(milliseconds: 100));
      await pumpEventQueue();

      final before = bloc.state.items.first;
      expect(before.likedByMe, isFalse);

      bloc.add(HomeFeedLikeToggled(before.id));
      // Immediately — before the repo call resolves.
      await Future<void>.delayed(const Duration(milliseconds: 5));
      expect(bloc.state.items.first.likedByMe, isTrue);
      expect(bloc.state.items.first.likeCount, before.likeCount + 1);

      await Future<void>.delayed(const Duration(milliseconds: 60));
      await pumpEventQueue();
      expect(bloc.state.items.first.likedByMe, isTrue);
      expect(
        analytics.propsFor(HomeEvents.contentLikeChanged)[HomeEventProps.action],
        'like',
      );
    });

    test('reverts to the pre-tap truth when the repository fails', () async {
      final repo = FakeHomeRepository(failLike: true);
      final bloc = build(repo);
      addTearDown(bloc.close);

      bloc.add(const HomeStarted());
      await pumpEventQueue();

      final before = bloc.state.items.first;
      bloc.add(HomeFeedLikeToggled(before.id));
      await pumpEventQueue();

      expect(bloc.state.items.first.likedByMe, before.likedByMe);
      expect(bloc.state.items.first.likeCount, before.likeCount);
      expect(bloc.state.errorMessage, isNotNull);
    });
  });

  group('share', () {
    test('records the share and updates the count', () async {
      final repo = FakeHomeRepository();
      final bloc = build(repo);
      addTearDown(bloc.close);

      bloc.add(const HomeStarted());
      await pumpEventQueue();
      final before = bloc.state.items.first;

      bloc.add(HomeFeedShared(before.id));
      await pumpEventQueue();

      expect(repo.shareCalls, [before.id]);
      expect(bloc.state.items.first.shareCount, before.shareCount + 1);
    });

    test('a failed share POST never surfaces — the sheet already opened',
        () async {
      final bloc = build(FakeHomeRepository(failShare: true));
      addTearDown(bloc.close);

      bloc.add(const HomeStarted());
      await pumpEventQueue();
      bloc.add(const HomeFeedShared('f-wallpaper'));
      await pumpEventQueue();

      expect(bloc.state.errorMessage, isNull);
    });
  });
}
