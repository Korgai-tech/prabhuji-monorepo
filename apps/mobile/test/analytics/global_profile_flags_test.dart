import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/analytics_enricher.dart';
import 'package:mobile/core/session_context.dart';
import 'package:mobile/features/status/data/status_models.dart';
import 'package:mobile/features/status/data/status_profile_flags_store.dart';

/// `has_name` / `has_photo` are GLOBAL analytics properties: the enricher
/// stamps both on EVERY event in the app, sourced from
/// [StatusProfileFlagsStore], which the status repository mirrors on every
/// `/status/profile` fetch and save.
///
/// This suite owns the profile-shape matrix that used to live per-event in
/// `status_share_bloc_test.dart` (six cases asserting which flag each profile
/// shape produced). Testing it here instead means it is asserted ONCE, at the
/// single place the value is now derived, rather than re-asserted on each
/// event that happens to carry it.
void main() {
  AnalyticsEnricher enricherOver(StatusProfileFlagsStore store) {
    return AnalyticsEnricher(
      sessionContext: SessionContext(),
      anonymousId: 'anon-1',
      appVersion: '1.0.0',
      buildNumber: '1',
      platform: 'android',
      osVersion: '14',
      deviceModel: 'Pixel 8',
      deviceLocale: 'en_IN',
      hasNameReader: store.hasName,
      hasPhotoReader: store.hasPhoto,
    );
  }

  group('StatusProfileFlagsStore — profile shape → the two flags', () {
    test('an empty profile reports both false', () {
      final store = StatusProfileFlagsStore.inMemory()
        ..mirror(StatusProfileData.empty);

      expect(store.hasName(), isFalse);
      expect(store.hasPhoto(), isFalse);
    });

    test('a name-only profile reports has_name true, has_photo false', () {
      final store = StatusProfileFlagsStore.inMemory()
        ..mirror(const StatusProfileData(
          activeProfileType: StatusProfileType.personal,
          personalDisplayName: 'Aditya Nath',
        ));

      expect(store.hasName(), isTrue);
      expect(store.hasPhoto(), isFalse);
    });

    test('a photo-only profile reports has_name false, has_photo true', () {
      final store = StatusProfileFlagsStore.inMemory()
        ..mirror(const StatusProfileData(
          activeProfileType: StatusProfileType.personal,
          avatarImageUrl: 'https://cdn.test.invalid/a.png',
        ));

      expect(store.hasName(), isFalse);
      expect(store.hasPhoto(), isTrue);
    });

    test('a name + photo profile reports both true', () {
      final store = StatusProfileFlagsStore.inMemory()
        ..mirror(const StatusProfileData(
          activeProfileType: StatusProfileType.personal,
          personalDisplayName: 'Aditya Nath',
          avatarImageUrl: 'https://cdn.test.invalid/a.png',
        ));

      expect(store.hasName(), isTrue);
      expect(store.hasPhoto(), isTrue);
    });

    test('a whitespace-only name does NOT count as a name', () {
      final store = StatusProfileFlagsStore.inMemory()
        ..mirror(const StatusProfileData(
          activeProfileType: StatusProfileType.personal,
          personalDisplayName: '   ',
        ));

      expect(store.hasName(), isFalse);
    });

    test(
        'a grandfathered business-only profile reports has_name false '
        '(mobile renders the personal face — TAM-168)', () {
      final store = StatusProfileFlagsStore.inMemory()
        ..mirror(const StatusProfileData(
          activeProfileType: StatusProfileType.business,
          businessName: 'Srinath Builders',
        ));

      // The business name is never burned into an export, so reporting
      // has_name: true would claim an overlay the render does not contain.
      expect(store.hasName(), isFalse);
      expect(store.hasPhoto(), isFalse);
    });

    test('a later mirror overwrites an earlier one in both directions', () {
      final store = StatusProfileFlagsStore.inMemory()
        ..mirror(const StatusProfileData(
          activeProfileType: StatusProfileType.personal,
          personalDisplayName: 'Aditya Nath',
          avatarImageUrl: 'https://cdn.test.invalid/a.png',
        ));
      expect(store.hasName(), isTrue);

      // A profile cleared server-side must clear the flags, not leave the
      // last positive reading behind.
      store.mirror(StatusProfileData.empty);
      expect(store.hasName(), isFalse);
      expect(store.hasPhoto(), isFalse);
    });

    test('clear() wipes both — the logout contract', () {
      final store = StatusProfileFlagsStore.inMemory()
        ..mirror(const StatusProfileData(
          activeProfileType: StatusProfileType.personal,
          personalDisplayName: 'Aditya Nath',
          avatarImageUrl: 'https://cdn.test.invalid/a.png',
        ));

      store.clear();

      // The next user on this device must not inherit user A's profile
      // state on every event until their first profile fetch.
      expect(store.hasName(), isFalse);
      expect(store.hasPhoto(), isFalse);
    });

    test('an un-mirrored store reads false rather than null', () {
      final store = StatusProfileFlagsStore.inMemory();

      // A boolean that is absent cannot be filtered in the warehouse, so the
      // "we know of nothing saved" case must still be a real `false`.
      expect(store.hasName(), isFalse);
      expect(store.hasPhoto(), isFalse);
    });
  });

  group('AnalyticsEnricher — the pair rides on every event', () {
    test('enrich() always carries both keys', () {
      final store = StatusProfileFlagsStore.inMemory();
      final enriched = enricherOver(store).enrich();

      expect(enriched.containsKey('has_name'), isTrue);
      expect(enriched.containsKey('has_photo'), isTrue);
      expect(enriched['has_name'], isFalse);
      expect(enriched['has_photo'], isFalse);
    });

    test('the readers are live — a mid-session save shows on the next event',
        () {
      final store = StatusProfileFlagsStore.inMemory();
      final enricher = enricherOver(store);

      expect(enricher.enrich()['has_name'], isFalse);

      // Same enricher instance, no rebuild — exactly what happens when the
      // user saves their profile without restarting the app.
      store.mirror(const StatusProfileData(
        activeProfileType: StatusProfileType.personal,
        personalDisplayName: 'Aditya Nath',
      ));

      expect(enricher.enrich()['has_name'], isTrue);
      expect(enricher.enrich()['has_photo'], isFalse);
    });

    test('a missing reader degrades to false, never a dropped key', () {
      // The wiring an enricher gets in widget tests / a degraded boot where
      // SharedPreferences was never resolved.
      final enriched = AnalyticsEnricher(
        sessionContext: SessionContext(),
        anonymousId: 'anon-1',
        appVersion: '1.0.0',
        buildNumber: '1',
        platform: 'android',
        osVersion: '14',
        deviceModel: 'Pixel 8',
        deviceLocale: 'en_IN',
      ).enrich();

      expect(enriched['has_name'], isFalse);
      expect(enriched['has_photo'], isFalse);
    });

    test('a throwing reader degrades to false — tracking never breaks', () {
      final enriched = AnalyticsEnricher(
        sessionContext: SessionContext(),
        anonymousId: 'anon-1',
        appVersion: '1.0.0',
        buildNumber: '1',
        platform: 'android',
        osVersion: '14',
        deviceModel: 'Pixel 8',
        deviceLocale: 'en_IN',
        hasNameReader: () => throw StateError('store exploded'),
        hasPhotoReader: () => throw StateError('store exploded'),
      ).enrich();

      expect(enriched['has_name'], isFalse);
      expect(enriched['has_photo'], isFalse);
    });

    test('the raw name never reaches the enriched bag', () {
      final store = StatusProfileFlagsStore.inMemory()
        ..mirror(const StatusProfileData(
          activeProfileType: StatusProfileType.personal,
          personalDisplayName: 'Aditya Nath',
          avatarImageUrl: 'https://cdn.test.invalid/a.png',
        ));

      final enriched = enricherOver(store).enrich();

      // Booleans only — the PII rule applies to global properties too, and
      // these are now on EVERY event, which makes it the highest-blast-radius
      // place in the app to leak a name or an avatar URL.
      expect(enriched['has_name'], isA<bool>());
      expect(enriched['has_photo'], isA<bool>());
      expect(
        enriched.values.any((v) => v.toString().contains('Aditya')),
        isFalse,
      );
      expect(
        enriched.values.any((v) => v.toString().contains('cdn.test.invalid')),
        isFalse,
      );
    });
  });
}
