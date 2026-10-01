import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/wallpaper/data/set_wallpaper_service.dart';
import 'package:mobile/features/wallpaper/data/wallpaper_models.dart';
import 'package:mobile/features/wallpaper/preview/bloc/set_wallpaper_bloc.dart';
import 'package:mobile/features/wallpaper/preview/bloc/set_wallpaper_event.dart';
import 'package:mobile/features/wallpaper/preview/bloc/set_wallpaper_state.dart';
import 'package:mobile/features/wallpaper/wallpaper_analytics.dart';

import '../support/fake_analytics.dart';
import '../support/fake_repositories.dart';
import '../support/fake_set_wallpaper_service.dart';

/// The Pro-gated native set state machine (TAM-70 §5/§6.12) — the single most
/// important piece. Exercised with fakes (no device, no navigator).
void main() {
  SetWallpaperBloc build({
    required FakeSetWallpaperService service,
    required FakeWallpaperRepository repo,
    required bool Function() isPro,
    Future<void> Function()? refresh,
    Future<void> Function()? openPaywall,
    RecordingAnalytics? analytics,
  }) =>
      SetWallpaperBloc(
        service: service,
        repository: repo,
        isPro: isPro,
        refreshEntitlement: refresh ?? () async {},
        openPaywall: openPaywall ?? () async {},
        analytics: analytics,
      );

  const staticEvent = SetWallpaperRequested(
    wallpaperId: 'wp1',
    mediaType: WallpaperMediaType.static_,
    target: WallpaperTarget.home,
    imageUrl: 'https://cdn/apply/wp1.jpg',
    deitySlug: 'hanuman',
  );

  group('Pro gate', () {
    test('Pro user → native call directly, no paywall', () async {
      final service = FakeSetWallpaperService();
      final repo = FakeWallpaperRepository();
      var paywallOpened = false;
      final bloc = build(
        service: service,
        repo: repo,
        isPro: () => true,
        openPaywall: () async => paywallOpened = true,
      );

      bloc.add(staticEvent);
      await bloc.stream.firstWhere((s) => s.status == SetWallpaperStatus.success);

      expect(paywallOpened, isFalse);
      expect(service.staticCalls, 1);
      expect(service.lastTarget, WallpaperTarget.home);
      await bloc.close();
    });

    test('free user → paywall dismissed → set_wallpaper_result cancelled, '
        'no native call, no paywall events (Paywall module owns those)',
        () async {
      final service = FakeSetWallpaperService();
      final repo = FakeWallpaperRepository();
      final analytics = RecordingAnalytics();
      var pro = false;
      final bloc = build(
        service: service,
        repo: repo,
        isPro: () => pro,
        openPaywall: () async {}, // user dismisses without buying
        refresh: () async {}, // still free after refresh
        analytics: analytics,
      );

      bloc.add(staticEvent);
      final cancelled = await bloc.stream
          .firstWhere((s) => s.status == SetWallpaperStatus.cancelled);

      expect(cancelled.status, SetWallpaperStatus.cancelled);
      expect(service.staticCalls, 0);
      // Set-result resolves for every attempt — including the cancelled one.
      expect(analytics.fired(WallpaperEvents.setWallpaperResult), isTrue);
      expect(
        analytics.propsFor(WallpaperEvents.setWallpaperResult)[
            WallpaperEventProps.result],
        WallpaperEventProps.resultCancelled,
      );
      expect(
        analytics.propsFor(WallpaperEvents.setWallpaperResult)[
            WallpaperEventProps.deitySlug],
        'hanuman',
      );
      expect(repo.incrementCalls, 0);
      await bloc.close();
    });

    test('free user → purchase → resume set (native call + count) + '
        'set_wallpaper_result success', () async {
      final service = FakeSetWallpaperService();
      final repo = FakeWallpaperRepository();
      final analytics = RecordingAnalytics();
      var pro = false;
      final bloc = build(
        service: service,
        repo: repo,
        isPro: () => pro,
        openPaywall: () async {}, // paywall presented
        refresh: () async => pro = true, // purchase succeeds
        analytics: analytics,
      );

      bloc.add(staticEvent);
      final success = await bloc.stream
          .firstWhere((s) => s.status == SetWallpaperStatus.success);

      expect(service.staticCalls, 1);
      expect(analytics.fired(WallpaperEvents.setWallpaperResult), isTrue);
      expect(
        analytics.propsFor(WallpaperEvents.setWallpaperResult)[
            WallpaperEventProps.result],
        WallpaperEventProps.resultSuccess,
      );
      expect(success.setCount, isNotNull);
      expect(repo.incrementCalls, 1);
      await bloc.close();
    });
  });

  group('native result branches (Pro)', () {
    test('success → count increment + set_wallpaper_result success', () async {
      final service = FakeSetWallpaperService();
      final repo = FakeWallpaperRepository();
      final analytics = RecordingAnalytics();
      final bloc = build(
        service: service,
        repo: repo,
        isPro: () => true,
        analytics: analytics,
      );

      bloc.add(staticEvent);
      final s = await bloc.stream
          .firstWhere((s) => s.status == SetWallpaperStatus.success);

      expect(repo.incrementCalls, 1);
      expect(s.setCount, repo.setCount);
      final props = analytics.propsFor(WallpaperEvents.setWallpaperResult);
      expect(props[WallpaperEventProps.result],
          WallpaperEventProps.resultSuccess);
      expect(props[WallpaperEventProps.setTarget],
          WallpaperEventProps.setTargetHomeScreen);
      expect(props[WallpaperEventProps.mediaType], 'static_');
      // `deity_slug` — the deity the SET wallpaper belongs to, so the set
      // funnel can be grouped by deity.
      expect(props[WallpaperEventProps.deitySlug], 'hanuman');
      await bloc.close();
    });

    test('unsupported → exact PRD message + unsupported_action_viewed + '
        'set_wallpaper_result unsupported, NO count increment', () async {
      final service =
          FakeSetWallpaperService(staticResult: WallpaperSetResult.unsupported);
      final repo = FakeWallpaperRepository();
      final analytics = RecordingAnalytics();
      final bloc = build(
        service: service,
        repo: repo,
        isPro: () => true,
        analytics: analytics,
      );

      bloc.add(staticEvent);
      final s = await bloc.stream
          .firstWhere((s) => s.status == SetWallpaperStatus.unsupported);

      expect(s.message, SetWallpaperState.unsupportedCopy);
      expect(repo.incrementCalls, 0);
      expect(
        analytics.fired(WallpaperEvents.unsupportedActionViewed),
        isTrue,
      );
      expect(analytics.fired(WallpaperEvents.setWallpaperResult), isTrue);
      expect(
        analytics.propsFor(WallpaperEvents.setWallpaperResult)[
            WallpaperEventProps.result],
        WallpaperEventProps.resultUnsupported,
      );
      expect(
        analytics.propsFor(WallpaperEvents.setWallpaperResult)[
            WallpaperEventProps.deitySlug],
        'hanuman',
      );
      await bloc.close();
    });

    test('failed → retry copy + set_wallpaper_result failure, NO count '
        'increment', () async {
      final service =
          FakeSetWallpaperService(staticResult: WallpaperSetResult.failed);
      final repo = FakeWallpaperRepository();
      final analytics = RecordingAnalytics();
      final bloc = build(
        service: service,
        repo: repo,
        isPro: () => true,
        analytics: analytics,
      );

      bloc.add(staticEvent);
      final s = await bloc.stream
          .firstWhere((s) => s.status == SetWallpaperStatus.failed);

      expect(s.message, SetWallpaperState.failedCopy);
      expect(repo.incrementCalls, 0);
      final props = analytics.propsFor(WallpaperEvents.setWallpaperResult);
      expect(props[WallpaperEventProps.result],
          WallpaperEventProps.resultFailure);
      expect(props[WallpaperEventProps.errorCode], 'set_failed');
      expect(props[WallpaperEventProps.deitySlug], 'hanuman');
      await bloc.close();
    });

    test('thrown native exception → treated as failed', () async {
      final service = FakeSetWallpaperService(throwOnStatic: true);
      final repo = FakeWallpaperRepository();
      final bloc = build(service: service, repo: repo, isPro: () => true);

      bloc.add(staticEvent);
      final s = await bloc.stream
          .firstWhere((s) => s.status == SetWallpaperStatus.failed);

      expect(s.status, SetWallpaperStatus.failed);
      expect(repo.incrementCalls, 0);
      await bloc.close();
    });
  });

  group('live vs static + targets', () {
    test('live set → live native path (home only), success', () async {
      final service = FakeSetWallpaperService();
      final repo = FakeWallpaperRepository();
      final bloc = build(service: service, repo: repo, isPro: () => true);

      bloc.add(const SetWallpaperRequested(
        wallpaperId: 'live1',
        mediaType: WallpaperMediaType.live,
        target: WallpaperTarget.home,
        imageUrl: 'https://cdn/frame/live1.jpg',
        liveFrameUrl: 'https://cdn/frame/live1.jpg',
      ));
      final s = await bloc.stream
          .firstWhere((s) => s.status == SetWallpaperStatus.success);

      expect(service.liveCalls, 1);
      expect(service.staticCalls, 0);
      expect(s.status, SetWallpaperStatus.success);
      await bloc.close();
    });

    test('static lock target routes the lock native method', () async {
      final service = FakeSetWallpaperService();
      final repo = FakeWallpaperRepository();
      final bloc = build(service: service, repo: repo, isPro: () => true);

      bloc.add(const SetWallpaperRequested(
        wallpaperId: 'wp1',
        mediaType: WallpaperMediaType.static_,
        target: WallpaperTarget.lock,
        imageUrl: 'https://cdn/apply/wp1.jpg',
      ));
      await bloc.stream.firstWhere((s) => s.status == SetWallpaperStatus.success);

      expect(service.lastTarget, WallpaperTarget.lock);
      await bloc.close();
    });
  });
}
