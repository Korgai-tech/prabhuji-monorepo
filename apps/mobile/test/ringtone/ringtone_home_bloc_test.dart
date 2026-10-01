import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/ringtone/home/bloc/ringtone_home_bloc.dart';
import 'package:mobile/features/ringtone/home/bloc/ringtone_home_event.dart';
import 'package:mobile/features/ringtone/home/bloc/ringtone_home_state.dart';
import 'package:mobile/features/ringtone/ringtone_analytics.dart';

import '../support/fake_analytics.dart';
import '../support/fake_repositories.dart';

void main() {
  test('load populates the grid (loaded)', () async {
    final repo = FakeRingtoneRepository(pageSize: 5);
    final bloc = RingtoneHomeBloc(repository: repo)
      ..add(const RingtoneHomeLoadRequested());
    await Future<void>.delayed(Duration.zero);
    expect(bloc.state.status, RingtoneHomeStatus.loaded);
    expect(bloc.state.items, hasLength(5));
    expect(bloc.state.hasMore, isTrue);
    await bloc.close();
  });

  test('deity filter reloads in-place + fires ringtone_deity_selected',
      () async {
    final analytics = RecordingAnalytics();
    final repo = FakeRingtoneRepository(pageSize: 5);
    final bloc = RingtoneHomeBloc(repository: repo, analytics: analytics)
      ..add(const RingtoneHomeLoadRequested());
    await Future<void>.delayed(Duration.zero);

    bloc.add(const RingtoneHomeDeitySelected(deityId: 'ram', deityName: 'Ram ji'));
    await Future<void>.delayed(Duration.zero);

    expect(bloc.state.selectedDeityId, 'ram');
    expect(repo.lastGridDeityId, 'ram');

    // Row 114 — `ringtone_deity_selected` with `deity_id` + `deity_name`.
    expect(analytics.fired(RingtoneEvents.deitySelected), isTrue);
    final props = analytics.propsFor(RingtoneEvents.deitySelected);
    expect(props[RingtoneEventProps.deityId], 'ram');
    expect(props[RingtoneEventProps.deityName], 'Ram ji');
    await bloc.close();
  });

  test('empty deity result → empty state (silent — no sheet event)', () async {
    final repo = FakeRingtoneRepository(emptyDeityId: 'durga');
    final bloc = RingtoneHomeBloc(repository: repo)
      ..add(const RingtoneHomeLoadRequested());
    await Future<void>.delayed(Duration.zero);
    bloc.add(const RingtoneHomeDeitySelected(deityId: 'durga', deityName: 'Durga Ma'));
    await Future<void>.delayed(Duration.zero);

    expect(bloc.state.status, RingtoneHomeStatus.empty);
    // Removed: `ringtone_empty_state_viewed` dropped from analytics contract.
    await bloc.close();
  });

  test('CMS failure → error state (silent); retry re-loads', () async {
    final repo = FakeRingtoneRepository(failGrid: true);
    final bloc = RingtoneHomeBloc(repository: repo)
      ..add(const RingtoneHomeLoadRequested());
    await Future<void>.delayed(Duration.zero);
    expect(bloc.state.status, RingtoneHomeStatus.error);
    // Removed: `ringtone_cms_load_failed` dropped from analytics contract.

    repo.failGrid = false;
    bloc.add(const RingtoneHomeRetryRequested());
    await Future<void>.delayed(Duration.zero);
    expect(bloc.state.status, RingtoneHomeStatus.loaded);
    // Removed: `ringtone_retry_tapped` dropped from analytics contract.
    await bloc.close();
  });

  test('pagination appends the next page', () async {
    final repo = FakeRingtoneRepository(pageSize: 5); // 15 items → 3 pages
    final bloc = RingtoneHomeBloc(repository: repo)
      ..add(const RingtoneHomeLoadRequested());
    await Future<void>.delayed(Duration.zero);
    bloc.add(const RingtoneHomeNextPageRequested());
    await Future<void>.delayed(Duration.zero);
    expect(bloc.state.items, hasLength(10));
    await bloc.close();
  });
}
