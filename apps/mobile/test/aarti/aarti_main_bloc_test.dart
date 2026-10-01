import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/aarti/aarti_analytics.dart';
import 'package:mobile/features/aarti/data/aarti_models.dart';
import 'package:mobile/features/aarti/main/bloc/aarti_main_bloc.dart';
import 'package:mobile/features/aarti/main/bloc/aarti_main_event.dart';
import 'package:mobile/features/aarti/main/bloc/aarti_main_state.dart';

import '../support/fake_analytics.dart';
import '../support/fake_repositories.dart';

void main() {
  group('AartiMainBloc', () {
    test('loads sections in server sortOrder and fires aarti_bhajans_opened',
        () async {
      final analytics = RecordingAnalytics();
      final bloc = AartiMainBloc(
        repository: FakeAartiRepository(),
        analytics: analytics,
      )..add(const AartiMainLoadRequested());

      await bloc.stream.firstWhere((s) => s is AartiMainLoaded);
      final state = bloc.state as AartiMainLoaded;

      expect(
        state.visibleSections.map((s) => s.type),
        [
          AartiSectionType.recentlyPlayed,
          AartiSectionType.deities,
          AartiSectionType.browseCategories,
          AartiSectionType.newlyAdded,
          AartiSectionType.mostPlayed,
        ],
      );
      expect(analytics.fired(AartiEvents.pageViewed), isTrue);
      await bloc.close();
    });

    test('Recently Played is absent when the server omits it (never fabricated)',
        () async {
      final bloc = AartiMainBloc(
        repository: FakeAartiRepository(
          sections: aartiSectionFixtures(withRecentlyPlayed: false),
        ),
      )..add(const AartiMainLoadRequested());

      await bloc.stream.firstWhere((s) => s is AartiMainLoaded);
      final state = bloc.state as AartiMainLoaded;

      expect(
        state.visibleSections.any(
            (s) => s.type == AartiSectionType.recentlyPlayed),
        isFalse,
      );
      await bloc.close();
    });

    test('empty sections are dropped so they hide independently', () async {
      final bloc = AartiMainBloc(
        repository: FakeAartiRepository(sections: [
          const AartiSectionData(
            sectionId: 'sec-newly-added',
            type: AartiSectionType.newlyAdded,
            title: 'Newly Added',
            sortOrder: 0,
            audios: [],
          ),
          AartiSectionData(
            sectionId: 'sec-most-played',
            type: AartiSectionType.mostPlayed,
            title: 'Most Played on Prabhuji',
            sortOrder: 1,
            audios: [aartiAudioFixture('m0')],
          ),
        ]),
      )..add(const AartiMainLoadRequested());

      await bloc.stream.firstWhere((s) => s is AartiMainLoaded);
      final state = bloc.state as AartiMainLoaded;

      expect(state.visibleSections.map((s) => s.type),
          [AartiSectionType.mostPlayed]);
      await bloc.close();
    });

    test('full failure → error state (retry available), never a paywall',
        () async {
      final bloc = AartiMainBloc(
        repository: FakeAartiRepository(failMain: true),
      )..add(const AartiMainLoadRequested());

      await bloc.stream.firstWhere((s) => s is AartiMainError);
      expect(bloc.state, isA<AartiMainError>());
      await bloc.close();
    });
  });
}
