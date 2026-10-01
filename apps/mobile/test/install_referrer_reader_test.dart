import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/install_referrer_reader.dart';

/// Coverage matrix:
///   - non-Android platforms short-circuit to null and cache the result
///   - NoOpInstallReferrerReader is safe to use anywhere
///   - UTM parsing (matches krutyug_app's Uri.getQueryParameter approach):
///     - single / multiple pairs
///     - percent-encoded query values decoded per-value
///     - encoded `&` inside a value is preserved (the whole-string-decode
///       bug that this parser explicitly avoids)
///     - Google Play's `(not set)` sentinel passes through (backend filters)
///     - deep-link path (no `utm_*`) → null
///     - mixed keys keep only `utm_*`
///
/// The Play Install Referrer platform channel itself is out-of-scope for
/// unit tests — it needs an Android emulator with Play Services.

void main() {
  group('PlayInstallReferrerReader.read', () {
    test('returns null on non-Android platforms and caches', () async {
      if (Platform.isAndroid) return;

      final reader = PlayInstallReferrerReader();
      expect(await reader.read(), isNull);
      // Second call should hit the in-memory cache — no exception, same result.
      expect(await reader.read(), isNull);
    });
  });

  group('PlayInstallReferrerReader.parseAttribution — utm keys', () {
    test('single utm pair', () {
      expect(
        PlayInstallReferrerReader.parseAttribution('utm_source=google-play'),
        {'utm_source': 'google-play'},
      );
    });

    test('multiple utm pairs', () {
      expect(
        PlayInstallReferrerReader.parseAttribution(
          'utm_source=google&utm_medium=cpc&utm_campaign=diwali',
        ),
        {
          'utm_source': 'google',
          'utm_medium': 'cpc',
          'utm_campaign': 'diwali',
        },
      );
    });

    test('percent-encoded value is decoded per-value', () {
      expect(
        PlayInstallReferrerReader.parseAttribution(
          'utm_source=google&utm_content=hello%20world',
        ),
        {'utm_source': 'google', 'utm_content': 'hello world'},
      );
    });

    test('encoded ampersand inside a value is preserved (not truncated)', () {
      // This is the whole-string-decode bug the Uri.splitQueryString path
      // fixes — a naive decode-then-split would truncate utm_content at
      // "abc" and drop the "def". Tamasha_app's Uri parser gets this right;
      // we match that behaviour.
      expect(
        PlayInstallReferrerReader.parseAttribution(
          'utm_content=abc%26def&utm_source=google',
        ),
        {'utm_content': 'abc&def', 'utm_source': 'google'},
      );
    });

    test('(not set) sentinel is passed through', () {
      // Matches krutyug_app: the backend / warehouse decides what to
      // filter out. Dropping it in the client would look like "no data
      // at all" which is a different signal from "value is (not set)".
      expect(
        PlayInstallReferrerReader.parseAttribution(
          'utm_source=(not set)&utm_medium=organic',
        ),
        {'utm_source': '(not set)', 'utm_medium': 'organic'},
      );
    });

    test('deep-link path (no utm_*) → null', () {
      expect(
        PlayInstallReferrerReader.parseAttribution('/app/aarti/xyz'),
        isNull,
      );
    });

    test('non-attribution keys are dropped', () {
      // Random query params that are not utm_* and not in the click-ID
      // allowlist are silently ignored.
      expect(
        PlayInstallReferrerReader.parseAttribution(
          'random_key=abc&utm_source=google&another=zzz',
        ),
        {'utm_source': 'google'},
      );
    });
  });

  group('PlayInstallReferrerReader.parseAttribution — paid-media click IDs', () {
    test('gclid (Google Ads) is captured', () {
      expect(
        PlayInstallReferrerReader.parseAttribution('gclid=EAIaIQobChM'),
        {'gclid': 'EAIaIQobChM'},
      );
    });

    test('fbclid (Meta) is captured', () {
      expect(
        PlayInstallReferrerReader.parseAttribution('fbclid=IwAR2xyz'),
        {'fbclid': 'IwAR2xyz'},
      );
    });

    test('gbraid + wbraid (Google privacy-safe click IDs) are captured', () {
      expect(
        PlayInstallReferrerReader.parseAttribution(
          'gbraid=0AAAAAD_&wbraid=0BBBBBB_',
        ),
        {'gbraid': '0AAAAAD_', 'wbraid': '0BBBBBB_'},
      );
    });

    test('dclid (Display & Video 360) is captured', () {
      expect(
        PlayInstallReferrerReader.parseAttribution('dclid=CjkKEQ'),
        {'dclid': 'CjkKEQ'},
      );
    });

    test('msclkid (Microsoft Ads) is captured', () {
      expect(
        PlayInstallReferrerReader.parseAttribution('msclkid=abc123'),
        {'msclkid': 'abc123'},
      );
    });

    test('utm and click-IDs are captured together', () {
      // Real-world Google Ads referrer often carries both utm_* and gclid.
      expect(
        PlayInstallReferrerReader.parseAttribution(
          'utm_source=google&utm_medium=cpc&utm_campaign=diwali&gclid=EAI123',
        ),
        {
          'utm_source': 'google',
          'utm_medium': 'cpc',
          'utm_campaign': 'diwali',
          'gclid': 'EAI123',
        },
      );
    });

    test('empty utm value is passed through', () {
      // Matches krutyug_app: server side decides how to treat empty values.
      expect(
        PlayInstallReferrerReader.parseAttribution('utm_source=&utm_medium=organic'),
        {'utm_source': '', 'utm_medium': 'organic'},
      );
    });
  });

  group('NoOpInstallReferrerReader', () {
    test('always returns null and is idempotent', () async {
      const reader = NoOpInstallReferrerReader();
      expect(await reader.read(), isNull);
      expect(await reader.read(), isNull);
      expect(await reader.read(), isNull);
    });
  });
}
