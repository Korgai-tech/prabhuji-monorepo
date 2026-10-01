import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/app_config.dart';
import 'package:mobile/core/deep_link_parser.dart';
import 'package:mobile/core/share_url_builder.dart';

/// Coverage matrix (TAM-124):
///   - HTTPS + custom-scheme URL construction for every target type
///   - Round-trip: build → parse yields the same target (both schemes)
///   - Attribution query params appended + URL-encoded
///   - shareHost from AppConfig is honoured
///   - UnknownDeepLink throws (cannot build a URL for nothing)

void main() {
  setUpAll(() {
    AppConfig.debugSetInstance(
      AppConfig.forTest(shareHost: 'https://share.example'),
    );
  });

  group('buildShareUrl — HTTPS shape', () {
    test('status → https://.../app/status/:id', () {
      expect(
        buildShareUrl(const StatusDeepLink(id: 'abc')),
        'https://share.example/app/status/abc',
      );
    });
    test('aarti → https://.../app/aarti/:audioId', () {
      expect(
        buildShareUrl(const AartiDeepLink(audioId: 'a-1')),
        'https://share.example/app/aarti/a-1',
      );
    });
    test('mantra → https://.../app/mantra/:audioId', () {
      expect(
        buildShareUrl(const MantraDeepLink(audioId: 'm-7')),
        'https://share.example/app/mantra/m-7',
      );
    });
    test('book → https://.../app/book/:contentId', () {
      expect(
        buildShareUrl(const BookDeepLink(contentId: 'geeta')),
        'https://share.example/app/book/geeta',
      );
    });
    test('horoscope → https://.../app/horoscope/:zodiacId', () {
      expect(
        buildShareUrl(const HoroscopeDeepLink(zodiacId: 'leo')),
        'https://share.example/app/horoscope/leo',
      );
    });
    test('ringtone → https://.../app/ringtone/:id', () {
      expect(
        buildShareUrl(const RingtoneDeepLink(id: 'rt-9')),
        'https://share.example/app/ringtone/rt-9',
      );
    });
    test('wallpaper → https://.../app/wallpaper/:id', () {
      expect(
        buildShareUrl(const WallpaperDeepLink(id: 'wp-1')),
        'https://share.example/app/wallpaper/wp-1',
      );
    });
    test('paywall → https://.../app/pro (id-less)', () {
      expect(
        buildShareUrl(const PaywallDeepLink()),
        'https://share.example/app/pro',
      );
    });
    test('UnknownDeepLink throws', () {
      expect(
        () => buildShareUrl(const UnknownDeepLink()),
        throwsArgumentError,
      );
    });
  });

  group('buildCustomSchemeUrl — prabhuji:// shape', () {
    test('status → prabhuji://status/:id', () {
      expect(
        buildCustomSchemeUrl(const StatusDeepLink(id: 'abc')),
        'prabhuji://status/abc',
      );
    });
    test('aarti → prabhuji://aarti/:audioId', () {
      expect(
        buildCustomSchemeUrl(const AartiDeepLink(audioId: 'a-1')),
        'prabhuji://aarti/a-1',
      );
    });
    test('paywall → prabhuji://pro (id-less, no trailing slash)', () {
      expect(
        buildCustomSchemeUrl(const PaywallDeepLink()),
        'prabhuji://pro',
      );
    });
  });

  group('attribution query params', () {
    test('appended when present', () {
      expect(
        buildShareUrl(
          const AartiDeepLink(audioId: 'a-1'),
          attribution: const {'ref': 'user_x', 'utm_source': 'whatsapp'},
        ),
        'https://share.example/app/aarti/a-1?ref=user_x&utm_source=whatsapp',
      );
    });
    test('URL-encoded (special chars in ref)', () {
      expect(
        buildShareUrl(
          const AartiDeepLink(audioId: 'a-1'),
          attribution: const {'ref': 'user@example.com'},
        ),
        'https://share.example/app/aarti/a-1?ref=user%40example.com',
      );
    });
    test('no query string when attribution is empty', () {
      expect(
        buildShareUrl(const AartiDeepLink(audioId: 'a-1')),
        'https://share.example/app/aarti/a-1',
      );
    });
  });

  group('round-trip build → parse', () {
    // The strongest contract: whatever the builder emits, the parser reads
    // back as the same typed target. Fails loudly if the two files drift.
    final targets = <DeepLinkTarget>[
      const StatusDeepLink(id: 'abc'),
      const AartiDeepLink(audioId: 'a-1'),
      const BookDeepLink(contentId: 'geeta'),
      const HoroscopeDeepLink(zodiacId: 'leo'),
      const RingtoneDeepLink(id: 'rt-9'),
      const WallpaperDeepLink(id: 'wp-1'),
      const PaywallDeepLink(),
    ];

    for (final t in targets) {
      test('${t.typeSlug}: HTTPS build → parse', () {
        final url = buildShareUrl(t);
        final parsed = parseDeepLink(Uri.parse(url));
        expect(parsed.runtimeType, t.runtimeType);
      });

      test('${t.typeSlug}: custom-scheme build → parse', () {
        final url = buildCustomSchemeUrl(t);
        final parsed = parseDeepLink(Uri.parse(url));
        expect(parsed.runtimeType, t.runtimeType);
      });
    }

    test('attribution preserved through the round trip', () {
      final url = buildShareUrl(
        const AartiDeepLink(audioId: 'a-1'),
        attribution: const {'ref': 'user_x', 'utm_source': 'whatsapp'},
      );
      final parsed = parseDeepLink(Uri.parse(url));
      expect(parsed.attribution, {
        'ref': 'user_x',
        'utm_source': 'whatsapp',
      });
    });
  });
}
