import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mantras/data/mantras_models.dart';
import 'package:mobile/features/mantras/main/bloc/mantras_main_bloc.dart';
import 'package:mobile/features/mantras/main/bloc/mantras_main_event.dart';
import 'package:mobile/features/mantras/main/bloc/mantras_main_state.dart';

import '../support/fake_analytics.dart';
import '../support/fake_repositories.dart';

void main() {
  test('loads the ordered sections from GET /mantras/sections', () async {
    final repo = FakeMantrasRepository();
    final bloc = MantrasMainBloc(repository: repo)
      ..add(const MantrasMainLoadRequested());
    await bloc.stream.firstWhere((s) => s is MantrasMainLoaded);
    final loaded = bloc.state as MantrasMainLoaded;
    expect(loaded.visibleSections.map((s) => s.type), [
      MantraSectionType.recentlyPlayed,
      MantraSectionType.deities,
      MantraSectionType.categories,
      MantraSectionType.newlyAdded,
    ]);
    await bloc.close();
  });

  test('omits Recently Played when the API returns no history', () async {
    final repo = FakeMantrasRepository(
      sections: mantraSectionFixtures(withRecentlyPlayed: false),
    );
    final bloc = MantrasMainBloc(repository: repo)
      ..add(const MantrasMainLoadRequested());
    await bloc.stream.firstWhere((s) => s is MantrasMainLoaded);
    final loaded = bloc.state as MantrasMainLoaded;
    expect(
      loaded.visibleSections.any(
        (s) => s.type == MantraSectionType.recentlyPlayed,
      ),
      isFalse,
    );
    await bloc.close();
  });

  test('empty sections are dropped from visibleSections', () async {
    final repo = FakeMantrasRepository(sections: const [
      MantraSectionData(
        sectionId: 'sec-recently-played',
        type: MantraSectionType.recentlyPlayed,
        title: 'Recently Played',
        sortOrder: 0,
        showAllEnabled: true,
      ),
    ]);
    final bloc = MantrasMainBloc(repository: repo)
      ..add(const MantrasMainLoadRequested());
    await bloc.stream.firstWhere((s) => s is MantrasMainLoaded);
    final loaded = bloc.state as MantrasMainLoaded;
    expect(loaded.visibleSections, isEmpty);
    expect(loaded.isAllEmpty, isTrue);
    await bloc.close();
  });

  test('a full-page failure emits the error state (no paywall)', () async {
    final repo = FakeMantrasRepository(failSections: true);
    final bloc = MantrasMainBloc(repository: repo)
      ..add(const MantrasMainLoadRequested());
    await bloc.stream.firstWhere((s) => s is MantrasMainError);
    expect(bloc.state, isA<MantrasMainError>());
    await bloc.close();
  });

  test('fires mantras_stutis_page_viewed on load', () async {
    final analytics = RecordingAnalytics();
    final repo = FakeMantrasRepository();
    final bloc = MantrasMainBloc(repository: repo, analytics: analytics)
      ..add(const MantrasMainLoadRequested());
    await bloc.stream.firstWhere((s) => s is MantrasMainLoaded);
    expect(analytics.names, contains('mantras_stutis_page_viewed'));
    await bloc.close();
  });
}
