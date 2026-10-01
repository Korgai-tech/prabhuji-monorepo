import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/aarti/data/aarti_models.dart';
import 'package:mobile/features/aarti/data/aarti_repository.dart';
import 'package:mobile/features/mantras/data/mantras_models.dart';
import 'package:mobile/features/mantras/data/mantras_repository.dart';

import 'support/aarti_harness.dart';
import 'support/fake_repositories.dart';
import 'support/mantras_harness.dart';

/// CMS-curated sections (TAM-160) for BOTH audio modules — one file because the
/// two halves are a mechanical mirror of the same server contract:
/// `sectionType: 'curated'` + a `sectionId` present on EVERY section, rendered
/// with the existing horizontal audio row and paged by `?sectionId=`.

/// Serves one canned envelope; records the outgoing request (mirrors the double
/// in `content_language_test.dart`).
class _CannedAdapter implements HttpClientAdapter {
  _CannedAdapter(this.body);
  final Map<String, dynamic> body;
  RequestOptions? lastRequest;

  @override
  void close({bool force = false}) {}

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    lastRequest = options;
    return ResponseBody.fromString(
      jsonEncode(body),
      200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }
}

Dio _dio(_CannedAdapter adapter) =>
    Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;

Map<String, dynamic> _aartiItem(String id) => {
      'kind': 'audio',
      'id': id,
      'title': 'Aarti $id',
      'coverImageUrl': '',
      'singerName': null,
      'isPrabhujiOriginal': false,
      'audioStreamUrl': null,
      'likeCount': 0,
      'shareCount': 0,
      'likedByMe': false,
    };

Map<String, dynamic> _mantraItem(String id) => {
      'kind': 'mantra',
      'id': id,
      'title': 'Mantra $id',
      'artworkUrl': '',
      'singerName': null,
      'audioUrl': null,
      'likeCount': 0,
      'shareCount': 0,
      'likedByMe': false,
    };

/// A curated section fixture for the Aarti main page.
AartiSectionData _aartiCurated(String id, String title, int sortOrder) =>
    AartiSectionData(
      sectionId: id,
      type: AartiSectionType.curated,
      title: title,
      sortOrder: sortOrder,
      audios: [aartiAudioFixture('$id-0')],
    );

/// A curated section fixture for the Mantras main page.
MantraSectionData _mantraCurated(
  String id,
  String title,
  int sortOrder, {
  bool showAllEnabled = true,
}) =>
    MantraSectionData(
      sectionId: id,
      type: MantraSectionType.curated,
      title: title,
      sortOrder: sortOrder,
      showAllEnabled: showAllEnabled,
      audios: [mantraAudioFixture('$id-0')],
    );

void main() {
  group('wire → model', () {
    test('aarti: curated maps to the enum, sectionId rides on every section',
        () async {
      final adapter = _CannedAdapter({
        'success': true,
        'message': 'ok',
        'data': {
          'sections': [
            {
              'sectionId': 'sec-curated',
              'sectionType': 'curated',
              'title': 'Top Aartis listened to by 80s kids',
              'sortOrder': 3,
              'items': [_aartiItem('a1')],
            },
            {
              'sectionId': 'sec-newly',
              'sectionType': 'newly_added',
              'title': 'Newly Added',
              'sortOrder': 1,
              'items': [_aartiItem('a2')],
            },
            // Forward-compat: a type this build has never heard of is dropped.
            {
              'sectionId': 'sec-future',
              'sectionType': 'holographic_row',
              'title': 'From the future',
              'sortOrder': 0,
              'items': [_aartiItem('a3')],
            },
          ],
        },
      });

      final sections = await DioAartiRepository(_dio(adapter)).fetchMain();

      expect(sections.map((s) => s.type),
          [AartiSectionType.newlyAdded, AartiSectionType.curated]);
      expect(sections.map((s) => s.sectionId), ['sec-newly', 'sec-curated']);
      expect(sections.last.title, 'Top Aartis listened to by 80s kids');
      expect(sections.last.audios.single.id, 'a1');
    });

    test('aarti: an unknown sectionType still maps to null', () {
      expect(AartiSectionType.fromWire('curated'), AartiSectionType.curated);
      expect(AartiSectionType.fromWire('holographic_row'), isNull);
    });

    test('mantras: curated maps to the enum, sectionId rides on every section',
        () async {
      final adapter = _CannedAdapter({
        'success': true,
        'message': 'ok',
        'data': {
          'sections': [
            {
              'sectionId': 'sec-curated',
              'sectionType': 'curated',
              'title': 'Monsoon Mantras',
              'sortOrder': 2,
              'showAllEnabled': true,
              'items': [_mantraItem('m1')],
            },
            {
              'sectionId': 'sec-newly',
              'sectionType': 'newly_added',
              'title': 'Newly Added',
              'sortOrder': 1,
              'showAllEnabled': true,
              'items': [_mantraItem('m2')],
            },
            {
              'sectionId': 'sec-future',
              'sectionType': 'holographic_row',
              'title': 'From the future',
              'sortOrder': 0,
              'showAllEnabled': true,
              'items': [_mantraItem('m3')],
            },
          ],
        },
      });

      final sections =
          await DioMantrasRepository(_dio(adapter)).fetchSections();

      expect(sections.map((s) => s.type),
          [MantraSectionType.newlyAdded, MantraSectionType.curated]);
      expect(sections.map((s) => s.sectionId), ['sec-newly', 'sec-curated']);
      expect(sections.last.title, 'Monsoon Mantras');
      expect(sections.last.audios.single.id, 'm1');
    });

    test('mantras: an unknown sectionType still maps to null', () {
      expect(MantraSectionType.fromWire('curated'), MantraSectionType.curated);
      expect(MantraSectionType.fromWire('holographic_row'), isNull);
    });
  });

  group('listing query', () {
    test('aarti sends sectionId, never sectionType, for a curated list', () {
      const query = AartiListQuery(
        title: 'Monsoon Bhajans',
        sourceListType: 'curated',
        sectionId: 'sec-1',
      );
      final params = query.toQueryParameters(limit: 20);
      expect(params['sectionId'], 'sec-1');
      expect(params.containsKey('sectionType'), isFalse);
    });

    test('mantras sends sectionId, never sectionType, for a curated list', () {
      const query = MantraListQuery(
        title: 'Monsoon Mantras',
        sourceListType: 'curated',
        sectionId: 'sec-1',
      );
      final params = query.toQueryParameters(limit: 20);
      expect(params['sectionId'], 'sec-1');
      expect(params.containsKey('sectionType'), isFalse);
    });
  });

  group('aarti main page', () {
    // Sections arrive already sorted by `sortOrder` (the repository sorts —
    // see the wire test above, where a curated section overtakes a built-in
    // one); the page renders them in that order.
    testWidgets('two curated sections render independently', (tester) async {
      await pumpAartiMain(
        tester,
        repository: FakeAartiRepository(sections: [
          _aartiCurated('sec-a', 'Top Aartis of the 80s', 0),
          _aartiCurated('sec-b', 'Monsoon Bhajans', 1),
        ]),
      );

      // Keyed on the section ID — two curated rows must not collide.
      expect(find.byKey(const Key('aarti-section-curated-sec-a')),
          findsOneWidget);
      expect(find.byKey(const Key('aarti-section-curated-sec-b')),
          findsOneWidget);
      expect(
        tester.getTopLeft(find.text('Top Aartis of the 80s')).dy,
        lessThan(tester.getTopLeft(find.text('Monsoon Bhajans')).dy),
      );
      // Same horizontal audio row as Newly Added / Most Played.
      expect(find.byKey(const Key('aarti-audio-card-sec-a-0')), findsOneWidget);
    });

    testWidgets('Show all carries the section id + the SERVER title',
        (tester) async {
      final pushed = <AartiListQuery>[];
      await pumpAartiMainWithRouter(
        tester,
        repository: FakeAartiRepository(sections: [
          _aartiCurated('sec-a', 'Top Aartis of the 80s', 0),
        ]),
        onListingPushed: pushed.add,
      );

      await tester.tap(find.byKey(const Key('aarti-showall-curated-sec-a')));
      await tester.pumpAndSettle();

      expect(pushed.single.title, 'Top Aartis of the 80s');
      expect(pushed.single.sectionId, 'sec-a');
      expect(pushed.single.section, isNull); // never filters by sectionType
      expect(pushed.single.sourceListType, 'curated');
      expect(pushed.single.filterLabel, 'sec-a'); // analytics `source_filter`
    });
  });

  group('mantras main page', () {
    testWidgets('two curated sections render independently', (tester) async {
      await pumpMantrasMain(
        tester,
        repository: FakeMantrasRepository(sections: [
          _mantraCurated('sec-a', 'Morning Chants', 0),
          _mantraCurated('sec-b', 'Monsoon Mantras', 1),
        ]),
      );

      expect(find.byKey(const Key('mantras-section-curated-sec-a')),
          findsOneWidget);
      expect(find.byKey(const Key('mantras-section-curated-sec-b')),
          findsOneWidget);
      expect(
        tester.getTopLeft(find.text('Morning Chants')).dy,
        lessThan(tester.getTopLeft(find.text('Monsoon Mantras')).dy),
      );
      expect(
          find.byKey(const Key('mantras-audio-card-sec-a-0')), findsOneWidget);
    });

    testWidgets('Show all carries the section id + the SERVER title',
        (tester) async {
      final pushed = <MantraListQuery>[];
      await pumpMantrasMainWithRouter(
        tester,
        repository: FakeMantrasRepository(sections: [
          _mantraCurated('sec-a', 'Morning Chants', 0),
        ]),
        onListingPushed: pushed.add,
      );

      await tester.tap(find.byKey(const Key('mantras-showall-curated-sec-a')));
      await tester.pumpAndSettle();

      expect(pushed.single.title, 'Morning Chants');
      expect(pushed.single.sectionId, 'sec-a');
      expect(pushed.single.section, isNull);
      expect(pushed.single.sourceListType, 'curated');
    });

    testWidgets('a curated section honours showAllEnabled: false',
        (tester) async {
      await pumpMantrasMain(
        tester,
        repository: FakeMantrasRepository(sections: [
          _mantraCurated('sec-a', 'Morning Chants', 0, showAllEnabled: false),
        ]),
      );

      expect(find.byKey(const Key('mantras-section-curated-sec-a')),
          findsOneWidget);
      expect(
          find.byKey(const Key('mantras-showall-curated-sec-a')), findsNothing);
    });
  });
}
