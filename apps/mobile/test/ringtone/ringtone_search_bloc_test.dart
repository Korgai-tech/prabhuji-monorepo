import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/ringtone/search/bloc/ringtone_search_bloc.dart';
import 'package:mobile/features/ringtone/search/bloc/ringtone_search_event.dart';
import 'package:mobile/features/ringtone/search/bloc/ringtone_search_state.dart';

import '../support/fake_repositories.dart';

/// The Ringtone search bloc no longer emits analytics — Sheet 1 rows 113–126
/// have no ringtone-specific search events. Tests here cover pure state
/// transitions; the surviving search-related analytics (`ringtone_selected`
/// with `selection_source: 'search'`) is asserted in the tap-handler test.
void main() {
  test('submitting a query loads results', () async {
    final repo = FakeRingtoneRepository(pageSize: 5);
    final bloc = RingtoneSearchBloc(repository: repo)
      ..add(const RingtoneSearchSubmitted('Krishna'));
    await Future<void>.delayed(Duration.zero);

    expect(bloc.state.status, RingtoneSearchStatus.loaded);
    expect(bloc.state.query, 'Krishna');
    expect(bloc.state.items, isNotEmpty);
    expect(bloc.state.resultCount, 15);
    // Removed: `ringtone_search_results_viewed` dropped from analytics contract.
    await bloc.close();
  });

  test('zero results → empty state', () async {
    final repo = FakeRingtoneRepository();
    final bloc = RingtoneSearchBloc(repository: repo)
      ..add(const RingtoneSearchSubmitted('zzzznone'));
    await Future<void>.delayed(Duration.zero);

    expect(bloc.state.status, RingtoneSearchStatus.empty);
    // Removed: `ringtone_no_search_results_viewed` dropped from analytics contract.
    await bloc.close();
  });

  test('empty query → idle (keeps the unfiltered home list)', () async {
    final repo = FakeRingtoneRepository();
    final bloc = RingtoneSearchBloc(repository: repo)
      ..add(const RingtoneSearchSubmitted('   '));
    await Future<void>.delayed(Duration.zero);
    expect(bloc.state.status, RingtoneSearchStatus.idle);
    expect(repo.searchCalls, 0);
    await bloc.close();
  });

  test('search failure → error; retry re-runs the query', () async {
    final repo = FakeRingtoneRepository(failSearch: true);
    final bloc = RingtoneSearchBloc(repository: repo)
      ..add(const RingtoneSearchSubmitted('Ram'));
    await Future<void>.delayed(Duration.zero);
    expect(bloc.state.status, RingtoneSearchStatus.error);

    repo.failSearch = false;
    bloc.add(const RingtoneSearchRetryRequested());
    await Future<void>.delayed(Duration.zero);
    expect(bloc.state.status, RingtoneSearchStatus.loaded);
    await bloc.close();
  });
}
