import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/analytics_enricher.dart';
import 'package:mobile/core/session_context.dart';

/// Unit tests for the TAM-167 addition to [AnalyticsEnricher]:
/// `chat_type` as a globally-stamped experiment-arm dimension: the key is
/// on EVERY event, carrying `''` until `/users/me` has told us the arm.
///
/// The property used to fall back to `'control'`, which filed every
/// pre-`/users/me` event under a real cohort and made those events
/// indistinguishable from genuine control users. These cases lock in both
/// halves of the replacement: the key is never missing, and an unknown arm
/// is never dressed up as a real one.
///
/// The rest of the enricher's surface (anonymous_id / session_id / device
/// info) is covered indirectly by the paywall analytics tests; these
/// cases lock the chat_type contract specifically so a future refactor
/// can't silently drop the property.
AnalyticsEnricher _buildEnricher({String? Function()? chatTypeReader}) {
  return AnalyticsEnricher(
    sessionContext: SessionContext(),
    anonymousId: 'anon-1',
    appVersion: '1.0.0',
    buildNumber: '1',
    platform: 'android',
    osVersion: '14',
    deviceModel: 'Pixel 8',
    deviceLocale: 'en_IN',
    sessionId: 'session-1',
    chatTypeReader: chatTypeReader,
  );
}

void main() {
  group('AnalyticsEnricher.enrich() — chat_type (TAM-167)', () {
    test('reader returning a real cohort surfaces on every event', () {
      final enricher = _buildEnricher(chatTypeReader: () => 'kuldevta');
      expect(enricher.enrich()['chat_type'], 'kuldevta');
    });

    test('reader returning null stamps an empty arm, not a cohort', () {
      final enricher = _buildEnricher(chatTypeReader: () => null);
      final props = enricher.enrich();
      // Both halves matter: the key is THERE (consumers can rely on it) and
      // its value is not a real cohort label.
      expect(props.containsKey('chat_type'), isTrue);
      expect(props['chat_type'], '');
    });

    test('reader returning empty string stamps an empty arm', () {
      final enricher = _buildEnricher(chatTypeReader: () => '');
      expect(enricher.enrich()['chat_type'], '');
    });

    test('missing reader (construction without one) stamps an empty arm', () {
      final enricher = _buildEnricher();
      final props = enricher.enrich();
      expect(props.containsKey('chat_type'), isTrue);
      expect(props['chat_type'], '');
    });

    test('a throwing reader stamps an empty arm, never propagates', () {
      final enricher = _buildEnricher(chatTypeReader: () {
        throw StateError('reader broken');
      });
      expect(enricher.enrich()['chat_type'], '');
    });

    test('"control" from the SERVER is a real arm and still rides', () {
      // The fallback is gone, but the cohort label itself is legitimate —
      // a user the server actually bucketed into control must be reported.
      final enricher = _buildEnricher(chatTypeReader: () => 'control');
      expect(enricher.enrich()['chat_type'], 'control');
    });

    test('reader is called live per enrich() so a late /users/me propagates',
        () {
      String? current;
      final enricher = _buildEnricher(chatTypeReader: () => current);
      // Pre-/users/me: present but empty.
      expect(enricher.enrich()['chat_type'], '');
      current = 'gita';
      expect(enricher.enrich()['chat_type'], 'gita');
      current = 'content';
      expect(enricher.enrich()['chat_type'], 'content');
    });
  });
}
