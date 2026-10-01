import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/wallpaper/preview/bloc/wallpaper_preview_bloc.dart';
import 'package:mobile/features/wallpaper/preview/bloc/wallpaper_preview_event.dart';
import 'package:mobile/features/wallpaper/wallpaper_analytics.dart';
import 'package:mobile/features/wallpaper/wallpaper_routes.dart';

import 'package:mobile/core/app_config.dart';

import '../support/fake_analytics.dart';
import '../support/fake_repositories.dart';
import '../support/fake_share_service.dart';

void main() {
  setUpAll(() {
    // `buildShareUrl` reads AppConfig.instance.shareHost.
    AppConfig.debugSetInstance(
      AppConfig.forTest(shareHost: 'https://share.example'),
    );
  });

  WallpaperPreviewBloc build(
    FakeWallpaperRepository repo, {
    FakeShareService? share,
    RecordingAnalytics? analytics,
  }) =>
      WallpaperPreviewBloc(
        repository: repo,
        shareService: share ?? FakeShareService(),
        analytics: analytics,
        paginateThreshold: 2,
      );

  WallpaperPreviewArgs seededArgs({int start = 0, String? cursor}) {
    final feed = wallpaperListingFixture(); // 15 items
    return WallpaperPreviewArgs(
      items: feed.take(8).toList(),
      startIndex: start,
      query: const WallpaperListQuery(title: 'Durga', deityId: 'durga'),
      nextCursor: cursor ?? '8',
    );
  }

  test('seeds the feed + resolves active detail; preview_viewed fires',
      () async {
    final repo = FakeWallpaperRepository();
    final analytics = RecordingAnalytics();
    final bloc = build(repo, analytics: analytics)
      ..add(WallpaperPreviewStarted(seededArgs(start: 0)));

    await bloc.stream.firstWhere((s) => s.activeDetail != null);
    expect(bloc.state.items.length, 8);
    expect(bloc.state.activeIndex, 0);
    expect(analytics.fired(WallpaperEvents.previewViewed), isTrue);
    await bloc.close();
  });

  test('swipe advances active index within the same context + fires swiped '
      'with from/to ids + direction', () async {
    final repo = FakeWallpaperRepository();
    final analytics = RecordingAnalytics();
    final bloc = build(repo, analytics: analytics)
      ..add(WallpaperPreviewStarted(seededArgs()));
    await bloc.stream.firstWhere((s) => s.activeDetail != null);
    final fromId = bloc.state.activeItem!.id;

    bloc.add(const WallpaperPreviewIndexChanged(1));
    await bloc.stream.firstWhere((s) => s.activeIndex == 1);
    expect(analytics.fired(WallpaperEvents.swiped), isTrue);
    final props = analytics.propsFor(WallpaperEvents.swiped);
    expect(props[WallpaperEventProps.fromWallpaperId], fromId);
    expect(props[WallpaperEventProps.toWallpaperId], bloc.state.activeItem!.id);
    expect(
      props[WallpaperEventProps.direction],
      WallpaperEventProps.directionForward,
    );
    await bloc.close();
  });

  test('nearing the end paginates the same source feed', () async {
    final repo = FakeWallpaperRepository(pageSize: 7);
    final bloc = build(repo)..add(WallpaperPreviewStarted(seededArgs(cursor: '8')));
    await bloc.stream.firstWhere((s) => s.activeDetail != null);

    // Move to index 6 (of 8) → within threshold (2) of the end → paginate.
    bloc.add(const WallpaperPreviewIndexChanged(6));
    final s = await bloc.stream.firstWhere((s) => s.items.length > 8);
    expect(s.items.length, greaterThan(8));
    expect(repo.fetchListCalls, greaterThanOrEqualTo(1));
    await bloc.close();
  });

  test('like toggle is optimistic and confirmed by the server', () async {
    final repo = FakeWallpaperRepository();
    final analytics = RecordingAnalytics();
    final bloc = build(repo, analytics: analytics)
      ..add(WallpaperPreviewStarted(seededArgs()));
    await bloc.stream.firstWhere((s) => s.activeDetail != null);

    final before = bloc.state.activeItem!.likedByMe;
    bloc.add(const WallpaperPreviewLikeToggled());
    final s = await bloc.stream.firstWhere((s) => s.activeItem!.likedByMe == true);
    expect(before, isFalse);
    expect(s.activeItem!.likedByMe, isTrue);
    expect(s.activeItem!.likeCount, 12501); // server-authoritative
    expect(analytics.fired(WallpaperEvents.likeChanged), isTrue);
    expect(
      analytics.propsFor(WallpaperEvents.likeChanged)[
          WallpaperEventProps.action],
      WallpaperEventProps.actionLike,
    );
    await bloc.close();
  });

  test('like failure reverts + surfaces an error', () async {
    final repo = FakeWallpaperRepository(failLike: true);
    final bloc = build(repo)..add(WallpaperPreviewStarted(seededArgs()));
    await bloc.stream.firstWhere((s) => s.activeDetail != null);

    final original = bloc.state.activeItem!;
    bloc.add(const WallpaperPreviewLikeToggled());
    final s = await bloc.stream.firstWhere((s) => s.errorMessage != null);
    expect(s.activeItem!.likedByMe, original.likedByMe);
    expect(s.activeItem!.likeCount, original.likeCount);
    await bloc.close();
  });

  test('share sends deep link + thumbnail (never the apply asset) + counts + '
      'fires share_clicked and share_result', () async {
    final repo = FakeWallpaperRepository();
    final share = FakeShareService();
    final analytics = RecordingAnalytics();
    final bloc = build(repo, share: share, analytics: analytics)
      ..add(WallpaperPreviewStarted(seededArgs()));
    await bloc.stream.firstWhere((s) => s.activeDetail != null);

    final id = bloc.state.activeItem!.id;
    bloc.add(const WallpaperPreviewShareRequested());
    await bloc.stream.firstWhere((s) => s.activeItem!.shareCount == 3201);

    expect(share.lastShare, isNotNull);
    // The canonical HTTPS App Link, NEVER the `prabhuji://` custom scheme:
    // messaging apps don't linkify unknown schemes, so a custom-scheme
    // share arrives as dead plain text and never reaches the Play Store.
    expect(share.lastShare!.deepLink, 'https://share.example/app/wallpaper/$id');
    expect(share.lastShare!.deepLink, isNot(startsWith('prabhuji://')));
    expect(analytics.fired(WallpaperEvents.shareClicked), isTrue);
    expect(analytics.fired(WallpaperEvents.shareResult), isTrue);
    await bloc.close();
  });

  test('set-count update reflects a confirmed native set', () async {
    final repo = FakeWallpaperRepository();
    final bloc = build(repo)..add(WallpaperPreviewStarted(seededArgs()));
    await bloc.stream.firstWhere((s) => s.activeDetail != null);

    final id = bloc.state.activeItem!.id;
    bloc.add(WallpaperPreviewSetCountUpdated(wallpaperId: id, setCount: 999999));
    final s = await bloc.stream.firstWhere(
      (s) => s.items.any((e) => e.id == id && e.setCount == 999999),
    );
    expect(s.items.firstWhere((e) => e.id == id).setCount, 999999);
    await bloc.close();
  });
}
