import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/support/presentation/whatsapp_launcher.dart';

/// Unit tests for [WhatsAppLauncher.buildUri] — the pure URL construction
/// (TAM-N-support-screen #EXPORT_CRITICAL: strip leading `+`, encode the
/// message). The launch side effect is tested via the SupportScreen widget
/// tests through the injected [FakeWhatsAppLauncher] seam.
void main() {
  group('WhatsAppLauncher.buildUri', () {
    test('strips the leading + from an E.164 number', () {
      final uri = WhatsAppLauncher.buildUri(
        number: '+911234567890',
        message: 'Hi',
      );
      expect(uri.scheme, 'https');
      expect(uri.host, 'wa.me');
      expect(uri.path, '/911234567890');
    });

    test('preserves a number that has no leading + (already stripped)', () {
      final uri = WhatsAppLauncher.buildUri(
        number: '911234567890',
        message: 'Hi',
      );
      expect(uri.path, '/911234567890');
    });

    test('url-encodes the message payload', () {
      final uri = WhatsAppLauncher.buildUri(
        number: '+911234567890',
        message: 'Hi there!',
      );
      // 'Hi there!' → 'Hi%20there!' when Uri.encodeComponent'd.
      expect(uri.queryParameters['text'], 'Hi there!');
      // Raw query preserves the encoding.
      expect(uri.query, contains('Hi%20there!'));
    });

    test('encodes reserved characters (& # ?) so they cannot break the URL',
        () {
      final uri = WhatsAppLauncher.buildUri(
        number: '+911234567890',
        message: 'Hello & #welcome? — reach out',
      );
      // Uri.encodeComponent escapes the reserved characters; the parsed
      // queryParameters round-trip them back to their raw values.
      expect(
        uri.queryParameters['text'],
        'Hello & #welcome? — reach out',
      );
      expect(uri.query, isNot(contains('&welcome')),
          reason: 'a raw & would introduce a second query parameter');
      expect(uri.query, isNot(contains('#welcome')),
          reason: 'a raw # would introduce a fragment');
    });

    test('produces a well-formed URL for a simple pairing', () {
      final uri = WhatsAppLauncher.buildUri(
        number: '+911234567890',
        message: 'Hi',
      );
      expect(uri.toString(), 'https://wa.me/911234567890?text=Hi');
    });
  });
}
