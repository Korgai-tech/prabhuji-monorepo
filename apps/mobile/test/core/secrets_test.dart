import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/secrets.dart';

/// Unit tests for the Support-related additions to [Secrets]
/// (TAM-N-support-screen). Covers every truth-table case for
/// [Secrets.supportWhatsAppEnabled] plus the [Secrets.isRealSecret]
/// predicate that gates it.
void main() {
  group('Secrets.isRealSecret', () {
    test('returns false for null', () {
      expect(Secrets.isRealSecret(null), isFalse);
    });

    test('returns false for empty string', () {
      expect(Secrets.isRealSecret(''), isFalse);
    });

    test('returns false for REPLACE_ME_* placeholder', () {
      expect(
        Secrets.isRealSecret('REPLACE_ME_SUPPORT_WHATSAPP_NUMBER'),
        isFalse,
      );
      expect(Secrets.isRealSecret('REPLACE_ME_ANY_KEY'), isFalse);
    });

    test('returns true for a real value', () {
      expect(Secrets.isRealSecret('+911234567890'), isTrue);
      expect(Secrets.isRealSecret('Hi there!'), isTrue);
    });
  });

  group('Secrets.supportWhatsAppEnabled truth table', () {
    test('true when BOTH values are real', () {
      final s = Secrets.forTest(
        supportWhatsAppNumber: '+911234567890',
        supportWhatsAppMessage: 'Hi there!',
      );
      expect(s.supportWhatsAppEnabled, isTrue);
    });

    test('false when both are null (missing / malformed secrets file)', () {
      final s = Secrets.forTest(
        supportWhatsAppNumber: null,
        supportWhatsAppMessage: null,
      );
      expect(s.supportWhatsAppEnabled, isFalse);
    });

    test('false when both are the shipped REPLACE_ME_* placeholders', () {
      final s = Secrets.forTest(
        supportWhatsAppNumber: 'REPLACE_ME_SUPPORT_WHATSAPP_NUMBER',
        supportWhatsAppMessage: 'REPLACE_ME_SUPPORT_WHATSAPP_MESSAGE',
      );
      expect(s.supportWhatsAppEnabled, isFalse);
    });

    test('false when both are empty strings', () {
      final s = Secrets.forTest(
        supportWhatsAppNumber: '',
        supportWhatsAppMessage: '',
      );
      expect(s.supportWhatsAppEnabled, isFalse);
    });

    test('false when only the number is real (message is placeholder)', () {
      final s = Secrets.forTest(
        supportWhatsAppNumber: '+911234567890',
        supportWhatsAppMessage: 'REPLACE_ME_SUPPORT_WHATSAPP_MESSAGE',
      );
      expect(s.supportWhatsAppEnabled, isFalse);
    });

    test('false when only the message is real (number is null)', () {
      final s = Secrets.forTest(
        supportWhatsAppNumber: null,
        supportWhatsAppMessage: 'Hi there!',
      );
      expect(s.supportWhatsAppEnabled, isFalse);
    });

    test('false when only the number is real (message is null)', () {
      final s = Secrets.forTest(
        supportWhatsAppNumber: '+911234567890',
        supportWhatsAppMessage: null,
      );
      expect(s.supportWhatsAppEnabled, isFalse);
    });
  });

  group('Secrets.analyticsTenantIdEnabled truth table', () {
    test('true when the value is a real tenant id', () {
      final s = Secrets.forTest(analyticsTenantId: 'prabhuji');
      expect(s.analyticsTenantIdEnabled, isTrue);
    });

    test('false when null (missing / malformed secrets file)', () {
      final s = Secrets.forTest(analyticsTenantId: null);
      expect(s.analyticsTenantIdEnabled, isFalse);
    });

    test('false for the shipped REPLACE_ME_* placeholder', () {
      final s =
          Secrets.forTest(analyticsTenantId: 'REPLACE_ME_ANALYTICS_TENANT_ID');
      expect(s.analyticsTenantIdEnabled, isFalse);
    });

    test('false when empty string', () {
      final s = Secrets.forTest(analyticsTenantId: '');
      expect(s.analyticsTenantIdEnabled, isFalse);
    });
  });

  group('Secrets.metaEnabled truth table — regression coverage', () {
    // The support fields must not accidentally leak into metaEnabled — the
    // two getters gate on independent field pairs.
    test('true when both meta fields real, regardless of support fields', () {
      final s = Secrets.forTest(
        metaAppId: '111',
        metaClientToken: 'abc',
        supportWhatsAppNumber: null,
        supportWhatsAppMessage: null,
      );
      expect(s.metaEnabled, isTrue);
      expect(s.supportWhatsAppEnabled, isFalse);
    });

    test('false when a meta field is a placeholder', () {
      final s = Secrets.forTest(
        metaAppId: 'REPLACE_ME_META_APP_ID',
        metaClientToken: 'abc',
      );
      expect(s.metaEnabled, isFalse);
    });
  });
}
