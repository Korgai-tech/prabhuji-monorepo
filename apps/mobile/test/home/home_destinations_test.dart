import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/aarti/aarti_routes.dart';
import 'package:mobile/features/books/books_routes.dart';
import 'package:mobile/features/home/data/home_models.dart';
import 'package:mobile/features/home/destinations.dart';
import 'package:mobile/features/horoscope/horoscope_routes.dart';
import 'package:mobile/features/mantras/mantras_routes.dart';
import 'package:mobile/features/ringtone/ringtone_routes.dart';
import 'package:mobile/features/status/status_routes.dart';
import 'package:mobile/features/wallpaper/wallpaper_routes.dart';

import '../support/fake_home_services.dart';

/// The route ALLOWLIST is the security boundary for untrusted CMS input
/// (pattern §3, #PATH_DECISION): a known value maps to a REAL module route; an
/// unknown one is a no-op, never a raw deep link.
void main() {
  group('module allowlist', () {
    test('every known module key maps to that module\'s real route', () {
      expect(HomeDestinations.module('wallpaper')?.path, WallpaperRoutes.home);
      expect(HomeDestinations.module('status')?.path, StatusRoutes.home);
      expect(HomeDestinations.module('aarti')?.path, AartiRoutes.main);
      expect(HomeDestinations.module('mantras')?.path, MantrasRoutes.main);
      expect(HomeDestinations.module('mantra')?.path, MantrasRoutes.main);
      expect(HomeDestinations.module('ringtone')?.path, RingtoneRoutes.home);
      expect(HomeDestinations.module('horoscope')?.path, HoroscopeRoutes.main);
      expect(HomeDestinations.module('books')?.path, BooksRoutes.home);
    });

    test('unknown / hostile values are a no-op', () {
      for (final v in [
        'not-a-module',
        '',
        '../../etc/passwd',
        'https://evil.example.com',
        'prabhuji://arbitrary/deep/link',
        null,
      ]) {
        expect(HomeDestinations.module(v), isNull, reason: 'value: $v');
      }
    });

    test('module keys are matched case/whitespace-insensitively', () {
      expect(HomeDestinations.module('  WallPaper ')?.path, WallpaperRoutes.home);
    });
  });

  group('banner destinations', () {
    test('linked_module → the module route', () {
      final b = homeBanner(
        id: 'b',
        destinationType: HomeDestinationType.linkedModule,
        destinationValue: 'wallpaper',
      );
      expect(HomeDestinations.banner(b)?.path, WallpaperRoutes.home);
    });

    test('content_detail → the owning module route', () {
      final b = homeBanner(
        id: 'b',
        destinationType: HomeDestinationType.contentDetail,
        destinationValue: 'ringtone',
      );
      expect(HomeDestinations.banner(b)?.path, RingtoneRoutes.home);
    });

    test('pro_paywall → the paywall gate, not a route', () {
      final b = homeBanner(
        id: 'b',
        destinationType: HomeDestinationType.proPaywall,
        destinationValue: 'prabhuji-pro-annual',
        isProFeatureDiscovery: true,
      );
      final d = HomeDestinations.banner(b);
      expect(d?.opensPaywall, isTrue);
      expect(d?.path, isNull);
    });

    test('informational → NO destination (non-tappable by contract)', () {
      final b = homeBanner(
        id: 'b',
        destinationType: HomeDestinationType.informational,
        destinationValue: null,
      );
      expect(HomeDestinations.banner(b), isNull);
    });

    test(
        'an informational banner that (wrongly) carries a destinationValue stays '
        'non-navigable', () {
      // Contract says the server nulls it — but a bad CMS row must not become
      // tappable, so the model scrubs it at the boundary.
      final b = HomeBannerView(
        id: 'b',
        mediaUrl: 'x',
        destinationType: HomeDestinationType.informational,
        destinationValue: 'wallpaper',
        isProFeatureDiscovery: false,
        sortOrder: 0,
      );
      expect(HomeDestinations.banner(b), isNull);
    });

    test('linked_module with an unknown value is a no-op', () {
      final b = homeBanner(
        id: 'b',
        destinationType: HomeDestinationType.linkedModule,
        destinationValue: 'mandir-not-built',
      );
      expect(HomeDestinations.banner(b), isNull);
    });
  });

  group('feed header destinations', () {
    test('header tap opens the owning module, for every content type', () {
      final expected = {
        HomeContentType.wallpaper: WallpaperRoutes.home,
        HomeContentType.status: StatusRoutes.home,
        HomeContentType.aarti: AartiRoutes.main,
        HomeContentType.mantra: MantrasRoutes.main,
        HomeContentType.ringtone: RingtoneRoutes.home,
      };
      final modules = {
        HomeContentType.wallpaper: 'wallpaper',
        HomeContentType.status: 'status',
        HomeContentType.aarti: 'aarti',
        HomeContentType.mantra: 'mantras',
        HomeContentType.ringtone: 'ringtone',
      };
      for (final type in HomeContentType.values) {
        final item = homeFeedItem(
          id: 'i',
          contentType: type,
          module: modules[type]!,
        );
        expect(
          HomeDestinations.feedHeader(item)?.path,
          expected[type],
          reason: '$type',
        );
      }
    });

    test('falls back to the item module when headerDestinationModule is junk',
        () {
      final item = homeFeedItem(
        id: 'i',
        contentType: HomeContentType.aarti,
        module: 'aarti',
        headerDestinationModule: 'nonsense',
      );
      expect(HomeDestinations.feedHeader(item)?.path, AartiRoutes.main);
    });
  });

  group('feed CTA destinations', () {
    test('ringtone content_detail → the REAL by-id ringtone preview', () {
      final item = homeFeedItem(
        id: 'i',
        contentType: HomeContentType.ringtone,
        module: 'ringtone',
        ctaDestinationValue: 'gayatri-mantra-ringtone-sample',
      );
      expect(
        HomeDestinations.feedCta(item)?.path,
        RingtoneRoutes.preview('gayatri-mantra-ringtone-sample'),
      );
    });

    test('aarti content_detail → the REAL by-id deep-link resolver', () {
      // The URL is built from `ctaContentId` (the UUID side-car), not from
      // `ctaDestinationValue` (a slug) — `GET /aarti/audios/:id` on the
      // server does strict id lookup with no slug fallback.
      final item = homeFeedItem(
        id: 'i',
        contentType: HomeContentType.aarti,
        module: 'aarti',
        ctaDestinationValue: 'hanuman-chalisa-slug',
        ctaContentId: 'hanuman-chalisa-audio-id',
      );
      expect(
        HomeDestinations.feedCta(item)?.path,
        AartiRoutes.deepLink('hanuman-chalisa-audio-id'),
      );
    });

    test(
        'wallpaper / status content_detail → the owning module '
        '(no by-id route exists — see destinations.dart)', () {
      expect(
        HomeDestinations.feedCta(homeFeedItem(
          id: 'i',
          contentType: HomeContentType.wallpaper,
          module: 'wallpaper',
        ))?.path,
        WallpaperRoutes.home,
      );
      expect(
        HomeDestinations.feedCta(homeFeedItem(
          id: 'i',
          contentType: HomeContentType.status,
          module: 'status',
        ))?.path,
        StatusRoutes.home,
      );
    });

    test(
        'mantra content_detail → the mantras deep-link resolver (TAM-59 '
        'follow-up: mantras now has a by-id route)', () {
      // Same contract as aarti: the URL is built from `ctaContentId` (UUID),
      // not `ctaDestinationValue` (slug). The fake factory defaults
      // `ctaContentId` to the item id, so the pushed path carries `i`.
      expect(
        HomeDestinations.feedCta(homeFeedItem(
          id: 'i',
          contentType: HomeContentType.mantra,
          module: 'mantras',
        ))?.path,
        MantrasRoutes.deepLink('i'),
      );
    });

    test('linked_module CTA → the module named by the value', () {
      final item = homeFeedItem(
        id: 'i',
        contentType: HomeContentType.wallpaper,
        module: 'wallpaper',
        ctaDestinationType: 'linked_module',
        ctaDestinationValue: 'ringtone',
      );
      expect(HomeDestinations.feedCta(item)?.path, RingtoneRoutes.home);
    });

    test('pro_paywall CTA → the gate', () {
      final item = homeFeedItem(
        id: 'i',
        contentType: HomeContentType.wallpaper,
        module: 'wallpaper',
        ctaDestinationType: 'pro_paywall',
        ctaDestinationValue: 'prabhuji-pro-annual',
      );
      expect(HomeDestinations.feedCta(item)?.opensPaywall, isTrue);
    });

    test('an unknown CTA type is a no-op — NOT a raw deep link', () {
      final item = homeFeedItem(
        id: 'i',
        contentType: HomeContentType.wallpaper,
        module: 'wallpaper',
        ctaDestinationType: 'open_arbitrary_url',
        ctaDestinationValue: 'https://evil.example.com',
      );
      expect(HomeDestinations.feedCta(item), isNull);
    });

    test('content_detail with an empty value falls back to the module', () {
      final item = homeFeedItem(
        id: 'i',
        contentType: HomeContentType.ringtone,
        module: 'ringtone',
        ctaDestinationValue: '',
      );
      expect(HomeDestinations.feedCta(item)?.path, RingtoneRoutes.home);
    });

    test('a shortcut resolves ONLY through the module allowlist', () {
      // The four Phase-1 tiles ship module keys the allowlist already spelled —
      // going server-driven needed no new allowlist entries.
      const expected = {
        'aarti': AartiRoutes.main,
        'mantras': MantrasRoutes.main,
        'ringtone': RingtoneRoutes.home,
        'wallpaper': WallpaperRoutes.home,
      };
      for (final entry in expected.entries) {
        expect(
          HomeDestinations.shortcut(homeShortcut(
            key: 'k',
            label: 'L',
            destinationValue: entry.key,
          ))?.path,
          entry.value,
          reason: entry.key,
        );
      }
    });

    test('an unknown shortcut module key is a no-op, never a deep link', () {
      for (final value in [
        'temple_cam_v2',
        '/paywall',
        'https://evil.example.com',
        'aarti-bhajans/audio/../../admin',
        '',
      ]) {
        expect(
          HomeDestinations.shortcut(homeShortcut(
            key: 'k',
            label: 'L',
            destinationValue: value,
          )),
          isNull,
          reason: value,
        );
      }
    });

    test('an informational shortcut is non-navigable', () {
      expect(
        HomeDestinations.shortcut(homeShortcut(
          key: 'k',
          label: 'L',
          destinationType: HomeDestinationType.informational,
          destinationValue: 'wallpaper',
        )),
        isNull,
      );
    });

    test('a pro_paywall shortcut opens the paywall, not a route', () {
      final destination = HomeDestinations.shortcut(homeShortcut(
        key: 'k',
        label: 'L',
        destinationType: HomeDestinationType.proPaywall,
        destinationValue: 'prabhuji-pro-annual',
      ));
      expect(destination?.opensPaywall, isTrue);
      expect(destination?.path, isNull);
    });

    test('NO shortcut can ever resolve to a direct-apply route', () {
      // Same #EXPORT_CRITICAL rule the feed CTAs obey: a tile opens a module,
      // never an apply/set action. Sweep every destination type × a hostile value.
      const forbidden = ['/set', 'apply', 'wallpaper/set', 'ringtone/set'];
      for (final type in HomeDestinationType.values) {
        for (final value in [
          'wallpaper',
          'ringtone',
          'aarti',
          'wallpaper/set',
          '/ringtones/set/123',
          'garbage',
        ]) {
          final path = HomeDestinations.shortcut(homeShortcut(
            key: 'k',
            label: 'L',
            destinationType: type,
            destinationValue: value,
          ))?.path;
          if (path == null) continue;
          for (final f in forbidden) {
            expect(path.contains(f), isFalse, reason: '$type/$value → $path');
          }
        }
      }
    });

    test('NO CTA can ever resolve to a direct-apply route (§12)', () {
      // The apply/set actions live behind the modules' own confirmation + Pro
      // gate. Sweep every content type × every CTA type and assert nothing
      // reaches one of those routes.
      const forbidden = ['/set', 'apply', 'wallpaper/set', 'ringtone/set'];
      for (final type in HomeContentType.values) {
        for (final cta in [
          'content_detail',
          'linked_module',
          'pro_paywall',
          'garbage',
        ]) {
          final path = HomeDestinations.feedCta(homeFeedItem(
            id: 'i',
            contentType: type,
            module: type.wire,
            ctaDestinationType: cta,
            ctaDestinationValue: 'x',
          ))?.path;
          if (path == null) continue;
          for (final f in forbidden) {
            expect(path.contains(f), isFalse, reason: '$type/$cta → $path');
          }
        }
      }
    });
  });
}
