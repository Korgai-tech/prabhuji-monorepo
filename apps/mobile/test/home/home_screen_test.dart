import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/app_config.dart';
import 'package:mobile/core/shared_analytics.dart';
import 'package:mobile/features/home/data/home_models.dart';
import 'package:mobile/features/home/home_analytics.dart';
import 'package:mobile/features/home/presentation/home_banner_carousel.dart';
import 'package:mobile/features/home/presentation/home_feed_card.dart';
import 'package:mobile/features/home/presentation/home_header.dart';
import 'package:mobile/features/home/presentation/home_shortcut_grid.dart';

import '../support/fake_analytics.dart';
import '../support/fake_home_services.dart';
import '../support/fake_share_service.dart';
import '../support/home_harness.dart';

/// Home widget tests (TAM-62). Every navigation assertion goes through the
/// harness's [RouteSpy], which registers the REAL module paths — so a route that
/// doesn't exist fails the test rather than passing silently.
void main() {
  setUpAll(() {
    // TAM-124: home feed shares now construct URLs via `buildShareUrl`,
    // which needs `AppConfig.instance.shareHost` seeded.
    AppConfig.debugSetInstance(
      AppConfig.forTest(shareHost: 'https://share.test.invalid'),
    );
  });

  group('structure', () {
    testWidgets('renders header, banners, shortcuts and the mixed feed',
        (tester) async {
      await pumpHome(tester, repository: FakeHomeRepository());

      expect(find.byType(HomeHeader), findsOneWidget);
      expect(find.byType(HomeBannerCarousel), findsOneWidget);
      expect(find.byType(HomeShortcutGrid), findsOneWidget);
      expect(find.byType(HomeFeedCard), findsWidgets);
    });

    testWidgets('the old temple_hindu placeholder is gone', (tester) async {
      await pumpHome(tester, repository: FakeHomeRepository());
      // The placeholder's copy + its Material icon must not exist anywhere.
      expect(find.text('Welcome to Prabhuji'), findsNothing);
      expect(find.byIcon(Icons.temple_hindu), findsNothing);
    });

    testWidgets('header renders NO search bar and NO mic (PRD §6)',
        (tester) async {
      await pumpHome(tester, repository: FakeHomeRepository());
      expect(find.byType(TextField), findsNothing);
      expect(find.byType(TextFormField), findsNothing);
      expect(find.text('Search for status, mantras and more.'), findsNothing);
    });

    testWidgets('feed renders one card per server item, in SERVER order',
        (tester) async {
      await pumpHome(
        tester,
        repository: FakeHomeRepository(pageSize: 6),
        viewportHeight: 6000,
      );

      final cards = tester
          .widgetList<HomeFeedCard>(find.byType(HomeFeedCard))
          .map((c) => c.item.contentType.wire)
          .toList();
      // Mixed, never grouped — the two wallpapers stay split by the others.
      expect(cards, ['wallpaper', 'aarti', 'status', 'ringtone', 'mantra', 'wallpaper']);
    });

    testWidgets('NO lock badge / Pro label on any card, for a free user',
        (tester) async {
      await pumpHome(
        tester,
        repository: FakeHomeRepository(pageSize: 6),
        isPro: false,
        viewportHeight: 6000,
      );
      for (final t in ['Pro', 'PRO', 'Locked', 'Unlock', 'Premium', 'VIP']) {
        expect(find.text(t), findsNothing, reason: 'free feed must not show "$t"');
      }
      expect(find.byIcon(Icons.lock), findsNothing);
      expect(find.byIcon(Icons.lock_outline), findsNothing);
    });

    testWidgets('Home load NEVER opens the paywall (PRD §5)', (tester) async {
      final spy = RouteSpy();
      await pumpHome(
        tester,
        repository: FakeHomeRepository(),
        routeSpy: spy,
        isPro: false,
      );
      expect(spy.pushed, isEmpty);
    });
  });

  group('sections fail independently', () {
    testWidgets('feed failure → retry CTA, shortcut cards still render',
        (tester) async {
      await pumpHome(tester, repository: FakeHomeRepository(failFeed: true));

      expect(find.byKey(const Key('home-feed-retry')), findsOneWidget);
      // §9/§16 — the static chrome survives.
      expect(find.byType(HomeShortcutGrid), findsOneWidget);
      expect(find.byType(HomeHeader), findsOneWidget);
      expect(find.byType(HomeFeedCard), findsNothing);
    });

    testWidgets('retry re-requests and renders the feed', (tester) async {
      final repo = FakeHomeRepository(failFeed: true);
      final analytics = RecordingAnalytics();
      await pumpHome(tester, repository: repo, analytics: analytics);

      repo.failFeed = false;
      await tester.tap(find.byKey(const Key('home-feed-retry-button')));
      await homeSettle(tester);

      expect(find.byType(HomeFeedCard), findsWidgets);
      // Removed: home_feed_retry_tapped dropped from analytics contract.
    });

    testWidgets('banner failure hides the carousel; feed + chrome unaffected',
        (tester) async {
      await pumpHome(tester, repository: FakeHomeRepository(failBanners: true));

      expect(find.byType(HomeBannerCarousel), findsNothing);
      expect(find.byType(HomeFeedCard), findsWidgets);
      expect(find.byType(HomeShortcutGrid), findsOneWidget);
    });

    testWidgets('banners + feed failing still renders header + shortcut cards',
        (tester) async {
      // Sections fail INDEPENDENTLY: the shortcut grid is its own remote section
      // now, so two other sections dying must not take it with them.
      await pumpHome(
        tester,
        repository: FakeHomeRepository(failBanners: true, failFeed: true),
      );

      expect(find.byType(HomeHeader), findsOneWidget);
      expect(find.byType(HomeShortcutGrid), findsOneWidget);
      expect(find.byKey(const Key('home-shortcut-aarti_bhajans')), findsOneWidget);
    });

    testWidgets('shortcuts failing hides the grid but keeps header + feed',
        (tester) async {
      await pumpHome(
        tester,
        repository: FakeHomeRepository(failShortcuts: true),
      );

      // No bundled fallback list: the tiles are content, so an unavailable
      // section renders nothing rather than four made-up cards.
      expect(find.byType(HomeShortcutGrid), findsNothing);
      expect(find.byType(HomeHeader), findsOneWidget);
      expect(find.byType(HomeFeedCard), findsWidgets);
    });

    testWidgets('empty feed hides the section, keeps the cards', (tester) async {
      await pumpHome(tester, repository: FakeHomeRepository(items: const []));

      expect(find.byType(HomeFeedCard), findsNothing);
      expect(find.byKey(const Key('home-feed-retry')), findsNothing);
      expect(find.byType(HomeShortcutGrid), findsOneWidget);
    });
  });

  group('feature shortcuts', () {
    testWidgets('all four cards open their REAL module route', (tester) async {
      final expected = {
        'home-shortcut-aarti_bhajans': '/aarti-bhajans',
        'home-shortcut-mantras_stutis': '/mantras',
        'home-shortcut-set_ringtone': '/ringtones',
        'home-shortcut-set_wallpaper': '/wallpaper',
      };

      for (final entry in expected.entries) {
        final spy = RouteSpy();
        final analytics = RecordingAnalytics();
        await pumpHome(
          tester,
          repository: FakeHomeRepository(),
          routeSpy: spy,
          analytics: analytics,
        );

        await tester.tap(find.byKey(Key(entry.key)));
        await homeSettle(tester);

        expect(spy.last, entry.value, reason: entry.key);
        expect(analytics.fired(HomeEvents.widgetClicked), isTrue);
      }
    });

    testWidgets('a shortcut tap never opens the paywall, even for a free user',
        (tester) async {
      final spy = RouteSpy();
      await pumpHome(
        tester,
        repository: FakeHomeRepository(),
        routeSpy: spy,
        isPro: false,
      );

      await tester.tap(find.byKey(const Key('home-shortcut-set_wallpaper')));
      await homeSettle(tester);

      expect(spy.pushed, ['/wallpaper']);
      expect(spy.pushed, isNot(contains('/paywall')));
    });

    testWidgets('labels and ORDER come from the server, not the app',
        (tester) async {
      // Copy the app has never contained, handed over in an order that is not
      // the design's — if this renders, nothing about the grid is bundled.
      await pumpHome(
        tester,
        repository: FakeHomeRepository(shortcuts: [
          homeShortcut(
            key: 'set_wallpaper',
            label: 'Wallpaper Badlein',
            destinationValue: 'wallpaper',
            iconKey: 'wallpaper',
            sortOrder: 0,
          ),
          homeShortcut(
            key: 'aarti_bhajans',
            label: 'Aarti Suniye',
            destinationValue: 'aarti',
            iconKey: 'aarti',
            sortOrder: 1,
          ),
        ]),
      );

      expect(find.text('Wallpaper Badlein'), findsOneWidget);
      expect(find.text('Aarti Suniye'), findsOneWidget);
      // The old hardcoded tile copy is gone. Scoped to the GRID: 'Set Wallpaper'
      // also legitimately appears as a feed card's server-sent `ctaLabel`.
      expect(
        find.descendant(
          of: find.byType(HomeShortcutGrid),
          matching: find.text('Set Wallpaper'),
        ),
        findsNothing,
      );
      expect(
        find.descendant(
          of: find.byType(HomeShortcutGrid),
          matching: find.text('Aarti & Bhajans'),
        ),
        findsNothing,
      );

      // Server order wins: wallpaper (sortOrder 0) sits left of aarti.
      final wallpaperX =
          tester.getTopLeft(find.byKey(const Key('home-shortcut-set_wallpaper'))).dx;
      final aartiX =
          tester.getTopLeft(find.byKey(const Key('home-shortcut-aarti_bhajans'))).dx;
      expect(wallpaperX, lessThan(aartiX));
    });

    testWidgets('the server decides HOW MANY tiles there are', (tester) async {
      await pumpHome(
        tester,
        repository: FakeHomeRepository(shortcuts: [
          homeShortcut(
            key: 'aarti_bhajans',
            label: 'Aarti & Bhajans',
            destinationValue: 'aarti',
            iconKey: 'aarti',
          ),
        ]),
      );

      expect(find.byKey(const Key('home-shortcut-aarti_bhajans')), findsOneWidget);
      expect(find.byKey(const Key('home-shortcut-set_wallpaper')), findsNothing);
    });

    testWidgets('an unknown destination key is inert — never a raw deep link',
        (tester) async {
      final spy = RouteSpy();
      await pumpHome(
        tester,
        repository: FakeHomeRepository(shortcuts: [
          // A module key this build's allowlist does not contain.
          homeShortcut(
            key: 'temple_cam',
            label: 'Temple Cam',
            destinationValue: 'temple_cam_v2',
            iconKey: 'aarti',
            sortOrder: 0,
          ),
        ]),
        routeSpy: spy,
      );

      // The tile still renders (it is a good, labelled card)…
      expect(find.text('Temple Cam'), findsOneWidget);

      await tester.tap(find.byKey(const Key('home-shortcut-temple_cam')));
      await homeSettle(tester);

      // …but the tap goes NOWHERE: an untrusted CMS string never becomes a route.
      expect(spy.pushed, isEmpty);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a destinationValue that looks like a PATH is not navigated to',
        (tester) async {
      final spy = RouteSpy();
      await pumpHome(
        tester,
        repository: FakeHomeRepository(shortcuts: [
          // #EXPORT_CRITICAL — the allowlist takes KEYS. A CMS row trying to
          // smuggle a route through must resolve to nothing.
          homeShortcut(
            key: 'sneaky',
            label: 'Sneaky',
            destinationValue: '/paywall',
            sortOrder: 0,
          ),
        ]),
        routeSpy: spy,
      );

      await tester.tap(find.byKey(const Key('home-shortcut-sneaky')));
      await homeSettle(tester);

      expect(spy.pushed, isEmpty);
    });

    testWidgets('a tile whose icon key ships no art still renders + navigates',
        (tester) async {
      final spy = RouteSpy();
      await pumpHome(
        tester,
        repository: FakeHomeRepository(shortcuts: [
          homeShortcut(
            key: 'future_tile',
            label: 'Future Tile',
            destinationValue: 'aarti',
            iconKey: 'hologram_v9',
            sortOrder: 0,
          ),
        ]),
        routeSpy: spy,
      );

      expect(find.text('Future Tile'), findsOneWidget);
      expect(tester.takeException(), isNull);

      await tester.tap(find.byKey(const Key('home-shortcut-future_tile')));
      await homeSettle(tester);
      expect(spy.last, '/aarti-bhajans');
    });

    testWidgets('icon art is resolved from the KEY, not sent as a URL',
        (tester) async {
      await pumpHome(tester, repository: FakeHomeRepository());

      // The bundled Figma export the `iconKey` maps to (the sanctioned static
      // exception) — a local asset, never a network image.
      final images = tester
          .widgetList<Image>(find.descendant(
            of: find.byKey(const Key('home-shortcut-aarti_bhajans')),
            matching: find.byType(Image),
          ))
          .toList();
      expect(images, isNotEmpty);
      expect(images.first.image, isA<AssetImage>());
      expect(
        (images.first.image as AssetImage).assetName,
        'assets/home/shortcut-aarti.png',
      );
    });
  });

  group('banner carousel', () {
    testWidgets('linked_module banner → the module route', (tester) async {
      final spy = RouteSpy();
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
        routeSpy: spy,
        analytics: analytics,
      );

      await tester.tap(find.byKey(const Key('home-banner-b1')));
      await homeSettle(tester);

      expect(spy.last, '/wallpaper');
      expect(analytics.fired(HomeEvents.bannerClicked), isTrue);
    });

    testWidgets('content_detail banner → the owning module route',
        (tester) async {
      final spy = RouteSpy();
      await pumpHome(
        tester,
        repository: FakeHomeRepository(banners: [
          homeBanner(
            id: 'b1',
            destinationType: HomeDestinationType.contentDetail,
            destinationValue: 'ringtone',
          ),
        ]),
        routeSpy: spy,
      );

      await tester.tap(find.byKey(const Key('home-banner-b1')));
      await homeSettle(tester);

      expect(spy.last, '/ringtones');
    });

    testWidgets('pro_paywall banner → the paywall, firing home_paywall_triggered',
        (tester) async {
      final spy = RouteSpy();
      final analytics = RecordingAnalytics();
      await pumpHome(
        tester,
        repository: FakeHomeRepository(banners: [
          homeBanner(
            id: 'b1',
            destinationType: HomeDestinationType.proPaywall,
            destinationValue: 'prabhuji-pro-annual',
            isProFeatureDiscovery: true,
          ),
        ]),
        routeSpy: spy,
        analytics: analytics,
        isPro: false,
      );

      await tester.tap(find.byKey(const Key('home-banner-b1')));
      await homeSettle(tester);

      expect(spy.last, '/paywall');
      // Removed: home_paywall_triggered dropped from analytics contract.
    });

    testWidgets('informational banner is NON-TAPPABLE (no destination)',
        (tester) async {
      final spy = RouteSpy();
      final analytics = RecordingAnalytics();
      await pumpHome(
        tester,
        repository: FakeHomeRepository(banners: [
          homeBanner(
            id: 'b1',
            destinationType: HomeDestinationType.informational,
            destinationValue: null,
          ),
        ]),
        routeSpy: spy,
        analytics: analytics,
      );

      await tester.tap(find.byKey(const Key('home-banner-b1')));
      await homeSettle(tester);

      expect(spy.pushed, isEmpty);
      // Not even a tap event — there is no gesture detector at all.
      expect(analytics.fired(HomeEvents.bannerClicked), isFalse);
    });

    testWidgets(
        'free user + isProFeatureDiscovery banner → paywall, NOT the destination',
        (tester) async {
      final spy = RouteSpy();
      final analytics = RecordingAnalytics();
      await pumpHome(
        tester,
        repository: FakeHomeRepository(banners: [
          homeBanner(
            id: 'b1',
            destinationType: HomeDestinationType.linkedModule,
            destinationValue: 'wallpaper',
            isProFeatureDiscovery: true,
          ),
        ]),
        routeSpy: spy,
        analytics: analytics,
        isPro: false,
      );

      await tester.tap(find.byKey(const Key('home-banner-b1')));
      await homeSettle(tester);

      expect(spy.pushed.first, '/paywall');
      // Cancelled the paywall ⇒ the gated destination is NOT reached.
      expect(spy.pushed, isNot(contains('/wallpaper')));
      // Removed: home_paywall_triggered dropped from analytics contract;
      // the Paywall module's paywall_viewed (Sheet 1 row 17) covers this
      // funnel step with a `trigger_module` property instead.
    });

    testWidgets(
        'PRO user + isProFeatureDiscovery banner → straight to the destination',
        (tester) async {
      final spy = RouteSpy();
      await pumpHome(
        tester,
        repository: FakeHomeRepository(banners: [
          homeBanner(
            id: 'b1',
            destinationType: HomeDestinationType.linkedModule,
            destinationValue: 'wallpaper',
            isProFeatureDiscovery: true,
          ),
        ]),
        routeSpy: spy,
        isPro: true,
      );

      await tester.tap(find.byKey(const Key('home-banner-b1')));
      await homeSettle(tester);

      expect(spy.pushed, ['/wallpaper']);
      expect(spy.pushed, isNot(contains('/paywall')));
    });

    testWidgets('dots render only when there is more than one banner',
        (tester) async {
      await pumpHome(
        tester,
        repository: FakeHomeRepository(banners: [
          homeBanner(
            id: 'only',
            destinationType: HomeDestinationType.linkedModule,
            destinationValue: 'wallpaper',
          ),
        ]),
      );
      expect(find.byKey(const Key('home-banner-dots')), findsNothing);

      await pumpHome(tester, repository: FakeHomeRepository());
      expect(find.byKey(const Key('home-banner-dots')), findsOneWidget);
    });

    testWidgets('fires home_banner_viewed for the first visible banner',
        (tester) async {
      final analytics = RecordingAnalytics();
      await pumpHome(
        tester,
        repository: FakeHomeRepository(),
        analytics: analytics,
      );
      expect(analytics.fired(HomeEvents.bannerViewed), isTrue);
      expect(
        analytics.propsFor(HomeEvents.bannerViewed)[HomeEventProps.bannerId],
        'b-module',
      );
    });
  });

  group('feed card routing', () {
    testWidgets('header tap opens the owning module, per content type',
        (tester) async {
      final cases = {
        'f-wallpaper': '/wallpaper',
        'f-aarti': '/aarti-bhajans',
        'f-status': '/status',
        'f-ringtone': '/ringtones',
        'f-mantra': '/mantras',
      };

      for (final entry in cases.entries) {
        final spy = RouteSpy();
        final analytics = RecordingAnalytics();
        await pumpHome(
          tester,
          repository: FakeHomeRepository(pageSize: 6),
          routeSpy: spy,
          analytics: analytics,
          viewportHeight: 6000,
        );

        await tester.tap(
          find.byKey(Key('home-feed-card-header-${entry.key}')),
          warnIfMissed: false,
        );
        await homeSettle(tester);

        expect(spy.last, entry.value, reason: entry.key);
        // Removed: home_feed_item_header_tapped dropped from analytics contract.
      }
    });

    testWidgets(
      'ringtone CTA runs the direct-Set flow — never pushes /ringtones/preview',
      (tester) async {
        // TAM-122 §2 — ringtone is the OTHER content type where the CTA is a
        // direct action, not a route push. The Pro gate runs up-front (the
        // ringtone SetBloc doesn't own it), so a free user (default in tests)
        // gets bounced to /paywall — but /ringtones/preview/* is never pushed.
        final spy = RouteSpy();
        final analytics = RecordingAnalytics();
        await pumpHome(
          tester,
          repository: FakeHomeRepository(pageSize: 6),
          routeSpy: spy,
          analytics: analytics,
          viewportHeight: 6000,
        );

        await tester.tap(
          find.byKey(const Key('home-feed-cta-f-ringtone')),
          warnIfMissed: false,
        );
        await homeSettle(tester);

        expect(
          spy.pushed.any((p) => p.startsWith('/ringtones/preview/')),
          isFalse,
          reason:
              'ringtone CTA must NOT push the module preview — direct-Set only',
        );
        // Removed: home_feed_cta_tapped dropped from analytics contract.
        // Default entitlement in tests is `false`; the direct-Set flow's Pro
        // gate bounces to the paywall before dispatching SetRingtoneBloc.
        expect(spy.pushed.contains('/paywall'), isTrue);
      },
    );

    testWidgets('aarti CTA opens the REAL by-id deep-link resolver',
        (tester) async {
      final spy = RouteSpy();
      await pumpHome(
        tester,
        repository: FakeHomeRepository(pageSize: 6),
        routeSpy: spy,
        viewportHeight: 6000,
      );

      await tester.tap(
        find.byKey(const Key('home-feed-cta-f-aarti')),
        warnIfMissed: false,
      );
      await homeSettle(tester);

      // Aarti deep-link is built from `ctaContentId` (a UUID side-car), not
      // from `ctaDestinationValue` (a slug). The fake factory defaults
      // `ctaContentId` to the item's id, so the pushed path carries `f-aarti`.
      expect(spy.last, '/aarti-bhajans/audio/f-aarti');
    });

    testWidgets(
      'wallpaper CTA opens the direct-Set target sheet — never pushes the module',
      (tester) async {
        // TAM-122 §2 — wallpaper is the ONE content type where the CTA is a
        // direct action, not a route push. Tapping it must open the target
        // picker sheet (Home / Lock / Both) and dispatch through the shared
        // SetWallpaperBloc; the module screen is not opened.
        final spy = RouteSpy();
        await pumpHome(
          tester,
          repository: FakeHomeRepository(pageSize: 6),
          routeSpy: spy,
          viewportHeight: 6000,
        );

        await tester.tap(
          find.byKey(const Key('home-feed-cta-f-wallpaper')),
          warnIfMissed: false,
        );
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 400));

        // The target sheet is up.
        expect(
          find.byKey(const Key('home-feed-wallpaper-target-sheet')),
          findsOneWidget,
        );
        // All three target tiles are offered.
        expect(
          find.byKey(const Key('home-feed-wallpaper-target-home')),
          findsOneWidget,
        );
        expect(
          find.byKey(const Key('home-feed-wallpaper-target-lock')),
          findsOneWidget,
        );
        expect(
          find.byKey(const Key('home-feed-wallpaper-target-both')),
          findsOneWidget,
        );
        // No route push happened.
        expect(spy.pushed, isEmpty);
      },
    );

    testWidgets('a CTA with an unknown destination type is a silent no-op',
        (tester) async {
      // Uses `mantra` (not `wallpaper`) because wallpaper items now short-
      // circuit the destination allowlist for the direct-Set flow (TAM-122 §2)
      // — this test still needs to prove the allowlist drops unknown CMS
      // destinations, so it targets a content type that still goes through it.
      final spy = RouteSpy();
      await pumpHome(
        tester,
        repository: FakeHomeRepository(items: [
          homeFeedItem(
            id: 'f-junk',
            contentType: HomeContentType.mantra,
            module: 'mantra',
            ctaDestinationType: 'open_browser',
            ctaDestinationValue: 'https://evil.example.com',
          ),
        ]),
        routeSpy: spy,
      );

      await tester.tap(
        find.byKey(const Key('home-feed-cta-f-junk')),
        warnIfMissed: false,
      );
      await homeSettle(tester);

      expect(spy.pushed, isEmpty);
    });
  });

  group('engagement', () {
    testWidgets('like toggles optimistically and persists', (tester) async {
      final repo = FakeHomeRepository();
      final analytics = RecordingAnalytics();
      final bloc = await pumpHome(
        tester,
        repository: repo,
        analytics: analytics,
      );

      expect(bloc.state.items.first.likedByMe, isFalse);
      await tester.tap(find.byKey(const Key('home-feed-like-f-wallpaper')));
      await homeSettle(tester);

      expect(bloc.state.items.first.likedByMe, isTrue);
      expect(repo.likeCalls, ['f-wallpaper']);
      expect(analytics.fired(HomeEvents.contentLikeChanged), isTrue);
    });

    testWidgets('share opens the OS sheet with the deep link + thumbnail',
        (tester) async {
      final holder = ShareServiceHolder();
      final repo = FakeHomeRepository();
      final analytics = RecordingAnalytics();
      await pumpHome(
        tester,
        repository: repo,
        shareHolder: holder,
        analytics: analytics,
      );

      await tester.tap(find.byKey(const Key('home-feed-share-f-wallpaper')));
      await homeSettle(tester);

      final shared = holder.service.lastShare;
      expect(shared, isNotNull);
      // Post-TAM-124: home-feed shares construct the canonical HTTPS App
      // Link via `buildShareUrl(WallpaperDeepLink(id: item.id))` — the
      // recipient's landing page redirects to Play Store, then App Links
      // opens the app directly.
      expect(shared!.deepLink,
          'https://share.test.invalid/app/wallpaper/f-wallpaper');
      expect(shared.thumbnailUrl, isNotNull);
      // …and it POSTed the share to the engagement forwarder.
      expect(repo.shareCalls, ['f-wallpaper']);
      expect(analytics.fired(HomeEvents.contentShareClicked), isTrue);
      // TAM-124 unified funnel event.
      expect(analytics.fired(SharedAnalyticsEvents.shareInitiated), isTrue);
    });

    testWidgets('a mantra share carries the HTTPS App Link, not the '
        "server's prabhuji:// URL", (tester) async {
      // Regression: `mantra` was the one content type with no deep-link
      // target, so the card fell back to the server-supplied
      // `meta.deepLink` — a `prabhuji://` URL that messaging apps don't
      // linkify (dead plain text for the recipient) and that the parser
      // resolved to UnknownDeepLink → /home even when it did arrive.
      final holder = ShareServiceHolder();
      await pumpHome(
        tester,
        // A single-item feed so the mantra card is the one on screen —
        // in the default fixture it's the 5th card, below the fold.
        repository: FakeHomeRepository(items: [
          homeFeedItem(
            id: 'f-mantra',
            contentType: HomeContentType.mantra,
            module: 'mantras',
            ctaLabel: 'Play Mantra',
            ctaDestinationValue: 'ganesha-mool-mantra-sample',
          ),
        ]),
        shareHolder: holder,
      );

      await tester.tap(find.byKey(const Key('home-feed-share-f-mantra')));
      await homeSettle(tester);

      final shared = holder.service.lastShare;
      expect(shared, isNotNull);
      expect(shared!.deepLink, 'https://share.test.invalid/app/mantra/f-mantra');
      expect(shared.deepLink, isNot(startsWith('prabhuji://')));
    });

    testWidgets('the view slot is a count, not a button', (tester) async {
      final repo = FakeHomeRepository();
      await pumpHome(tester, repository: repo);

      final before = List<String>.from(repo.viewCalls);
      await tester.tap(find.byKey(const Key('home-feed-view-f-wallpaper')));
      await homeSettle(tester);

      // A view is earned by dwelling, never by tapping.
      expect(repo.viewCalls, before);
    });

    testWidgets('badge pill renders only when the CMS sent one', (tester) async {
      await pumpHome(
        tester,
        repository: FakeHomeRepository(pageSize: 6),
        viewportHeight: 6000,
      );

      expect(find.byKey(const Key('home-feed-badge-f-wallpaper')), findsOneWidget);
      expect(find.text('TRENDING'), findsWidgets);
      expect(find.byKey(const Key('home-feed-badge-f-aarti')), findsOneWidget);
      expect(find.text('SUGGESTED'), findsWidgets);
      // f-status carries no badge.
      expect(find.byKey(const Key('home-feed-badge-f-status')), findsNothing);
    });

    testWidgets('the pill renders the CMS badgeLabel verbatim', (tester) async {
      await pumpHome(
        tester,
        repository: FakeHomeRepository(items: [
          homeFeedItem(
            id: 'f-1',
            contentType: HomeContentType.wallpaper,
            module: 'wallpaper',
            badge: HomeBadge.trending,
            // Copy the app has never contained.
            badgeLabel: 'AAJ KA HIT',
          ),
        ]),
      );

      expect(find.text('AAJ KA HIT'), findsOneWidget);
      // The enum name no longer implies any copy.
      expect(find.text('TRENDING'), findsNothing);
    });

    testWidgets('a badge with no CMS label draws NO pill (never invented copy)',
        (tester) async {
      await pumpHome(
        tester,
        repository: FakeHomeRepository(items: [
          homeFeedItem(
            id: 'f-1',
            contentType: HomeContentType.wallpaper,
            module: 'wallpaper',
            badge: HomeBadge.trending,
            badgeLabel: null,
          ),
        ]),
      );

      expect(find.byKey(const Key('home-feed-badge-f-1')), findsNothing);
      expect(find.text('TRENDING'), findsNothing);
    });
  });
}
