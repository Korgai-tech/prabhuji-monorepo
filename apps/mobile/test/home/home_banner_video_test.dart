import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/home/data/home_models.dart';
import 'package:mobile/features/home/home_analytics.dart';
import 'package:mobile/shared/widgets/app_network_image.dart';

import '../support/fake_analytics.dart';
import '../support/fake_home_services.dart';
import '../support/home_harness.dart';

/// Video hero banners: the thumbnail-first render, the muted/looping/no-controls
/// playback, the "only the banner on screen plays" gate, the never-look-broken
/// failure path, and the `media_type` property on both banner events.
///
/// Every test drives [FakeHomeBannerVideoPort] — no codec, no network. The real
/// `media_kit` port is exercised by hand on device; what is asserted here is the
/// POLICY around it, which is where the bugs live.
void main() {
  setUp(FakeHomeBannerVideoPort.resetCounters);

  Finder still(String id) => find.byKey(Key('home-banner-still-$id'));
  Finder video(String id) => find.byKey(Key('home-banner-video-$id'));

  group('video banner render', () {
    testWidgets('paints the thumbnail still, then the video over it',
        (tester) async {
      await pumpHome(
        tester,
        repository: FakeHomeRepository(banners: [homeVideoBanner(id: 'v1')]),
      );

      // The still is the base layer and STAYS in the tree once the video is up
      // — that is what makes a mid-playback decode failure degrade to the
      // thumbnail instead of a black box.
      expect(still('v1'), findsOneWidget);
      expect(video('v1'), findsOneWidget);
      expect(
        tester.widget<AppNetworkImage>(still('v1')).url,
        'https://cdn.example.com/banner-thumb.png',
      );

      final port = FakeHomeBannerVideoPort.created.single;
      expect(port.lastUrl, 'https://cdn.example.com/banner.mp4');
      expect(port.isPlaying, isTrue);
    });

    testWidgets('an image banner builds NO video port at all', (tester) async {
      await pumpHome(
        tester,
        repository: FakeHomeRepository(banners: [
          homeBanner(
            id: 'b1',
            destinationType: HomeDestinationType.linkedModule,
            destinationValue: 'wallpaper',
          ),
        ]),
      );

      expect(FakeHomeBannerVideoPort.created, isEmpty);
      expect(video('b1'), findsNothing);
      expect(
        tester.widget<AppNetworkImage>(still('b1')).url,
        'https://cdn.example.com/banner.png',
      );
    });

    testWidgets('a failed video keeps the thumbnail up — never a broken banner',
        (tester) async {
      await pumpHome(
        tester,
        repository: FakeHomeRepository(banners: [homeVideoBanner(id: 'v1')]),
        bannerVideoPortFactory: () =>
            FakeHomeBannerVideoPort(failInitialize: true),
      );

      expect(video('v1'), findsNothing);
      expect(still('v1'), findsOneWidget);
      // The banner is still THERE (and still tappable) — a media failure is not
      // an empty carousel.
      expect(find.byKey(const Key('home-banner-v1')), findsOneWidget);
      expect(FakeHomeBannerVideoPort.created.single.hasError, isTrue);
    });

    testWidgets(
        'a video row with no thumbnail falls back to the branded placeholder',
        (tester) async {
      await pumpHome(
        tester,
        repository: FakeHomeRepository(
          banners: [homeVideoBanner(id: 'v1', thumbnailUrl: null)],
        ),
      );

      // Empty URL is AppNetworkImage's deterministic fallback path — never a
      // broken-image glyph (PRD rule).
      expect(tester.widget<AppNetworkImage>(still('v1')).url, '');
      expect(find.byKey(const Key('home-banner-v1')), findsOneWidget);
    });
  });

  group('playback gate', () {
    testWidgets('only the banner ON SCREEN plays — swiping stops the old one',
        (tester) async {
      await pumpHome(
        tester,
        repository: FakeHomeRepository(banners: [
          homeVideoBanner(id: 'v1', sortOrder: 0),
          homeVideoBanner(id: 'v2', sortOrder: 1),
        ]),
      );

      final first = FakeHomeBannerVideoPort.created.single;
      expect(first.isPlaying, isTrue);

      await tester.drag(
        find.byKey(const Key('home-banner-carousel')),
        const Offset(-400, 0),
      );
      await homeSettle(tester);

      expect(first.isPlaying, isFalse, reason: 'page 1 scrolled away');
      expect(first.pauseCalls, greaterThan(0));
      expect(FakeHomeBannerVideoPort.playing.length, 1,
          reason: 'exactly one banner video plays at a time');
      expect(FakeHomeBannerVideoPort.playing.single.lastUrl, isNotNull);
    });

    testWidgets('a banner that is never the current page never starts a decoder',
        (tester) async {
      await pumpHome(
        tester,
        repository: FakeHomeRepository(banners: [
          homeVideoBanner(id: 'v1', sortOrder: 0),
          homeVideoBanner(id: 'v2', sortOrder: 1),
          homeVideoBanner(id: 'v3', sortOrder: 2),
        ]),
      );

      // Lazy init: three video banners, ONE player.
      expect(FakeHomeBannerVideoPort.created.length, 1);
    });

    testWidgets('scrolling the carousel out of view pauses playback',
        (tester) async {
      await pumpHome(
        tester,
        repository: FakeHomeRepository(banners: [homeVideoBanner(id: 'v1')]),
        // A short viewport so the feed below can scroll the banner off screen.
        viewportHeight: 700,
      );

      final port = FakeHomeBannerVideoPort.created.single;
      expect(port.isPlaying, isTrue);

      // A TIMED drag, not a one-shot one: `VisibilityDetector` reports on
      // PAINT, so it needs the intermediate frames a real scroll produces. A
      // single `tester.drag` jumps the banner from fully visible to never
      // painted again in one frame and no callback ever lands — a test
      // artefact, not the behaviour on device.
      await tester.timedDrag(
        find.byKey(const Key('home-scroll')),
        const Offset(0, -900),
        const Duration(milliseconds: 600),
      );
      await homeSettle(tester);

      expect(port.isPlaying, isFalse);
      expect(port.pauseCalls, greaterThan(0));
    });

    testWidgets('pushing a route over Home pauses playback', (tester) async {
      final spy = RouteSpy();
      await pumpHome(
        tester,
        repository: FakeHomeRepository(banners: [
          homeVideoBanner(
            id: 'v1',
            destinationType: HomeDestinationType.linkedModule,
            destinationValue: 'wallpaper',
          ),
        ]),
        routeSpy: spy,
      );

      final port = FakeHomeBannerVideoPort.created.single;
      expect(port.isPlaying, isTrue);

      // Tapping the banner navigates AWAY from Home — Home stays mounted
      // underneath, laid out at its old visibility, so only the TickerMode
      // gate catches this.
      await tester.tap(find.byKey(const Key('home-banner-v1')));
      await homeSettle(tester);

      expect(spy.last, '/wallpaper');
      expect(port.isPlaying, isFalse);
    });

    testWidgets('backgrounding the app pauses, resuming plays again',
        (tester) async {
      await pumpHome(
        tester,
        repository: FakeHomeRepository(banners: [homeVideoBanner(id: 'v1')]),
      );

      final port = FakeHomeBannerVideoPort.created.single;
      expect(port.isPlaying, isTrue);

      tester.binding
          .handleAppLifecycleStateChanged(AppLifecycleState.paused);
      await homeSettle(tester);
      expect(port.isPlaying, isFalse, reason: 'app left the foreground');

      tester.binding
          .handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await homeSettle(tester);
      expect(port.isPlaying, isTrue);
    });

    testWidgets('leaving Home disposes the player', (tester) async {
      await pumpHome(
        tester,
        repository: FakeHomeRepository(banners: [homeVideoBanner(id: 'v1')]),
      );
      final port = FakeHomeBannerVideoPort.created.single;

      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();

      expect(port.disposeCalls, greaterThan(0));
    });
  });

  group('tap behaviour is unchanged for a video banner', () {
    testWidgets('a linked_module video banner navigates like an image one',
        (tester) async {
      final spy = RouteSpy();
      await pumpHome(
        tester,
        repository: FakeHomeRepository(banners: [
          homeVideoBanner(
            id: 'v1',
            destinationType: HomeDestinationType.linkedModule,
            destinationValue: 'wallpaper',
          ),
        ]),
        routeSpy: spy,
      );

      await tester.tap(find.byKey(const Key('home-banner-v1')));
      await homeSettle(tester);

      expect(spy.last, '/wallpaper');
    });

    testWidgets('an informational video banner is still NON-tappable',
        (tester) async {
      final spy = RouteSpy();
      await pumpHome(
        tester,
        repository: FakeHomeRepository(banners: [
          homeVideoBanner(
            id: 'v1',
            destinationType: HomeDestinationType.informational,
            destinationValue: null,
          ),
        ]),
        routeSpy: spy,
      );

      expect(
        find.descendant(
          of: find.byKey(const Key('home-banner-v1')),
          matching: find.byType(GestureDetector),
        ),
        findsNothing,
      );
      expect(spy.last, isNull);
    });
  });

  group('media_type analytics property', () {
    testWidgets('home_banner_viewed + home_banner_clicked carry "video"',
        (tester) async {
      final analytics = RecordingAnalytics();
      await pumpHome(
        tester,
        repository: FakeHomeRepository(banners: [
          homeVideoBanner(
            id: 'v1',
            destinationType: HomeDestinationType.linkedModule,
            destinationValue: 'wallpaper',
          ),
        ]),
        analytics: analytics,
      );

      expect(
        analytics.propsFor(HomeEvents.bannerViewed)[HomeEventProps.mediaType],
        'video',
      );

      await tester.tap(find.byKey(const Key('home-banner-v1')));
      await homeSettle(tester);

      expect(
        analytics.propsFor(HomeEvents.bannerClicked)[HomeEventProps.mediaType],
        'video',
      );
    });

    testWidgets('an image banner carries "image"', (tester) async {
      final analytics = RecordingAnalytics();
      await pumpHome(
        tester,
        repository: FakeHomeRepository(banners: [
          homeBanner(
            id: 'b1',
            destinationType: HomeDestinationType.linkedModule,
            destinationValue: 'wallpaper',
          ),
        ]),
        analytics: analytics,
      );

      expect(
        analytics.propsFor(HomeEvents.bannerViewed)[HomeEventProps.mediaType],
        'image',
      );

      await tester.tap(find.byKey(const Key('home-banner-b1')));
      await homeSettle(tester);

      expect(
        analytics.propsFor(HomeEvents.bannerClicked)[HomeEventProps.mediaType],
        'image',
      );
    });
  });
}
