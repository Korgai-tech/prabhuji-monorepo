import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/deep_link_parser.dart';

/// Coverage matrix (TAM-124):
///   - Every `type` in both schemes, happy path
///   - Cross-scheme equivalence (prabhuji:// == https://…/app/…)
///   - Missing id where required
///   - Trailing slashes
///   - Query params preserved as attribution
///   - Unknown types
///   - Malformed / off-contract URIs
///   - Case sensitivity
///
/// Deliberately does NOT test scheme forwarding (that's deep_link_service's
/// job) or route resolution (router's job) — this file only asserts the
/// URL → target contract.

void main() {
  group('parseDeepLink — happy paths, prabhuji:// scheme', () {
    test('status', () {
      final t = parseDeepLink(Uri.parse('prabhuji://status/abc123'));
      expect(t, isA<StatusDeepLink>());
      expect((t as StatusDeepLink).id, 'abc123');
    });

    test('aarti', () {
      final t = parseDeepLink(Uri.parse('prabhuji://aarti/audio-42'));
      expect(t, isA<AartiDeepLink>());
      expect((t as AartiDeepLink).audioId, 'audio-42');
    });

    test('mantra', () {
      final t = parseDeepLink(Uri.parse('prabhuji://mantra/m-7'));
      expect(t, isA<MantraDeepLink>());
      expect((t as MantraDeepLink).audioId, 'm-7');
    });

    test('book', () {
      final t = parseDeepLink(Uri.parse('prabhuji://book/geeta'));
      expect(t, isA<BookDeepLink>());
      expect((t as BookDeepLink).contentId, 'geeta');
    });

    test('horoscope', () {
      final t = parseDeepLink(Uri.parse('prabhuji://horoscope/leo'));
      expect(t, isA<HoroscopeDeepLink>());
      expect((t as HoroscopeDeepLink).zodiacId, 'leo');
    });

    test('ringtone', () {
      final t = parseDeepLink(Uri.parse('prabhuji://ringtone/rt-9'));
      expect(t, isA<RingtoneDeepLink>());
      expect((t as RingtoneDeepLink).id, 'rt-9');
    });

    test('wallpaper', () {
      final t = parseDeepLink(Uri.parse('prabhuji://wallpaper/wp-1'));
      expect(t, isA<WallpaperDeepLink>());
      expect((t as WallpaperDeepLink).id, 'wp-1');
    });

    test('paywall (id-less)', () {
      final t = parseDeepLink(Uri.parse('prabhuji://pro'));
      expect(t, isA<PaywallDeepLink>());
    });

    test('paywall ignores a trailing path segment', () {
      // The paywall target doesn't take an id; trailing segments are ignored,
      // not treated as errors.
      final t = parseDeepLink(Uri.parse('prabhuji://pro/anything'));
      expect(t, isA<PaywallDeepLink>());
    });

    test('home (id-less)', () {
      final t = parseDeepLink(Uri.parse('prabhuji://home'));
      expect(t, isA<HomeDeepLink>());
    });

    test('payment/return (id-less)', () {
      final t = parseDeepLink(Uri.parse('prabhuji://payment/return'));
      expect(t, isA<PaymentReturnDeepLink>());
    });

    test('payment/return preserves provider + mandateId as attribution', () {
      final t = parseDeepLink(Uri.parse(
          'prabhuji://payment/return?provider=cashfree&mandateId=mnd_42'));
      expect(t, isA<PaymentReturnDeepLink>());
      expect(t.attribution['provider'], 'cashfree');
      expect(t.attribution['mandateId'], 'mnd_42');
    });

    test('payment/<unknown-subtype> → UnknownDeepLink (never falls through)',
        () {
      // Guard: a typo in a provider's return-URL config (e.g. `payment/retrn`
      // or a future `payment/receipt` not yet handled) must NOT silently
      // resolve to a random target. UnknownDeepLink → /home is the safe fall.
      final t = parseDeepLink(Uri.parse('prabhuji://payment/retrn'));
      expect(t, isA<UnknownDeepLink>());
    });
  });

  group('parseDeepLink — happy paths, https app link scheme', () {
    test('status', () {
      final t =
          parseDeepLink(Uri.parse('https://krutyug.ai/app/status/abc123'));
      expect(t, isA<StatusDeepLink>());
      expect((t as StatusDeepLink).id, 'abc123');
    });

    test('aarti', () {
      final t =
          parseDeepLink(Uri.parse('https://krutyug.ai/app/aarti/audio-42'));
      expect(t, isA<AartiDeepLink>());
      expect((t as AartiDeepLink).audioId, 'audio-42');
    });

    // The shape a real share produces — a mantra share used to fall through
    // to UnknownDeepLink (no parser case), landing every recipient on /home.
    test('mantra', () {
      final t = parseDeepLink(Uri.parse('https://krutyug.ai/app/mantra/m-7'));
      expect(t, isA<MantraDeepLink>());
      expect((t as MantraDeepLink).audioId, 'm-7');
    });

    test('book', () {
      final t = parseDeepLink(Uri.parse('https://krutyug.ai/app/book/geeta'));
      expect(t, isA<BookDeepLink>());
      expect((t as BookDeepLink).contentId, 'geeta');
    });

    test('horoscope', () {
      final t =
          parseDeepLink(Uri.parse('https://krutyug.ai/app/horoscope/leo'));
      expect(t, isA<HoroscopeDeepLink>());
      expect((t as HoroscopeDeepLink).zodiacId, 'leo');
    });

    test('ringtone', () {
      final t =
          parseDeepLink(Uri.parse('https://krutyug.ai/app/ringtone/rt-9'));
      expect(t, isA<RingtoneDeepLink>());
      expect((t as RingtoneDeepLink).id, 'rt-9');
    });

    test('wallpaper', () {
      final t =
          parseDeepLink(Uri.parse('https://krutyug.ai/app/wallpaper/wp-1'));
      expect(t, isA<WallpaperDeepLink>());
      expect((t as WallpaperDeepLink).id, 'wp-1');
    });

    test('paywall (id-less)', () {
      final t = parseDeepLink(Uri.parse('https://krutyug.ai/app/pro'));
      expect(t, isA<PaywallDeepLink>());
    });

    test('home (id-less) — regression: was UnknownDeepLink before this fix',
        () {
      // Was previously parsed as `UnknownDeepLink('unknown type: home')`,
      // which short-circuited to /home BEFORE the login/paywall gate and
      // broke share URLs from the landing page for un-onboarded users.
      final t = parseDeepLink(Uri.parse('https://krutyug.ai/app/home'));
      expect(t, isA<HomeDeepLink>());
    });

    test('payment/return with cashfree attribution (the default env value)',
        () {
      // Cashfree's `CASHFREE_RETURN_URL` env defaults to this exact URL;
      // pin the parse so a future rename of the default surfaces here first
      // rather than as a broken payment flow in prod.
      final t = parseDeepLink(Uri.parse(
          'https://krutyug.ai/app/payment/return?provider=cashfree'));
      expect(t, isA<PaymentReturnDeepLink>());
      expect(t.attribution['provider'], 'cashfree');
    });
  });

  group('parseDeepLink — cross-scheme equivalence', () {
    // Sharing an HTTPS URL and firing the equivalent prabhuji:// URL MUST
    // produce identical routing — that's the whole point of path-mirroring.
    // Loop through every representative pair.
    final pairs = <(String, String)>[
      ('prabhuji://status/x', 'https://krutyug.ai/app/status/x'),
      ('prabhuji://aarti/x', 'https://krutyug.ai/app/aarti/x'),
      ('prabhuji://mantra/x', 'https://krutyug.ai/app/mantra/x'),
      ('prabhuji://book/x', 'https://krutyug.ai/app/book/x'),
      ('prabhuji://horoscope/x', 'https://krutyug.ai/app/horoscope/x'),
      ('prabhuji://ringtone/x', 'https://krutyug.ai/app/ringtone/x'),
      ('prabhuji://wallpaper/x', 'https://krutyug.ai/app/wallpaper/x'),
      ('prabhuji://pro', 'https://krutyug.ai/app/pro'),
      ('prabhuji://home', 'https://krutyug.ai/app/home'),
    ];

    for (final (custom, https) in pairs) {
      test('$custom == $https', () {
        expect(
          parseDeepLink(Uri.parse(custom)).runtimeType,
          parseDeepLink(Uri.parse(https)).runtimeType,
          reason: 'The two schemes must resolve to the same target type.',
        );
      });
    }
  });

  group('parseDeepLink — a bare module slug is that module (TAM-259)', () {
    // This group used to assert the opposite — every id-less content URL was
    // UnknownDeepLink and landed on /home. That made "open this module"
    // inexpressible, and invisibly so: falling back to Home is exactly what a
    // working link TO Home looks like, so the gap survived until a server-sent
    // landing (TAM-258) needed `prabhuji://ringtone` and silently got Home.
    //
    // Now an id is OPTIONAL on every content slug: bare = the module's own
    // screen, with an id = that item. UnknownDeepLink is reserved for a slug we
    // genuinely do not know, which is the only case where Home is honest.
    final bareCases = <String, Type>{
      'prabhuji://status': StatusDeepLink,
      'prabhuji://aarti': AartiDeepLink,
      'prabhuji://mantra': MantraDeepLink,
      'prabhuji://book': BookDeepLink,
      'prabhuji://horoscope': HoroscopeDeepLink,
      'prabhuji://ringtone': RingtoneDeepLink,
      'prabhuji://wallpaper': WallpaperDeepLink,
      'https://krutyug.ai/app/status': StatusDeepLink,
      'https://krutyug.ai/app/aarti': AartiDeepLink,
      'https://krutyug.ai/app/mantra': MantraDeepLink,
      'https://krutyug.ai/app/book': BookDeepLink,
      'https://krutyug.ai/app/horoscope': HoroscopeDeepLink,
      'https://krutyug.ai/app/ringtone': RingtoneDeepLink,
      'https://krutyug.ai/app/wallpaper': WallpaperDeepLink,
    };

    bareCases.forEach((url, type) {
      test('bare slug → $type, not UnknownDeepLink: $url', () {
        final t = parseDeepLink(Uri.parse(url));
        expect(t, isNot(isA<UnknownDeepLink>()));
        expect(t.runtimeType, type);
      });
    });

    test('the id is null on a bare link, for every slug', () {
      String? idOf(DeepLinkTarget t) => switch (t) {
            StatusDeepLink(:final id) => id,
            AartiDeepLink(:final audioId) => audioId,
            MantraDeepLink(:final audioId) => audioId,
            BookDeepLink(:final contentId) => contentId,
            HoroscopeDeepLink(:final zodiacId) => zodiacId,
            RingtoneDeepLink(:final id) => id,
            WallpaperDeepLink(:final id) => id,
            _ => 'not-a-content-target',
          };
      for (final url in bareCases.keys) {
        expect(idOf(parseDeepLink(Uri.parse(url))), isNull, reason: url);
      }
    });

    test('a slug we do not know is still UnknownDeepLink', () {
      final t = parseDeepLink(Uri.parse('prabhuji://newthing'));
      expect(t, isA<UnknownDeepLink>());
      expect((t as UnknownDeepLink).reason, contains('unknown type'));
    });

    test('a bare link still carries its attribution', () {
      final t = parseDeepLink(Uri.parse('prabhuji://ringtone?utm_source=meta'));
      expect(t, isA<RingtoneDeepLink>());
      expect(t.attribution['utm_source'], 'meta');
    });
  });

  group('parseDeepLink — trailing slashes', () {
    test('prabhuji://aarti/audio-42/ → AartiDeepLink', () {
      final t = parseDeepLink(Uri.parse('prabhuji://aarti/audio-42/'));
      expect(t, isA<AartiDeepLink>());
      expect((t as AartiDeepLink).audioId, 'audio-42');
    });

    test('https://…/app/aarti/audio-42/ → AartiDeepLink', () {
      final t =
          parseDeepLink(Uri.parse('https://krutyug.ai/app/aarti/audio-42/'));
      expect(t, isA<AartiDeepLink>());
      expect((t as AartiDeepLink).audioId, 'audio-42');
    });
  });

  group('parseDeepLink — attribution query params', () {
    test('preserves ref + utm_* verbatim as attribution', () {
      final t = parseDeepLink(Uri.parse(
        'https://krutyug.ai/app/aarti/audio-42?ref=user_xyz&utm_source=whatsapp&utm_campaign=diwali',
      ));
      expect(t, isA<AartiDeepLink>());
      expect(t.attribution, {
        'ref': 'user_xyz',
        'utm_source': 'whatsapp',
        'utm_campaign': 'diwali',
      });
    });

    test('attribution is unmodifiable', () {
      final t = parseDeepLink(
          Uri.parse('prabhuji://aarti/audio-42?ref=user_xyz'));
      expect(() => (t.attribution as dynamic)['tampered'] = 'nope',
          throwsUnsupportedError);
    });

    test('empty when no query string', () {
      final t = parseDeepLink(Uri.parse('prabhuji://aarti/audio-42'));
      expect(t.attribution, isEmpty);
    });

    test('preserved on UnknownDeepLink too (analytics still fires)', () {
      final t = parseDeepLink(Uri.parse(
        'https://krutyug.ai/app/nonsense/xyz?ref=user_xyz',
      ));
      expect(t, isA<UnknownDeepLink>());
      expect(t.attribution, {'ref': 'user_xyz'});
    });
  });

  group('parseDeepLink — unknown types', () {
    test('unknown type in prabhuji:// → UnknownDeepLink with reason', () {
      final t = parseDeepLink(Uri.parse('prabhuji://xyz/abc'));
      expect(t, isA<UnknownDeepLink>());
      expect((t as UnknownDeepLink).reason, contains('unknown type: xyz'));
    });

    test('unknown type in https → UnknownDeepLink with reason', () {
      final t = parseDeepLink(Uri.parse('https://krutyug.ai/app/xyz/abc'));
      expect(t, isA<UnknownDeepLink>());
      expect((t as UnknownDeepLink).reason, contains('unknown type: xyz'));
    });
  });

  group('parseDeepLink — off-contract URIs', () {
    test('bare prabhuji:// → UnknownDeepLink', () {
      final t = parseDeepLink(Uri.parse('prabhuji://'));
      expect(t, isA<UnknownDeepLink>());
    });

    test('http (not https) → UnknownDeepLink (App Links require HTTPS)', () {
      final t = parseDeepLink(Uri.parse('http://krutyug.ai/app/aarti/x'));
      expect(t, isA<UnknownDeepLink>());
    });

    test('https to wrong path prefix → UnknownDeepLink', () {
      // The parser does not gate on host (that's the manifest's job);
      // ANY /app/<type>/… under any HTTPS host is accepted at parse time.
      // But a non-/app/ path is not a deep link at all.
      final t = parseDeepLink(Uri.parse('https://krutyug.ai/download/aarti/x'));
      expect(t, isA<UnknownDeepLink>());
    });

    test('https to /app root (no type) → UnknownDeepLink', () {
      final t = parseDeepLink(Uri.parse('https://krutyug.ai/app'));
      expect(t, isA<UnknownDeepLink>());
    });

    test('completely unrelated scheme → UnknownDeepLink', () {
      final t = parseDeepLink(Uri.parse('mailto:someone@example.com'));
      expect(t, isA<UnknownDeepLink>());
    });
  });

  group('parseDeepLink — case sensitivity', () {
    // Scheme + host are lowercased by Uri; path is case-preserved. So the
    // type slug (which lives in host for prabhuji://, path for https) is
    // effectively case-sensitive on https but not on prabhuji://. Contract:
    // we generate lowercase types only; the parser doesn't try to fix caller
    // mistakes.
    test('mixed-case type in https path → UnknownDeepLink (not matched)', () {
      final t = parseDeepLink(Uri.parse('https://krutyug.ai/app/Aarti/x'));
      expect(t, isA<UnknownDeepLink>());
      expect((t as UnknownDeepLink).reason, contains('unknown type: Aarti'));
    });

    test('mixed-case type in prabhuji:// → still parses (Uri lowercases host)',
        () {
      // Uri normalizes host to lowercase, so this "just works". Not something
      // we rely on — the callers should always emit lowercase — but the
      // parser doesn't need special handling to survive it.
      final t = parseDeepLink(Uri.parse('prabhuji://Aarti/x'));
      expect(t, isA<AartiDeepLink>());
    });
  });
}
