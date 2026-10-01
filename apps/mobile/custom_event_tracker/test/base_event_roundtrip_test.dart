import 'dart:convert';

import 'package:custom_analytics_flutter/events/base_event.dart';
import 'package:custom_analytics_flutter/events/ingestion_metadata.dart';
import 'package:custom_analytics_flutter/event_storage.dart';
import 'package:flutter_test/flutter_test.dart';

// Regression guard for the Aug 10 → Aug 13 outage: adid was set on every
// BaseEvent, persisted to SQLite via jsonEncode(event.toMap()), but
// baseEventFromMap didn't read it back — so every flushed event shipped with
// empty adid. ClickHouse's adid column stayed at the default '' for the whole
// window. This asserts every top-level field toMap emits is round-trippable.
void main() {
  group('BaseEvent storage roundtrip', () {
    test('adid survives toMap -> jsonEncode -> jsonDecode -> baseEventFromMap',
        () {
      final original = BaseEvent(
        'chat_room_entered',
        adid: '3a261148-eb54-486a-a7d9-b60bdee05c25',
      );

      final restored = baseEventFromMap(
        jsonDecode(jsonEncode(original.toMap())) as Map<String, dynamic>,
      );

      expect(restored.adid, '3a261148-eb54-486a-a7d9-b60bdee05c25');
    });

    test('all top-level context fields survive the roundtrip', () {
      final original = BaseEvent(
        'evt',
        userId: 'u-1',
        deviceId: 'd-1',
        timestamp: 1699999999999,
        eventId: 7,
        sessionId: 42,
        insertId: 'insert-1',
        locationLat: 12.34,
        locationLng: 56.78,
        appVersion: 6,
        versionName: '1.0.5',
        platform: 'android',
        osName: 'android',
        osVersion: '16',
        deviceBrand: 'OPPO',
        deviceManufacturer: 'OPPO',
        deviceModel: 'I2410',
        carrier: 'Jio',
        country: 'IN',
        region: 'MH',
        city: 'Mumbai',
        dma: 'BOM',
        idfa: 'idfa-x',
        idfv: 'idfv-x',
        adid: 'adid-x',
        appSetId: 'set-x',
        androidId: 'aid-x',
        language: 'en',
        library: 'custom-analytics-flutter/1.0.0',
        ip: '127.0.0.1',
        ingestionMetadata: IngestionMetadata(
          sourceName: 'src',
          sourceVersion: 'v1',
        ),
        revenue: 9.99,
        price: 4.99,
        quantity: 2,
        productId: 'sku-1',
        revenueType: 'purchase',
        currency: 'INR',
        extra: {'k': 'v'},
        partnerId: 'p-1',
        eventProperties: {'navigation_item': 'home'},
        userProperties: {'plan': 'pro'},
        groups: {'workspace': 'w-1'},
        groupProperties: {'workspace': {'tier': 'gold'}},
      )..attempts = 3
       ..pseudoUserId = 'pseudo-x';

      final restored = baseEventFromMap(
        jsonDecode(jsonEncode(original.toMap())) as Map<String, dynamic>,
      );

      expect(restored.eventType, 'evt');
      expect(restored.userId, 'u-1');
      expect(restored.deviceId, 'd-1');
      expect(restored.timestamp, 1699999999999);
      expect(restored.eventId, 7);
      expect(restored.sessionId, 42);
      expect(restored.insertId, 'insert-1');
      expect(restored.locationLat, 12.34);
      expect(restored.locationLng, 56.78);
      expect(restored.appVersion, 6);
      expect(restored.versionName, '1.0.5');
      expect(restored.platform, 'android');
      expect(restored.osName, 'android');
      expect(restored.osVersion, '16');
      expect(restored.deviceBrand, 'OPPO');
      expect(restored.deviceManufacturer, 'OPPO');
      expect(restored.deviceModel, 'I2410');
      expect(restored.carrier, 'Jio');
      expect(restored.country, 'IN');
      expect(restored.region, 'MH');
      expect(restored.city, 'Mumbai');
      expect(restored.dma, 'BOM');
      expect(restored.idfa, 'idfa-x');
      expect(restored.idfv, 'idfv-x');
      expect(restored.adid, 'adid-x');
      expect(restored.appSetId, 'set-x');
      expect(restored.androidId, 'aid-x');
      expect(restored.language, 'en');
      expect(restored.library, 'custom-analytics-flutter/1.0.0');
      expect(restored.ip, '127.0.0.1');
      expect(restored.ingestionMetadata?.sourceName, 'src');
      expect(restored.ingestionMetadata?.sourceVersion, 'v1');
      expect(restored.revenue, 9.99);
      expect(restored.price, 4.99);
      expect(restored.quantity, 2);
      expect(restored.productId, 'sku-1');
      expect(restored.revenueType, 'purchase');
      expect(restored.currency, 'INR');
      expect(restored.extra, {'k': 'v'});
      expect(restored.partnerId, 'p-1');
      expect(restored.attempts, 3);
      expect(restored.pseudoUserId, 'pseudo-x');
      expect(restored.eventProperties, {'navigation_item': 'home'});
      expect(restored.userProperties, {'plan': 'pro'});
      expect(restored.groups, {'workspace': 'w-1'});
      expect(restored.groupProperties, {'workspace': {'tier': 'gold'}});
    });

    test('null adid stays null on roundtrip (no wire field)', () {
      final restored = baseEventFromMap(
        jsonDecode(jsonEncode(BaseEvent('evt').toMap()))
            as Map<String, dynamic>,
      );

      expect(restored.adid, isNull);
    });
  });
}
