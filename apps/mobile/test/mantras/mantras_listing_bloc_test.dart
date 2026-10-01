import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mantras/data/mantras_models.dart';
import 'package:mobile/features/mantras/listing/bloc/mantras_listing_bloc.dart';
import 'package:mobile/features/mantras/listing/bloc/mantras_listing_event.dart';
import 'package:mobile/features/mantras/listing/bloc/mantras_listing_state.dart';

import '../support/fake_repositories.dart';

const _query = MantraListQuery(
  title: 'Newly Added Mantras',
  sourceListType: 'newly_added',
  section: MantraListSection.newlyAdded,
);

void main() {
  test('loads the first keyset page', () async {
    final repo = FakeMantrasRepository();
    final bloc = MantrasListingBloc(repository: repo, query: _query)
      ..add(const MantrasListingLoadRequested());
    await bloc.stream.firstWhere((s) => s.status == MantrasListingStatus.loaded);
    expect(bloc.state.items.length, 2);
    expect(bloc.state.hasMore, isTrue);
    await bloc.close();
  });

  test('appends the next page and clears the cursor at the end', () async {
    final repo = FakeMantrasRepository(pageSize: 4);
    final bloc = MantrasListingBloc(repository: repo, query: _query)
      ..add(const MantrasListingLoadRequested());
    await bloc.stream.firstWhere((s) => s.status == MantrasListingStatus.loaded);

    bloc.add(const MantrasListingNextPageRequested());
    await bloc.stream.firstWhere((s) => s.items.length == 8);

    bloc.add(const MantrasListingNextPageRequested());
    await bloc.stream.firstWhere((s) => s.items.length == 10);
    expect(bloc.state.hasMore, isFalse);
    await bloc.close();
  });

  test('empty first page → empty state', () async {
    final repo = FakeMantrasRepository(listing: const []);
    final bloc = MantrasListingBloc(repository: repo, query: _query)
      ..add(const MantrasListingLoadRequested());
    await bloc.stream.firstWhere((s) => s.status == MantrasListingStatus.empty);
    expect(bloc.state.status, MantrasListingStatus.empty);
    await bloc.close();
  });

  test('first-page failure → error state', () async {
    final repo = FakeMantrasRepository(failListing: true);
    final bloc = MantrasListingBloc(repository: repo, query: _query)
      ..add(const MantrasListingLoadRequested());
    await bloc.stream.firstWhere((s) => s.status == MantrasListingStatus.error);
    expect(bloc.state.status, MantrasListingStatus.error);
    await bloc.close();
  });
}
